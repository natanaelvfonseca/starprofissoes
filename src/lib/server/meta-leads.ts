import { createHmac, createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import type { LeadStage } from "@/lib/commercial-types";
import { ensureCommercialSchema, isUuid } from "@/lib/server/commercial-schema";
import {
  chooseAttendanceConsultant,
  ensureCourseAttendanceSchema,
  findCampaignAttendance,
  parseCampaignRoute,
} from "@/lib/server/course-attendances";
import { queryDb, withTransaction } from "@/lib/server/db";

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
  page_name: string;
  page_id: string;
  page_access_token_encrypted: string | null;
  token_status: "unknown" | "valid" | "invalid";
  last_validated_at: string | null;
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
  unit_name: string | null;
  course_id: string | null;
  course_name: string | null;
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
  configured_at: string | null;
  synced_at: string | null;
  last_lead_received_at: string | null;
  leads_received_count: number;
  created_at: string;
  updated_at: string;
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
  routing_source: "campaign_matrix" | "form_fallback" | null;
  routing_error: string | null;
  payload: Record<string, unknown>;
  lead_payload: Record<string, unknown> | null;
  mapped_payload: Record<string, unknown> | null;
};

type ConsultantCandidateRow = QueryResultRow & {
  id: string;
  name: string;
  open_leads: string;
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

  metaSchemaPromise ??= queryDb(`
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

    create index if not exists app_meta_pages_integration_idx on app_meta_pages (integration_id);
    create index if not exists app_meta_pages_status_idx on app_meta_pages (status);

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
  `).then(() => undefined);

  await metaSchemaPromise;
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

  if (result.rows[0]) {
    return result.rows[0];
  }

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

  return existing.rows[0];
}

export async function getMetaIntegration() {
  return ensureMetaIntegration();
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

  const relevantCandidate = phoneCandidatesFromFields(fields).find((candidate) => candidate.relevant);

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
    phoneCandidatesFromFields(fields).find((candidate) => isDifferentPhone(candidate.value))?.value ??
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

function parseMetaEntry(payload: Record<string, unknown>) {
  const entry = Array.isArray(payload.entry) ? (payload.entry[0] as Record<string, unknown>) : null;
  const change = Array.isArray(entry?.changes)
    ? (entry?.changes[0] as Record<string, unknown>)
    : null;
  const value = (change?.value ?? change) as Record<string, unknown> | null;

  return {
    pageId: String(value?.page_id ?? entry?.id ?? "").trim(),
    formId: String(value?.form_id ?? "").trim(),
    leadgenId: String(value?.leadgen_id ?? value?.leadgen_id ?? "").trim(),
    campaignId: stringOrNull(value?.campaign_id),
    adsetId: stringOrNull(value?.adset_id),
    adId: stringOrNull(value?.ad_id),
    createdTime: stringOrNull(value?.created_time),
    value: value ?? {},
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function appSecretProof(token: string, appSecret: string | null) {
  if (!appSecret) {
    return "";
  }

  return createHmac("sha256", appSecret).update(token).digest("hex");
}

export async function fetchMetaLeadDetails(
  leadgenId: string,
  token: string,
  integration: MetaIntegrationRow,
) {
  const version = integration.graph_api_version || "v23.0";
  const params = new URLSearchParams({
    access_token: token,
    fields:
      "id,created_time,field_data,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,form_id",
  });
  const proof = appSecretProof(token, integration.app_secret);

  if (proof) {
    params.set("appsecret_proof", proof);
  }

  const response = await fetch(`https://graph.facebook.com/${version}/${leadgenId}?${params}`);
  const data = (await response.json().catch(() => ({}))) as MetaLeadPayload & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message ?? "Falha ao consultar lead na Graph API.");
  }

  return data;
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
  parsed: ReturnType<typeof parseMetaEntry>,
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

export async function listMetaState() {
  const integration = await ensureMetaIntegration();

  const [pagesResult, formsResult, eventsResult, optionsResult, alertsResult] = await Promise.all([
    queryDb<MetaPageRow>(
      `
        select
          p.*,
          p.created_at::text,
          p.updated_at::text,
          p.last_validated_at::text,
          count(f.id)::text as forms_count
        from app_meta_pages p
        left join app_meta_forms f on f.page_id = p.id
        group by p.id
        order by p.created_at desc
      `,
    ),
    queryDb<MetaFormRow>(
      `
        select
          f.*,
          p.page_name,
          p.page_id as meta_page_id,
          u.name as unit_name,
          c.name as course_name,
          ch.name as acquisition_channel_name,
          owner.name as default_responsible_name,
          coalesce(array_agg(fc.user_id::text) filter (where fc.user_id is not null), '{}') as selected_consultant_ids,
          f.created_at::text,
          f.updated_at::text,
          f.configured_at::text,
          f.synced_at::text,
          f.last_lead_received_at::text
        from app_meta_forms f
        inner join app_meta_pages p on p.id = f.page_id
        left join app_units u on u.id = f.unit_id
        left join app_courses c on c.id = f.course_id
        left join app_acquisition_channels ch on ch.id = f.acquisition_channel_id
        left join app_users owner on owner.id = f.default_responsible_id
        left join app_meta_form_consultants fc on fc.form_id = f.id
        group by f.id, p.id, u.id, c.id, ch.id, owner.id
        order by f.created_at desc
      `,
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
          payload,
          lead_payload,
          mapped_payload
        from app_meta_lead_events
        order by received_at desc
        limit 100
      `,
    ),
    queryDb<QueryResultRow>(
      `
        select
          coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug) order by name) from app_units where status = 'active'), '[]'::jsonb) as units,
          coalesce((select jsonb_agg(jsonb_build_object('id', id, 'unitId', unit_id, 'name', name, 'status', status) order by name) from app_courses), '[]'::jsonb) as courses,
          coalesce((select jsonb_agg(jsonb_build_object('id', id, 'unitId', unit_id, 'name', name, 'status', status) order by name) from app_acquisition_channels), '[]'::jsonb) as channels,
          coalesce((select jsonb_agg(jsonb_build_object('id', id, 'unitId', primary_unit_id, 'name', name, 'role', role, 'status', status) order by name) from app_users where role = 'CONSULTOR'), '[]'::jsonb) as consultants
      `,
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
        where routing_source = 'form_fallback'
          and routing_error is not null
        group by campaign_id, campaign_name, routing_error
        order by max(received_at) desc
        limit 50
      `,
    ),
  ]);

  return {
    integration: {
      ...integration,
      appSecret: integration.app_secret ? "configured" : null,
      verifyToken: integration.verify_token ? "configured" : null,
    },
    pages: pagesResult.rows.map((page) => ({
      ...page,
      tokenMasked: maskToken(page.page_access_token_encrypted),
      pageAccessTokenEncrypted: undefined,
      formsCount: Number(page.forms_count) || 0,
    })),
    forms: formsResult.rows,
    events: eventsResult.rows,
    campaignAlerts: alertsResult.rows.map((alert) => ({
      campaignId: alert.campaign_id,
      campaignName: alert.campaign_name,
      reason: alert.routing_error,
      count: Number(alert.affected_count) || 0,
    })),
    options: optionsResult.rows[0],
  };
}

export async function upsertMetaIntegration(input: Record<string, unknown>, userId: string) {
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

export async function upsertMetaPage(input: Record<string, unknown>) {
  const integration = await ensureMetaIntegration();
  const pageId = stringOrNull(input.pageId);
  const pageName = stringOrNull(input.pageName) ?? pageId;

  if (!pageId || !pageName) {
    throw new Error("Página inválida.");
  }

  const encrypted = encryptPageToken(stringOrNull(input.pageAccessToken) ?? "");
  const result = await queryDb(
    `
      insert into app_meta_pages (
        integration_id,
        page_name,
        page_id,
        page_access_token_encrypted,
        status
      )
      values ($1, $2, $3, $4, $5)
      on conflict (page_id) do update
      set
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
      pageName,
      pageId,
      encrypted,
      input.status === "inactive" ? "inactive" : "active",
    ],
  );

  return result.rows[0];
}

export async function upsertMetaForm(input: Record<string, unknown>) {
  const pageDbId = stringOrNull(input.pageDbId);
  const metaFormId = stringOrNull(input.metaFormId);
  const formName = stringOrNull(input.formName) ?? metaFormId;
  const unitId = stringOrNull(input.unitId);

  if (!pageDbId || !isUuid(pageDbId) || !metaFormId || !formName) {
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
    const formResult = await client.query<{ id: string }>(
      `
        insert into app_meta_forms (
          page_id,
          form_name,
          meta_form_id,
          unit_id,
          course_id,
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
        values ($1, $2, $3, $4, $5, nullif($6, ''), $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, now())
        on conflict (page_id, meta_form_id) do update
        set
          form_name = excluded.form_name,
          unit_id = excluded.unit_id,
          course_id = excluded.course_id,
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
        unitId && isUuid(unitId) ? unitId : null,
        isUuid(String(input.courseId ?? "")) ? input.courseId : null,
        stringOrNull(input.funnelName) ?? "",
        initialStage,
        isUuid(String(input.acquisitionChannelId ?? "")) ? input.acquisitionChannelId : null,
        null,
        "round_robin",
        JSON.stringify(normalizeMapping(fieldMapping)),
        JSON.stringify(settings),
        input.status === "active" ? "active" : "inactive",
      ],
    );
    const formId = formResult.rows[0].id;

    await client.query(`delete from app_meta_form_consultants where form_id = $1`, [formId]);

    return formResult.rows[0];
  });

  return form;
}

export async function duplicateMetaForm(input: Record<string, unknown>) {
  const sourceFormId = stringOrNull(input.sourceFormId);
  const nextMetaFormId = stringOrNull(input.metaFormId);
  const formName = stringOrNull(input.formName) ?? nextMetaFormId;

  if (!sourceFormId || !isUuid(sourceFormId) || !nextMetaFormId || !formName) {
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
        returning id
      `,
      [sourceFormId, formName, nextMetaFormId],
    );
    const newForm = result.rows[0];

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

  const token = decryptPageToken(page.page_access_token_encrypted);
  if (!token) {
    throw new Error("Token da página ausente.");
  }

  const version = integration.graph_api_version || "v23.0";
  const params = new URLSearchParams({
    access_token: token,
    fields: "id,name,status,created_time",
  });
  const response = await fetch(
    `https://graph.facebook.com/${version}/${page.page_id}/leadgen_forms?${params}`,
  );
  const data = (await response.json().catch(() => ({}))) as {
    data?: Array<{ id?: string; name?: string; created_time?: string }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message ?? "Falha ao sincronizar formulários.");
  }

  for (const form of data.data ?? []) {
    if (!form.id) {
      continue;
    }

    await queryDb(
      `
        insert into app_meta_forms (page_id, form_name, meta_form_id, synced_at, status)
        values ($1, $2, $3, now(), 'inactive')
        on conflict (page_id, meta_form_id) do update
        set form_name = excluded.form_name,
            synced_at = now(),
            updated_at = now()
      `,
      [page.id, form.name ?? form.id, form.id],
    );
  }

  return { count: data.data?.length ?? 0 };
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
  const params = new URLSearchParams({ access_token: token, fields: "id,name" });
  const response = await fetch(`https://graph.facebook.com/${version}/${page.page_id}?${params}`);
  const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  const valid = response.ok;

  await queryDb(
    `
      update app_meta_pages
      set token_status = $2,
          last_validated_at = now(),
          last_error = $3,
          updated_at = now()
      where id = $1
    `,
    [
      page.id,
      valid ? "valid" : "invalid",
      valid ? null : (data.error?.message ?? "Token inválido."),
    ],
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
  const response = await fetch(
    `https://graph.facebook.com/${version}/${page.page_id}/subscribed_apps`,
    {
      method: "POST",
      body: new URLSearchParams({
        subscribed_fields: "leadgen",
        access_token: token,
      }),
    },
  );
  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string };
  };
  const subscribed = response.ok && data.success !== false;

  await queryDb(
    `
      update app_meta_pages
      set subscription_status = $2,
          last_error = $3,
          updated_at = now()
      where id = $1
    `,
    [
      page.id,
      subscribed ? "subscribed" : "error",
      subscribed ? null : (data.error?.message ?? "Falha na inscrição."),
    ],
  );

  return { subscribed };
}

async function candidateConsultants(client: PoolClient, form: MetaFormRow) {
  if (!form.unit_id) {
    return [];
  }

  const result = await client.query<ConsultantCandidateRow>(
    `
      select
        u.id,
        u.name,
        count(l.id) filter (where l.stage <> 'Matriculado')::text as open_leads
      from app_users u
      left join app_leads l on l.created_by = u.id and l.unit_id = $1 and l.stage <> 'Matriculado'
      where u.status = 'active'
        and u.role = 'CONSULTOR'
        and (
          u.primary_unit_id = $1
          or exists (
            select 1
            from app_user_units uu
            where uu.user_id = u.id and uu.unit_id = $1
          )
        )
      group by u.id
      order by u.name asc
    `,
    [form.unit_id],
  );

  return result.rows;
}

async function chooseConsultant(client: PoolClient, form: MetaFormRow) {
  const candidates = await candidateConsultants(client, form);

  if (!candidates.length) {
    return { userId: null, reason: "Nenhum consultor ativo elegível encontrado." };
  }

  const cursor = Number(form.round_robin_cursor) || 0;
  const candidate = candidates[cursor % candidates.length];

  await client.query(
    `
      update app_meta_forms
      set round_robin_cursor = $2,
          updated_at = now()
      where id = $1
    `,
    [form.id, (cursor + 1) % candidates.length],
  );

  return {
    userId: candidate.id,
    reason: `Rodízio sequencial; posição ${cursor % candidates.length} de ${candidates.length}.`,
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
  const result = await client.query<MetaFormRow>(
    `
      select
        f.*,
        p.page_name,
        p.page_id as meta_page_id,
        u.name as unit_name,
        c.name as course_name,
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

async function processEventById(eventId: string) {
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
        `update app_meta_lead_events set status = 'duplicate', updated_at = now() where id = $1`,
        [event.id],
      );
      return { status: "duplicate", leadId: event.lead_id };
    }

    const form = await getFormForProcessing(client, event.page_id, event.form_id);

    if (!form || form.status !== "active" || !form.unit_id) {
      await client.query(
        `
          update app_meta_lead_events
          set status = 'pending_configuration',
              form_db_id = $2,
              updated_at = now()
          where id = $1
        `,
        [event.id, form?.id ?? null],
      );
      return { status: "pending_configuration", leadId: null };
    }

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
      return { status: "error", leadId: null };
    }

    const campaignRouting = await findCampaignAttendance(client, event.campaign_name);
    const attendance = campaignRouting.attendance;
    const attendanceAssignment = attendance
      ? await chooseAttendanceConsultant(client, attendance)
      : null;
    const resolvedAttendance = attendanceAssignment?.userId ? attendance : null;
    const routingError =
      attendance && !resolvedAttendance ? attendanceAssignment?.reason : campaignRouting.error;
    const targetUnitId = resolvedAttendance?.unit_id ?? form.unit_id;
    const course = resolvedAttendance
      ? await getCourseSnapshot(client, resolvedAttendance.course_id, resolvedAttendance.unit_id)
      : ((await getCourseSnapshot(client, form.course_id, form.unit_id)) ??
        (await getCourseByName(client, mapped.courseName, form.unit_id)));
    const channel =
      (await getChannelSnapshot(client, form.acquisition_channel_id, targetUnitId)) ??
      (resolvedAttendance
        ? await getChannelByName(client, form.acquisition_channel_name, targetUnitId)
        : null);
    const assignment =
      resolvedAttendance && attendanceAssignment
        ? attendanceAssignment
        : await chooseConsultant(client, form);
    const marketingFallback = assignment.userId
      ? null
      : await defaultMarketingOwner(client, targetUnitId);
    const finalAssignment = assignment.userId
      ? assignment
      : marketingFallback
        ? {
            userId: marketingFallback.id,
            reason: `${assignment.reason} Lead atribuido automaticamente ao Marketing.`,
          }
        : assignment;
    const routingSource = resolvedAttendance ? "campaign_matrix" : "form_fallback";
    const leadCity = campaignCityValue(event.campaign_name, attendance?.city ?? null) || mapped.city;
    const leadFullName = mapped.fullName || `Lead Meta ${event.leadgen_id}`;
    const leadPhone = mapped.phone || "";
    const leadPhone2 = mapped.phone2 || "";
    const leadResult = await client.query<{ id: string }>(
      `
        insert into app_leads (
          unit_id,
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
          created_by
        )
        values ($1, $2, $3, nullif($4, ''), nullif($5, ''), nullif($6, ''), $7, $8, $9, $10, $11, nullif($12, ''), $13, $14)
        returning id
      `,
      [
        targetUnitId,
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
            resolvedAttendance
              ? `Roteamento: ${resolvedAttendance.course_name} - ${resolvedAttendance.city}-${resolvedAttendance.state}`
              : routingError
                ? `Roteamento padrão: ${routingError}`
                : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        form.initial_stage,
        finalAssignment.userId,
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
          updated_at = now()
        where id = $1
      `,
      [
        event.id,
        leadId,
        event.page_id,
        form.id,
        finalAssignment.reason,
        JSON.stringify({
          ...mapped,
          fullName: leadFullName,
          phone: leadPhone,
          phone2: leadPhone2,
          city: leadCity,
        }),
        resolvedAttendance?.id ?? null,
        finalAssignment.userId,
        routingSource,
        resolvedAttendance ? null : routingError,
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

    return { status: "processed", leadId };
  });
}

export async function reprocessMetaEvent(eventId: string) {
  if (!isUuid(eventId)) {
    throw new Error("Evento inválido.");
  }

  await refreshMetaEventLeadPayload(eventId);
  return processEventById(eventId);
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

  const payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
  const parsed = parseMetaEntry(payload);

  if (!parsed.pageId || !parsed.formId || !parsed.leadgenId) {
    return { ok: false, status: 400, error: "Payload sem page_id, form_id ou leadgen_id." };
  }

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
  let leadPayload = leadPayloadFromWebhookValue(parsed.value, parsed);
  let leadFetchError: string | null = null;

  if (page?.page_access_token_encrypted) {
    try {
      leadPayload = await fetchMetaLeadDetailsWithRetry(
        parsed.leadgenId,
        decryptPageToken(page.page_access_token_encrypted),
        integration,
      );
    } catch (error) {
      leadFetchError =
        error instanceof Error
          ? `Não foi possível buscar os dados do lead na Meta: ${error.message}`
          : "Não foi possível buscar os dados do lead na Meta.";
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
    ],
  );
  const event = eventResult.rows[0];

  if (event.lead_id || event.status === "processed") {
    await queryDb(
      `update app_meta_lead_events set status = 'duplicate', updated_at = now() where id = $1`,
      [event.id],
    );
    return { ok: true, status: 200, result: "duplicate" };
  }

  const result = await processEventById(event.id).catch(async (error: unknown) => {
    await queryDb(
      `
        update app_meta_lead_events
        set status = 'error',
            error_message = $2,
            updated_at = now()
        where id = $1
      `,
      [event.id, error instanceof Error ? error.message : "Falha ao processar evento."],
    );
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
