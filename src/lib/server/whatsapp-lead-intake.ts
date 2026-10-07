import type { QueryResultRow } from "pg";
import { selectWhatsappContactName } from "@/lib/whatsapp-contact-name";
import {
  chooseLeadCandidate,
  phonesMatch,
} from "@/lib/whatsapp-label-automation";
import {
  canonicalWhatsappLeadPhone,
  shouldResolveWhatsappLead,
  whatsappLeadFallbackName,
} from "@/lib/whatsapp-lead-intake";
import { ensureCommercialSchema } from "@/lib/server/commercial-schema";
import { ensureRuntimeSchema, withTransaction } from "@/lib/server/db";

type ConversationRow = QueryResultRow & {
  id: string;
  unit_id: string;
  consultant_id: string;
  instance_id: string;
  canonical_phone: string | null;
  primary_remote_jid: string;
  contact_name: string | null;
  lead_id: string | null;
  inbound_count: number;
  instance_status: string;
  instance_user_id: string | null;
  consultant_name: string;
  consultant_role: string;
  consultant_status: string;
};

type LeadCandidateRow = QueryResultRow & {
  id: string;
  created_by: string | null;
  stage: string;
  created_at: string;
  phone: string;
  phone2: string | null;
};

let schemaPromise: Promise<void> | null = null;

export function ensureWhatsappLeadIntakeSchema() {
  schemaPromise ??= ensureRuntimeSchema(
    "whatsapp-lead-intake",
    `
      create table if not exists app_whatsapp_lead_intake_checks (
        id uuid primary key default gen_random_uuid(),
        unit_id uuid not null references app_units(id) on delete cascade,
        consultant_id uuid not null references app_users(id) on delete cascade,
        instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
        conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
        identity_key text not null,
        lead_id uuid references app_leads(id) on delete set null,
        status text not null check (status in ('processing', 'linked', 'created', 'ambiguous')),
        checked_at timestamptz not null default now(),
        resolved_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (instance_id, identity_key)
      );

      create index if not exists app_whatsapp_lead_intake_unit_phone_idx
        on app_whatsapp_lead_intake_checks (unit_id, identity_key);
      create index if not exists app_whatsapp_lead_intake_lead_idx
        on app_whatsapp_lead_intake_checks (lead_id) where lead_id is not null;
    `,
  ).catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

export async function resolveWhatsappLeadOnConversationStart(conversationId: string) {
  await ensureCommercialSchema();
  await ensureWhatsappLeadIntakeSchema();

  return withTransaction(async (client) => {
    const conversationResult = await client.query<ConversationRow>(
      `
        select conversation.id, conversation.unit_id, conversation.consultant_id,
          conversation.instance_id, conversation.canonical_phone,
          conversation.primary_remote_jid, conversation.contact_name, conversation.lead_id,
          conversation.inbound_count, instance.status instance_status,
          instance.user_id instance_user_id, consultant.name consultant_name,
          consultant.role consultant_role, consultant.status consultant_status
        from app_whatsapp_conversations conversation
        inner join app_whatsapp_instances instance on instance.id = conversation.instance_id
        inner join app_users consultant on consultant.id = conversation.consultant_id
        where conversation.id = $1 and conversation.merged_into_id is null
        limit 1
        for update of conversation
      `,
      [conversationId],
    );
    const conversation = conversationResult.rows[0];

    if (
      !conversation ||
      conversation.lead_id ||
      conversation.instance_user_id !== conversation.consultant_id ||
      !shouldResolveWhatsappLead({
        inbound: true,
        instanceStatus: conversation.instance_status,
        consultantId: conversation.consultant_id,
        consultantActive: conversation.consultant_status === "active",
        consultantRole: conversation.consultant_role,
        phone: conversation.canonical_phone,
        inboundCount: Number(conversation.inbound_count),
      })
    ) {
      return { result: "skipped" as const, leadId: conversation?.lead_id ?? null };
    }

    const identityKey = canonicalWhatsappLeadPhone(conversation.canonical_phone);
    const claim = await client.query<{ id: string } & QueryResultRow>(
      `
        insert into app_whatsapp_lead_intake_checks (
          unit_id, consultant_id, instance_id, conversation_id, identity_key, status
        ) values ($1, $2, $3, $4, $5, 'processing')
        on conflict (instance_id, identity_key) do nothing
        returning id
      `,
      [
        conversation.unit_id,
        conversation.consultant_id,
        conversation.instance_id,
        conversation.id,
        identityKey,
      ],
    );

    if (!claim.rows[0]) {
      await client.query(
        `
          update app_whatsapp_conversations conversation
          set lead_id = resolution.lead_id, updated_at = now()
          from app_whatsapp_lead_intake_checks resolution
          where conversation.id = $1
            and resolution.instance_id = conversation.instance_id
            and resolution.identity_key = $2
            and resolution.lead_id is not null
            and conversation.lead_id is null
        `,
        [conversation.id, identityKey],
      );
      return { result: "already_checked" as const, leadId: null };
    }

    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      `whatsapp-lead:${conversation.unit_id}:${identityKey}`,
    ]);

    const suffix = identityKey.slice(-8);
    const candidates = await client.query<LeadCandidateRow>(
      `
        select id, created_by, stage, created_at::text, phone, phone2
        from app_leads
        where unit_id = $1
          and (
            right(regexp_replace(phone, '\\D', '', 'g'), 8) = $2
            or right(regexp_replace(coalesce(phone2, ''), '\\D', '', 'g'), 8) = $2
          )
        order by created_at desc
        limit 30
      `,
      [conversation.unit_id, suffix],
    );
    const matching = candidates.rows.filter(
      (lead) =>
        phonesMatch(lead.phone, identityKey) || phonesMatch(lead.phone2, identityKey),
    );
    const selection = chooseLeadCandidate(
      matching.map((lead) => ({
        ...lead,
        createdBy: lead.created_by,
        createdAt: lead.created_at,
      })),
      conversation.consultant_id,
    );

    if (selection.ambiguous) {
      await client.query(
        `update app_whatsapp_lead_intake_checks
         set status = 'ambiguous', resolved_at = now(), updated_at = now() where id = $1`,
        [claim.rows[0].id],
      );
      return { result: "ambiguous" as const, leadId: null };
    }

    let leadId = selection.candidate?.id ?? null;
    let result: "linked" | "created" = "linked";

    if (!leadId) {
      const channel = await client.query<{ id: string; name: string } & QueryResultRow>(
        `select id, name from app_acquisition_channels
         where unit_id = $1 and status = 'active' and lower(name) = lower('WhatsApp') limit 1`,
        [conversation.unit_id],
      );
      const column = await client.query<{ id: string } & QueryResultRow>(
        `select id from app_pipeline_columns
         where unit_id = $1 and pipeline_type = 'leads'
           and (semantic_stage = 'Em contato' or system_key = 'contact')
         order by case when semantic_stage = 'Em contato' then 0 else 1 end, position limit 1`,
        [conversation.unit_id],
      );
      const selectedName = selectWhatsappContactName({
        inboundName: conversation.contact_name,
        consultantName: conversation.consultant_name,
        phone: identityKey,
        remoteJid: conversation.primary_remote_jid,
      });
      const fullName = selectedName === identityKey ? whatsappLeadFallbackName(identityKey) : selectedName;
      const inserted = await client.query<{ id: string } & QueryResultRow>(
        `
          insert into app_leads (
            unit_id, full_name, phone, acquisition_channel_id,
            acquisition_channel_name_snapshot, observations, stage, first_contact_at,
            pipeline_column_id, shared_queue, created_by
          ) values ($1, $2, $3, $4, $5, $6, 'Em contato', now(), $7, false, $8)
          returning id
        `,
        [
          conversation.unit_id,
          fullName,
          identityKey,
          channel.rows[0]?.id ?? null,
          channel.rows[0]?.name ?? "WhatsApp",
          `Criado automaticamente no início da conversa do WhatsApp de ${conversation.consultant_name}.`,
          column.rows[0]?.id ?? null,
          conversation.consultant_id,
        ],
      );
      leadId = inserted.rows[0].id;
      result = "created";
    }

    await client.query(
      `update app_whatsapp_conversations set lead_id = $2, updated_at = now() where id = $1`,
      [conversation.id, leadId],
    );
    await client.query(
      `update app_whatsapp_lead_intake_checks
       set lead_id = $2, status = $3, resolved_at = now(), updated_at = now() where id = $1`,
      [claim.rows[0].id, leadId, result],
    );

    return { result, leadId };
  });
}
