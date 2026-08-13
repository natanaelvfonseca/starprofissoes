import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import {
  chooseLeadCandidate,
  choosePipelineColumnByLabelName,
  didEvolutionLabelStateChange,
  evolutionEventSourceId,
  labelIdsFromEvolutionChat,
  latestEvolutionChatLabelIds,
  lidJidsFromEvolutionContacts,
  phoneFromWhatsappJid,
  phoneFromEvolutionMessages,
  phoneFromEvolutionNumberLookup,
  phoneMappingsFromEvolutionLookup,
  phonesMatch,
  parseWhatsappLabelAssociation,
  parseWhatsappLabelEdit,
} from "@/lib/whatsapp-label-automation";
import { ensureCommercialSchema } from "@/lib/server/commercial-schema";
import { queryDb, withTransaction } from "@/lib/server/db";
import { evolutionWebhookUrl, requestEvolution } from "@/lib/server/evolution-client";
import { LeadPipelineMoveError, moveLeadToPipelineColumn } from "@/lib/server/lead-pipeline";

type EvolutionInstance = QueryResultRow & {
  id: string;
  unit_id: string;
  user_id: string | null;
  instance_name: string;
  status: string;
  webhook_secret: string;
  label_webhook_configured_at?: string | null;
  labels_reconciled_at?: string | null;
  label_snapshots_initialized_at?: string | null;
};

type EvolutionLabel = {
  id: string;
  name: string;
  color: string | null;
};

type EvolutionLabelRow = QueryResultRow & {
  label_id: string;
  label_name: string;
  color: string | null;
  deleted: boolean;
};

type LeadCandidateRow = QueryResultRow & {
  id: string;
  created_by: string | null;
  stage: string;
  created_at: string;
  phone: string;
  phone2: string | null;
  pipeline_column_id: string | null;
};

type PipelineColumnRow = QueryResultRow & {
  id: string;
  name: string;
};

let labelSchemaPromise: Promise<void> | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstValue(...values: Array<unknown>) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export async function ensureEvolutionLabelAutomationSchema() {
  if (!labelSchemaPromise) {
    labelSchemaPromise = ensureCommercialSchema()
      .then(() =>
        queryDb(`
          alter table app_whatsapp_instances
            add column if not exists labels_synced_at timestamptz;
          alter table app_whatsapp_instances
            add column if not exists label_webhook_configured_at timestamptz;
          alter table app_whatsapp_instances
            add column if not exists labels_reconciled_at timestamptz;
          alter table app_whatsapp_instances
            add column if not exists label_snapshots_initialized_at timestamptz;

          create table if not exists app_whatsapp_labels (
            id uuid primary key default gen_random_uuid(),
            instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
            label_id text not null,
            label_name text not null,
            color text,
            deleted boolean not null default false,
            synced_at timestamptz not null default now(),
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now(),
            unique (instance_id, label_id)
          );
          create index if not exists app_whatsapp_labels_instance_name_idx
            on app_whatsapp_labels (instance_id, label_name)
            where deleted = false;

          create table if not exists app_whatsapp_label_events (
            id uuid primary key default gen_random_uuid(),
            unit_id uuid not null references app_units(id) on delete cascade,
            instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
            consultant_id uuid references app_users(id) on delete set null,
            lead_id uuid references app_leads(id) on delete set null,
            event_key text not null unique,
            source_event_id text,
            event_type text not null,
            action text not null,
            label_id text,
            label_name text,
            remote_jid text,
            phone text,
            previous_pipeline_column_id uuid references app_pipeline_columns(id) on delete set null,
            next_pipeline_column_id uuid references app_pipeline_columns(id) on delete set null,
            status text not null check (
              status in ('processing', 'processed', 'ignored', 'unresolved', 'error')
            ),
            reason text,
            error_message text,
            event_received_at timestamptz,
            processed_at timestamptz,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          );
          create index if not exists app_whatsapp_label_events_unit_created_idx
            on app_whatsapp_label_events (unit_id, created_at desc);
          create index if not exists app_whatsapp_label_events_instance_created_idx
            on app_whatsapp_label_events (instance_id, created_at desc);
          create index if not exists app_whatsapp_label_events_lead_idx
            on app_whatsapp_label_events (lead_id, created_at desc);

          create table if not exists app_whatsapp_label_snapshots (
            id uuid primary key default gen_random_uuid(),
            instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
            lid_jid text not null,
            label_ids text[] not null default '{}',
            observed_at timestamptz not null default now(),
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now(),
            unique (instance_id, lid_jid)
          );
          create index if not exists app_whatsapp_label_snapshots_instance_idx
            on app_whatsapp_label_snapshots (instance_id, updated_at desc);
        `),
      )
      .then(() => undefined)
      .catch((error) => {
        labelSchemaPromise = null;
        throw error;
      });
  }

  return labelSchemaPromise;
}

export async function configureEvolutionWebhook(instanceName: string, url: string) {
  await requestEvolution(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url,
        byEvents: false,
        base64: true,
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_EDITED",
          "MESSAGES_UPDATE",
          "MESSAGES_DELETE",
          "SEND_MESSAGE",
          "CONNECTION_UPDATE",
          "LABELS_EDIT",
          "LABELS_ASSOCIATION",
        ],
      },
    }),
  });
}

function extractArray(value: unknown): Array<unknown> {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  const candidate = firstValue(record.labels, record.data, record.records);
  return Array.isArray(candidate) ? candidate : [];
}

export async function fetchEvolutionLabels(instanceName: string): Promise<Array<EvolutionLabel>> {
  const payload = await requestEvolution(`/label/findLabels/${encodeURIComponent(instanceName)}`);

  return extractArray(payload)
    .map((item) => {
      const record = asRecord(item);
      const id = String(record.id ?? record.labelId ?? "").trim();
      const name = String(record.name ?? "").trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        color: record.color === undefined || record.color === null ? null : String(record.color),
      };
    })
    .filter((label): label is EvolutionLabel => Boolean(label));
}

async function syncEvolutionLabels(instance: EvolutionInstance) {
  const labels = await fetchEvolutionLabels(instance.instance_name);

  await withTransaction(async (client) => {
    await client.query(
      `
        insert into app_whatsapp_labels (
          instance_id, label_id, label_name, color, deleted, synced_at
        )
        select $1, item.id, item.name, item.color, false, now()
        from jsonb_to_recordset($2::jsonb) as item(id text, name text, color text)
        on conflict (instance_id, label_id) do update
        set label_name = excluded.label_name,
            color = excluded.color,
            deleted = false,
            synced_at = now(),
            updated_at = now()
      `,
      [instance.id, JSON.stringify(labels)],
    );
    await client.query(
      `
        update app_whatsapp_labels
        set deleted = true, synced_at = now(), updated_at = now()
        where instance_id = $1 and not (label_id = any($2::text[]))
      `,
      [instance.id, labels.map((label) => label.id)],
    );
    await client.query(
      `update app_whatsapp_instances set labels_synced_at = now(), updated_at = now() where id = $1`,
      [instance.id],
    );
  });

  return labels;
}

async function findCachedLabel(instanceId: string, labelId: string) {
  const result = await queryDb<EvolutionLabelRow>(
    `
      select label_id, label_name, color, deleted
      from app_whatsapp_labels
      where instance_id = $1 and label_id = $2 and deleted = false
      limit 1
    `,
    [instanceId, labelId],
  );
  const row = result.rows[0];
  return row ? { id: row.label_id, name: row.label_name, color: row.color } : null;
}

async function resolveEvolutionLabel(instance: EvolutionInstance, labelId: string) {
  const cached = await findCachedLabel(instance.id, labelId);
  if (cached) return { label: cached, error: null };

  try {
    const labels = await syncEvolutionLabels(instance);
    return { label: labels.find((label) => label.id === labelId) ?? null, error: null };
  } catch (error) {
    return {
      label: null,
      error: error instanceof Error ? error.message : "Falha ao sincronizar as etiquetas.",
    };
  }
}

async function saveEvolutionLabelEdit(
  instanceId: string,
  label: { labelId: string; name: string; color: string | null; deleted: boolean },
) {
  await queryDb(
    `
      insert into app_whatsapp_labels (
        instance_id, label_id, label_name, color, deleted, synced_at
      )
      values ($1, $2, $3, $4, $5, now())
      on conflict (instance_id, label_id) do update
      set label_name = case
            when nullif(excluded.label_name, '') is null then app_whatsapp_labels.label_name
            else excluded.label_name
          end,
          color = excluded.color,
          deleted = excluded.deleted,
          synced_at = now(),
          updated_at = now()
    `,
    [
      instanceId,
      label.labelId,
      label.name || `Etiqueta ${label.labelId}`,
      label.color,
      label.deleted,
    ],
  );
}

function eventMetadata(payload: unknown) {
  const record = asRecord(payload);
  const sourceEventId = evolutionEventSourceId(payload);
  const dateTime = String(firstValue(record.date_time, record.dateTime) ?? "");
  const received = dateTime && !Number.isNaN(new Date(dateTime).getTime()) ? dateTime : null;

  return { sourceEventId, received };
}

function eventKey(params: {
  payload: unknown;
  instanceName: string;
  event: string;
  action: string;
  labelId: string;
  chatId?: string;
}) {
  const metadata = eventMetadata(params.payload);
  const stablePayload = metadata.sourceEventId
    ? `${params.instanceName}|${params.event}|${metadata.sourceEventId}`
    : `${params.instanceName}|${params.event}|${JSON.stringify(params.payload)}`;

  return createHash("sha256").update(stablePayload).digest("hex");
}

async function beginAuditEvent(params: {
  payload: unknown;
  instance: EvolutionInstance;
  event: string;
  action: string;
  labelId: string;
  labelName?: string | null;
  chatId?: string | null;
  phone?: string | null;
}) {
  const metadata = eventMetadata(params.payload);
  const result = await queryDb<{ id: string }>(
    `
      insert into app_whatsapp_label_events (
        unit_id, instance_id, consultant_id, event_key, source_event_id,
        event_type, action, label_id, label_name, remote_jid, phone, status,
        event_received_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'processing', $12)
      on conflict (event_key) do nothing
      returning id
    `,
    [
      params.instance.unit_id,
      params.instance.id,
      params.instance.user_id,
      eventKey({
        payload: params.payload,
        instanceName: params.instance.instance_name,
        event: params.event,
        action: params.action,
        labelId: params.labelId,
        chatId: params.chatId ?? undefined,
      }),
      metadata.sourceEventId,
      params.event,
      params.action,
      params.labelId || null,
      params.labelName ?? null,
      params.chatId ?? null,
      params.phone ?? null,
      metadata.received,
    ],
  );

  return result.rows[0]?.id ?? null;
}

async function finishAuditEvent(
  id: string,
  values: {
    status: "processed" | "ignored" | "unresolved" | "error";
    reason?: string | null;
    error?: string | null;
    leadId?: string | null;
    phone?: string | null;
    labelName?: string | null;
    previousColumnId?: string | null;
    nextColumnId?: string | null;
  },
) {
  await queryDb(
    `
      update app_whatsapp_label_events
      set status = $2,
          reason = $3,
          error_message = $4,
          lead_id = coalesce($5, lead_id),
          phone = coalesce($6, phone),
          label_name = coalesce($7, label_name),
          previous_pipeline_column_id = $8,
          next_pipeline_column_id = $9,
          processed_at = now(),
          updated_at = now()
      where id = $1
    `,
    [
      id,
      values.status,
      values.reason ?? null,
      values.error?.slice(0, 2_000) ?? null,
      values.leadId ?? null,
      values.phone ?? null,
      values.labelName ?? null,
      values.previousColumnId ?? null,
      values.nextColumnId ?? null,
    ],
  );
}

async function saveLidMapping(instanceId: string, lidJid: string, phone: string) {
  await queryDb(
    `
      insert into app_whatsapp_jid_mappings (instance_id, lid_jid, phone)
      values ($1, $2, $3)
      on conflict (instance_id, lid_jid) do update
      set phone = excluded.phone, updated_at = now()
    `,
    [instanceId, lidJid, phone],
  );
}

async function saveLabelSnapshot(instanceId: string, lidJid: string, labelIds: Array<string>) {
  await queryDb(
    `
      insert into app_whatsapp_label_snapshots (instance_id, lid_jid, label_ids, observed_at)
      values ($1, $2, $3::text[], now())
      on conflict (instance_id, lid_jid) do update
      set label_ids = excluded.label_ids,
          observed_at = now(),
          updated_at = now()
    `,
    [instanceId, lidJid, labelIds],
  );
}

async function applyLabelSnapshotEvent(
  instanceId: string,
  lidJid: string,
  labelId: string,
  action: "add" | "remove",
) {
  if (!lidJid.toLowerCase().endsWith("@lid")) return;

  await queryDb(
    `
      insert into app_whatsapp_label_snapshots (instance_id, lid_jid, label_ids, observed_at)
      values ($1, $2, case when $4 = 'add' then array[$3]::text[] else '{}'::text[] end, now())
      on conflict (instance_id, lid_jid) do update
      set label_ids = case
            when $4 = 'add' then array(
              select distinct item
              from unnest(app_whatsapp_label_snapshots.label_ids || array[$3]::text[]) item
              order by item
            )
            else array_remove(app_whatsapp_label_snapshots.label_ids, $3)
          end,
          observed_at = now(),
          updated_at = now()
    `,
    [instanceId, lidJid, labelId, action],
  );
}

async function resolvePhone(instance: EvolutionInstance, chatId: string, phoneJid?: string) {
  const directPhone = phoneFromWhatsappJid(phoneJid) || phoneFromWhatsappJid(chatId);
  if (directPhone) return directPhone;

  if (chatId.toLowerCase().endsWith("@lid")) {
    const mappingResult = await queryDb<{ phone: string }>(
      `
        select phone
        from app_whatsapp_jid_mappings
        where instance_id = $1 and lid_jid = $2
        limit 1
      `,
      [instance.id, chatId],
    );
    if (mappingResult.rows[0]?.phone) return mappingResult.rows[0].phone;
  }

  const result = await queryDb<{ phone: string }>(
    `
      select phone
      from app_whatsapp_messages
      where instance_id = $1 and remote_jid = $2 and nullif(phone, '') is not null
      order by sent_at desc
      limit 1
    `,
    [instance.id, chatId],
  );

  if (result.rows[0]?.phone) return result.rows[0].phone;

  if (!chatId.toLowerCase().endsWith("@lid")) return "";

  let phone = "";
  try {
    const lookup = await requestEvolution(
      `/chat/whatsappNumbers/${encodeURIComponent(instance.instance_name)}`,
      {
        method: "POST",
        body: JSON.stringify({ numbers: [chatId] }),
      },
    );
    phone = phoneFromEvolutionNumberLookup(lookup);
  } catch {
    // Algumas versões antigas da Evolution ainda não resolvem LID neste endpoint.
  }

  if (!phone) {
    try {
      const messages = await requestEvolution(
        `/chat/findMessages/${encodeURIComponent(instance.instance_name)}`,
        {
          method: "POST",
          body: JSON.stringify({ where: { key: { remoteJid: chatId } }, limit: 20 }),
        },
      );
      phone = phoneFromEvolutionMessages(messages);
    } catch {
      // Sem histórico não há uma segunda fonte segura para converter o LID.
    }
  }

  if (phone) await saveLidMapping(instance.id, chatId, phone);

  return phone;
}

async function resolveLead(unitId: string, consultantId: string, phone: string) {
  const suffix = phone.replace(/\D/g, "").slice(-8);
  if (suffix.length !== 8) return { candidate: null, ambiguous: false };

  const result = await queryDb<LeadCandidateRow>(
    `
      select id, created_by, stage, created_at::text, phone, phone2, pipeline_column_id
      from app_leads
      where unit_id = $1
        and (
          right(regexp_replace(phone, '\\D', '', 'g'), 8) = $2
          or right(regexp_replace(coalesce(phone2, ''), '\\D', '', 'g'), 8) = $2
        )
      order by created_at desc
      limit 30
    `,
    [unitId, suffix],
  );
  const matching = result.rows.filter(
    (lead) => phonesMatch(lead.phone, phone) || phonesMatch(lead.phone2, phone),
  );

  return chooseLeadCandidate(
    matching.map((lead) => ({
      ...lead,
      createdBy: lead.created_by,
      createdAt: lead.created_at,
    })),
    consultantId,
  );
}

async function resolvePipelineColumn(unitId: string, labelName: string) {
  const result = await queryDb<PipelineColumnRow>(
    `
      select id, name
      from app_pipeline_columns
      where unit_id = $1 and pipeline_type = 'leads'
      order by position, created_at
    `,
    [unitId],
  );
  return choosePipelineColumnByLabelName(result.rows, labelName);
}

async function discoverEvolutionLidMappings(instance: EvolutionInstance) {
  const contactsPayload = await requestEvolution(
    `/chat/findContacts/${encodeURIComponent(instance.instance_name)}`,
    {
      method: "POST",
      body: JSON.stringify({ offset: 2_500, page: 1 }),
    },
  );
  const lids = lidJidsFromEvolutionContacts(contactsPayload);
  if (!lids.length) return [];

  const lookupPayload = await requestEvolution(
    `/chat/whatsappNumbers/${encodeURIComponent(instance.instance_name)}`,
    {
      method: "POST",
      body: JSON.stringify({ numbers: lids }),
    },
  );
  const mappings = phoneMappingsFromEvolutionLookup(lookupPayload);

  await Promise.all(
    mappings.map((mapping) => saveLidMapping(instance.id, mapping.lidJid, mapping.phone)),
  );

  return mappings;
}

function evolutionChatJids(lidJid: string, phone: string) {
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneJids = phoneDigits ? [`${phoneDigits}@s.whatsapp.net`] : [];

  return Array.from(new Set([lidJid, ...phoneJids]));
}

async function fetchCurrentEvolutionLabelIds(
  instanceName: string,
  lidJid: string,
  phone: string,
) {
  const chats = await Promise.all(
    evolutionChatJids(lidJid, phone).map((remoteJid) =>
      requestEvolution(
        `/chat/findChatByRemoteJid/${encodeURIComponent(instanceName)}?remoteJid=${encodeURIComponent(remoteJid)}`,
        { signal: AbortSignal.timeout(4_000) },
      ).catch(() => null),
    ),
  );

  return latestEvolutionChatLabelIds(chats);
}

async function reconcileEvolutionLabelAssociations(instance: EvolutionInstance) {
  if (!instance.user_id) return { checked: 0, moved: 0 };

  const [labels, discoveredMappings, columnsResult] = await Promise.all([
    syncEvolutionLabels(instance),
    discoverEvolutionLidMappings(instance),
    queryDb<PipelineColumnRow>(
      `
        select id, name
        from app_pipeline_columns
        where unit_id = $1 and pipeline_type = 'leads'
        order by position, created_at
      `,
      [instance.unit_id],
    ),
  ]);
  const storedMappings = await queryDb<{ lid_jid: string; phone: string }>(
    `
      select lid_jid, phone
      from app_whatsapp_jid_mappings
      where instance_id = $1
      order by updated_at desc
      limit 500
    `,
    [instance.id],
  );
  const storedSnapshots = await queryDb<{ lid_jid: string; label_ids: Array<string> }>(
    `
      select lid_jid, label_ids
      from app_whatsapp_label_snapshots
      where instance_id = $1
    `,
    [instance.id],
  );
  const mappings = new Map<string, string>();
  storedMappings.rows.forEach((mapping) => mappings.set(mapping.lid_jid, mapping.phone));
  discoveredMappings.forEach((mapping) => mappings.set(mapping.lidJid, mapping.phone));
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const snapshotByLid = new Map(
    storedSnapshots.rows.map((snapshot) => [snapshot.lid_jid, snapshot.label_ids]),
  );

  const chatMatches = await Promise.all(
    Array.from(mappings, async ([lidJid, phone]) => {
      try {
        const matchingColumns = new Map<string, PipelineColumnRow>();
        const currentLabelIds = await fetchCurrentEvolutionLabelIds(
          instance.instance_name,
          lidJid,
          phone,
        );

        for (const labelId of currentLabelIds) {
          const label = labelById.get(labelId);
          if (!label) continue;
          const resolution = choosePipelineColumnByLabelName(columnsResult.rows, label.name);
          if (resolution.column && !resolution.ambiguous) {
            matchingColumns.set(resolution.column.id, resolution.column);
          }
        }

        return {
          lidJid,
          phone,
          labelIds: currentLabelIds,
          changed: snapshotByLid.has(lidJid)
            ? didEvolutionLabelStateChange(snapshotByLid.get(lidJid), currentLabelIds)
            : Boolean(instance.label_snapshots_initialized_at && currentLabelIds.length),
          columns: Array.from(matchingColumns.values()),
        };
      } catch {
        return null;
      }
    }),
  );
  await Promise.all(
    chatMatches
      .filter((match): match is NonNullable<typeof match> => Boolean(match))
      .map((match) => saveLabelSnapshot(instance.id, match.lidJid, match.labelIds)),
  );
  if (!instance.label_snapshots_initialized_at) {
    await queryDb(
      `update app_whatsapp_instances set label_snapshots_initialized_at = now(), updated_at = now() where id = $1`,
      [instance.id],
    );
  }
  const columnsByPhone = new Map<string, Map<string, PipelineColumnRow>>();
  chatMatches.forEach((match) => {
    if (!match?.changed) return;
    const { phone, columns } = match;
    const current = columnsByPhone.get(phone) ?? new Map<string, PipelineColumnRow>();
    columns.forEach((column) => current.set(column.id, column));
    columnsByPhone.set(phone, current);
  });

  const reconciled = await Promise.all(
    Array.from(columnsByPhone, async ([phone, matchingColumns]) => {
      try {
        if (matchingColumns.size !== 1) return false;
        const column = Array.from(matchingColumns.values())[0];
        const lead = await resolveLead(instance.unit_id, instance.user_id, phone);
        if (!lead.candidate || lead.ambiguous) return false;

        const moved = await moveLeadToPipelineColumn({
          leadId: lead.candidate.id,
          pipelineColumnId: column.id,
          claimUserId: instance.user_id,
        });
        return moved.changed;
      } catch {
        return false;
      }
    }),
  );

  return { checked: mappings.size, moved: reconciled.filter(Boolean).length };
}

export async function reconcileEvolutionLabelsForUser(
  userId: string,
  unitId: string,
  requestUrl: string,
) {
  await ensureEvolutionLabelAutomationSchema();
  const lease = await queryDb<EvolutionInstance>(
    `
      update app_whatsapp_instances instance
      set labels_reconciled_at = now(), updated_at = now()
      where instance.id = (
        select candidate.id
        from app_whatsapp_instances candidate
        where candidate.user_id = $1
          and candidate.unit_id = $2
          and candidate.status = 'connected'
          and (
            candidate.labels_reconciled_at is null
            or candidate.labels_reconciled_at < now() - interval '20 seconds'
          )
        order by candidate.updated_at desc
        limit 1
        for update skip locked
      )
      returning instance.*
    `,
    [userId, unitId],
  );
  const instance = lease.rows[0];
  if (!instance) return { checked: 0, moved: 0 };

  const webhookConfiguredAt = instance.label_webhook_configured_at
    ? new Date(instance.label_webhook_configured_at).getTime()
    : 0;
  if (!webhookConfiguredAt || Date.now() - webhookConfiguredAt > 5 * 60_000) {
    try {
      await configureEvolutionWebhook(
        instance.instance_name,
        evolutionWebhookUrl(requestUrl, instance.webhook_secret),
      );
      await queryDb(
        `update app_whatsapp_instances set label_webhook_configured_at = now(), updated_at = now() where id = $1`,
        [instance.id],
      );
    } catch {
      // A reconciliação direta ainda funciona quando apenas o webhook está indisponível.
    }
  }

  return reconcileEvolutionLabelAssociations(instance);
}

async function processLabelAssociation(params: {
  payload: unknown;
  instance: EvolutionInstance;
  event: string;
}) {
  const association = parseWhatsappLabelAssociation(params.payload);
  if (!association) return;

  await applyLabelSnapshotEvent(
    params.instance.id,
    association.chatId,
    association.labelId,
    association.action,
  );
  const phone = await resolvePhone(params.instance, association.chatId, association.phoneJid);
  const labelResolution =
    association.action === "add"
      ? await resolveEvolutionLabel(params.instance, association.labelId)
      : { label: await findCachedLabel(params.instance.id, association.labelId), error: null };
  const auditId = await beginAuditEvent({
    payload: params.payload,
    instance: params.instance,
    event: params.event,
    action: association.action,
    labelId: association.labelId,
    labelName: labelResolution.label?.name,
    chatId: association.chatId,
    phone,
  });

  if (!auditId) return;

  if (association.action === "remove") {
    await finishAuditEvent(auditId, {
      status: "ignored",
      reason: "Etiqueta removida; a automação não retrocede etapas do CRM.",
    });
    return;
  }

  if (!labelResolution.label) {
    await finishAuditEvent(auditId, {
      status: "unresolved",
      reason: "Não foi possível identificar o nome da etiqueta na Evolution.",
      error: labelResolution.error,
    });
    return;
  }

  const columnResolution = await resolvePipelineColumn(
    params.instance.unit_id,
    labelResolution.label.name,
  );
  if (columnResolution.ambiguous) {
    await finishAuditEvent(auditId, {
      status: "unresolved",
      reason: `Mais de uma coluna do CRM corresponde à etiqueta “${labelResolution.label.name}”.`,
    });
    return;
  }
  if (!columnResolution.column) {
    await finishAuditEvent(auditId, {
      status: "ignored",
      reason: `Nenhuma coluna do CRM possui o nome “${labelResolution.label.name}”.`,
    });
    return;
  }

  if (!params.instance.user_id) {
    await finishAuditEvent(auditId, {
      status: "unresolved",
      reason: "A instância não está vinculada a um consultor.",
    });
    return;
  }
  if (!phone) {
    await finishAuditEvent(auditId, {
      status: "unresolved",
      reason: "Não foi possível resolver o telefone a partir do JID recebido.",
    });
    return;
  }

  const resolved = await resolveLead(params.instance.unit_id, params.instance.user_id, phone);
  if (resolved.ambiguous) {
    await finishAuditEvent(auditId, {
      status: "unresolved",
      reason: "Há mais de um lead com a mesma prioridade para este telefone.",
    });
    return;
  }
  if (!resolved.candidate) {
    await finishAuditEvent(auditId, {
      status: "unresolved",
      reason: "Nenhum lead foi encontrado para o telefone normalizado.",
    });
    return;
  }

  try {
    const moved = await moveLeadToPipelineColumn({
      leadId: resolved.candidate.id,
      pipelineColumnId: columnResolution.column.id,
      claimUserId: params.instance.user_id,
    });

    await finishAuditEvent(auditId, {
      status: moved.changed ? "processed" : "ignored",
      reason: moved.changed
        ? `Lead movido automaticamente para “${columnResolution.column.name}”.`
        : "Lead já estava na coluna correspondente à etiqueta.",
      leadId: resolved.candidate.id,
      phone,
      previousColumnId: moved.previousPipelineColumnId,
      nextColumnId: moved.pipelineColumnId,
    });
  } catch (error) {
    await finishAuditEvent(auditId, {
      status: "error",
      reason: error instanceof LeadPipelineMoveError ? error.message : "Falha ao mover o lead.",
      error: error instanceof Error ? error.message : String(error),
      leadId: resolved.candidate.id,
      phone,
      previousColumnId: resolved.candidate.pipeline_column_id,
      nextColumnId: columnResolution.column.id,
    });
  }
}

async function processLabelEdit(params: {
  payload: unknown;
  instance: EvolutionInstance;
  event: string;
}) {
  const edit = parseWhatsappLabelEdit(params.payload);
  if (!edit) return;

  await saveEvolutionLabelEdit(params.instance.id, edit);
  const auditId = await beginAuditEvent({
    payload: params.payload,
    instance: params.instance,
    event: params.event,
    action: edit.deleted ? "delete" : "edit",
    labelId: edit.labelId,
    labelName: edit.name,
  });
  if (!auditId) return;

  await finishAuditEvent(auditId, {
    status: "processed",
    reason: edit.deleted
      ? "Etiqueta removida do catálogo automático."
      : "Nome da etiqueta atualizado no catálogo automático.",
    labelName: edit.name || null,
  });
}

export async function processEvolutionLabelEvent(params: {
  payload: unknown;
  event: string;
  instance: EvolutionInstance;
}) {
  await ensureEvolutionLabelAutomationSchema();

  try {
    if (params.event === "labels.association") {
      await processLabelAssociation(params);
    } else if (params.event === "labels.edit") {
      await processLabelEdit(params);
    }
  } finally {
    await queryDb(
      `update app_whatsapp_instances set last_event_at = now(), updated_at = now() where id = $1`,
      [params.instance.id],
    );
  }
}
