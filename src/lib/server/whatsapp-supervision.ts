import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { AuthSession, UserRole } from "@/lib/auth-types";
import type {
  WhatsappConversationAnalysis,
  WhatsappInterventionNotification,
  WhatsappSupervisionConsultant,
  WhatsappSupervisionConversation,
  WhatsappSupervisionMessage,
} from "@/lib/whatsapp-supervision-types";
import {
  isUsefulWhatsappContactName,
  selectWhatsappContactName,
} from "@/lib/whatsapp-contact-name";
import {
  canonicalWhatsappIdentity,
  whatsappAliasType,
  whatsappDigits,
  whatsappPhoneFromJid,
} from "@/lib/whatsapp-conversation-identity";
import type { WhatsappDeliveryStatus } from "@/lib/whatsapp-message-status";
import { queryDb, withTransaction } from "@/lib/server/db";
import { EvolutionRequestError, requestEvolution } from "@/lib/server/evolution-client";

export const WHATSAPP_SUPERVISION_FEATURE = "whatsapp_supervision";
const LEADERSHIP_ROLES: Array<UserRole> = ["DEV", "CEO", "DIRETOR", "GERENTE"];
const MAX_REPLY_CHARS = 4_000;

let schemaPromise: Promise<void> | null = null;

export function ensureWhatsappSupervisionSchema() {
  schemaPromise ??= queryDb(`
    create table if not exists app_feature_role_access (
      feature_key text not null,
      role text not null,
      enabled boolean not null default false,
      updated_by uuid references app_users(id) on delete set null,
      updated_at timestamptz not null default now(),
      primary key (feature_key, role)
    );
    insert into app_feature_role_access (feature_key, role, enabled)
    values
      ('whatsapp_supervision', 'DEV', true),
      ('whatsapp_supervision', 'CEO', false),
      ('whatsapp_supervision', 'DIRETOR', false),
      ('whatsapp_supervision', 'GERENTE', false)
    on conflict (feature_key, role) do nothing;

    create table if not exists app_whatsapp_conversations (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      consultant_id uuid not null references app_users(id) on delete cascade,
      instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
      canonical_key text not null,
      canonical_phone text,
      primary_remote_jid text not null,
      contact_name text,
      lead_id uuid references app_leads(id) on delete set null,
      last_message_at timestamptz,
      last_message_preview text not null default '',
      last_message_type text not null default 'text',
      message_count integer not null default 0,
      inbound_count integer not null default 0,
      outbound_count integer not null default 0,
      merged_into_id uuid references app_whatsapp_conversations(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (instance_id, canonical_key)
    );
    alter table app_whatsapp_conversations add column if not exists merged_into_id uuid references app_whatsapp_conversations(id) on delete set null;
    alter table app_whatsapp_conversations add column if not exists profile_picture_url text;
    create index if not exists app_whatsapp_conversations_unit_consultant_idx
      on app_whatsapp_conversations (unit_id, consultant_id, last_message_at desc);
    create index if not exists app_whatsapp_conversations_phone_idx
      on app_whatsapp_conversations (unit_id, canonical_phone)
      where canonical_phone is not null;

    create table if not exists app_whatsapp_conversation_aliases (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
      instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
      remote_jid text not null,
      alias_type text not null default 'unknown' check (alias_type in ('phone', 'lid', 'legacy', 'unknown')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (instance_id, remote_jid)
    );
    create index if not exists app_whatsapp_conversation_aliases_conversation_idx
      on app_whatsapp_conversation_aliases (conversation_id);

    alter table app_whatsapp_messages add column if not exists conversation_id uuid references app_whatsapp_conversations(id) on delete set null;
    alter table app_whatsapp_messages add column if not exists edited_at timestamptz;
    alter table app_whatsapp_messages add column if not exists deleted_at timestamptz;
    alter table app_whatsapp_messages add column if not exists delivery_status text check (
      delivery_status in ('pending', 'sent', 'delivered', 'read', 'played', 'failed')
    );
    create index if not exists app_whatsapp_messages_conversation_sent_idx
      on app_whatsapp_messages (conversation_id, sent_at desc);

    create table if not exists app_whatsapp_interventions (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      consultant_id uuid not null references app_users(id) on delete cascade,
      conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
      actor_user_id uuid not null references app_users(id) on delete restrict,
      client_request_id text not null,
      content text not null,
      status text not null default 'pending' check (status in ('pending', 'sent', 'confirmed', 'failed')),
      evolution_message_id text,
      error_message text,
      sent_at timestamptz,
      confirmed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (actor_user_id, client_request_id)
    );
    create index if not exists app_whatsapp_interventions_conversation_idx
      on app_whatsapp_interventions (conversation_id, created_at desc);

    create table if not exists app_whatsapp_notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references app_users(id) on delete cascade,
      intervention_id uuid not null references app_whatsapp_interventions(id) on delete cascade,
      conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
      read_at timestamptz,
      created_at timestamptz not null default now(),
      unique (user_id, intervention_id)
    );
    create index if not exists app_whatsapp_notifications_user_unread_idx
      on app_whatsapp_notifications (user_id, created_at desc) where read_at is null;

    create table if not exists app_whatsapp_conversation_analyses (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      consultant_id uuid not null references app_users(id) on delete cascade,
      conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
      lead_id uuid references app_leads(id) on delete set null,
      course_id uuid references app_courses(id) on delete set null,
      sales_script_id uuid,
      input_fingerprint text not null,
      status text not null check (status in ('completed', 'insufficient_context', 'failed')),
      rubric_type text not null check (rubric_type in ('course_script', 'general')),
      score numeric(5,2), stage text, intent text, summary text not null,
      objections jsonb not null default '[]'::jsonb,
      strengths jsonb not null default '[]'::jsonb,
      risks jsonb not null default '[]'::jsonb,
      next_steps jsonb not null default '[]'::jsonb,
      evidence jsonb not null default '[]'::jsonb,
      message_ids jsonb not null default '[]'::jsonb,
      model text, prompt_version text not null default 'conversation-v1', error_message text,
      created_at timestamptz not null default now(),
      unique (conversation_id, input_fingerprint)
    );
    create index if not exists app_whatsapp_conversation_analyses_latest_idx
      on app_whatsapp_conversation_analyses (conversation_id, created_at desc);

    create table if not exists app_whatsapp_analysis_jobs (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
      input_fingerprint text not null,
      status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
      attempts integer not null default 0,
      available_at timestamptz not null default now(), locked_at timestamptz, last_error text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique (conversation_id, input_fingerprint)
    );
    create index if not exists app_whatsapp_analysis_jobs_queue_idx
      on app_whatsapp_analysis_jobs (status, available_at, created_at);

    create table if not exists app_whatsapp_sync_checkpoints (
      instance_id uuid primary key references app_whatsapp_instances(id) on delete cascade,
      history_since timestamptz, last_synced_at timestamptz, last_error text,
      updated_at timestamptz not null default now()
    );
    alter table app_whatsapp_sync_checkpoints add column if not exists contacts_synced_at timestamptz;
  `)
    .then(() => undefined)
    .catch((error) => {
      schemaPromise = null;
      throw error;
    });

  return schemaPromise;
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function normalizeType(value: unknown) {
  const type = String(value ?? "").toLowerCase();
  if (["image", "audio", "video", "document", "text"].includes(type)) return type;
  return "unknown";
}

export function leadershipRole(role: UserRole) {
  return LEADERSHIP_ROLES.includes(role);
}

export async function canUseWhatsappSupervision(session: AuthSession | null) {
  if (!session || !leadershipRole(session.user.role) || !session.units.length) return false;
  await ensureWhatsappSupervisionSchema();
  const result = await queryDb<{ enabled: boolean } & QueryResultRow>(
    `select enabled from app_feature_role_access where feature_key = $1 and role = $2 limit 1`,
    [WHATSAPP_SUPERVISION_FEATURE, session.user.role],
  );
  return result.rows[0]?.enabled === true;
}

export async function getWhatsappFeatureRoles() {
  await ensureWhatsappSupervisionSchema();
  const result = await queryDb<{ role: UserRole; enabled: boolean } & QueryResultRow>(
    `select role, enabled from app_feature_role_access where feature_key = $1 order by role`,
    [WHATSAPP_SUPERVISION_FEATURE],
  );
  return result.rows;
}

export async function setWhatsappFeatureRole(role: UserRole, enabled: boolean, actorId: string) {
  if (!LEADERSHIP_ROLES.includes(role)) throw new Error("Papel inválido para esta função.");
  if (role === "DEV" && !enabled) throw new Error("O acesso DEV permanece ativo durante o piloto.");
  await ensureWhatsappSupervisionSchema();
  await withTransaction(async (client) => {
    if (enabled && (role === "DIRETOR" || role === "GERENTE")) {
      const prerequisite = role === "DIRETOR" ? "CEO" : "DIRETOR";
      const access = await client.query<{ enabled: boolean } & QueryResultRow>(
        `select enabled from app_feature_role_access where feature_key = $1 and role = $2`,
        [WHATSAPP_SUPERVISION_FEATURE, prerequisite],
      );
      if (!access.rows[0]?.enabled) {
        throw new Error(`Libere ${prerequisite === "CEO" ? "CEO" : "Diretor"} antes deste papel.`);
      }
    }
    await client.query(
      `insert into app_feature_role_access (feature_key, role, enabled, updated_by, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (feature_key, role) do update
       set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()`,
      [WHATSAPP_SUPERVISION_FEATURE, role, enabled, actorId],
    );
    if (!enabled && role === "CEO") {
      await client.query(
        `update app_feature_role_access set enabled = false, updated_by = $2, updated_at = now()
        where feature_key = $1 and role in ('DIRETOR','GERENTE')`,
        [WHATSAPP_SUPERVISION_FEATURE, actorId],
      );
    }
    if (!enabled && role === "DIRETOR") {
      await client.query(
        `update app_feature_role_access set enabled = false, updated_by = $2, updated_at = now()
        where feature_key = $1 and role = 'GERENTE'`,
        [WHATSAPP_SUPERVISION_FEATURE, actorId],
      );
    }
  });
}

function allowedUnitIds(session: AuthSession) {
  return session.units.map((unit) => unit.id);
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstText(...values: Array<unknown>) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value.trim() : "";
}

function nestedEvolutionRecords(value: unknown, depth = 0): Array<unknown> {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  const record = recordOf(value);
  for (const key of ["records", "chats", "contacts", "data", "items", "result"]) {
    const records = nestedEvolutionRecords(record[key], depth + 1);
    if (records.length) return records;
  }
  return [];
}

async function refreshSupervisionContactMetadata(
  session: AuthSession,
  consultantId: string,
  requestedUnitId?: string | null,
) {
  const units = allowedUnitIds(session);
  if (requestedUnitId && !units.includes(requestedUnitId)) return;
  const instanceResult = await queryDb<
    { id: string; instance_name: string; status: string; consultant_name: string } & QueryResultRow
  >(
    `select instance.id, instance.instance_name, instance.status, consultant.name consultant_name
     from app_whatsapp_instances instance
     inner join app_users consultant on consultant.id = instance.user_id
     where instance.user_id = $1 and instance.unit_id = any($2::uuid[])
       and left(instance.instance_name, 5) = 'star_'
     limit 1`,
    [consultantId, requestedUnitId ? [requestedUnitId] : units],
  );
  const instance = instanceResult.rows[0];
  if (!instance || instance.status !== "connected") return;

  await queryDb(
    `insert into app_whatsapp_sync_checkpoints (instance_id)
    values ($1) on conflict (instance_id) do nothing`,
    [instance.id],
  );
  const claimed = await queryDb(
    `update app_whatsapp_sync_checkpoints
    set contacts_synced_at = now(), updated_at = now()
    where instance_id = $1
      and (contacts_synced_at is null or contacts_synced_at < now() - interval '5 minutes')
    returning instance_id`,
    [instance.id],
  );
  if (!claimed.rowCount) return;

  try {
    const payload = await requestEvolution(
      `/chat/findChats/${encodeURIComponent(instance.instance_name)}`,
      {
        method: "POST",
        body: JSON.stringify({
          limit: 1_000,
          offset: 0,
          sort: { field: "updatedAt", order: "desc" },
        }),
      },
    );
    const contacts = nestedEvolutionRecords(payload);
    for (const rawContact of contacts) {
      const contact = recordOf(rawContact);
      const key = recordOf(contact.key);
      const lastMessage = recordOf(contact.lastMessage);
      const lastMessageKey = recordOf(lastMessage.key);
      const remoteJid = firstText(
        contact.remoteJid,
        contact.jid,
        contact.id,
        key.remoteJid,
        lastMessageKey.remoteJid,
      );
      if (!remoteJid.includes("@") || remoteJid.endsWith("@g.us")) continue;
      const phone = whatsappPhoneFromJid(remoteJid);
      const name = firstText(
        contact.name,
        contact.contactName,
        contact.verifiedName,
        contact.pushName,
        lastMessage.pushName,
      );
      const profilePictureUrl = firstText(
        contact.profilePictureUrl,
        contact.profilePicUrl,
        contact.picture,
        contact.avatar,
      );
      if (!isUsefulWhatsappContactName(name, instance.consultant_name, phone) && !profilePictureUrl)
        continue;
      await queryDb(
        `update app_whatsapp_conversations conversation
        set contact_name = case when $4::text = '' then conversation.contact_name else $4 end,
            profile_picture_url = case when $5::text ~ '^https?://' then $5
              else conversation.profile_picture_url end,
            updated_at = now()
        where conversation.instance_id = $1 and conversation.merged_into_id is null
          and (conversation.canonical_phone = nullif($3, '') or exists (
            select 1 from app_whatsapp_conversation_aliases alias
            where alias.conversation_id = conversation.id and alias.instance_id = $1
              and alias.remote_jid = $2
          ))`,
        [
          instance.id,
          remoteJid,
          phone,
          isUsefulWhatsappContactName(name, instance.consultant_name, phone) ? name : "",
          profilePictureUrl,
        ],
      );
    }
    await queryDb(
      `update app_whatsapp_sync_checkpoints set last_error = null, updated_at = now()
      where instance_id = $1`,
      [instance.id],
    );
  } catch (error) {
    await queryDb(
      `update app_whatsapp_sync_checkpoints set last_error = $2, updated_at = now()
      where instance_id = $1`,
      [
        instance.id,
        error instanceof Error ? error.message.slice(0, 800) : "Falha ao atualizar contatos",
      ],
    );
  }
}

export async function upsertCanonicalConversationForMessage(input: {
  instanceId: string;
  unitId: string;
  consultantId: string | null;
  remoteJid: string;
  alternateJid?: string | null;
  phone?: string | null;
  contactName?: string | null;
  messageId: string;
}) {
  if (!input.consultantId) return null;
  await ensureWhatsappSupervisionSchema();
  const mapped = await queryDb<{ phone: string } & QueryResultRow>(
    `select phone from app_whatsapp_jid_mappings where instance_id = $1 and lid_jid = any($2::text[]) limit 1`,
    [input.instanceId, [input.remoteJid, input.alternateJid].filter(Boolean)],
  );
  const identity = canonicalWhatsappIdentity({
    remoteJid: input.remoteJid,
    alternateJid: input.alternateJid,
    phone: input.phone,
    mappedPhone: mapped.rows[0]?.phone,
  });

  return withTransaction(async (client) => {
    const conversation = await client.query<{ id: string } & QueryResultRow>(
      `insert into app_whatsapp_conversations (
         unit_id, consultant_id, instance_id, canonical_key, canonical_phone,
         primary_remote_jid, contact_name
       ) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (instance_id, canonical_key) do update
       set canonical_phone = coalesce(excluded.canonical_phone, app_whatsapp_conversations.canonical_phone),
           primary_remote_jid = case
             when excluded.primary_remote_jid like '%@s.whatsapp.net' or excluded.primary_remote_jid like '%@c.us'
               then excluded.primary_remote_jid
             else app_whatsapp_conversations.primary_remote_jid
           end,
           contact_name = coalesce(nullif(excluded.contact_name, ''), app_whatsapp_conversations.contact_name),
           updated_at = now()
       returning id`,
      [
        input.unitId,
        input.consultantId,
        input.instanceId,
        identity.canonicalKey,
        identity.canonicalPhone,
        input.alternateJid?.includes("@s.whatsapp.net") ? input.alternateJid : input.remoteJid,
        input.contactName,
      ],
    );
    const conversationId = conversation.rows[0].id;
    for (const jid of [input.remoteJid, input.alternateJid].filter(Boolean) as Array<string>) {
      const previousAlias = await client.query<{ conversation_id: string } & QueryResultRow>(
        `select conversation_id from app_whatsapp_conversation_aliases
         where instance_id = $1 and remote_jid = $2 limit 1`,
        [input.instanceId, jid],
      );
      const previousConversationId = previousAlias.rows[0]?.conversation_id;
      if (previousConversationId && previousConversationId !== conversationId) {
        await client.query(
          `update app_whatsapp_messages set conversation_id = $2 where conversation_id = $1`,
          [previousConversationId, conversationId],
        );
        await client.query(
          `update app_whatsapp_interventions set conversation_id = $2 where conversation_id = $1`,
          [previousConversationId, conversationId],
        );
        await client.query(
          `update app_whatsapp_notifications set conversation_id = $2 where conversation_id = $1`,
          [previousConversationId, conversationId],
        );
        await client.query(
          `update app_whatsapp_conversations set merged_into_id = $2, updated_at = now() where id = $1`,
          [previousConversationId, conversationId],
        );
      }
      await client.query(
        `insert into app_whatsapp_conversation_aliases (conversation_id, instance_id, remote_jid, alias_type)
         values ($1, $2, $3, $4)
         on conflict (instance_id, remote_jid) do update
         set conversation_id = excluded.conversation_id, updated_at = now()`,
        [conversationId, input.instanceId, jid, whatsappAliasType(jid)],
      );
    }
    await client.query(
      `update app_whatsapp_messages set conversation_id = $2 where instance_id = $1 and evolution_message_id = $3`,
      [input.instanceId, conversationId, input.messageId],
    );
    await client.query(
      `update app_whatsapp_conversations conversation set
         last_message_at = stats.last_message_at,
         last_message_preview = stats.last_message_preview,
         last_message_type = stats.last_message_type,
         message_count = stats.message_count,
         inbound_count = stats.inbound_count,
         outbound_count = stats.outbound_count,
         updated_at = now()
       from (
         select max(sent_at) last_message_at,
           (array_agg(content order by sent_at desc))[1] last_message_preview,
           (array_agg(message_type order by sent_at desc))[1] last_message_type,
           count(*)::int message_count,
           count(*) filter (where direction = 'inbound')::int inbound_count,
           count(*) filter (where direction = 'outbound')::int outbound_count
         from app_whatsapp_messages where conversation_id = $1
       ) stats where conversation.id = $1`,
      [conversationId],
    );
    return conversationId;
  });
}

export async function reconcileCanonicalHistory() {
  await ensureWhatsappSupervisionSchema();
  const messages = await queryDb<
    {
      instance_id: string;
      unit_id: string;
      user_id: string;
      remote_jid: string;
      phone: string;
      contact_name: string | null;
      evolution_message_id: string;
    } & QueryResultRow
  >(`select message.instance_id, message.unit_id, message.user_id, message.remote_jid,
       message.phone, message.contact_name, message.evolution_message_id
     from app_whatsapp_messages message
     inner join app_whatsapp_instances instance on instance.id = message.instance_id
     where message.conversation_id is null and message.user_id is not null
       and left(instance.instance_name, 5) = 'star_'
     order by message.sent_at asc limit 1000`);
  for (const message of messages.rows) {
    await upsertCanonicalConversationForMessage({
      instanceId: message.instance_id,
      unitId: message.unit_id,
      consultantId: message.user_id,
      remoteJid: message.remote_jid,
      phone: message.phone,
      contactName: message.contact_name,
      messageId: message.evolution_message_id,
    });
  }
  return messages.rows.length;
}

export async function listSupervisionConsultants(session: AuthSession, unitId?: string | null) {
  if (!(await canUseWhatsappSupervision(session))) return null;
  const units = allowedUnitIds(session);
  const requested = unitId?.trim();
  if (requested && !units.includes(requested)) return null;
  const selected = requested ? [requested] : units;
  const result = await queryDb<
    {
      id: string;
      name: string;
      avatar_url: string | null;
      unit_id: string;
      unit_name: string;
      status: WhatsappSupervisionConsultant["status"];
      phone_number: string | null;
      conversation_count: string;
      last_message_at: string | null;
      last_event_at: string | null;
    } & QueryResultRow
  >(
    `select u.id, u.name, u.avatar_url, instance.unit_id, unit.name unit_name,
       instance.status, instance.phone_number, instance.last_event_at::text,
       count(conversation.id)::text conversation_count,
       max(conversation.last_message_at)::text last_message_at
     from app_whatsapp_instances instance
     inner join app_users u on u.id = instance.user_id
     inner join app_units unit on unit.id = instance.unit_id
     left join app_whatsapp_conversations conversation on conversation.instance_id = instance.id
     where instance.unit_id = any($1::uuid[]) and left(instance.instance_name, 5) = 'star_'
       and u.role = 'CONSULTOR' and u.status = 'active'
     group by u.id, u.name, u.avatar_url, instance.unit_id, unit.name, instance.status,
       instance.phone_number, instance.last_event_at
     order by unit.name, u.name`,
    [selected],
  );
  return result.rows.map<WhatsappSupervisionConsultant>((row) => ({
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url,
    unitId: row.unit_id,
    unitName: row.unit_name,
    status: row.status,
    phoneNumber: row.phone_number,
    conversationCount: Number(row.conversation_count),
    lastMessageAt: row.last_message_at,
    lastEventAt: row.last_event_at,
  }));
}

type ConversationRow = QueryResultRow & Record<string, unknown>;

function mapAnalysis(row: ConversationRow): WhatsappConversationAnalysis | null {
  if (!row.analysis_id) return null;
  return {
    id: row.analysis_id,
    status: row.analysis_status,
    rubricType: row.rubric_type,
    score: row.analysis_score === null ? null : Number(row.analysis_score),
    stage: row.analysis_stage,
    intent: row.analysis_intent,
    summary: row.analysis_summary,
    objections: jsonArray(row.objections),
    strengths: jsonArray(row.strengths),
    risks: jsonArray(row.risks),
    nextSteps: jsonArray(row.next_steps),
    evidence: jsonArray(row.evidence),
    model: row.analysis_model,
    createdAt: row.analysis_created_at,
  };
}

function conversationContactName(row: ConversationRow) {
  return selectWhatsappContactName({
    leadName: row.lead_name,
    inboundName: row.inbound_contact_name,
    storedName: row.contact_name,
    consultantName: row.consultant_name,
    phone: row.canonical_phone,
    remoteJid: row.primary_remote_jid,
  });
}

export async function listSupervisionConversations(
  session: AuthSession,
  params: {
    consultantId: string;
    unitId?: string | null;
    search?: string | null;
    limit?: number;
    before?: string | null;
  },
) {
  if (!(await canUseWhatsappSupervision(session))) return null;
  const units = allowedUnitIds(session);
  if (params.unitId && !units.includes(params.unitId)) return null;
  await refreshSupervisionContactMetadata(session, params.consultantId, params.unitId);
  const limit = Math.min(Math.max(Number(params.limit) || 30, 1), 100);
  const result = await queryDb<ConversationRow>(
    `
    select conversation.*,
      consultant.name consultant_name,
      lead.full_name lead_name, coalesce(course.name, lead.course_name_snapshot) course_name,
      inbound_contact.contact_name inbound_contact_name,
      analysis.id analysis_id, analysis.status analysis_status, analysis.rubric_type,
      analysis.score analysis_score, analysis.stage analysis_stage, analysis.intent analysis_intent,
      analysis.summary analysis_summary, analysis.objections, analysis.strengths, analysis.risks,
      analysis.next_steps, analysis.evidence, analysis.model analysis_model,
      analysis.created_at::text analysis_created_at
    from app_whatsapp_conversations conversation
    inner join app_whatsapp_instances instance on instance.id = conversation.instance_id
    inner join app_users consultant on consultant.id = conversation.consultant_id
    left join app_leads lead on lead.id = conversation.lead_id
    left join app_courses course on course.id = lead.course_id
    left join lateral (
      select * from app_whatsapp_conversation_analyses item
      where item.conversation_id = conversation.id order by item.created_at desc limit 1
    ) analysis on true
    left join lateral (
      select nullif(trim(message.contact_name), '') contact_name
      from app_whatsapp_messages message
      where message.conversation_id = conversation.id and message.direction = 'inbound'
        and nullif(trim(message.contact_name), '') is not null
      order by message.sent_at desc limit 1
    ) inbound_contact on true
    where conversation.consultant_id = $1
      and conversation.merged_into_id is null
      and conversation.unit_id = any($2::uuid[])
      and left(instance.instance_name, 5) = 'star_'
      and ($3::text is null or conversation.last_message_at < $3::timestamptz)
      and ($4::text = '' or concat_ws(' ', lead.full_name, inbound_contact.contact_name,
        conversation.contact_name, conversation.canonical_phone, conversation.primary_remote_jid)
        ilike '%' || $4 || '%')
    order by conversation.last_message_at desc nulls last limit $5`,
    [
      params.consultantId,
      params.unitId ? [params.unitId] : units,
      params.before || null,
      params.search?.trim() || "",
      limit,
    ],
  );
  return result.rows.map<WhatsappSupervisionConversation>((row) => ({
    id: row.id,
    consultantId: row.consultant_id,
    unitId: row.unit_id,
    phone: row.canonical_phone,
    remoteJid: row.primary_remote_jid,
    contactName: conversationContactName(row),
    profilePictureUrl: row.profile_picture_url || null,
    lastMessage: row.last_message_preview || "[Mensagem]",
    lastMessageAt: row.last_message_at,
    messageType: normalizeType(
      row.last_message_type,
    ) as WhatsappSupervisionConversation["messageType"],
    messageCount: Number(row.message_count),
    inboundCount: Number(row.inbound_count),
    outboundCount: Number(row.outbound_count),
    lead: row.lead_id
      ? { id: row.lead_id, name: row.lead_name, courseName: row.course_name }
      : null,
    latestAnalysis: mapAnalysis(row),
  }));
}

async function accessibleConversation(
  session: AuthSession,
  conversationId: string,
  leadership = false,
) {
  await ensureWhatsappSupervisionSchema();
  if (leadership && !(await canUseWhatsappSupervision(session))) return null;
  const result = await queryDb<ConversationRow>(
    `
    select conversation.*, instance.instance_name, instance.status instance_status,
      consultant.name consultant_name
    from app_whatsapp_conversations conversation
    inner join app_whatsapp_instances instance on instance.id = conversation.instance_id
    inner join app_users consultant on consultant.id = conversation.consultant_id
    where conversation.id = $1 and left(instance.instance_name, 5) = 'star_'
      and conversation.unit_id = any($2::uuid[])
      and ($3::boolean = false or conversation.consultant_id = $4)
    limit 1`,
    [conversationId, allowedUnitIds(session), session.user.role === "CONSULTOR", session.user.id],
  );
  return result.rows[0] ?? null;
}

export async function listSupervisionMessages(
  session: AuthSession,
  conversationId: string,
  before?: string | null,
) {
  const leadership = session.user.role !== "CONSULTOR";
  const conversation = await accessibleConversation(session, conversationId, leadership);
  if (!conversation) return null;
  const result = await queryDb<ConversationRow>(
    `
    select message.*, intervention.id intervention_id, intervention.status intervention_status,
      actor.name actor_name, actor.role actor_role
    from app_whatsapp_messages message
    left join app_whatsapp_interventions intervention
      on intervention.evolution_message_id = message.evolution_message_id
      and intervention.conversation_id = message.conversation_id
    left join app_users actor on actor.id = intervention.actor_user_id
    where message.conversation_id = $1
      and ($2::text is null or message.sent_at < $2::timestamptz)
    order by message.sent_at desc limit 60`,
    [conversationId, before || null],
  );
  return result.rows.reverse().map<WhatsappSupervisionMessage>((row) => ({
    id: row.evolution_message_id || row.id,
    direction: row.direction,
    type: normalizeType(row.message_type) as WhatsappSupervisionMessage["type"],
    content: row.deleted_at ? "Mensagem apagada" : row.content || "[Mensagem]",
    sentAt: row.sent_at,
    mediaUrl:
      normalizeType(row.message_type) !== "text" && normalizeType(row.message_type) !== "unknown"
        ? `/api/atendimentos/midia?${new URLSearchParams({
            consultantId: String(conversation.consultant_id),
            unitId: String(conversation.unit_id),
            remoteJid: String(row.remote_jid),
            messageId: String(row.evolution_message_id),
            direction: String(row.direction),
            type: String(row.message_type),
          })}`
        : null,
    mimeType: row.media_mime_type,
    fileName: row.media_file_name,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    deliveryStatus: (row.delivery_status as WhatsappDeliveryStatus | null) || null,
    intervention: row.intervention_id
      ? {
          id: row.intervention_id,
          actorName: row.actor_name,
          actorRole: row.actor_role,
          status: row.intervention_status,
        }
      : null,
  }));
}

function extractProviderMessageId(value: unknown, depth = 0): string | null {
  if (!value || depth > 5) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = extractProviderMessageId(item, depth + 1);
      if (id) return id;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const key = record.key as Record<string, unknown> | undefined;
  if (typeof key?.id === "string" && key.id) return key.id;
  if (typeof record.messageId === "string" && record.messageId) return record.messageId;
  for (const nested of Object.values(record)) {
    const id = extractProviderMessageId(nested, depth + 1);
    if (id) return id;
  }
  return null;
}

export async function sendLeadershipReply(
  session: AuthSession,
  input: {
    conversationId: string;
    clientRequestId: string;
    text: string;
  },
) {
  const conversation = await accessibleConversation(session, input.conversationId, true);
  if (!conversation) return null;
  const text = input.text.trim().slice(0, MAX_REPLY_CHARS);
  const requestId = input.clientRequestId.trim().slice(0, 160);
  if (!text || !requestId) throw new Error("Informe a mensagem e o identificador do envio.");
  if (conversation.instance_status !== "connected")
    throw new Error("O WhatsApp do consultor não está conectado.");

  const claimed = await withTransaction(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      `${session.user.id}:${requestId}`,
    ]);
    const existing = await client.query<ConversationRow>(
      `select * from app_whatsapp_interventions where actor_user_id = $1 and client_request_id = $2 limit 1`,
      [session.user.id, requestId],
    );
    if (existing.rows[0]) return { intervention: existing.rows[0], shouldSend: false };
    const inserted = await client.query<ConversationRow>(
      `
      insert into app_whatsapp_interventions
        (unit_id, consultant_id, conversation_id, actor_user_id, client_request_id, content)
      values ($1, $2, $3, $4, $5, $6) returning *`,
      [
        conversation.unit_id,
        conversation.consultant_id,
        conversation.id,
        session.user.id,
        requestId,
        text,
      ],
    );
    return { intervention: inserted.rows[0], shouldSend: true };
  });
  const intervention = claimed.intervention;
  if (!claimed.shouldSend) {
    return intervention;
  }

  const number = conversation.canonical_phone || conversation.primary_remote_jid;
  const legacyPayload = process.env.EVOLUTION_TEXT_PAYLOAD_MODE === "legacy";
  try {
    const payload = await requestEvolution(
      `/message/sendText/${encodeURIComponent(conversation.instance_name)}`,
      {
        method: "POST",
        body: JSON.stringify(legacyPayload ? { number, textMessage: { text } } : { number, text }),
      },
    );
    const messageId = extractProviderMessageId(payload);
    const updated = await queryDb<ConversationRow>(
      `
      update app_whatsapp_interventions set status = 'sent', evolution_message_id = $2,
        sent_at = now(), error_message = null, updated_at = now() where id = $1 returning *`,
      [intervention.id, messageId],
    );
    await queryDb(
      `insert into app_whatsapp_notifications (user_id, intervention_id, conversation_id)
      values ($1, $2, $3) on conflict (user_id, intervention_id) do nothing`,
      [conversation.consultant_id, intervention.id, conversation.id],
    );
    if (messageId) {
      await queryDb(
        `insert into app_whatsapp_messages (
          unit_id, user_id, instance_id, conversation_id, evolution_message_id, remote_jid, phone,
          contact_name, direction, message_type, content, delivery_status, sent_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,'outbound','text',$9,'sent',now())
        on conflict (instance_id, evolution_message_id) do nothing`,
        [
          conversation.unit_id,
          conversation.consultant_id,
          conversation.instance_id,
          conversation.id,
          messageId,
          conversation.primary_remote_jid,
          conversation.canonical_phone || "",
          conversation.contact_name,
          text,
        ],
      );
      await upsertCanonicalConversationForMessage({
        instanceId: conversation.instance_id,
        unitId: conversation.unit_id,
        consultantId: conversation.consultant_id,
        remoteJid: conversation.primary_remote_jid,
        phone: conversation.canonical_phone,
        contactName: conversation.contact_name,
        messageId,
      });
    }
    return updated.rows[0];
  } catch (error) {
    const definitive =
      error instanceof EvolutionRequestError && error.status >= 400 && error.status < 500;
    const updated = await queryDb<ConversationRow>(
      `
      update app_whatsapp_interventions set status = $2, error_message = $3, updated_at = now()
      where id = $1 returning *`,
      [
        intervention.id,
        definitive ? "failed" : "pending",
        error instanceof Error ? error.message.slice(0, 500) : "Falha ao enviar",
      ],
    );
    return updated.rows[0];
  }
}

export async function confirmIntervention(
  instanceId: string,
  messageId: string,
  match?: { conversationId: string; content: string },
) {
  await ensureWhatsappSupervisionSchema();
  let result = await queryDb<
    { id: string; consultant_id: string; conversation_id: string } & QueryResultRow
  >(
    `update app_whatsapp_interventions intervention set status = 'confirmed',
      confirmed_at = now(), updated_at = now()
    from app_whatsapp_conversations conversation
    where conversation.id = intervention.conversation_id and conversation.instance_id = $1
      and intervention.evolution_message_id = $2
    returning intervention.id, intervention.consultant_id, intervention.conversation_id`,
    [instanceId, messageId],
  );
  if (!result.rows[0] && match) {
    result = await queryDb<
      { id: string; consultant_id: string; conversation_id: string } & QueryResultRow
    >(
      `
      with candidate as (
        select intervention.id from app_whatsapp_interventions intervention
        inner join app_whatsapp_conversations conversation on conversation.id = intervention.conversation_id
        where conversation.instance_id = $1 and intervention.conversation_id = $2
          and intervention.evolution_message_id is null and intervention.content = $3
          and intervention.status in ('pending','sent')
          and intervention.created_at >= now() - interval '10 minutes'
        order by intervention.created_at desc limit 1
      )
      update app_whatsapp_interventions intervention set status = 'confirmed',
        evolution_message_id = $4, confirmed_at = now(), sent_at = coalesce(sent_at, now()),
        error_message = null, updated_at = now()
      from candidate where intervention.id = candidate.id
      returning intervention.id, intervention.consultant_id, intervention.conversation_id`,
      [instanceId, match.conversationId, match.content, messageId],
    );
  }
  const intervention = result.rows[0];
  if (intervention) {
    await queryDb(
      `insert into app_whatsapp_notifications (user_id, intervention_id, conversation_id)
      values ($1, $2, $3) on conflict (user_id, intervention_id) do nothing`,
      [intervention.consultant_id, intervention.id, intervention.conversation_id],
    );
  }
}

export async function listWhatsappNotifications(session: AuthSession) {
  await ensureWhatsappSupervisionSchema();
  const result = await queryDb<ConversationRow>(
    `
    select notification.id, notification.conversation_id, notification.read_at::text,
      notification.created_at::text, intervention.content, actor.name actor_name
    from app_whatsapp_notifications notification
    inner join app_whatsapp_interventions intervention on intervention.id = notification.intervention_id
    inner join app_users actor on actor.id = intervention.actor_user_id
    where notification.user_id = $1 order by notification.created_at desc limit 50`,
    [session.user.id],
  );
  return result.rows.map<WhatsappInterventionNotification>((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    actorName: row.actor_name,
    content: row.content,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export async function markWhatsappNotificationRead(session: AuthSession, notificationId: string) {
  await ensureWhatsappSupervisionSchema();
  await queryDb(
    `update app_whatsapp_notifications set read_at = coalesce(read_at, now())
    where id = $1 and user_id = $2`,
    [notificationId, session.user.id],
  );
}

export function conversationFingerprint(
  conversationId: string,
  lastMessageAt: string,
  messageCount: number,
) {
  return createHash("sha256")
    .update(`${conversationId}:${lastMessageAt}:${messageCount}`)
    .digest("hex");
}

export function normalizedLeadPhone(value: unknown) {
  const digits = whatsappDigits(value);
  return digits.length >= 10 ? digits : "";
}
