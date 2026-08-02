import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import {
  chooseLeadCandidate,
  phoneFromWhatsappJid,
  phonesMatch,
  parseWhatsappLabelAssociation,
  parseWhatsappLabelEdit,
} from "@/lib/whatsapp-label-automation";
import { ensureCommercialSchema } from "@/lib/server/commercial-schema";
import { queryDb } from "@/lib/server/db";
import { evolutionWebhookUrl, requestEvolution } from "@/lib/server/evolution-client";
import { LeadPipelineMoveError, moveLeadToPipelineColumn } from "@/lib/server/lead-pipeline";

type EvolutionInstance = QueryResultRow & {
  id: string;
  unit_id: string;
  user_id: string | null;
  instance_name: string;
  status: string;
  webhook_secret: string;
  labels_synced_at?: string | null;
};

type LabelRuleRow = QueryResultRow & {
  id: string;
  unit_id: string;
  instance_id: string;
  label_id: string;
  label_name: string;
  pipeline_column_id: string;
  active: boolean;
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

type EvolutionLabel = {
  id: string;
  name: string;
  color: string | null;
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

        create table if not exists app_whatsapp_label_rules (
          id uuid primary key default gen_random_uuid(),
          unit_id uuid not null references app_units(id) on delete cascade,
          instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
          label_id text not null,
          label_name text not null,
          pipeline_column_id uuid not null references app_pipeline_columns(id) on delete cascade,
          active boolean not null default true,
          created_by uuid references app_users(id) on delete set null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (instance_id, label_id)
        );
        create index if not exists app_whatsapp_label_rules_unit_idx
          on app_whatsapp_label_rules (unit_id, active, updated_at desc);
        create index if not exists app_whatsapp_label_rules_column_idx
          on app_whatsapp_label_rules (pipeline_column_id);

        create table if not exists app_whatsapp_label_events (
          id uuid primary key default gen_random_uuid(),
          unit_id uuid not null references app_units(id) on delete cascade,
          instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
          consultant_id uuid references app_users(id) on delete set null,
          lead_id uuid references app_leads(id) on delete set null,
          rule_id uuid references app_whatsapp_label_rules(id) on delete set null,
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
          status text not null check (status in ('processing', 'processed', 'ignored', 'unresolved', 'error')),
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

function eventMetadata(payload: unknown) {
  const record = asRecord(payload);
  const data = asRecord(record.data);
  const sourceEventId = String(firstValue(record.id, record.eventId, data.id, data.eventId, ""));
  const dateTime = String(firstValue(record.date_time, record.dateTime, ""));
  const received = dateTime && !Number.isNaN(new Date(dateTime).getTime()) ? dateTime : null;

  return { sourceEventId: sourceEventId || null, received };
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
    : [
        params.instanceName,
        params.event,
        params.action,
        params.labelId,
        params.chatId ?? "",
        metadata.received ?? "",
      ].join("|");

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
  ruleId?: string | null;
}) {
  const metadata = eventMetadata(params.payload);
  const result = await queryDb<{ id: string }>(
    `
      insert into app_whatsapp_label_events (
        unit_id, instance_id, consultant_id, rule_id, event_key, source_event_id,
        event_type, action, label_id, label_name, remote_jid, phone, status,
        event_received_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'processing', $13)
      on conflict (event_key) do nothing
      returning id
    `,
    [
      params.instance.unit_id,
      params.instance.id,
      params.instance.user_id,
      params.ruleId ?? null,
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
    ruleId?: string | null;
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
          rule_id = coalesce($8, rule_id),
          previous_pipeline_column_id = $9,
          next_pipeline_column_id = $10,
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
      values.ruleId ?? null,
      values.previousColumnId ?? null,
      values.nextColumnId ?? null,
    ],
  );
}

async function resolvePhone(instanceId: string, chatId: string) {
  const directPhone = phoneFromWhatsappJid(chatId);
  if (directPhone) return directPhone;

  const result = await queryDb<{ phone: string }>(
    `
      select phone
      from app_whatsapp_messages
      where instance_id = $1 and remote_jid = $2 and nullif(phone, '') is not null
      order by sent_at desc
      limit 1
    `,
    [instanceId, chatId],
  );

  return result.rows[0]?.phone ?? "";
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

async function processLabelAssociation(params: {
  payload: unknown;
  instance: EvolutionInstance;
  event: string;
}) {
  const association = parseWhatsappLabelAssociation(params.payload);
  if (!association) return;

  const ruleResult = await queryDb<LabelRuleRow>(
    `select * from app_whatsapp_label_rules where instance_id = $1 and label_id = $2 limit 1`,
    [params.instance.id, association.labelId],
  );
  const rule = ruleResult.rows[0] ?? null;
  const phone = await resolvePhone(params.instance.id, association.chatId);
  const auditId = await beginAuditEvent({
    payload: params.payload,
    instance: params.instance,
    event: params.event,
    action: association.action,
    labelId: association.labelId,
    labelName: rule?.label_name,
    chatId: association.chatId,
    phone,
    ruleId: rule?.id,
  });

  if (!auditId) return;

  if (association.action === "remove") {
    await finishAuditEvent(auditId, {
      status: "ignored",
      reason: "Etiqueta removida; a automação é somente WhatsApp → CRM e não retrocede etapas.",
    });
    return;
  }

  if (!rule) {
    await finishAuditEvent(auditId, {
      status: "ignored",
      reason: "Nenhuma regra cadastrada para esta etiqueta e instância.",
    });
    return;
  }

  if (!rule.active) {
    await finishAuditEvent(auditId, { status: "ignored", reason: "Regra inativa." });
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
      pipelineColumnId: rule.pipeline_column_id,
      claimUserId: params.instance.user_id,
    });

    await finishAuditEvent(auditId, {
      status: moved.changed ? "processed" : "ignored",
      reason: moved.changed
        ? "Lead movido automaticamente pela etiqueta do WhatsApp."
        : "Lead já estava na etapa configurada.",
      leadId: resolved.candidate.id,
      phone,
      ruleId: rule.id,
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
      ruleId: rule.id,
      previousColumnId: resolved.candidate.pipeline_column_id,
      nextColumnId: rule.pipeline_column_id,
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

  const ruleResult = await queryDb<LabelRuleRow>(
    `select * from app_whatsapp_label_rules where instance_id = $1 and label_id = $2 limit 1`,
    [params.instance.id, edit.labelId],
  );
  const rule = ruleResult.rows[0] ?? null;
  const auditId = await beginAuditEvent({
    payload: params.payload,
    instance: params.instance,
    event: params.event,
    action: edit.deleted ? "delete" : "edit",
    labelId: edit.labelId,
    labelName: edit.name || rule?.label_name,
    ruleId: rule?.id,
  });
  if (!auditId) return;

  if (!rule) {
    await finishAuditEvent(auditId, {
      status: "ignored",
      reason: "Etiqueta atualizada sem regra cadastrada.",
    });
    return;
  }

  await queryDb(
    `
      update app_whatsapp_label_rules
      set label_name = coalesce(nullif($3, ''), label_name),
          active = case when $4 then false else active end,
          updated_at = now()
      where instance_id = $1 and label_id = $2
    `,
    [params.instance.id, edit.labelId, edit.name, edit.deleted],
  );
  await finishAuditEvent(auditId, {
    status: "processed",
    reason: edit.deleted
      ? "Etiqueta excluída no WhatsApp; a regra foi desativada."
      : "Nome da etiqueta sincronizado na regra.",
    labelName: edit.name || rule.label_name,
    ruleId: rule.id,
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

async function getScopedInstance(unitId: string, instanceId?: string | null) {
  const result = await queryDb<EvolutionInstance & { consultant_name: string; consultant_email: string }>(
    `
      select instance.*, consultant.name as consultant_name, consultant.email as consultant_email
      from app_whatsapp_instances instance
      inner join app_users consultant on consultant.id = instance.user_id
      where instance.unit_id = $1
        and consultant.role = 'CONSULTOR'
        and consultant.status = 'active'
        and ($2::uuid is null or instance.id = $2)
      order by (instance.status = 'connected') desc, consultant.name
      limit 1
    `,
    [unitId, instanceId || null],
  );
  return result.rows[0] ?? null;
}

export async function getEvolutionLabelAutomationDashboard(params: {
  unitId: string;
  instanceId?: string | null;
  requestUrl: string;
}) {
  await ensureEvolutionLabelAutomationSchema();
  const instancesResult = await queryDb<
    EvolutionInstance & { consultant_name: string; consultant_email: string }
  >(
    `
      select instance.*, consultant.name as consultant_name, consultant.email as consultant_email
      from app_whatsapp_instances instance
      inner join app_users consultant on consultant.id = instance.user_id
      where instance.unit_id = $1
        and consultant.role = 'CONSULTOR'
        and consultant.status = 'active'
      order by (instance.status = 'connected') desc, consultant.name
    `,
    [params.unitId],
  );
  const selected =
    instancesResult.rows.find((instance) => instance.id === params.instanceId) ??
    instancesResult.rows[0] ??
    null;

  let labels: Array<EvolutionLabel> = [];
  let labelsError: string | null = null;
  let webhookError: string | null = null;
  let lastSyncAt = selected?.labels_synced_at ?? null;
  let evolutionVersion: string | null = null;

  if (selected) {
    try {
      await configureEvolutionWebhook(
        selected.instance_name,
        evolutionWebhookUrl(params.requestUrl, selected.webhook_secret),
      );
      await queryDb(
        `update app_whatsapp_instances set label_webhook_configured_at = now(), updated_at = now() where id = $1`,
        [selected.id],
      );
    } catch (error) {
      webhookError = error instanceof Error ? error.message : "Falha ao configurar o webhook.";
    }

    try {
      labels = await fetchEvolutionLabels(selected.instance_name);
      await queryDb(
        `update app_whatsapp_instances set labels_synced_at = now(), updated_at = now() where id = $1`,
        [selected.id],
      );
      lastSyncAt = new Date().toISOString();
    } catch (error) {
      labelsError = error instanceof Error ? error.message : "Falha ao buscar etiquetas.";
    }

    try {
      const serverInfo = asRecord(await requestEvolution("/"));
      evolutionVersion = String(firstValue(serverInfo.version, serverInfo.versionCode, "")) || null;
    } catch {
      // A versão é apenas informativa e não bloqueia a automação.
    }
  }

  const [rulesResult, columnsResult, eventsResult] = await Promise.all([
    queryDb(
      `
        select rule.id, rule.instance_id as "instanceId", rule.label_id as "labelId",
          rule.label_name as "labelName", rule.pipeline_column_id as "pipelineColumnId",
          column_data.name as "pipelineColumnName", rule.active, rule.updated_at::text as "updatedAt"
        from app_whatsapp_label_rules rule
        inner join app_pipeline_columns column_data on column_data.id = rule.pipeline_column_id
        where rule.unit_id = $1 and ($2::uuid is null or rule.instance_id = $2)
        order by rule.active desc, rule.label_name
      `,
      [params.unitId, selected?.id ?? null],
    ),
    queryDb(
      `
        select id, name, color, position
        from app_pipeline_columns
        where unit_id = $1 and pipeline_type = 'leads'
        order by position, created_at
      `,
      [params.unitId],
    ),
    queryDb(
      `
        select event.id, event.event_type as "eventType", event.action, event.label_name as "labelName",
          event.phone, event.status, event.reason, event.error_message as "errorMessage",
          event.created_at::text as "createdAt", lead.full_name as "leadName",
          consultant.name as "consultantName", previous.name as "previousColumnName",
          next.name as "nextColumnName"
        from app_whatsapp_label_events event
        left join app_leads lead on lead.id = event.lead_id
        left join app_users consultant on consultant.id = event.consultant_id
        left join app_pipeline_columns previous on previous.id = event.previous_pipeline_column_id
        left join app_pipeline_columns next on next.id = event.next_pipeline_column_id
        where event.unit_id = $1 and ($2::uuid is null or event.instance_id = $2)
        order by event.created_at desc
        limit 12
      `,
      [params.unitId, selected?.id ?? null],
    ),
  ]);

  if (!labels.length) {
    labels = rulesResult.rows.map((rule) => ({
      id: String(rule.labelId),
      name: String(rule.labelName),
      color: null,
    }));
  }

  return {
    instances: instancesResult.rows.map((instance) => ({
      id: instance.id,
      name: instance.instance_name,
      consultantName: instance.consultant_name,
      consultantEmail: instance.consultant_email,
      status: instance.status,
      labelsSyncedAt: instance.labels_synced_at ?? null,
    })),
    selectedInstanceId: selected?.id ?? null,
    labels,
    labelsError,
    webhookError,
    evolutionVersion,
    rules: rulesResult.rows,
    columns: columnsResult.rows,
    recentEvents: eventsResult.rows,
    summary: {
      active: rulesResult.rows.some((rule) => rule.active === true),
      activeRules: rulesResult.rows.filter((rule) => rule.active === true).length,
      totalRules: rulesResult.rows.length,
      lastSyncAt,
      lastEventAt: eventsResult.rows[0]?.createdAt ?? null,
    },
  };
}

export async function saveEvolutionLabelRule(params: {
  unitId: string;
  instanceId: string;
  labelId: string;
  pipelineColumnId: string;
  active: boolean;
  userId: string;
}) {
  await ensureEvolutionLabelAutomationSchema();
  const instance = await getScopedInstance(params.unitId, params.instanceId);
  if (!instance) throw new Error("Instância do consultor não encontrada.");

  const labels = await fetchEvolutionLabels(instance.instance_name);
  const label = labels.find((item) => item.id === params.labelId);
  if (!label) throw new Error("A etiqueta não existe na instância selecionada.");

  const columnResult = await queryDb<{ id: string }>(
    `
      select id from app_pipeline_columns
      where id = $1 and unit_id = $2 and pipeline_type = 'leads'
      limit 1
    `,
    [params.pipelineColumnId, params.unitId],
  );
  if (!columnResult.rows[0]) throw new Error("Etapa do pipeline não encontrada.");

  const result = await queryDb(
    `
      insert into app_whatsapp_label_rules (
        unit_id, instance_id, label_id, label_name, pipeline_column_id, active, created_by
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (instance_id, label_id) do update
      set label_name = excluded.label_name,
          pipeline_column_id = excluded.pipeline_column_id,
          active = excluded.active,
          updated_at = now()
      returning id
    `,
    [
      params.unitId,
      params.instanceId,
      label.id,
      label.name,
      params.pipelineColumnId,
      params.active,
      params.userId,
    ],
  );
  return result.rows[0];
}

export async function updateEvolutionLabelRule(params: {
  unitId: string;
  ruleId: string;
  pipelineColumnId: string;
  active: boolean;
}) {
  await ensureEvolutionLabelAutomationSchema();
  const result = await queryDb(
    `
      update app_whatsapp_label_rules rule
      set pipeline_column_id = $3, active = $4, updated_at = now()
      where rule.id = $1 and rule.unit_id = $2
        and exists (
          select 1 from app_pipeline_columns column_data
          where column_data.id = $3 and column_data.unit_id = $2 and column_data.pipeline_type = 'leads'
        )
      returning rule.id
    `,
    [params.ruleId, params.unitId, params.pipelineColumnId, params.active],
  );
  if (!result.rows[0]) throw new Error("Regra ou etapa não encontrada.");
  return result.rows[0];
}

export async function deleteEvolutionLabelRule(unitId: string, ruleId: string) {
  await ensureEvolutionLabelAutomationSchema();
  const result = await queryDb(
    `delete from app_whatsapp_label_rules where id = $1 and unit_id = $2 returning id`,
    [ruleId, unitId],
  );
  if (!result.rows[0]) throw new Error("Regra não encontrada.");
}
