import { createHmac, createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import type { LeadStage } from "@/lib/commercial-types";
import { createMetaImportSummary, recordMetaImportResult } from "@/lib/meta-import-summary";
import { ensureCommercialSchema, isUuid } from "@/lib/server/commercial-schema";
import {
  ensureCourseAttendanceSchema,
  findCampaignAttendance,
  getAttendanceConsultants,
  parseCampaignRoute,
} from "@/lib/server/course-attendances";
import { ensureRuntimeSchema, queryDb, withTransaction } from "@/lib/server/db";
import {
  ensureMetaPageLeadgenSubscription,
  fetchAllMetaGraphPages,
  metaGraphErrorDetails,
  metaGraphRequest,
} from "@/lib/server/meta-graph";
import {
  isMetaConnectionAlreadyUnavailable,
  type MetaGraphErrorPayload,
} from "@/lib/server/meta-disconnect";
import {
  parseKognaMetaLeadEvent,
  parseMetaLeadEvents,
  type ParsedMetaLeadEvent,
} from "@/lib/server/meta-webhook-payload";
import type { MakeMetaLeadPayload } from "@/lib/server/make-meta-bridge";
import { getMetaUnitConfigurationIssue, resolveMetaPageUnit } from "@/lib/server/meta-unit-routing";

export type MetaDistributionRule =
  | "fixed"
  | "round_robin"
  | "random"
  | "least_open"
  | "unit_consultants"
  | "selected_consultants"
  | "unassigned"
  | "keep_existing";

export type MetaFieldMapping = {
  source: string;
  target:
    | "fullName"
    | "phone"
    | "phone2"
    | "email"
    | "city"
    | "courseName"
    | "observations"
    | "ignore";
  required?: boolean;
  defaultValue?: string;
  transform?: "none" | "lowercase" | "uppercase" | "phone_digits";
  example?: string;
};

type MetaIntegrationRow = QueryResultRow & {
  id: string;
  app_id: string | null;
  app_secret: string | null;
  verify_token: string | null;
  graph_api_version: string;
  status: "active" | "inactive";
  callback_url: string | null;
  last_communication_at: string | null;
  total_events_received: number;
  total_leads_created: number;
  total_errors: number;
  created_at: string;
  updated_at: string;
};

type MetaPageRow = QueryResultRow & {
  id: string;
  integration_id: string;
  unit_id: string | null;
  unit_name?: string | null;
  page_name: string;
  page_id: string;
  page_access_token_encrypted: string | null;
  token_status: "unknown" | "valid" | "invalid";
  last_validated_at: string | null;
  leadgen_subscribed_at: string | null;
  forms_synced_at: string | null;
  subscription_status: "unknown" | "subscribed" | "not_subscribed" | "error";
  forms_count: string;
  leads_received_count: number;
  status: "active" | "inactive";
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type MetaFormRow = QueryResultRow & {
  id: string;
  page_id: string;
  page_name: string;
  meta_page_id: string;
  form_name: string;
  meta_form_id: string;
  unit_id: string | null;
  page_unit_id?: string | null;
  unit_name: string | null;
  course_id: string | null;
  course_name: string | null;
  attendance_id: string | null;
  attendance_city: string | null;
  attendance_state: string | null;
  attendance_class_date: string | null;
  attendance_status: "active" | "inactive" | null;
  funnel_name: string | null;
  initial_stage: LeadStage;
  acquisition_channel_id: string | null;
  acquisition_channel_name: string | null;
  default_responsible_id: string | null;
  default_responsible_name: string | null;
  distribution_rule: MetaDistributionRule;
  field_mapping: Array<MetaFieldMapping>;
  settings: Record<string, unknown>;
  selected_consultant_ids: Array<string> | null;
  status: "active" | "inactive";
  meta_status: string;
  meta_created_time: string | null;
  last_seen_at: string | null;
  configured_at: string | null;
  synced_at: string | null;
  last_lead_received_at: string | null;
  leads_received_count: number;
  created_at: string;
  updated_at: string;
};

type MetaProcessingForm = Pick<
  MetaFormRow,
  "status" | "unit_id" | "field_mapping" | "attendance_id" | "acquisition_channel_id"
> & {
  id: string | null;
  page_id: string | null;
};

type MetaEventRow = QueryResultRow & {
  id: string;
  page_db_id: string | null;
  form_db_id: string | null;
  lead_id: string | null;
  page_id: string;
  form_id: string;
  leadgen_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  form_name: string | null;
  page_name: string | null;
  meta_created_time: string | null;
  received_at: string;
  processed_at: string | null;
  status: "received" | "pending_configuration" | "processing" | "processed" | "duplicate" | "error";
  error_message: string | null;
  distribution_reason: string | null;
  attendance_id: string | null;
  assigned_user_id: string | null;
  routing_source: "form_turma" | "campaign_matrix" | "form_fallback" | null;
  routing_error: string | null;
  processing_stage: string | null;
  error_type: string | null;
  error_code: string | null;
  error_subcode: string | null;
  fbtrace_id: string | null;
  payload: Record<string, unknown>;
  lead_payload: Record<string, unknown> | null;
  mapped_payload: Record<string, unknown> | null;
};

type DefaultMarketingOwnerRow = QueryResultRow & {
  id: string;
  name: string;
};

type CourseSnapshotRow = QueryResultRow & {
  id: string;
  name: string;
  value: string;
};

type ChannelSnapshotRow = QueryResultRow & {
  id: string;
  name: string;
};

type MetaLeadPayload = {
  id?: string;
  created_time?: string;
  field_data?: Array<{ name?: string; values?: Array<string> }>;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  form_id?: string;
  form_name?: string;
  page_id?: string;
  page_name?: string;
};

type MetaGraphForm = {
  id?: string;
  name?: string;
  status?: string;
  created_time?: string;
};

type MetaProcessingStage =
  | "received"
  | "hmac_validated"
  | "token_resolved"
  | "lead_fetched"
  | "form_resolved"
  | "lead_created"
  | "duplicate"
  | "pending_configuration"
  | "failed";

function logMetaStage(input: {
  eventId?: string | null;
  leadgenId: string;
  pageId: string;
  formId: string;
  stage: MetaProcessingStage;
  status: string;
  errorCode?: string | null;
  fbtraceId?: string | null;
}) {
  console.info("[Meta Ads] lead pipeline", {
    event_id: input.eventId ?? null,
    leadgen_id: input.leadgenId,
    page_id: input.pageId,
    form_id: input.formId,
    client: "star",
    stage: input.stage,
    status: input.status,
    error_code: input.errorCode ?? null,
    fbtrace_id: input.fbtraceId ?? null,
  });
}

function metaTechnicalMessage(error: unknown, fallback: string) {
  const details = metaGraphErrorDetails(error);
  if (!details) return error instanceof Error && error.message ? error.message : fallback;

  return [
    details.message,
    details.code ? `code=${details.code}` : "",
    details.subcode ? `subcode=${details.subcode}` : "",
    details.fbtraceId ? `fbtrace_id=${details.fbtraceId}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export const META_WEBHOOK_PATH = "/api/webhooks/meta-leads";

const allowedStages: Array<LeadStage> = [
  "Novo lead",
  "Em contato",
  "Qualificado",
  "Proposta",
  "Pagamento pendente",
  "Confirmado",
  "Recuperação",
  "Matriculado",
];

let metaSchemaPromise: Promise<void> | null = null;

export async function ensureMetaLeadSchema() {
  await ensureCommercialSchema();
  await ensureCourseAttendanceSchema();

  metaSchemaPromise ??= ensureRuntimeSchema(
    "meta-leads",
    `
    create table if not exists app_meta_integrations (
      id uuid primary key default gen_random_uuid(),
      app_id text,
      app_secret text,
      verify_token text,
      graph_api_version text not null default 'v23.0',
      status text not null default 'inactive' check (status in ('active', 'inactive')),
      callback_url text,
      last_communication_at timestamptz,
      total_events_received integer not null default 0 check (total_events_received >= 0),
      total_leads_created integer not null default 0 check (total_leads_created >= 0),
      total_errors integer not null default 0 check (total_errors >= 0),
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create unique index if not exists app_meta_integrations_singleton_idx
      on app_meta_integrations ((true));

    create table if not exists app_meta_pages (
      id uuid primary key default gen_random_uuid(),
      integration_id uuid not null references app_meta_integrations(id) on delete cascade,
      page_name text not null,
      page_id text not null,
      page_access_token_encrypted text,
      token_status text not null default 'unknown' check (token_status in ('unknown', 'valid', 'invalid')),
      last_validated_at timestamptz,
      subscription_status text not null default 'unknown' check (subscription_status in ('unknown', 'subscribed', 'not_subscribed', 'error')),
      leads_received_count integer not null default 0 check (leads_received_count >= 0),
      status text not null default 'active' check (status in ('active', 'inactive')),
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (page_id)
    );

    alter table app_meta_pages
      add column if not exists unit_id uuid references app_units(id) on delete restrict;

    create index if not exists app_meta_pages_integration_idx on app_meta_pages (integration_id);
    create index if not exists app_meta_pages_status_idx on app_meta_pages (status);
    create index if not exists app_meta_pages_unit_idx
      on app_meta_pages (unit_id, status, created_at desc);

    alter table app_meta_pages add column if not exists leadgen_subscribed_at timestamptz;
    alter table app_meta_pages add column if not exists forms_synced_at timestamptz;

    create table if not exists app_meta_oauth_unit_contexts (
      id uuid primary key default gen_random_uuid(),
      nonce text not null unique,
      user_id uuid not null references app_users(id) on delete cascade,
      unit_id uuid not null references app_units(id) on delete restrict,
      connect_timestamp bigint not null,
      callback_count integer not null default 0 check (callback_count >= 0),
      last_callback_at timestamptz,
      completed_at timestamptz,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create index if not exists app_meta_oauth_unit_contexts_pending_idx
      on app_meta_oauth_unit_contexts (expires_at desc)
      where completed_at is null;

    create table if not exists app_meta_forms (
      id uuid primary key default gen_random_uuid(),
      page_id uuid not null references app_meta_pages(id) on delete cascade,
      form_name text not null,
      meta_form_id text not null,
      unit_id uuid references app_units(id) on delete set null,
      course_id uuid references app_courses(id) on delete set null,
      funnel_name text,
      initial_stage text not null default 'Novo lead',
      acquisition_channel_id uuid references app_acquisition_channels(id) on delete set null,
      default_responsible_id uuid references app_users(id) on delete set null,
      distribution_rule text not null default 'unassigned',
      round_robin_cursor integer not null default 0 check (round_robin_cursor >= 0),
      field_mapping jsonb not null default '[]'::jsonb,
      settings jsonb not null default '{}'::jsonb,
      status text not null default 'inactive' check (status in ('active', 'inactive')),
      configured_at timestamptz,
      synced_at timestamptz,
      last_lead_received_at timestamptz,
      leads_received_count integer not null default 0 check (leads_received_count >= 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (page_id, meta_form_id)
    );

    create index if not exists app_meta_forms_page_idx on app_meta_forms (page_id);
    create index if not exists app_meta_forms_unit_idx on app_meta_forms (unit_id);
    create index if not exists app_meta_forms_status_idx on app_meta_forms (status);

    alter table app_meta_forms add column if not exists attendance_id uuid
      references app_course_attendances(id) on delete set null;
    alter table app_meta_forms add column if not exists meta_status text not null default 'UNKNOWN';
    alter table app_meta_forms add column if not exists meta_created_time timestamptz;
    alter table app_meta_forms add column if not exists last_seen_at timestamptz;
    create index if not exists app_meta_forms_attendance_idx on app_meta_forms (attendance_id);

    create table if not exists app_make_meta_form_connections (
      id uuid primary key default gen_random_uuid(),
      form_id text not null unique,
      turma_id uuid not null references app_course_attendances(id) on delete restrict,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists app_make_meta_form_connections_turma_idx
      on app_make_meta_form_connections (turma_id, active);

    insert into app_make_meta_form_connections (form_id, turma_id)
    select meta_form_id, attendance_id
    from app_meta_forms
    where attendance_id is not null
    on conflict (form_id) do nothing;

    create table if not exists app_meta_form_consultants (
      form_id uuid not null references app_meta_forms(id) on delete cascade,
      user_id uuid not null references app_users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (form_id, user_id)
    );

    create table if not exists app_meta_lead_events (
      id uuid primary key default gen_random_uuid(),
      integration_id uuid references app_meta_integrations(id) on delete set null,
      page_db_id uuid references app_meta_pages(id) on delete set null,
      form_db_id uuid references app_meta_forms(id) on delete set null,
      lead_id uuid references app_leads(id) on delete set null,
      page_id text not null,
      form_id text not null,
      leadgen_id text not null,
      campaign_id text,
      campaign_name text,
      adset_id text,
      adset_name text,
      ad_id text,
      ad_name text,
      form_name text,
      page_name text,
      meta_created_time timestamptz,
      received_at timestamptz not null default now(),
      processed_at timestamptz,
      status text not null default 'received' check (
        status in ('received', 'pending_configuration', 'processing', 'processed', 'duplicate', 'error')
      ),
      error_message text,
      distribution_reason text,
      payload jsonb not null,
      lead_payload jsonb,
      mapped_payload jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (leadgen_id)
    );

    create index if not exists app_meta_events_form_idx on app_meta_lead_events (page_id, form_id);
    create index if not exists app_meta_events_status_idx on app_meta_lead_events (status, received_at desc);
    create index if not exists app_meta_events_lead_idx on app_meta_lead_events (lead_id);

    alter table app_meta_lead_events
      add column if not exists attendance_id uuid references app_course_attendances(id) on delete set null;
    alter table app_meta_lead_events
      add column if not exists assigned_user_id uuid references app_users(id) on delete set null;
    alter table app_meta_lead_events
      add column if not exists routing_source text;
    alter table app_meta_lead_events
      add column if not exists routing_error text;
    alter table app_meta_lead_events
      add column if not exists processing_stage text;
    alter table app_meta_lead_events
      add column if not exists error_type text;
    alter table app_meta_lead_events
      add column if not exists error_code text;
    alter table app_meta_lead_events
      add column if not exists error_subcode text;
    alter table app_meta_lead_events
      add column if not exists fbtrace_id text;
  `,
  )
    .then(() => undefined)
    .catch((error) => {
      metaSchemaPromise = null;
      throw error;
    });

  await metaSchemaPromise;
}

const META_OAUTH_CONTEXT_LOCK = "star_profissoes:meta_oauth_unit_context";

export async function createMetaOAuthUnitContext(userId: string, unitId: string) {
  await ensureMetaLeadSchema();

  return withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [META_OAUTH_CONTEXT_LOCK]);

    const activeResult = await client.query<{
      user_id: string;
      unit_id: string;
    }>(
      `
        select user_id, unit_id
        from app_meta_oauth_unit_contexts
        where completed_at is null and expires_at > now()
        order by created_at desc
        limit 2
        for update
      `,
    );
    const active = activeResult.rows[0];

    if (
      activeResult.rows.some((context) => context.user_id !== userId || context.unit_id !== unitId)
    ) {
      throw new Error(
        "Já existe uma conexão Meta em andamento para outra unidade. Conclua ou aguarde alguns minutos.",
      );
    }

    if (active) {
      await client.query(
        `update app_meta_oauth_unit_contexts set completed_at = now() where completed_at is null`,
      );
    }

    const nonce = randomBytes(24).toString("hex");
    const connectTimestamp = Math.floor(Date.now() / 1000);
    await client.query(
      `
        insert into app_meta_oauth_unit_contexts (
          nonce, user_id, unit_id, connect_timestamp, expires_at
        )
        values ($1, $2, $3, $4, now() + interval '15 minutes')
      `,
      [nonce, userId, unitId, connectTimestamp],
    );

    return { nonce, timestamp: connectTimestamp };
  });
}

export async function resolveMetaOAuthUnitContext() {
  await ensureMetaLeadSchema();

  return withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [META_OAUTH_CONTEXT_LOCK]);
    const contextResult = await client.query<{ id: string; unit_id: string }>(
      `
        select id, unit_id
        from app_meta_oauth_unit_contexts
        where completed_at is null and expires_at > now()
        order by created_at desc
        limit 2
        for update
      `,
    );

    if (contextResult.rows.length !== 1) {
      throw new Error(
        contextResult.rows.length
          ? "Há mais de um contexto de unidade para esta conexão Meta. Inicie a conexão novamente."
          : "O contexto de unidade da conexão Meta expirou. Inicie a conexão novamente.",
      );
    }

    const context = contextResult.rows[0];
    await client.query(
      `
        update app_meta_oauth_unit_contexts
        set callback_count = callback_count + 1, last_callback_at = now()
        where id = $1
      `,
      [context.id],
    );

    return { unitId: context.unit_id };
  });
}

export async function completeMetaOAuthUnitContext(userId: string) {
  await ensureMetaLeadSchema();
  const result = await queryDb(
    `
      update app_meta_oauth_unit_contexts
      set completed_at = now()
      where user_id = $1 and completed_at is null
      returning id
    `,
    [userId],
  );

  return { completed: Boolean(result.rowCount) };
}

export async function ensureMetaIntegration(createdBy?: string) {
  await ensureMetaLeadSchema();

  const result = await queryDb<MetaIntegrationRow>(
    `
      insert into app_meta_integrations (
        app_id,
        app_secret,
        verify_token,
        graph_api_version,
        status,
        callback_url,
        created_by
      )
      values (
        nullif($1, ''),
        nullif($2, ''),
        nullif($3, ''),
        coalesce(nullif($4, ''), 'v23.0'),
        'inactive',
        nullif($5, ''),
        $6
      )
      on conflict do nothing
      returning *
    `,
    [
      process.env.META_APP_ID ?? "",
      process.env.META_APP_SECRET ?? "",
      process.env.META_VERIFY_TOKEN ?? "",
      process.env.META_GRAPH_API_VERSION ?? "v23.0",
      process.env.META_CALLBACK_URL ?? "",
      createdBy ?? null,
    ],
  );

  if (result.rows[0]) return withMetaEnvironment(result.rows[0]);

  const existing = await queryDb<MetaIntegrationRow>(
    `
      select
        id,
        app_id,
        app_secret,
        verify_token,
        graph_api_version,
        status,
        callback_url,
        last_communication_at::text,
        total_events_received,
        total_leads_created,
        total_errors,
        created_at::text,
        updated_at::text
      from app_meta_integrations
      order by created_at asc
      limit 1
    `,
  );

  return withMetaEnvironment(existing.rows[0]);
}

function withMetaEnvironment(integration: MetaIntegrationRow) {
  if (!integration) throw new Error("Integração Meta não encontrada.");

  return {
    ...integration,
    app_id: integration.app_id || process.env.META_APP_ID || null,
    app_secret: integration.app_secret || process.env.META_APP_SECRET || null,
    verify_token: integration.verify_token || process.env.META_VERIFY_TOKEN || null,
    graph_api_version:
      integration.graph_api_version || process.env.META_GRAPH_API_VERSION || "v23.0",
    callback_url: integration.callback_url || process.env.META_CALLBACK_URL || null,
  };
}

export async function getMetaIntegration() {
  return ensureMetaIntegration();
}

export async function assertMetaPageInUnit(pageDbId: string, unitId: string) {
  if (!isUuid(pageDbId) || !isUuid(unitId)) {
    throw new Error("Página inválida.");
  }

  await ensureMetaLeadSchema();
  const result = await queryDb(
    `select 1 from app_meta_pages where id = $1 and unit_id = $2 limit 1`,
    [pageDbId, unitId],
  );

  if (!result.rowCount) {
    throw new Error("A Página Meta não pertence à unidade ativa.");
  }
}

function encryptionKey() {
  const secret =
    process.env.META_TOKEN_ENCRYPTION_KEY ||
    process.env.APP_SECRET ||
    process.env.META_APP_SECRET ||
    process.env.DATABASE_URL ||
    "star-profissoes-meta-local-dev-key";

  return createHash("sha256").update(secret).digest();
}

export function encryptPageToken(token: string) {
  if (!token.trim()) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptPageToken(encrypted: string | null) {
  if (!encrypted) {
    return "";
  }

  const [ivRaw, tagRaw, valueRaw] = encrypted.split(".");
  if (!ivRaw || !tagRaw || !valueRaw) {
    return "";
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(valueRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskToken(encrypted: string | null) {
  const token = decryptPageToken(encrypted);

  if (!token) {
    return null;
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function normalizeMapping(value: unknown): Array<MetaFieldMapping> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => item as Partial<MetaFieldMapping>)
    .filter((item) => typeof item.source === "string" && typeof item.target === "string")
    .map((item) => ({
      source: item.source?.trim() ?? "",
      target: item.target as MetaFieldMapping["target"],
      required: Boolean(item.required),
      defaultValue: typeof item.defaultValue === "string" ? item.defaultValue : "",
      transform: item.transform ?? "none",
      example: typeof item.example === "string" ? item.example : "",
    }))
    .filter((item) => item.source && item.target);
}

function leadFieldsFromMeta(lead: MetaLeadPayload) {
  const fields: Record<string, string> = {};

  for (const field of lead.field_data ?? []) {
    const name = field.name?.trim();

    if (!name) {
      continue;
    }

    fields[name] = field.values?.filter(Boolean).join(", ") ?? "";
  }

  return fields;
}

function normalizeMetaFieldName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sourceFieldValue(fields: Record<string, string>, name: string) {
  if (fields[name]) {
    return fields[name];
  }

  const normalizedName = normalizeMetaFieldName(name);
  const matchingEntry = Object.entries(fields).find(
    ([fieldName]) => normalizeMetaFieldName(fieldName) === normalizedName,
  );

  return matchingEntry?.[1] ?? "";
}

function phoneDigits(value: string) {
  return value.replace(/\D+/g, "");
}

function phoneTextLooksRelevant(fieldName: string, value: string) {
  const normalizedName = normalizeMetaFieldName(fieldName);
  const normalizedValue = normalizeMetaFieldName(value);

  if (/url|link|inbox|psid|thread|facebook|business/.test(normalizedName)) {
    return false;
  }

  return /phone|fone|telefone|tel|celular|whats|whatsapp|zap|contato|ddd|descricao|description/.test(
    `${normalizedName}_${normalizedValue}`,
  );
}

function extractPhoneCandidates(value: string) {
  const candidates = new Set<string>();
  const matches = value.matchAll(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4,5}[-.\s]?\d{4}/g);

  for (const match of matches) {
    const candidate = match[0].trim();
    const digits = phoneDigits(candidate);

    if (digits.length >= 10 && digits.length <= 13) {
      candidates.add(candidate);
    }
  }

  const compactDigits = phoneDigits(value);
  if (compactDigits.length >= 10 && compactDigits.length <= 13) {
    candidates.add(value.trim());
  }

  return Array.from(candidates);
}

function phoneCandidatesFromFields(fields: Record<string, string>) {
  const candidates: Array<{ value: string; relevant: boolean }> = [];

  for (const [fieldName, value] of Object.entries(fields)) {
    const normalizedName = normalizeMetaFieldName(fieldName);

    if (/url|link|inbox|psid|thread|facebook|business/.test(normalizedName)) {
      continue;
    }

    const fieldCandidates = extractPhoneCandidates(value);

    for (const candidate of fieldCandidates) {
      candidates.push({
        value: candidate,
        relevant: phoneTextLooksRelevant(fieldName, value),
      });
    }
  }

  return candidates;
}

function phoneFieldValue(fields: Record<string, string>) {
  const explicitValue = firstField(fields, [
    "phone_number",
    "numero_de_telefone",
    "numero_telefone",
    "telefone_celular",
    "telefone_com_ddd",
    "telefone_para_contato",
    "telefone",
    "celular",
    "phone",
  ]);

  if (explicitValue) {
    return explicitValue;
  }

  const phoneLikeEntry = Object.entries(fields).find(([fieldName, value]) => {
    const normalizedName = normalizeMetaFieldName(fieldName);
    const digits = phoneDigits(value);

    return (
      digits.length >= 8 &&
      /phone|fone|telefone|tel|celular|ddd/.test(normalizedName) &&
      !/whats|whatsapp|zap|contato/.test(normalizedName)
    );
  });

  if (phoneLikeEntry?.[1]) {
    return phoneLikeEntry[1];
  }

  const relevantCandidate = phoneCandidatesFromFields(fields).find(
    (candidate) => candidate.relevant,
  );

  if (relevantCandidate) {
    return relevantCandidate.value;
  }

  const valueLikePhone = Object.values(fields).find((value) => {
    const digits = phoneDigits(value);

    return digits.length >= 10 && digits.length <= 13;
  });

  return valueLikePhone ?? phoneCandidatesFromFields(fields)[0]?.value ?? "";
}

function phone2FieldValue(fields: Record<string, string>, primaryPhone: string) {
  const primaryDigits = phoneDigits(primaryPhone);
  const isDifferentPhone = (value: string) => {
    const digits = phoneDigits(value);
    return Boolean(value) && (!primaryDigits || digits !== primaryDigits);
  };
  const explicitValue = firstField(fields, [
    "phone_2",
    "phone2",
    "telefone_2",
    "telefone2",
    "segundo_telefone",
    "segundo_numero",
    "telefone_secundario",
    "telefone_alternativo",
    "outro_telefone",
    "celular_2",
    "celular2",
    "whatsapp_2",
    "whatsapp2",
    "whatsapp_number",
    "numero_do_whatsapp",
    "número_do_whatsapp",
    "whats_2",
    "contato_2",
  ]);

  if (explicitValue) {
    return explicitValue;
  }

  const phoneLikeEntry = Object.entries(fields).find(([fieldName, value]) => {
    const normalizedName = normalizeMetaFieldName(fieldName);
    const digits = phoneDigits(value);

    return (
      digits.length >= 8 &&
      isDifferentPhone(value) &&
      /phone|fone|telefone|tel|celular|whats|zap|contato|ddd/.test(normalizedName)
    );
  });

  if (phoneLikeEntry?.[1]) {
    return phoneLikeEntry[1];
  }

  return (
    phoneCandidatesFromFields(fields).find(
      (candidate) => candidate.relevant && isDifferentPhone(candidate.value),
    )?.value ??
    phoneCandidatesFromFields(fields).find((candidate) => isDifferentPhone(candidate.value))
      ?.value ??
    ""
  );
}

function transformValue(value: string, transform: MetaFieldMapping["transform"]) {
  if (transform === "lowercase") {
    return value.toLowerCase();
  }

  if (transform === "uppercase") {
    return value.toUpperCase();
  }

  if (transform === "phone_digits") {
    return value.replace(/\D+/g, "");
  }

  return value;
}

function firstField(fields: Record<string, string>, names: Array<string>) {
  for (const name of names) {
    const value = sourceFieldValue(fields, name);

    if (value) {
      return value;
    }
  }

  return "";
}

function formatMetaObservationLabel(value: string) {
  const label = value.replace(/_/g, " ").replace(/\s+/g, " ").trim();

  return label ? label.charAt(0).toUpperCase() + label.slice(1) : value;
}

function shouldHideMetaObservationField(fieldName: string, mappedRuleSources: Set<string>) {
  const normalizedName = normalizeMetaFieldName(fieldName);
  const hiddenNames = new Set([
    "full_name",
    "nome_completo",
    "nome_e_sobrenome",
    "nome",
    "name",
    "phone_number",
    "phone_2",
    "phone2",
    "numero_de_telefone",
    "numero_telefone",
    "segundo_telefone",
    "telefone_2",
    "telefone2",
    "telefone_celular",
    "telefone_com_ddd",
    "telefone_para_contato",
    "telefone_secundario",
    "telefone_alternativo",
    "outro_telefone",
    "telefone",
    "celular",
    "celular_2",
    "celular2",
    "phone",
    "whatsapp",
    "whatsapp_number",
    "numero_do_whatsapp",
    "número_do_whatsapp",
    "whatsapp_2",
    "whatsapp2",
    "whats",
    "whats_2",
    "email",
    "e_mail",
    "city",
    "cidade",
    "qual_cidade_voce_mora",
    "qual_cidade_você_mora",
    "em_qual_cidade_voce_mora",
    "em_qual_cidade_você_mora",
    "cidade_onde_mora",
    "cidade_que_mora",
    "onde_voce_mora",
    "onde_você_mora",
    "course",
    "curso",
    "curso_de_interesse",
    "qual_curso_voce_deseja",
  ]);

  return hiddenNames.has(normalizedName) || mappedRuleSources.has(normalizedName);
}

function cleanMetaLeadObservations(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      const normalizedLine = normalizeMetaFieldName(line);

      return (
        line &&
        !normalizedLine.startsWith("meta_lead_id") &&
        !normalizedLine.startsWith("campanha") &&
        !normalizedLine.startsWith("anuncio") &&
        !normalizedLine.startsWith("roteamento") &&
        !normalizedLine.startsWith("nome_nao_informado_pela_meta") &&
        !normalizedLine.startsWith("telefone_nao_informado_pela_meta")
      );
    })
    .join("\n");
}

function cityFieldValue(fields: Record<string, string>) {
  return firstField(fields, [
    "city",
    "cidade",
    "qual_cidade_voce_mora",
    "qual_cidade_você_mora",
    "em_qual_cidade_voce_mora",
    "em_qual_cidade_você_mora",
    "qual_sua_cidade",
    "cidade_onde_mora",
    "cidade_que_mora",
    "onde_voce_mora",
    "onde_você_mora",
  ]);
}

function campaignCityValue(campaignName: string | null, attendanceCity: string | null) {
  if (attendanceCity) {
    return attendanceCity;
  }

  if (!campaignName) {
    return "";
  }

  const parsed = parseCampaignRoute(campaignName);

  return "error" in parsed ? "" : parsed.city;
}

export function mapMetaLead(lead: MetaLeadPayload, mapping: Array<MetaFieldMapping>) {
  const sourceFields = leadFieldsFromMeta(lead);
  const mapped = {
    fullName: "",
    phone: "",
    phone2: "",
    email: "",
    city: "",
    courseName: "",
    observations: "",
    sourceFields,
    missingRequiredFields: [] as Array<string>,
  };

  const rules = normalizeMapping(mapping);
  const mappedRuleSources = new Set(
    rules
      .filter((rule) => !["observations", "ignore"].includes(rule.target))
      .map((rule) => normalizeMetaFieldName(rule.source)),
  );

  if (!rules.length) {
    mapped.fullName = firstField(sourceFields, [
      "full_name",
      "nome_completo",
      "nome_e_sobrenome",
      "nome",
      "name",
    ]);
    mapped.phone = phoneFieldValue(sourceFields);
    mapped.phone2 = phone2FieldValue(sourceFields, mapped.phone);
    mapped.email = firstField(sourceFields, ["email", "e-mail"]);
    mapped.city = cityFieldValue(sourceFields);
    mapped.courseName = firstField(sourceFields, [
      "course",
      "curso",
      "curso_de_interesse",
      "qual_curso_voce_deseja",
    ]);
  }

  for (const rule of rules) {
    let rawValue = sourceFieldValue(sourceFields, rule.source) || rule.defaultValue || "";

    if (!rawValue && rule.target === "fullName") {
      rawValue = firstField(sourceFields, [
        "full_name",
        "nome_completo",
        "nome_e_sobrenome",
        "nome",
        "name",
      ]);
    } else if (!rawValue && rule.target === "phone") {
      rawValue = phoneFieldValue(sourceFields);
    } else if (!rawValue && rule.target === "phone2") {
      rawValue = phone2FieldValue(sourceFields, mapped.phone || phoneFieldValue(sourceFields));
    } else if (!rawValue && rule.target === "email") {
      rawValue = firstField(sourceFields, ["email", "e_mail"]);
    } else if (!rawValue && rule.target === "city") {
      rawValue = cityFieldValue(sourceFields);
    }

    const value = transformValue(rawValue.trim(), rule.transform);

    if (!value || rule.target === "ignore") {
      continue;
    }

    if (rule.target === "observations") {
      mapped.observations = [
        mapped.observations,
        `${formatMetaObservationLabel(rule.source)}: ${value}`,
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      mapped[rule.target] = value;
    }
  }

  if (!mapped.phone2) {
    mapped.phone2 = phone2FieldValue(sourceFields, mapped.phone || phoneFieldValue(sourceFields));
  }

  if (!mapped.observations) {
    mapped.observations = Object.entries(sourceFields)
      .filter(([key]) => !shouldHideMetaObservationField(key, mappedRuleSources))
      .map(([key, value]) => `${formatMetaObservationLabel(key)}: ${value}`)
      .join("\n");
  }

  if (!mapped.fullName.trim()) {
    mapped.missingRequiredFields.push("nome");
  }

  const primaryPhoneDigits = phoneDigits(mapped.phone);
  if (primaryPhoneDigits.length < 10 || primaryPhoneDigits.length > 13) {
    mapped.missingRequiredFields.push("telefone");
  }

  return mapped;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function fetchMetaLeadDetails(
  leadgenId: string,
  token: string,
  integration: MetaIntegrationRow,
) {
  const version = integration.graph_api_version || "v23.0";
  const params = new URLSearchParams({
    fields:
      "id,created_time,field_data,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,form_id",
  });
  return metaGraphRequest<MetaLeadPayload>(
    `https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}?${params}`,
    { token, appSecret: integration.app_secret },
  );
}

async function fetchMetaLeadDetailsWithRetry(
  leadgenId: string,
  token: string,
  integration: MetaIntegrationRow,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchMetaLeadDetails(leadgenId, token, integration);
    } catch (error) {
      lastError = error;

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Falha ao consultar os dados do lead na Graph API.");
}

function leadPayloadFromWebhookValue(
  value: Record<string, unknown>,
  parsed: ParsedMetaLeadEvent,
): MetaLeadPayload | null {
  const fieldData = Array.isArray(value.field_data)
    ? (value.field_data as MetaLeadPayload["field_data"])
    : null;

  if (!fieldData?.length) {
    return null;
  }

  return {
    id: parsed.leadgenId,
    field_data: fieldData,
    campaign_id: parsed.campaignId ?? undefined,
    adset_id: parsed.adsetId ?? undefined,
    ad_id: parsed.adId ?? undefined,
    form_id: parsed.formId,
    page_id: parsed.pageId,
    created_time: parsed.createdTime ?? undefined,
  };
}

export function verifyMetaSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string | null,
) {
  if (!appSecret) {
    return true;
  }

  if (!signature?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;

  return expected.length === signature.length && expected === signature;
}

export async function listMetaState(unitId: string, searchValue = "") {
  if (!isUuid(unitId)) {
    throw new Error("Unidade inválida.");
  }

  const integration = await ensureMetaIntegration();
  const search = searchValue.trim().slice(0, 200);

  const [
    pagesResult,
    formsResult,
    processedEventsResult,
    pendingEventsResult,
    optionsResult,
    alertsResult,
    metricsResult,
  ] = await Promise.all([
    queryDb<MetaPageRow>(
      `
        select
          p.*,
          p.created_at::text,
          p.updated_at::text,
          p.last_validated_at::text,
          p.leadgen_subscribed_at::text,
          p.forms_synced_at::text,
          u.name as unit_name,
          count(f.id)::text as forms_count
        from app_meta_pages p
        inner join app_units u on u.id = p.unit_id
        left join app_meta_forms f on f.page_id = p.id
        where p.unit_id = $1
        group by p.id, u.id
        order by p.created_at desc
      `,
      [unitId],
    ),
    queryDb<MetaFormRow>(
      `
        select
          f.*,
          p.unit_id,
          p.page_name,
          p.page_id as meta_page_id,
          u.name as unit_name,
          c.name as course_name,
          a.city as attendance_city,
          a.state as attendance_state,
          a.class_date::text as attendance_class_date,
          a.status as attendance_status,
          ch.name as acquisition_channel_name,
          owner.name as default_responsible_name,
          coalesce(array_agg(fc.user_id::text) filter (where fc.user_id is not null), '{}') as selected_consultant_ids,
          f.created_at::text,
          f.updated_at::text,
          f.configured_at::text,
          f.synced_at::text,
          f.last_lead_received_at::text,
          f.meta_created_time::text,
          f.last_seen_at::text
        from app_meta_forms f
        inner join app_meta_pages p on p.id = f.page_id
        inner join app_units u on u.id = p.unit_id
        left join app_courses c on c.id = f.course_id
        left join app_course_attendances a on a.id = f.attendance_id
        left join app_acquisition_channels ch on ch.id = f.acquisition_channel_id
        left join app_users owner on owner.id = f.default_responsible_id
        left join app_meta_form_consultants fc on fc.form_id = f.id
        where p.unit_id = $1
        group by f.id, p.id, u.id, c.id, a.id, ch.id, owner.id
        order by f.created_at desc
      `,
      [unitId],
    ),
    queryDb<MetaEventRow>(
      `
        select
          id,
          page_db_id,
          form_db_id,
          lead_id,
          page_id,
          form_id,
          leadgen_id,
          campaign_id,
          campaign_name,
          adset_id,
          adset_name,
          ad_id,
          ad_name,
          form_name,
          page_name,
          meta_created_time::text,
          received_at::text,
          processed_at::text,
          status,
          error_message,
          distribution_reason,
          attendance_id,
          assigned_user_id,
          routing_source,
          routing_error,
          processing_stage,
          error_type,
          error_code,
          error_subcode,
          fbtrace_id,
          payload,
          lead_payload,
          mapped_payload
        from app_meta_lead_events
        where status in ('processed', 'duplicate')
          and exists (
            select 1 from app_meta_pages p
            where p.unit_id = $1 and (p.id = app_meta_lead_events.page_db_id or p.page_id = app_meta_lead_events.page_id)
          )
          and (
            $2 = '' or concat_ws(' ', id::text, leadgen_id, form_id, page_id, campaign_name,
              adset_name, ad_name, error_message, routing_error, lead_payload->>'full_name',
              lead_payload->>'phone_number', mapped_payload->>'fullName', mapped_payload->>'phone',
              lead_payload::text) ilike '%' || $2 || '%'
          )
        order by received_at desc
        limit 100
      `,
      [unitId, search],
    ),
    queryDb<MetaEventRow>(
      `
        select
          id, page_db_id, form_db_id, lead_id, page_id, form_id, leadgen_id,
          campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name,
          form_name, page_name, meta_created_time::text, received_at::text,
          processed_at::text, status, error_message, distribution_reason,
          attendance_id, assigned_user_id, routing_source, routing_error,
          processing_stage, error_type, error_code, error_subcode, fbtrace_id,
          payload, lead_payload, mapped_payload
        from app_meta_lead_events
        where status in ('received', 'pending_configuration', 'processing', 'error')
          and exists (
            select 1 from app_meta_pages p
            where p.unit_id = $1 and (p.id = app_meta_lead_events.page_db_id or p.page_id = app_meta_lead_events.page_id)
          )
          and (
            $2 = '' or concat_ws(' ', id::text, leadgen_id, form_id, page_id, campaign_name,
              adset_name, ad_name, error_message, routing_error, lead_payload->>'full_name',
              lead_payload->>'phone_number', mapped_payload->>'fullName', mapped_payload->>'phone',
              lead_payload::text) ilike '%' || $2 || '%'
          )
        order by received_at desc
        limit 100
      `,
      [unitId, search],
    ),
    queryDb<QueryResultRow>(
      `
        select
          coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug) order by name) from app_units where id = $1 and status = 'active'), '[]'::jsonb) as units,
          coalesce((select jsonb_agg(jsonb_build_object('id', id, 'unitId', unit_id, 'name', name, 'status', status) order by name) from app_courses where unit_id = $1), '[]'::jsonb) as courses,
          coalesce((select jsonb_agg(jsonb_build_object('id', id, 'unitId', unit_id, 'name', name, 'status', status) order by name) from app_acquisition_channels where unit_id = $1), '[]'::jsonb) as channels,
          coalesce((select jsonb_agg(jsonb_build_object('id', id, 'unitId', primary_unit_id, 'name', name, 'role', role, 'status', status) order by name) from app_users where role in ('CONSULTOR', 'GERENTE', 'DIRETOR') and (primary_unit_id = $1 or exists (select 1 from app_user_units uu where uu.user_id = app_users.id and uu.unit_id = $1))), '[]'::jsonb) as consultants,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', a.id, 'unitId', a.unit_id, 'courseId', a.course_id,
              'city', a.city, 'state', a.state, 'classDate', a.class_date,
              'status', a.status,
              'displayName', concat(c.name, ' · ', a.city, '/', a.state, ' · ', to_char(a.class_date, 'DD/MM/YYYY'))
            ) order by a.class_date, c.name, a.city)
            from app_course_attendances a
            inner join app_courses c on c.id = a.course_id
            where a.unit_id = $1
          ), '[]'::jsonb) as attendances
      `,
      [unitId],
    ),
    queryDb<
      QueryResultRow & {
        campaign_id: string | null;
        campaign_name: string;
        routing_error: string;
        affected_count: string;
      }
    >(
      `
        select
          campaign_id,
          coalesce(campaign_name, 'Campanha sem nome') as campaign_name,
          routing_error,
          count(*)::text as affected_count
        from app_meta_lead_events
        where routing_source = 'campaign_matrix'
          and routing_error is not null
          and exists (
            select 1 from app_meta_pages p
            where p.unit_id = $1 and (p.id = app_meta_lead_events.page_db_id or p.page_id = app_meta_lead_events.page_id)
          )
        group by campaign_id, campaign_name, routing_error
        order by max(received_at) desc
        limit 50
      `,
      [unitId],
    ),
    queryDb<{
      total_events_received: number;
      total_leads_created: number;
      total_errors: number;
    }>(
      `
        select
          count(e.id)::int as total_events_received,
          count(e.id) filter (where e.lead_id is not null)::int as total_leads_created,
          count(e.id) filter (where e.status = 'error')::int as total_errors
        from app_meta_lead_events e
        where exists (
          select 1 from app_meta_pages p
          where p.unit_id = $1 and (p.id = e.page_db_id or p.page_id = e.page_id)
        )
      `,
      [unitId],
    ),
  ]);

  const { app_secret: appSecret, verify_token: verifyToken, ...safeIntegration } = integration;

  return {
    integration: {
      ...safeIntegration,
      ...metricsResult.rows[0],
      appSecret: appSecret ? "configured" : null,
      verifyToken: verifyToken ? "configured" : null,
    },
    pages: pagesResult.rows.map(({ page_access_token_encrypted: encryptedToken, ...page }) => ({
      ...page,
      tokenMasked: maskToken(encryptedToken),
      formsCount: Number(page.forms_count) || 0,
    })),
    forms: formsResult.rows.map((form) => ({
      ...form,
      configurationMode: form.attendance_id ? "form_turma" : "campaign_matrix",
      configurationLabel: form.attendance_id ? null : "Configuração legada",
    })),
    events: [...pendingEventsResult.rows, ...processedEventsResult.rows],
    processedEvents: processedEventsResult.rows,
    pendingEvents: pendingEventsResult.rows,
    campaignAlerts: alertsResult.rows.map((alert) => ({
      campaignId: alert.campaign_id,
      campaignName: alert.campaign_name,
      reason: alert.routing_error,
      count: Number(alert.affected_count) || 0,
    })),
    options: optionsResult.rows[0],
  };
}

export async function upsertMetaIntegration(input: Record<string, unknown>, userId?: string) {
  await ensureMetaIntegration(userId);

  const result = await queryDb<MetaIntegrationRow>(
    `
      update app_meta_integrations
      set
        app_id = nullif($1, ''),
        app_secret = coalesce(nullif($2, ''), app_secret),
        verify_token = coalesce(nullif($3, ''), verify_token),
        graph_api_version = coalesce(nullif($4, ''), graph_api_version),
        status = case when $5 = 'active' then 'active' else 'inactive' end,
        callback_url = nullif($6, ''),
        updated_at = now()
      where id = (select id from app_meta_integrations order by created_at asc limit 1)
      returning *
    `,
    [
      stringOrNull(input.appId) ?? "",
      stringOrNull(input.appSecret) ?? "",
      stringOrNull(input.verifyToken) ?? "",
      stringOrNull(input.graphApiVersion) ?? "v23.0",
      input.status,
      stringOrNull(input.callbackUrl) ?? "",
    ],
  );

  return result.rows[0];
}

export async function upsertMetaPage(input: Record<string, unknown>, unitId: string) {
  const integration = await ensureMetaIntegration();
  const pageId = stringOrNull(input.pageId);
  const pageName = stringOrNull(input.pageName) ?? pageId;

  if (!pageId || !pageName || !isUuid(unitId)) {
    throw new Error("Página inválida.");
  }

  const encrypted = encryptPageToken(stringOrNull(input.pageAccessToken) ?? "");
  return withTransaction(async (client) => {
    const existingResult = await client.query<{ id: string; unit_id: string | null }>(
      `select id, unit_id from app_meta_pages where page_id = $1 limit 1 for update`,
      [pageId],
    );
    const existing = existingResult.rows[0];

    resolveMetaPageUnit(existing?.unit_id ?? null, unitId);

    const result = await client.query<{ id: string }>(
      `
        insert into app_meta_pages (
          integration_id,
          unit_id,
          page_name,
          page_id,
          page_access_token_encrypted,
          status
        )
        values ($1, $2, $3, $4, $5, $6)
        on conflict (page_id) do update
        set
          unit_id = coalesce(app_meta_pages.unit_id, excluded.unit_id),
          page_name = excluded.page_name,
          page_access_token_encrypted = coalesce(excluded.page_access_token_encrypted, app_meta_pages.page_access_token_encrypted),
          token_status = case
            when excluded.page_access_token_encrypted is not null then 'unknown'
            else app_meta_pages.token_status
          end,
          last_error = case
            when excluded.page_access_token_encrypted is not null then null
            else app_meta_pages.last_error
          end,
          status = excluded.status,
          updated_at = now()
        returning id
      `,
      [
        integration.id,
        unitId,
        pageName,
        pageId,
        encrypted,
        input.status === "inactive" ? "inactive" : "active",
      ],
    );

    return result.rows[0];
  });
}

export async function upsertMetaForm(input: Record<string, unknown>, expectedUnitId: string) {
  const pageDbId = stringOrNull(input.pageDbId);
  const metaFormId = stringOrNull(input.metaFormId);
  const formName = stringOrNull(input.formName) ?? metaFormId;
  const attendanceId = stringOrNull(input.attendanceId);
  const requestedStatus = input.status === "active" ? "active" : "inactive";

  if (!pageDbId || !isUuid(pageDbId) || !metaFormId || !formName || !isUuid(expectedUnitId)) {
    throw new Error("Formulário inválido.");
  }

  const fieldMapping =
    typeof input.fieldMapping === "string"
      ? JSON.parse(input.fieldMapping || "[]")
      : (input.fieldMapping ?? []);
  const settings =
    typeof input.settings === "string"
      ? JSON.parse(input.settings || "{}")
      : (input.settings ?? {});
  const initialStage =
    typeof input.initialStage === "string" &&
    allowedStages.includes(input.initialStage as LeadStage)
      ? input.initialStage
      : "Novo lead";

  const form = await withTransaction(async (client) => {
    const pageResult = await client.query<{ unit_id: string | null }>(
      `select unit_id from app_meta_pages where id = $1 limit 1 for update`,
      [pageDbId],
    );
    const pageUnitId = pageResult.rows[0]?.unit_id ?? null;

    if (!pageUnitId || pageUnitId !== expectedUnitId) {
      throw new Error("O formulário não pertence à unidade ativa.");
    }

    const attendanceResult =
      attendanceId && isUuid(attendanceId)
        ? await client.query<{
            id: string;
            unit_id: string;
            course_id: string;
            status: "active" | "inactive";
          }>(
            `select id, unit_id, course_id, status from app_course_attendances where id = $1 limit 1`,
            [attendanceId],
          )
        : null;
    const attendance = attendanceResult?.rows[0] ?? null;

    if (requestedStatus === "active" && !attendance) {
      throw new Error("Selecione uma turma ativa para ativar o formulário.");
    }

    if (attendance?.status !== "active") {
      if (attendance || requestedStatus === "active") {
        throw new Error("A turma selecionada está inativa ou indisponível.");
      }
    }

    if (attendance && attendance.unit_id !== pageUnitId) {
      throw new Error("A turma não pertence à unidade da Página Meta.");
    }

    const resolvedUnitId = pageUnitId;
    const resolvedCourseId = attendance?.course_id ?? null;
    const acquisitionChannelId = isUuid(String(input.acquisitionChannelId ?? ""))
      ? String(input.acquisitionChannelId)
      : null;

    if (acquisitionChannelId) {
      const channel = await client.query(
        `select id from app_acquisition_channels where id = $1 and unit_id = $2 and status = 'active' limit 1`,
        [acquisitionChannelId, resolvedUnitId],
      );
      if (!channel.rows[0]) {
        throw new Error("O canal de aquisição não pertence à unidade da turma.");
      }
    }

    const formResult = await client.query<{ id: string }>(
      `
        insert into app_meta_forms (
          page_id,
          form_name,
          meta_form_id,
          unit_id,
          course_id,
          attendance_id,
          funnel_name,
          initial_stage,
          acquisition_channel_id,
          default_responsible_id,
          distribution_rule,
          field_mapping,
          settings,
          status,
          configured_at
        )
        values ($1, $2, $3, $4, $5, $6, nullif($7, ''), $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, now())
        on conflict (page_id, meta_form_id) do update
        set
          form_name = excluded.form_name,
          unit_id = excluded.unit_id,
          course_id = excluded.course_id,
          attendance_id = excluded.attendance_id,
          funnel_name = excluded.funnel_name,
          initial_stage = excluded.initial_stage,
          acquisition_channel_id = excluded.acquisition_channel_id,
          default_responsible_id = excluded.default_responsible_id,
          distribution_rule = excluded.distribution_rule,
          field_mapping = excluded.field_mapping,
          settings = excluded.settings,
          status = excluded.status,
          configured_at = now(),
          updated_at = now()
        returning id
      `,
      [
        pageDbId,
        formName,
        metaFormId,
        resolvedUnitId,
        resolvedCourseId,
        attendance?.id ?? null,
        stringOrNull(input.funnelName) ?? "",
        initialStage,
        acquisitionChannelId,
        null,
        "round_robin",
        JSON.stringify(normalizeMapping(fieldMapping)),
        JSON.stringify(settings),
        requestedStatus,
      ],
    );
    const formId = formResult.rows[0].id;

    await client.query(`delete from app_meta_form_consultants where form_id = $1`, [formId]);

    return formResult.rows[0];
  });

  return form;
}

export async function duplicateMetaForm(input: Record<string, unknown>, expectedUnitId: string) {
  const sourceFormId = stringOrNull(input.sourceFormId);
  const nextMetaFormId = stringOrNull(input.metaFormId);
  const formName = stringOrNull(input.formName) ?? nextMetaFormId;

  if (
    !sourceFormId ||
    !isUuid(sourceFormId) ||
    !nextMetaFormId ||
    !formName ||
    !isUuid(expectedUnitId)
  ) {
    throw new Error("Dados da duplicação inválidos.");
  }

  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `
        insert into app_meta_forms (
          page_id,
          form_name,
          meta_form_id,
          unit_id,
          course_id,
          attendance_id,
          funnel_name,
          initial_stage,
          acquisition_channel_id,
          default_responsible_id,
          distribution_rule,
          field_mapping,
          settings,
          status,
          configured_at
        )
        select
          page_id,
          $2,
          $3,
          unit_id,
          course_id,
          attendance_id,
          funnel_name,
          initial_stage,
          acquisition_channel_id,
          default_responsible_id,
          distribution_rule,
          field_mapping,
          settings,
          'inactive',
          now()
        from app_meta_forms
        where id = $1
          and exists (
            select 1 from app_meta_pages p
            where p.id = app_meta_forms.page_id and p.unit_id = $4
          )
        returning id
      `,
      [sourceFormId, formName, nextMetaFormId, expectedUnitId],
    );
    const newForm = result.rows[0];

    if (!newForm) {
      throw new Error("O formulário não pertence à unidade ativa.");
    }

    await client.query(
      `
        insert into app_meta_form_consultants (form_id, user_id)
        select $2, user_id
        from app_meta_form_consultants
        where form_id = $1
        on conflict do nothing
      `,
      [sourceFormId, newForm.id],
    );

    return newForm;
  });
}

export async function syncFormsForPage(pageDbId: string) {
  const integration = await ensureMetaIntegration();
  const pageResult = await queryDb<MetaPageRow>(
    `
      select p.*, '0'::text as forms_count, p.created_at::text, p.updated_at::text, p.last_validated_at::text
      from app_meta_pages p
      where p.id = $1
      limit 1
    `,
    [pageDbId],
  );
  const page = pageResult.rows[0];

  if (!page) {
    throw new Error("Página não encontrada.");
  }

  if (!page.unit_id) {
    throw new Error("A Página Meta ainda não possui unidade configurada.");
  }

  const token = decryptPageToken(page.page_access_token_encrypted);
  if (!token) {
    throw new Error("Token da página ausente.");
  }

  const version = integration.graph_api_version || "v23.0";
  try {
    const params = new URLSearchParams({
      fields: "id,name,status,created_time",
      limit: "100",
    });
    const result = await fetchAllMetaGraphPages<MetaGraphForm>(
      `https://graph.facebook.com/${version}/${encodeURIComponent(page.page_id)}/leadgen_forms?${params}`,
      { token, appSecret: integration.app_secret },
    );

    await withTransaction(async (client) => {
      for (const form of result.items) {
        if (!form.id) continue;

        await client.query(
          `
            insert into app_meta_forms (
              page_id, unit_id, form_name, meta_form_id, synced_at, last_seen_at,
              meta_status, meta_created_time, status
            )
            values ($1, $2, $3, $4, now(), now(), $5, nullif($6, '')::timestamptz, 'inactive')
            on conflict (page_id, meta_form_id) do update
            set form_name = excluded.form_name,
                unit_id = coalesce(app_meta_forms.unit_id, excluded.unit_id),
                meta_status = excluded.meta_status,
                meta_created_time = coalesce(excluded.meta_created_time, app_meta_forms.meta_created_time),
                last_seen_at = now(),
                synced_at = now(),
                updated_at = now()
          `,
          [
            page.id,
            page.unit_id,
            form.name ?? form.id,
            form.id,
            form.status ?? "UNKNOWN",
            form.created_time ?? "",
          ],
        );
      }

      await client.query(
        `update app_meta_pages set forms_synced_at = now(), last_error = null, updated_at = now() where id = $1`,
        [page.id],
      );
    });

    return { count: result.items.length, pages: result.pages };
  } catch (error) {
    const message = metaTechnicalMessage(error, "Falha ao sincronizar formulários.");
    await queryDb(`update app_meta_pages set last_error = $2, updated_at = now() where id = $1`, [
      page.id,
      message,
    ]);
    throw new Error(message);
  }
}

export async function validateMetaPageToken(pageDbId: string) {
  const integration = await ensureMetaIntegration();
  const pageResult = await queryDb<MetaPageRow>(
    `
      select p.*, '0'::text as forms_count, p.created_at::text, p.updated_at::text, p.last_validated_at::text
      from app_meta_pages p
      where p.id = $1
      limit 1
    `,
    [pageDbId],
  );
  const page = pageResult.rows[0];

  if (!page) {
    throw new Error("Página não encontrada.");
  }

  const token = decryptPageToken(page.page_access_token_encrypted);
  const version = integration.graph_api_version || "v23.0";
  let valid = false;
  let errorMessage: string | null = null;

  try {
    await metaGraphRequest(
      `https://graph.facebook.com/${version}/${encodeURIComponent(page.page_id)}?fields=id,name`,
      { token, appSecret: integration.app_secret },
    );
    valid = true;
  } catch (error) {
    errorMessage = metaTechnicalMessage(error, "Token inválido.");
  }

  await queryDb(
    `
      update app_meta_pages
      set token_status = $2,
          last_validated_at = now(),
          last_error = $3,
          updated_at = now()
      where id = $1
    `,
    [page.id, valid ? "valid" : "invalid", errorMessage],
  );

  return { valid };
}

export async function subscribeMetaPage(pageDbId: string) {
  const integration = await ensureMetaIntegration();
  const pageResult = await queryDb<MetaPageRow>(
    `
      select p.*, '0'::text as forms_count, p.created_at::text, p.updated_at::text, p.last_validated_at::text
      from app_meta_pages p
      where p.id = $1
      limit 1
    `,
    [pageDbId],
  );
  const page = pageResult.rows[0];

  if (!page) {
    throw new Error("Página não encontrada.");
  }

  const token = decryptPageToken(page.page_access_token_encrypted);
  const version = integration.graph_api_version || "v23.0";
  const appId = integration.app_id;

  if (!token) throw new Error("Token da Página ausente.");
  if (!appId) throw new Error("META_APP_ID não configurado.");

  let subscribed = false;
  let changed = false;
  let errorMessage: string | null = null;

  try {
    const result = await ensureMetaPageLeadgenSubscription(version, page.page_id, appId, {
      token,
      appSecret: integration.app_secret,
    });
    subscribed = result.leadgenSubscribed;
    changed = result.changed;
  } catch (error) {
    errorMessage = metaTechnicalMessage(error, "Falha na inscrição leadgen.");
  }

  await queryDb(
    `
      update app_meta_pages
      set subscription_status = $2,
          leadgen_subscribed_at = case when $2 = 'subscribed' then now() else leadgen_subscribed_at end,
          last_error = $3,
          updated_at = now()
      where id = $1
    `,
    [page.id, subscribed ? "subscribed" : "error", errorMessage],
  );

  if (!subscribed) throw new Error(errorMessage ?? "Falha na inscrição leadgen.");
  return { subscribed, changed };
}

async function unsubscribeMetaPage(page: MetaPageRow, graphApiVersion: string) {
  const token = decryptPageToken(page.page_access_token_encrypted);

  if (!token) {
    return { alreadyDisconnected: true };
  }

  let response: Response;

  try {
    response = await fetch(
      `https://graph.facebook.com/${graphApiVersion}/${encodeURIComponent(page.page_id)}/subscribed_apps`,
      {
        method: "DELETE",
        body: new URLSearchParams({ access_token: token }),
      },
    );
  } catch (error) {
    console.error("[Meta Ads] Falha de rede ao desinscrever página", {
      pageDbId: page.id,
      metaPageId: page.page_id,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    throw new Error("Não foi possível contatar a Meta para desconectar a página. Tente novamente.");
  }

  const data = (await response.json().catch(() => ({}))) as MetaGraphErrorPayload;

  if (response.ok && data.success !== false) {
    return { alreadyDisconnected: false };
  }

  if (isMetaConnectionAlreadyUnavailable(data)) {
    return { alreadyDisconnected: true };
  }

  console.error("[Meta Ads] Falha ao desinscrever página", {
    pageDbId: page.id,
    metaPageId: page.page_id,
    httpStatus: response.status,
    code: data.error?.code,
    subcode: data.error?.error_subcode,
    type: data.error?.type,
    message: data.error?.message,
  });

  throw new Error(
    "A Meta não confirmou a desinscrição da página. Tente novamente antes de remover a conexão.",
  );
}

export async function disconnectMetaPage(pageDbId: string, expectedUnitId: string) {
  if (!isUuid(pageDbId) || !isUuid(expectedUnitId)) {
    throw new Error("Página inválida.");
  }

  const integration = await ensureMetaIntegration();
  return withTransaction(async (client) => {
    const pageResult = await client.query<MetaPageRow>(
      `
        select p.*, '0'::text as forms_count,
          p.created_at::text, p.updated_at::text, p.last_validated_at::text
        from app_meta_pages p
        where p.id = $1 and p.unit_id = $2
        limit 1
        for update
      `,
      [pageDbId, expectedUnitId],
    );
    const page = pageResult.rows[0];

    if (!page) {
      throw new Error("Página não encontrada.");
    }

    const { alreadyDisconnected } = await unsubscribeMetaPage(
      page,
      integration.graph_api_version || "v23.0",
    );

    await client.query(
      `
        update app_meta_forms
        set status = 'inactive', updated_at = now()
        where page_id = $1
      `,
      [page.id],
    );

    await client.query(
      `
        update app_meta_pages
        set page_access_token_encrypted = null,
            token_status = 'invalid',
            subscription_status = 'not_subscribed',
            status = 'inactive',
            last_error = null,
            updated_at = now()
        where id = $1
      `,
      [page.id],
    );

    await client.query(
      `
        update app_meta_integrations
        set status = case
              when exists (
                select 1
                from app_meta_pages
                where integration_id = $1
                  and status = 'active'
                  and page_access_token_encrypted is not null
              ) then 'active'
              else 'inactive'
            end,
            updated_at = now()
        where id = $1
      `,
      [page.integration_id],
    );

    return {
      disconnected: true,
      alreadyDisconnected,
      page: { id: page.id, pageId: page.page_id, name: page.page_name },
    };
  });
}

export async function disconnectAllMetaPages(expectedUnitId: string) {
  if (!isUuid(expectedUnitId)) {
    throw new Error("Unidade inválida.");
  }

  const integration = await ensureMetaIntegration();
  const pagesResult = await queryDb<{ id: string }>(
    `
      select id
      from app_meta_pages
      where integration_id = $1
        and unit_id = $2
        and (status = 'active' or page_access_token_encrypted is not null)
      order by created_at asc
    `,
    [integration.id, expectedUnitId],
  );
  const disconnectedPages = [];

  for (const page of pagesResult.rows) {
    disconnectedPages.push(await disconnectMetaPage(page.id, expectedUnitId));
  }

  const remainingConnectedPages = await withTransaction(async (client) => {
    await client.query(
      `
        update app_meta_forms f
        set status = 'inactive', updated_at = now()
        where exists (
          select 1
          from app_meta_pages p
          where p.id = f.page_id
            and p.integration_id = $1
            and p.unit_id = $2
            and (p.status <> 'active' or p.page_access_token_encrypted is null)
        )
      `,
      [integration.id, expectedUnitId],
    );

    const remainingResult = await client.query<{ count: string }>(
      `
        select count(*)::text as count
        from app_meta_pages
        where integration_id = $1
          and unit_id = $2
          and status = 'active'
          and page_access_token_encrypted is not null
      `,
      [integration.id, expectedUnitId],
    );
    const count = Number(remainingResult.rows[0]?.count ?? 0);

    const globallyConnectedResult = await client.query<{ count: string }>(
      `
        select count(*)::text as count
        from app_meta_pages
        where integration_id = $1
          and status = 'active'
          and page_access_token_encrypted is not null
      `,
      [integration.id],
    );
    await client.query(
      `
        update app_meta_integrations
        set status = $2, updated_at = now()
        where id = $1
      `,
      [
        integration.id,
        Number(globallyConnectedResult.rows[0]?.count ?? 0) > 0 ? "active" : "inactive",
      ],
    );

    return count;
  });

  if (remainingConnectedPages > 0) {
    throw new Error(
      "Uma nova página foi conectada durante a operação. Recarregue a tela e tente novamente.",
    );
  }

  return { disconnected: true, count: disconnectedPages.length, pages: disconnectedPages };
}

export async function resetMetaConnection(expectedUnitId: string) {
  if (!isUuid(expectedUnitId)) {
    throw new Error("Unidade inválida.");
  }

  const integration = await ensureMetaIntegration();
  const pagesResult = await queryDb<MetaPageRow>(
    `
      select p.*, '0'::text as forms_count,
        p.created_at::text, p.updated_at::text, p.last_validated_at::text
      from app_meta_pages p
      where p.integration_id = $1
        and p.unit_id = $2
      order by p.created_at asc
    `,
    [integration.id, expectedUnitId],
  );
  const unsubscribeFailures: Array<{ pageId: string; name: string }> = [];

  for (const page of pagesResult.rows) {
    try {
      await unsubscribeMetaPage(page, integration.graph_api_version || "v23.0");
    } catch (error) {
      unsubscribeFailures.push({ pageId: page.page_id, name: page.page_name });
      console.error("[Meta Ads] Reset continuará somente com a limpeza local", {
        pageDbId: page.id,
        metaPageId: page.page_id,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        update app_meta_forms f
        set status = 'inactive', updated_at = now()
        where exists (
          select 1 from app_meta_pages p
          where p.id = f.page_id and p.integration_id = $1 and p.unit_id = $2
        )
      `,
      [integration.id, expectedUnitId],
    );
    await client.query(
      `
        update app_meta_pages
        set page_access_token_encrypted = null,
            token_status = 'invalid',
            subscription_status = 'not_subscribed',
            status = 'inactive',
            last_error = null,
            updated_at = now()
        where integration_id = $1 and unit_id = $2
      `,
      [integration.id, expectedUnitId],
    );
    await client.query(
      `
        update app_meta_integrations
        set status = case when exists (
              select 1 from app_meta_pages
              where integration_id = $1 and status = 'active'
                and page_access_token_encrypted is not null
            ) then 'active' else 'inactive' end,
            updated_at = now()
        where id = $1
      `,
      [integration.id],
    );
  });

  return {
    reset: true,
    removedPages: 0,
    disconnectedPages: pagesResult.rows.length,
    unsubscribeFailures,
  };
}

async function defaultMarketingOwner(client: PoolClient, unitId: string | null) {
  if (!unitId) {
    return null;
  }

  const result = await client.query<DefaultMarketingOwnerRow>(
    `
      select u.id, u.name
      from app_users u
      where u.status = 'active'
        and u.role = 'MARKETING'
        and (
          u.primary_unit_id = $1
          or exists (
            select 1
            from app_user_units uu
            where uu.user_id = u.id
              and uu.unit_id = $1
          )
          or not exists (
            select 1
            from app_users scoped
            where scoped.status = 'active'
              and scoped.role = 'MARKETING'
              and (
                scoped.primary_unit_id = $1
                or exists (
                  select 1
                  from app_user_units scoped_uu
                  where scoped_uu.user_id = scoped.id
                    and scoped_uu.unit_id = $1
                )
              )
          )
        )
      order by
        case
          when u.primary_unit_id = $1 then 0
          when exists (
            select 1
            from app_user_units uu
            where uu.user_id = u.id
              and uu.unit_id = $1
          ) then 1
          else 2
        end,
        u.created_at asc,
        u.name asc
      limit 1
    `,
    [unitId],
  );

  return result.rows[0] ?? null;
}

async function getFormForProcessing(client: PoolClient, pageId: string, formId: string) {
  const result = await client.query<MetaProcessingForm>(
    `
      select
        f.*,
        p.unit_id as page_unit_id,
        p.page_name,
        p.page_id as meta_page_id,
        u.name as unit_name,
        c.name as course_name,
        a.city as attendance_city,
        a.state as attendance_state,
        a.class_date::text as attendance_class_date,
        a.status as attendance_status,
        ch.name as acquisition_channel_name,
        owner.name as default_responsible_name,
        '{}'::text[] as selected_consultant_ids,
        f.created_at::text,
        f.updated_at::text,
        f.configured_at::text,
        f.synced_at::text,
        f.last_lead_received_at::text
      from app_meta_forms f
      inner join app_meta_pages p on p.id = f.page_id
      left join app_units u on u.id = f.unit_id
      left join app_courses c on c.id = f.course_id
      left join app_course_attendances a on a.id = f.attendance_id
      left join app_acquisition_channels ch on ch.id = f.acquisition_channel_id
      left join app_users owner on owner.id = f.default_responsible_id
      where p.page_id = $1
        and f.meta_form_id = $2
      limit 1
      for update of f
    `,
    [pageId, formId],
  );

  return result.rows[0] ?? null;
}

async function getMakeFormForProcessing(client: PoolClient, formId: string) {
  const result = await client.query<MetaProcessingForm>(
    `
      select
        f.id,
        f.page_id,
        a.unit_id,
        'active'::text as status,
        '[]'::jsonb as field_mapping,
        connection.turma_id as attendance_id,
        f.acquisition_channel_id
      from app_make_meta_form_connections connection
      inner join app_course_attendances a
        on a.id = connection.turma_id
       and a.status = 'active'
      left join app_meta_forms f on f.meta_form_id = connection.form_id
      where connection.form_id = $1
        and connection.active = true
      order by f.updated_at desc nulls last
      limit 1
      for update of connection, a
    `,
    [formId],
  );

  return result.rows[0] ?? null;
}

async function getCourseSnapshot(
  client: PoolClient,
  courseId: string | null,
  unitId: string | null,
) {
  if (!courseId || !unitId) {
    return null;
  }

  const result = await client.query<CourseSnapshotRow>(
    `
      select id, name, value::text
      from app_courses
      where id = $1 and unit_id = $2 and status = 'active'
      limit 1
    `,
    [courseId, unitId],
  );

  return result.rows[0] ?? null;
}

async function getCourseByName(client: PoolClient, courseName: string, unitId: string | null) {
  if (!courseName || !unitId) {
    return null;
  }

  const result = await client.query<CourseSnapshotRow>(
    `
      select id, name, value::text
      from app_courses
      where unit_id = $1
        and status = 'active'
        and lower(name) = lower($2)
      limit 1
    `,
    [unitId, courseName],
  );

  return result.rows[0] ?? null;
}

async function getChannelSnapshot(
  client: PoolClient,
  channelId: string | null,
  unitId: string | null,
) {
  if (!channelId || !unitId) {
    return null;
  }

  const result = await client.query<ChannelSnapshotRow>(
    `
      select id, name
      from app_acquisition_channels
      where id = $1 and unit_id = $2 and status = 'active'
      limit 1
    `,
    [channelId, unitId],
  );

  return result.rows[0] ?? null;
}

async function getChannelByName(
  client: PoolClient,
  channelName: string | null,
  unitId: string | null,
) {
  if (!channelName || !unitId) {
    return null;
  }

  const result = await client.query<ChannelSnapshotRow>(
    `
      select id, name
      from app_acquisition_channels
      where unit_id = $1
        and status = 'active'
        and lower(name) = lower($2)
      limit 1
    `,
    [unitId, channelName],
  );

  return result.rows[0] ?? null;
}

async function refreshMetaEventLeadPayload(eventId: string) {
  const integration = await ensureMetaIntegration();
  const result = await queryDb<
    QueryResultRow & {
      leadgen_id: string;
      page_access_token_encrypted: string | null;
    }
  >(
    `
      select e.leadgen_id, p.page_access_token_encrypted
      from app_meta_lead_events e
      left join app_meta_pages p on p.page_id = e.page_id
      where e.id = $1
      limit 1
    `,
    [eventId],
  );
  const event = result.rows[0];
  const token = decryptPageToken(event?.page_access_token_encrypted ?? null);

  if (!event || !token) {
    throw new Error("Token da Página ausente. Valide a Página antes de reprocessar.");
  }

  const leadPayload = await fetchMetaLeadDetailsWithRetry(event.leadgen_id, token, integration);

  await queryDb(
    `
      update app_meta_lead_events
      set campaign_id = coalesce($2, campaign_id),
          campaign_name = coalesce($3, campaign_name),
          adset_id = coalesce($4, adset_id),
          adset_name = coalesce($5, adset_name),
          ad_id = coalesce($6, ad_id),
          ad_name = coalesce($7, ad_name),
          form_name = coalesce($8, form_name),
          page_name = coalesce($9, page_name),
          meta_created_time = coalesce(nullif($10, '')::timestamptz, meta_created_time),
          lead_payload = $11::jsonb,
          error_message = null,
          processing_stage = 'lead_fetched',
          error_type = null,
          error_code = null,
          error_subcode = null,
          fbtrace_id = null,
          updated_at = now()
      where id = $1
    `,
    [
      eventId,
      leadPayload.campaign_id ?? null,
      leadPayload.campaign_name ?? null,
      leadPayload.adset_id ?? null,
      leadPayload.adset_name ?? null,
      leadPayload.ad_id ?? null,
      leadPayload.ad_name ?? null,
      leadPayload.form_name ?? null,
      leadPayload.page_name ?? null,
      leadPayload.created_time ?? "",
      JSON.stringify(leadPayload),
    ],
  );
}

async function processEventById(eventId: string, source: "meta" | "make" = "meta") {
  const integration = await ensureMetaIntegration();

  return withTransaction(async (client) => {
    const eventResult = await client.query<MetaEventRow>(
      `
        select
          id,
          page_db_id,
          form_db_id,
          lead_id,
          page_id,
          form_id,
          leadgen_id,
          campaign_id,
          campaign_name,
          adset_id,
          adset_name,
          ad_id,
          ad_name,
          form_name,
          page_name,
          meta_created_time::text,
          received_at::text,
          processed_at::text,
          status,
          error_message,
          distribution_reason,
          attendance_id,
          assigned_user_id,
          routing_source,
          routing_error,
          processing_stage,
          error_type,
          error_code,
          error_subcode,
          fbtrace_id,
          payload,
          lead_payload,
          mapped_payload
        from app_meta_lead_events
        where id = $1
        limit 1
        for update
      `,
      [eventId],
    );
    const event = eventResult.rows[0];

    if (!event) {
      throw new Error("Evento não encontrado.");
    }

    if (event.lead_id && event.status === "processed") {
      await client.query(
        `update app_meta_lead_events set status = 'duplicate', processing_stage = 'duplicate', updated_at = now() where id = $1`,
        [event.id],
      );
      logMetaStage({
        eventId: event.id,
        leadgenId: event.leadgen_id,
        pageId: event.page_id,
        formId: event.form_id,
        stage: "duplicate",
        status: "duplicate",
      });
      return { status: "duplicate", leadId: event.lead_id };
    }

    await client.query(
      `update app_meta_lead_events set status = 'processing', processing_stage = 'lead_fetched', updated_at = now() where id = $1`,
      [event.id],
    );

    const form =
      source === "make"
        ? await getMakeFormForProcessing(client, event.form_id)
        : await getFormForProcessing(client, event.page_id, event.form_id);
    const pageUnitId =
      source === "make"
        ? (form?.unit_id ?? null)
        : ((
            await client.query<{ unit_id: string | null }>(
              `
                select unit_id
                from app_meta_pages
                where id = $1 or page_id = $2
                order by (id = $1) desc
                limit 1
                for update
              `,
              [event.page_db_id, event.page_id],
            )
          ).rows[0]?.unit_id ?? null);

    const configurationReason =
      source === "make" && !form
        ? "Formulário não conectado a uma turma no bridge Make."
        : getMetaUnitConfigurationIssue(
            pageUnitId,
            form ? { status: form.status, unitId: form.unit_id } : null,
          );

    if (configurationReason) {
      await client.query(
        `
          update app_meta_lead_events
          set status = 'pending_configuration',
              form_db_id = $2,
              error_message = coalesce(error_message, $3),
              routing_error = $3,
              processing_stage = 'pending_configuration',
              updated_at = now()
          where id = $1
        `,
        [event.id, form?.id ?? null, configurationReason],
      );
      logMetaStage({
        eventId: event.id,
        leadgenId: event.leadgen_id,
        pageId: event.page_id,
        formId: event.form_id,
        stage: "pending_configuration",
        status: "pending_configuration",
      });
      return { status: "pending_configuration", leadId: null };
    }

    if (!form || !pageUnitId) {
      throw new Error("Configuração de unidade Meta inconsistente.");
    }

    logMetaStage({
      eventId: event.id,
      leadgenId: event.leadgen_id,
      pageId: event.page_id,
      formId: event.form_id,
      stage: "form_resolved",
      status: "success",
    });

    const leadPayload = (event.lead_payload ?? {}) as MetaLeadPayload;
    const mapped = mapMetaLead(leadPayload, form.field_mapping);

    if (mapped.missingRequiredFields.length) {
      const detailsUnavailable = !Object.keys(mapped.sourceFields).length;
      await client.query(
        `
          update app_meta_lead_events
          set status = 'error',
              error_message = $2,
              mapped_payload = $3::jsonb,
              processing_stage = 'failed',
              updated_at = now()
          where id = $1
        `,
        [
          event.id,
          detailsUnavailable && event.error_message
            ? event.error_message
            : detailsUnavailable
              ? "A Meta não entregou os dados do lead. Valide o token da Página e reprocesse o evento."
              : mapped.missingRequiredFields.length
                ? `Campos obrigatórios ausentes: ${mapped.missingRequiredFields.join(", ")}`
                : "Nome e telefone são obrigatórios após o mapeamento.",
          JSON.stringify(mapped),
        ],
      );
      logMetaStage({
        eventId: event.id,
        leadgenId: event.leadgen_id,
        pageId: event.page_id,
        formId: event.form_id,
        stage: "failed",
        status: "error",
        errorCode: event.error_code,
        fbtraceId: event.fbtrace_id,
      });
      return { status: "error", leadId: null };
    }

    const linkedAttendanceResult = form.attendance_id
      ? await client.query<{
          id: string;
          unit_id: string;
          course_id: string;
          course_name: string;
          city: string;
          state: string;
          round_robin_cursor: number;
        }>(
          `
            select a.id, a.unit_id, a.course_id, c.name as course_name, a.city, a.state,
              a.round_robin_cursor
            from app_course_attendances a
            inner join app_courses c on c.id = a.course_id
            where a.id = $1 and a.unit_id = $2 and a.status = 'active' and c.status = 'active'
            limit 1
            for update of a
          `,
          [form.attendance_id, pageUnitId],
        )
      : null;
    const campaignRouting = form.attendance_id
      ? null
      : await findCampaignAttendance(client, event.campaign_name, pageUnitId);
    const attendance = linkedAttendanceResult?.rows[0] ?? campaignRouting?.attendance ?? null;
    const routingSource = form.attendance_id ? "form_turma" : "campaign_matrix";

    if (!attendance) {
      const routingError = form.attendance_id
        ? "A turma vinculada ao formulário está inativa ou indisponível."
        : (campaignRouting?.error ?? "Turma legada não encontrada pela campanha.");
      await client.query(
        `
          update app_meta_lead_events
          set status = 'pending_configuration', form_db_id = $2,
              error_message = coalesce(error_message, $3),
              routing_source = $4, routing_error = $3,
              processing_stage = 'pending_configuration', updated_at = now()
          where id = $1
        `,
        [event.id, form.id, routingError, routingSource],
      );
      logMetaStage({
        eventId: event.id,
        leadgenId: event.leadgen_id,
        pageId: event.page_id,
        formId: event.form_id,
        stage: "pending_configuration",
        status: "pending_configuration",
      });
      return { status: "pending_configuration", leadId: null };
    }

    const attendanceConsultants = await getAttendanceConsultants(client, attendance);
    if (!attendanceConsultants.length) {
      await client.query(
        `
          update app_meta_lead_events
          set status = 'pending_configuration', form_db_id = $2, attendance_id = $3,
              error_message = coalesce(error_message, $4), routing_source = $5, routing_error = $4,
              processing_stage = 'pending_configuration', updated_at = now()
          where id = $1
        `,
        [
          event.id,
          form.id,
          attendance.id,
          "Turma sem consultores ativos selecionados.",
          routingSource,
        ],
      );
      logMetaStage({
        eventId: event.id,
        leadgenId: event.leadgen_id,
        pageId: event.page_id,
        formId: event.form_id,
        stage: "pending_configuration",
        status: "pending_configuration",
      });
      return { status: "pending_configuration", leadId: null };
    }

    if (attendance.unit_id !== pageUnitId) {
      const routingError = "A turma encontrada não pertence à unidade da Página Meta.";
      await client.query(
        `
          update app_meta_lead_events
          set status = 'pending_configuration', form_db_id = $2,
              error_message = coalesce(error_message, $3),
              routing_source = $4, routing_error = $3,
              processing_stage = 'pending_configuration', updated_at = now()
          where id = $1
        `,
        [event.id, form.id, routingError, routingSource],
      );
      logMetaStage({
        eventId: event.id,
        leadgenId: event.leadgen_id,
        pageId: event.page_id,
        formId: event.form_id,
        stage: "pending_configuration",
        status: "pending_configuration",
      });
      return { status: "pending_configuration", leadId: null };
    }

    const targetUnitId = pageUnitId;
    const course = await getCourseSnapshot(client, attendance.course_id, attendance.unit_id);
    const channel =
      (await getChannelSnapshot(client, form.acquisition_channel_id, targetUnitId)) ?? null;
    const leadCity = `${attendance.city} - ${attendance.state}`;
    const leadFullName = mapped.fullName || `Lead Meta ${event.leadgen_id}`;
    const leadPhone = mapped.phone || "";
    const leadPhone2 = mapped.phone2 || "";
    const leadResult = await client.query<{ id: string }>(
      `
        insert into app_leads (
          unit_id,
          attendance_id,
          full_name,
          phone,
          phone2,
          email,
          city,
          course_id,
          course_name_snapshot,
          course_value_snapshot,
          acquisition_channel_id,
          acquisition_channel_name_snapshot,
          observations,
          stage,
          shared_queue,
          created_by
        )
        values ($1, $2, $3, $4, nullif($5, ''), nullif($6, ''), nullif($7, ''), $8, $9, $10, $11, $12, nullif($13, ''), $14, true, null)
        returning id
      `,
      [
        targetUnitId,
        attendance.id,
        leadFullName,
        leadPhone,
        leadPhone2,
        mapped.email,
        leadCity,
        course?.id ?? null,
        course?.name ?? (mapped.courseName || null),
        course ? Number(course.value) : null,
        channel?.id ?? null,
        channel?.name ?? null,
        cleanMetaLeadObservations(
          [
            mapped.observations,
            event.ad_name ? `Anúncio: ${event.ad_name}` : "",
            `Roteamento: ${attendance.course_name} - ${attendance.city}-${attendance.state}`,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        "Novo lead",
      ],
    );
    const leadId = leadResult.rows[0].id;

    await client.query(
      `
        update app_meta_lead_events
        set
          lead_id = $2,
          page_db_id = (select id from app_meta_pages where page_id = $3 limit 1),
          form_db_id = $4,
          status = 'processed',
          processed_at = now(),
          error_message = null,
          distribution_reason = $5,
          mapped_payload = $6::jsonb,
          attendance_id = $7,
          assigned_user_id = $8,
          routing_source = $9,
          routing_error = $10,
          processing_stage = 'lead_created',
          error_type = null,
          error_code = null,
          error_subcode = null,
          fbtrace_id = null,
          updated_at = now()
        where id = $1
      `,
      [
        event.id,
        leadId,
        event.page_id,
        form.id,
        `Fila compartilhada da turma; disponível para ${attendanceConsultants.length} consultor(es).`,
        JSON.stringify({
          ...mapped,
          fullName: leadFullName,
          phone: leadPhone,
          phone2: leadPhone2,
          city: leadCity,
        }),
        attendance.id,
        null,
        routingSource,
        null,
      ],
    );

    await client.query(
      `
        update app_meta_forms
        set leads_received_count = leads_received_count + 1,
            last_lead_received_at = now(),
            updated_at = now()
        where id = $1
      `,
      [form.id],
    );

    await client.query(
      `
        update app_meta_pages
        set leads_received_count = leads_received_count + 1,
            updated_at = now()
        where id = $1
      `,
      [form.page_id],
    );

    await client.query(
      `
        update app_meta_integrations
        set total_leads_created = total_leads_created + 1,
            updated_at = now()
        where id = $1
      `,
      [integration.id],
    );

    logMetaStage({
      eventId: event.id,
      leadgenId: event.leadgen_id,
      pageId: event.page_id,
      formId: event.form_id,
      stage: "lead_created",
      status: "processed",
    });

    return { status: "processed", leadId };
  });
}

export async function reprocessMetaEvent(eventId: string, expectedUnitId: string) {
  if (!isUuid(eventId) || !isUuid(expectedUnitId)) {
    throw new Error("Evento inválido.");
  }

  const eventResult = await queryDb(
    `
      select 1
      from app_meta_lead_events e
      inner join app_meta_pages p on p.id = e.page_db_id or p.page_id = e.page_id
      where e.id = $1 and p.unit_id = $2
      limit 1
    `,
    [eventId, expectedUnitId],
  );

  if (!eventResult.rowCount) {
    throw new Error("O evento não pertence à unidade ativa.");
  }

  try {
    await refreshMetaEventLeadPayload(eventId);
    return processEventById(eventId);
  } catch (error) {
    const details = metaGraphErrorDetails(error);
    const message = metaTechnicalMessage(error, "Falha ao reprocessar evento Meta.");
    await queryDb(
      `
        update app_meta_lead_events
        set status = 'error', error_message = $2, processing_stage = 'failed',
            error_type = $3, error_code = $4, error_subcode = $5, fbtrace_id = $6,
            updated_at = now()
        where id = $1
      `,
      [
        eventId,
        message,
        details?.type ?? null,
        details?.code ?? null,
        details?.subcode ?? null,
        details?.fbtraceId ?? null,
      ],
    );
    throw new Error(message);
  }
}

async function processMetaLead(
  payload: Record<string, unknown>,
  parsed: ParsedMetaLeadEvent,
  integration: MetaIntegrationRow,
  prefetchedLeadPayload?: MetaLeadPayload,
  countAsReceived = true,
  source: "meta" | "make" = "meta",
) {
  if (countAsReceived) {
    await queryDb(
      `
        update app_meta_integrations
        set total_events_received = total_events_received + 1,
            last_communication_at = now(),
            updated_at = now()
        where id = $1
      `,
      [integration.id],
    );
  }

  const pageResult = await queryDb<MetaPageRow>(
    `
      select p.*, '0'::text as forms_count, p.created_at::text, p.updated_at::text, p.last_validated_at::text
      from app_meta_pages p
      where p.page_id = $1
      limit 1
    `,
    [parsed.pageId],
  );
  const page = pageResult.rows[0] ?? null;

  logMetaStage({
    leadgenId: parsed.leadgenId,
    pageId: parsed.pageId,
    formId: parsed.formId,
    stage: "received",
    status: "received",
  });

  if (page && (page.status !== "active" || !page.page_access_token_encrypted)) {
    return { ok: true, status: 200, result: "ignored_disconnected_page" };
  }

  let leadPayload = prefetchedLeadPayload ?? leadPayloadFromWebhookValue(parsed.value, parsed);
  let leadFetchError: string | null = null;
  let leadFetchDetails: ReturnType<typeof metaGraphErrorDetails> = null;

  if (prefetchedLeadPayload) {
    logMetaStage({
      leadgenId: parsed.leadgenId,
      pageId: parsed.pageId,
      formId: parsed.formId,
      stage: "lead_fetched",
      status: "success",
    });
  } else if (page?.page_access_token_encrypted) {
    try {
      logMetaStage({
        leadgenId: parsed.leadgenId,
        pageId: parsed.pageId,
        formId: parsed.formId,
        stage: "token_resolved",
        status: "success",
      });
      leadPayload = await fetchMetaLeadDetailsWithRetry(
        parsed.leadgenId,
        decryptPageToken(page.page_access_token_encrypted),
        integration,
      );
      logMetaStage({
        leadgenId: parsed.leadgenId,
        pageId: parsed.pageId,
        formId: parsed.formId,
        stage: "lead_fetched",
        status: "success",
      });
    } catch (error) {
      leadFetchDetails = metaGraphErrorDetails(error);
      leadFetchError = `Não foi possível buscar os dados do lead na Meta: ${metaTechnicalMessage(
        error,
        "Falha na Graph API.",
      )}`;
      logMetaStage({
        leadgenId: parsed.leadgenId,
        pageId: parsed.pageId,
        formId: parsed.formId,
        stage: "failed",
        status: "error",
        errorCode: leadFetchDetails?.code,
        fbtraceId: leadFetchDetails?.fbtraceId,
      });
    }
  } else {
    leadFetchError = "A Página não possui token para consultar os dados do lead na Meta.";
  }

  const eventResult = await queryDb<{ id: string; lead_id: string | null; status: string }>(
    `
      insert into app_meta_lead_events (
        integration_id,
        page_db_id,
        form_db_id,
        page_id,
        form_id,
        leadgen_id,
        campaign_id,
        campaign_name,
        adset_id,
        adset_name,
        ad_id,
        ad_name,
        form_name,
        page_name,
        meta_created_time,
        status,
        error_message,
        processing_stage,
        error_type,
        error_code,
        error_subcode,
        fbtrace_id,
        payload,
        lead_payload
      )
      values (
        $1,
        $2,
        (select f.id from app_meta_forms f where f.page_id = $2 and f.meta_form_id = $3 limit 1),
        $4,
        $3,
        $5,
        coalesce($6, $17),
        $7,
        coalesce($8, $18),
        $9,
        coalesce($10, $19),
        $11,
        $12,
        $13,
        nullif($14, '')::timestamptz,
        'received',
        $15,
        $21,
        $22,
        $23,
        $24,
        $25,
        $16::jsonb,
        $20::jsonb
      )
      on conflict (leadgen_id) do update
      set campaign_id = coalesce(excluded.campaign_id, app_meta_lead_events.campaign_id),
          campaign_name = coalesce(excluded.campaign_name, app_meta_lead_events.campaign_name),
          adset_id = coalesce(excluded.adset_id, app_meta_lead_events.adset_id),
          adset_name = coalesce(excluded.adset_name, app_meta_lead_events.adset_name),
          ad_id = coalesce(excluded.ad_id, app_meta_lead_events.ad_id),
          ad_name = coalesce(excluded.ad_name, app_meta_lead_events.ad_name),
          form_name = coalesce(excluded.form_name, app_meta_lead_events.form_name),
          page_name = coalesce(excluded.page_name, app_meta_lead_events.page_name),
          lead_payload = coalesce(excluded.lead_payload, app_meta_lead_events.lead_payload),
          error_message = excluded.error_message,
          processing_stage = excluded.processing_stage,
          error_type = excluded.error_type,
          error_code = excluded.error_code,
          error_subcode = excluded.error_subcode,
          fbtrace_id = excluded.fbtrace_id,
          updated_at = now()
      returning id, lead_id, status
    `,
    [
      integration.id,
      page?.id ?? null,
      parsed.formId,
      parsed.pageId,
      parsed.leadgenId,
      leadPayload?.campaign_id ?? null,
      leadPayload?.campaign_name ?? null,
      leadPayload?.adset_id ?? null,
      leadPayload?.adset_name ?? null,
      leadPayload?.ad_id ?? null,
      leadPayload?.ad_name ?? null,
      leadPayload?.form_name ?? null,
      leadPayload?.page_name ?? page?.page_name ?? null,
      leadPayload?.created_time ?? parsed.createdTime ?? "",
      leadFetchError,
      JSON.stringify(payload),
      parsed.campaignId,
      parsed.adsetId,
      parsed.adId,
      JSON.stringify(leadPayload),
      leadFetchError ? "failed" : "lead_fetched",
      leadFetchDetails?.type ?? null,
      leadFetchDetails?.code ?? null,
      leadFetchDetails?.subcode ?? null,
      leadFetchDetails?.fbtraceId ?? null,
    ],
  );
  const event = eventResult.rows[0];

  if (event.lead_id || event.status === "processed") {
    await queryDb(
      `update app_meta_lead_events set status = 'duplicate', processing_stage = 'duplicate', updated_at = now() where id = $1`,
      [event.id],
    );
    logMetaStage({
      eventId: event.id,
      leadgenId: parsed.leadgenId,
      pageId: parsed.pageId,
      formId: parsed.formId,
      stage: "duplicate",
      status: "duplicate",
    });
    return { ok: true, status: 200, result: "duplicate" };
  }

  const result = await processEventById(event.id, source).catch(async (error: unknown) => {
    await queryDb(
      `
        update app_meta_lead_events
        set status = 'error',
            error_message = $2,
            processing_stage = 'failed',
            updated_at = now()
        where id = $1
      `,
      [event.id, error instanceof Error ? error.message : "Falha ao processar evento."],
    );
    logMetaStage({
      eventId: event.id,
      leadgenId: parsed.leadgenId,
      pageId: parsed.pageId,
      formId: parsed.formId,
      stage: "failed",
      status: "error",
      errorCode: metaGraphErrorDetails(error)?.code,
      fbtraceId: metaGraphErrorDetails(error)?.fbtraceId,
    });
    await queryDb(
      `
        update app_meta_integrations
        set total_errors = total_errors + 1,
            updated_at = now()
        where id = $1
      `,
      [integration.id],
    );
    return { status: "error", leadId: null };
  });

  return { ok: true, status: 200, result: result.status, leadId: result.leadId };
}

export async function importHistoricalMetaLeads(
  pageDbId: string,
  expectedUnitId: string,
  formDbId?: string,
) {
  if (!isUuid(pageDbId) || !isUuid(expectedUnitId) || (formDbId && !isUuid(formDbId))) {
    throw new Error("Página ou formulário inválido para importação.");
  }

  const integration = await ensureMetaIntegration();
  const formsResult = await queryDb<MetaFormRow & { page_access_token_encrypted: string | null }>(
    `
      select f.*, p.page_id as meta_page_id, p.page_name,
        p.page_access_token_encrypted, p.unit_id as page_unit_id,
        ''::text as unit_name, ''::text as course_name,
        ''::text as attendance_city, ''::text as attendance_state,
        null::text as attendance_class_date, null::text as attendance_status,
        ''::text as acquisition_channel_name, ''::text as default_responsible_name,
        '{}'::text[] as selected_consultant_ids,
        f.created_at::text, f.updated_at::text, f.configured_at::text,
        f.synced_at::text, f.last_lead_received_at::text,
        f.meta_created_time::text, f.last_seen_at::text
      from app_meta_forms f
      inner join app_meta_pages p on p.id = f.page_id
      where p.id = $1
        and p.unit_id = $2
        and p.status = 'active'
        and f.status = 'active'
        and f.attendance_id is not null
        and ($3::uuid is null or f.id = $3)
      order by f.created_at
    `,
    [pageDbId, expectedUnitId, formDbId ?? null],
  );

  if (!formsResult.rows.length) {
    throw new Error("Nenhum formulário configurado e ativo foi encontrado para importação.");
  }

  const summary = createMetaImportSummary();

  for (const form of formsResult.rows) {
    const token = decryptPageToken(form.page_access_token_encrypted);
    if (!token) {
      summary.errors += 1;
      summary.formErrors.push({
        formId: form.meta_form_id,
        message: "Token da Página ausente.",
        code: null,
        fbtraceId: null,
      });
      continue;
    }

    summary.formsChecked += 1;

    try {
      const params = new URLSearchParams({
        fields:
          "id,created_time,field_data,form_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name",
        limit: "100",
      });
      const history = await fetchAllMetaGraphPages<MetaLeadPayload>(
        `https://graph.facebook.com/${integration.graph_api_version || "v23.0"}/${encodeURIComponent(form.meta_form_id)}/leads?${params}`,
        { token, appSecret: integration.app_secret },
      );
      summary.leadsFound += history.items.length;

      for (const lead of history.items) {
        if (!lead.id) {
          summary.errors += 1;
          continue;
        }

        const parsed: ParsedMetaLeadEvent = {
          pageId: form.meta_page_id,
          formId: lead.form_id || form.meta_form_id,
          leadgenId: lead.id,
          campaignId: lead.campaign_id ?? null,
          adsetId: lead.adset_id ?? null,
          adId: lead.ad_id ?? null,
          createdTime: lead.created_time ?? null,
          value: lead as Record<string, unknown>,
        };
        const result = await processMetaLead(
          {
            source: "historical_import",
            page_id: parsed.pageId,
            form_id: parsed.formId,
            leadgen_id: parsed.leadgenId,
          },
          parsed,
          integration,
          lead,
          false,
        );

        recordMetaImportResult(summary, result.result);
      }
    } catch (error) {
      const details = metaGraphErrorDetails(error);
      summary.errors += 1;
      summary.formErrors.push({
        formId: form.meta_form_id,
        message: metaTechnicalMessage(error, "Falha ao importar leads do formulário."),
        code: details?.code ?? null,
        fbtraceId: details?.fbtraceId ?? null,
      });
    }
  }

  return summary;
}

export async function receiveMakeMetaLead(payload: MakeMetaLeadPayload) {
  const integration = await ensureMetaIntegration();
  const fieldData = [
    { name: "full_name", values: [payload.name] },
    { name: "phone_number", values: [payload.phone] },
    ...(payload.email ? [{ name: "email", values: [payload.email] }] : []),
  ];
  const leadPayload: MetaLeadPayload = {
    id: payload.leadgen_id,
    created_time: payload.created_time ?? undefined,
    field_data: fieldData,
    form_id: payload.form_id,
    form_name: payload.form_name ?? undefined,
    campaign_id: payload.campaign_id ?? undefined,
    campaign_name: payload.campaign_name ?? undefined,
    adset_id: payload.adset_id ?? undefined,
    adset_name: payload.adset_name ?? undefined,
    ad_id: payload.ad_id ?? undefined,
    ad_name: payload.ad_name ?? undefined,
  };
  const parsed: ParsedMetaLeadEvent = {
    pageId: payload.page_id,
    formId: payload.form_id,
    leadgenId: payload.leadgen_id,
    campaignId: payload.campaign_id,
    adsetId: payload.adset_id,
    adId: payload.ad_id,
    createdTime: payload.created_time,
    value: leadPayload as Record<string, unknown>,
  };

  return processMetaLead(
    { source: "make_meta_bridge", ...payload },
    parsed,
    integration,
    leadPayload,
    false,
    "make",
  );
}

async function processMetaLeadEvents(
  payload: Record<string, unknown>,
  parsedEvents: Array<ParsedMetaLeadEvent>,
) {
  if (!parsedEvents.length) {
    return { ok: false, status: 400, error: "Payload sem page_id, form_id ou leadgen_id." };
  }

  const integration = await ensureMetaIntegration();
  const results = [];

  for (const parsed of parsedEvents) {
    results.push(await processMetaLead(payload, parsed, integration));
  }

  if (results.length === 1) {
    return results[0];
  }

  return {
    ok: true,
    status: 200,
    result: "batch",
    leadId: null,
    results: results.map((item) => ({ result: item.result, leadId: item.leadId ?? null })),
  };
}

export async function receiveMetaWebhook(rawBody: string, signature: string | null) {
  const integration = await ensureMetaIntegration();

  if (!verifyMetaSignature(rawBody, signature, integration.app_secret)) {
    await queryDb(
      `
        update app_meta_integrations
        set total_errors = total_errors + 1,
            last_communication_at = now(),
            updated_at = now()
        where id = $1
      `,
      [integration.id],
    );
    return { ok: false, status: 401, error: "Assinatura inválida." };
  }

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, error: "JSON inválido." };
  }
  const events = parseMetaLeadEvents(payload);
  for (const event of events) {
    logMetaStage({
      leadgenId: event.leadgenId,
      pageId: event.pageId,
      formId: event.formId,
      stage: "hmac_validated",
      status: "success",
    });
  }

  return processMetaLeadEvents(payload, events);
}

export async function receiveKognaMetaWebhook(payload: Record<string, unknown>) {
  const event = parseKognaMetaLeadEvent(payload);

  return processMetaLeadEvents(payload, event ? [event] : []);
}
