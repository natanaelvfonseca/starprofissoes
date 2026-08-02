import type { QueryResultRow } from "pg";
import type { AuthSession } from "@/lib/auth-types";
import { canViewAttendances, canViewSalesAi } from "@/lib/auth-types";
import type {
  SalesAiConsultantSummary,
  SalesAiCourseOption,
  SalesAnalysisExample,
  SalesConversationAnalysis,
  SalesScriptRecord,
} from "@/lib/sales-ai-types";
import { ensureCommercialSchema, isUuid } from "@/lib/server/commercial-schema";
import { queryDb } from "@/lib/server/db";
import {
  getAttendanceUnitScope,
  listAttendanceConversations,
  listAttendanceMessages,
} from "@/lib/server/attendances";
import { ensureEvolutionSchema } from "@/lib/server/evolution-whatsapp";

const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_ANALYSIS_MODEL = "gpt-4.1-mini";
const DEFAULT_ANALYSIS_PERIOD_DAYS = 30;
const MAX_CONVERSATIONS_FOR_ANALYSIS = 8;
const MAX_MESSAGES_PER_CONVERSATION = 30;
const MAX_PROMPT_CHARS = 28_000;
const MAX_SCRIPT_CHARS = 24_000;

type SalesScriptRow = QueryResultRow & {
  id: string;
  unit_id: string;
  unit_name: string;
  course_id: string;
  course_name: string;
  title: string;
  script_body: string;
  active: boolean;
  updated_at: string;
  updated_by_name: string | null;
};

type CourseRow = QueryResultRow & {
  id: string;
  unit_id: string;
  unit_name: string;
  name: string;
  status: "active" | "inactive";
};

type ConsultantRow = QueryResultRow & {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  unit_id: string;
  unit_name: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  phone_number: string | null;
  conversation_count: string | number;
  message_count_30d: string | number;
  outbound_count_30d: string | number;
  inbound_count_30d: string | number;
  last_message_at: string | null;
};

type AnalysisRow = QueryResultRow & {
  id: string;
  unit_id: string;
  unit_name: string;
  consultant_id: string;
  consultant_name: string;
  course_id: string;
  course_name: string;
  script_id: string | null;
  score: string | number;
  script_adherence: string | number;
  rapport_score: string | number;
  discovery_score: string | number;
  objection_score: string | number;
  closing_score: string | number;
  messages_analyzed: string | number;
  conversations_analyzed: string | number;
  summary: string;
  strengths: unknown;
  improvements: unknown;
  action_items: unknown;
  examples: unknown;
  model: string;
  created_at: string;
  created_by_name: string | null;
};

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

type ParsedAnalysis = {
  score: number;
  scriptAdherence: number;
  rapportScore: number;
  discoveryScore: number;
  objectionScore: number;
  closingScore: number;
  summary: string;
  strengths: Array<string>;
  improvements: Array<string>;
  actionItems: Array<string>;
  examples: Array<SalesAnalysisExample>;
};

let salesAiSchemaPromise: Promise<void> | null = null;

export function canAccessSalesAi(session: AuthSession | null) {
  return Boolean(session && canViewSalesAi(session.user.role) && session.units.length);
}

export function canManageSalesAi(session: AuthSession | null) {
  return Boolean(session && canViewAttendances(session.user.role) && session.units.length);
}

export function ensureSalesAiSchema() {
  salesAiSchemaPromise ??= queryDb(`
    create table if not exists app_sales_scripts (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      course_id uuid not null references app_courses(id) on delete cascade,
      title text not null,
      script_body text not null,
      active boolean not null default true,
      created_by uuid references app_users(id) on delete set null,
      updated_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create unique index if not exists app_sales_scripts_unit_course_idx
      on app_sales_scripts (unit_id, course_id);

    create index if not exists app_sales_scripts_unit_updated_idx
      on app_sales_scripts (unit_id, updated_at desc);

    create table if not exists app_sales_conversation_analyses (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      consultant_id uuid not null references app_users(id) on delete cascade,
      course_id uuid not null references app_courses(id) on delete cascade,
      sales_script_id uuid references app_sales_scripts(id) on delete set null,
      period_days integer not null default 30,
      messages_analyzed integer not null default 0,
      conversations_analyzed integer not null default 0,
      score numeric(5,2) not null default 0,
      script_adherence numeric(5,2) not null default 0,
      rapport_score numeric(5,2) not null default 0,
      discovery_score numeric(5,2) not null default 0,
      objection_score numeric(5,2) not null default 0,
      closing_score numeric(5,2) not null default 0,
      summary text not null,
      strengths jsonb not null default '[]'::jsonb,
      improvements jsonb not null default '[]'::jsonb,
      action_items jsonb not null default '[]'::jsonb,
      examples jsonb not null default '[]'::jsonb,
      model text not null,
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now()
    );

    create index if not exists app_sales_conversation_analyses_consultant_idx
      on app_sales_conversation_analyses (unit_id, consultant_id, created_at desc);

    create index if not exists app_sales_conversation_analyses_course_idx
      on app_sales_conversation_analyses (unit_id, course_id, created_at desc);
  `)
    .then(() => undefined)
    .catch((error) => {
      salesAiSchemaPromise = null;
      throw error;
    });

  return salesAiSchemaPromise;
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0) || 0;
}

function clampScore(value: unknown) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function readString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeArray(value: unknown, maxItems = 6) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);
}

function safeExamples(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};

      return {
        conversation: readString(record.conversation, 120),
        evidence: readString(record.evidence, 360),
        recommendation: readString(record.recommendation, 360),
      };
    })
    .filter((item) => item.evidence || item.recommendation)
    .slice(0, 5);
}

function mapScript(row: SalesScriptRow): SalesScriptRecord {
  return {
    id: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    courseId: row.course_id,
    courseName: row.course_name,
    title: row.title,
    scriptBody: row.script_body,
    active: row.active,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
}

function mapCourse(row: CourseRow): SalesAiCourseOption {
  return {
    id: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    name: row.name,
    status: row.status,
  };
}

function mapAnalysis(row: AnalysisRow): SalesConversationAnalysis {
  return {
    id: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    consultantId: row.consultant_id,
    consultantName: row.consultant_name,
    courseId: row.course_id,
    courseName: row.course_name,
    scriptId: row.script_id,
    score: toNumber(row.score),
    scriptAdherence: toNumber(row.script_adherence),
    rapportScore: toNumber(row.rapport_score),
    discoveryScore: toNumber(row.discovery_score),
    objectionScore: toNumber(row.objection_score),
    closingScore: toNumber(row.closing_score),
    messagesAnalyzed: toNumber(row.messages_analyzed),
    conversationsAnalyzed: toNumber(row.conversations_analyzed),
    summary: row.summary,
    strengths: safeArray(row.strengths),
    improvements: safeArray(row.improvements),
    actionItems: safeArray(row.action_items),
    examples: safeExamples(row.examples),
    model: row.model,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
  };
}

function mapConsultant(row: ConsultantRow, latestAnalysis: SalesConversationAnalysis | null) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    unitId: row.unit_id,
    unitName: row.unit_name,
    status: row.status,
    phoneNumber: row.phone_number,
    conversationCount: toNumber(row.conversation_count),
    messageCount30d: toNumber(row.message_count_30d),
    outboundCount30d: toNumber(row.outbound_count_30d),
    inboundCount30d: toNumber(row.inbound_count_30d),
    lastMessageAt: row.last_message_at,
    latestAnalysis,
  } satisfies SalesAiConsultantSummary;
}

function scopedUnitIds(session: AuthSession, requestedUnitId?: string | null) {
  const scope = getAttendanceUnitScope(session, requestedUnitId);

  if (!scope?.unitIds.length) {
    return null;
  }

  return scope;
}

async function listCourses(unitIds: Array<string>) {
  const result = await queryDb<CourseRow>(
    `
      select
        c.id,
        c.unit_id,
        u.name as unit_name,
        c.name,
        c.status
      from app_courses c
      inner join app_units u on u.id = c.unit_id
      where c.unit_id = any($1::uuid[])
      order by u.name asc, case c.status when 'active' then 0 else 1 end, c.name asc
    `,
    [unitIds],
  );

  return result.rows.map(mapCourse);
}

async function listScripts(unitIds: Array<string>) {
  const result = await queryDb<SalesScriptRow>(
    `
      select
        s.id,
        s.unit_id,
        unit.name as unit_name,
        s.course_id,
        course.name as course_name,
        s.title,
        s.script_body,
        s.active,
        s.updated_at::text,
        editor.name as updated_by_name
      from app_sales_scripts s
      inner join app_units unit on unit.id = s.unit_id
      inner join app_courses course on course.id = s.course_id
      left join app_users editor on editor.id = s.updated_by
      where s.unit_id = any($1::uuid[])
      order by unit.name asc, course.name asc
    `,
    [unitIds],
  );

  return result.rows.map(mapScript);
}

async function listLatestAnalyses(unitIds: Array<string>) {
  const result = await queryDb<AnalysisRow>(
    `
      select distinct on (a.consultant_id, a.unit_id)
        a.id,
        a.unit_id,
        unit.name as unit_name,
        a.consultant_id,
        consultant.name as consultant_name,
        a.course_id,
        course.name as course_name,
        a.sales_script_id as script_id,
        a.score::text,
        a.script_adherence::text,
        a.rapport_score::text,
        a.discovery_score::text,
        a.objection_score::text,
        a.closing_score::text,
        a.messages_analyzed::text,
        a.conversations_analyzed::text,
        a.summary,
        a.strengths,
        a.improvements,
        a.action_items,
        a.examples,
        a.model,
        a.created_at::text,
        creator.name as created_by_name
      from app_sales_conversation_analyses a
      inner join app_units unit on unit.id = a.unit_id
      inner join app_users consultant on consultant.id = a.consultant_id
      inner join app_courses course on course.id = a.course_id
      left join app_users creator on creator.id = a.created_by
      where a.unit_id = any($1::uuid[])
      order by a.consultant_id, a.unit_id, a.created_at desc
    `,
    [unitIds],
  );

  return new Map(
    result.rows.map((row) => [`${row.unit_id}:${row.consultant_id}`, mapAnalysis(row)]),
  );
}

async function listConsultants(unitIds: Array<string>, consultantId?: string | null) {
  const result = await queryDb<ConsultantRow>(
    `
      select
        u.id,
        u.name,
        u.email,
        u.avatar_url,
        instance.unit_id,
        unit.name as unit_name,
        instance.status,
        instance.phone_number,
        count(distinct message.remote_jid)::text as conversation_count,
        count(message.id) filter (where message.sent_at >= now() - interval '30 days')::text as message_count_30d,
        count(message.id) filter (
          where message.sent_at >= now() - interval '30 days'
            and message.direction = 'outbound'
        )::text as outbound_count_30d,
        count(message.id) filter (
          where message.sent_at >= now() - interval '30 days'
            and message.direction = 'inbound'
        )::text as inbound_count_30d,
        max(message.sent_at)::text as last_message_at
      from app_whatsapp_instances instance
      inner join app_users u on u.id = instance.user_id
      inner join app_units unit on unit.id = instance.unit_id
      left join app_whatsapp_messages message
        on message.instance_id = instance.id
        and message.unit_id = instance.unit_id
        and message.user_id = u.id
      where instance.unit_id = any($1::uuid[])
        and ($2::uuid is null or u.id = $2)
        and u.role = 'CONSULTOR'
        and u.status = 'active'
      group by
        u.id,
        u.name,
        u.email,
        u.avatar_url,
        instance.unit_id,
        unit.name,
        instance.status,
        instance.phone_number
      order by
        case instance.status when 'connected' then 0 when 'connecting' then 1 else 2 end,
        max(message.sent_at) desc nulls last,
        u.name asc
    `,
    [unitIds, consultantId ?? null],
  );

  const latestAnalyses = await listLatestAnalyses(unitIds);

  return result.rows.map((row) =>
    mapConsultant(row, latestAnalyses.get(`${row.unit_id}:${row.id}`) ?? null),
  );
}

export async function listSalesAiDashboard(session: AuthSession, requestedUnitId?: string | null) {
  const scope = scopedUnitIds(session, requestedUnitId);

  if (!scope) {
    return null;
  }

  await Promise.all([ensureCommercialSchema(), ensureEvolutionSchema(), ensureSalesAiSchema()]);

  const isConsultant = session.user.role === "CONSULTOR";
  const [courses, scripts, consultants] = await Promise.all([
    isConsultant ? Promise.resolve([]) : listCourses(scope.unitIds),
    isConsultant ? Promise.resolve([]) : listScripts(scope.unitIds),
    listConsultants(scope.unitIds, isConsultant ? session.user.id : null),
  ]);

  return {
    selectedUnitId: scope.selectedUnitId,
    courses,
    scripts,
    consultants,
  };
}

export async function upsertSalesScript(
  session: AuthSession,
  payload: {
    unitId: unknown;
    courseId: unknown;
    title: unknown;
    scriptBody: unknown;
    active: unknown;
  },
) {
  const unitId = readString(payload.unitId, 80);
  const courseId = readString(payload.courseId, 80);
  const title = readString(payload.title, 160);
  const scriptBody = readString(payload.scriptBody, MAX_SCRIPT_CHARS);
  const active = payload.active !== false;

  if (!isUuid(unitId) || !session.units.some((unit) => unit.id === unitId)) {
    return { error: "Unidade indisponível.", status: 403 } as const;
  }

  if (!isUuid(courseId) || !title || scriptBody.length < 80) {
    return {
      error: "Selecione um curso e informe um script com pelo menos 80 caracteres.",
      status: 400,
    } as const;
  }

  await Promise.all([ensureCommercialSchema(), ensureSalesAiSchema()]);

  const courseResult = await queryDb<{ id: string } & QueryResultRow>(
    `select id from app_courses where id = $1 and unit_id = $2 limit 1`,
    [courseId, unitId],
  );

  if (!courseResult.rows[0]) {
    return { error: "Curso não encontrado nesta unidade.", status: 404 } as const;
  }

  const result = await queryDb<SalesScriptRow>(
    `
      insert into app_sales_scripts (
        unit_id,
        course_id,
        title,
        script_body,
        active,
        created_by,
        updated_by
      )
      values ($1, $2, $3, $4, $5, $6, $6)
      on conflict (unit_id, course_id) do update
      set
        title = excluded.title,
        script_body = excluded.script_body,
        active = excluded.active,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning
        id,
        unit_id,
        (select name from app_units where id = $1) as unit_name,
        course_id,
        (select name from app_courses where id = $2) as course_name,
        title,
        script_body,
        active,
        updated_at::text,
        (select name from app_users where id = $6) as updated_by_name
    `,
    [unitId, courseId, title, scriptBody, active, session.user.id],
  );

  return { script: mapScript(result.rows[0]) } as const;
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return "";
  }

  return trimmed.slice(start, end + 1);
}

function parseOpenAiAnalysis(content: string): ParsedAnalysis {
  const jsonText = extractJsonObject(content);
  const data = JSON.parse(jsonText || "{}") as Record<string, unknown>;

  return {
    score: clampScore(data.score),
    scriptAdherence: clampScore(data.scriptAdherence),
    rapportScore: clampScore(data.rapportScore),
    discoveryScore: clampScore(data.discoveryScore),
    objectionScore: clampScore(data.objectionScore),
    closingScore: clampScore(data.closingScore),
    summary: readString(data.summary, 1200) || "A IA não retornou um resumo conclusivo.",
    strengths: safeArray(data.strengths),
    improvements: safeArray(data.improvements),
    actionItems: safeArray(data.actionItems),
    examples: safeExamples(data.examples),
  };
}

async function callOpenAiAnalysis({
  script,
  transcript,
  consultantName,
  courseName,
}: {
  script: string;
  transcript: string;
  consultantName: string;
  courseName: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Configure OPENAI_API_KEY no ambiente do servidor para analisar conversas.");
  }

  const model = process.env.OPENAI_ANALYSIS_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL;
  const prompt = `
Analise conversas comerciais reais de WhatsApp da Star Profissões.

Curso/script de referência: ${courseName}
Consultor avaliado: ${consultantName}

SCRIPT DE VENDAS:
${script}

CONVERSAS:
${transcript}

Responda somente JSON válido com esta estrutura:
{
  "score": 0-100,
  "scriptAdherence": 0-100,
  "rapportScore": 0-100,
  "discoveryScore": 0-100,
  "objectionScore": 0-100,
  "closingScore": 0-100,
  "summary": "diagnóstico objetivo em português",
  "strengths": ["ponto forte"],
  "improvements": ["o que melhorar"],
  "actionItems": ["ação prática para o gestor passar ao consultor"],
  "examples": [
    {
      "conversation": "Contato 1",
      "evidence": "trecho ou comportamento observado, sem expor telefone",
      "recommendation": "como corrigir seguindo o script"
    }
  ]
}
`;

  const response = await fetch(OPENAI_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você é uma liderança comercial sênior. Avalie aderência ao script, técnica consultiva, clareza, objeções e fechamento. Seja direto, prático e justo.",
        },
        { role: "user", content: prompt.slice(0, MAX_PROMPT_CHARS) },
      ],
    }),
  });
  const payload = (await response.json().catch(() => null)) as OpenAiChatResponse | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "A OpenAI não conseguiu analisar as conversas.");
  }

  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("A OpenAI não retornou uma análise.");
  }

  return { model, analysis: parseOpenAiAnalysis(content) };
}

async function getScriptForAnalysis(unitId: string, courseId: string) {
  const result = await queryDb<SalesScriptRow>(
    `
      select
        s.id,
        s.unit_id,
        unit.name as unit_name,
        s.course_id,
        course.name as course_name,
        s.title,
        s.script_body,
        s.active,
        s.updated_at::text,
        editor.name as updated_by_name
      from app_sales_scripts s
      inner join app_units unit on unit.id = s.unit_id
      inner join app_courses course on course.id = s.course_id
      left join app_users editor on editor.id = s.updated_by
      where s.unit_id = $1
        and s.course_id = $2
        and s.active = true
      limit 1
    `,
    [unitId, courseId],
  );

  return result.rows[0] ? mapScript(result.rows[0]) : null;
}

async function getConsultantName(consultantId: string, unitId: string) {
  const result = await queryDb<{ id: string; name: string } & QueryResultRow>(
    `
      select u.id, u.name
      from app_users u
      inner join app_whatsapp_instances instance on instance.user_id = u.id
      where u.id = $1
        and instance.unit_id = $2
        and u.role = 'CONSULTOR'
        and u.status = 'active'
      limit 1
    `,
    [consultantId, unitId],
  );

  return result.rows[0] ?? null;
}

async function buildConversationTranscript(
  session: AuthSession,
  params: { consultantId: string; unitId: string },
) {
  const conversationsData = await listAttendanceConversations(session, {
    consultantId: params.consultantId,
    unitId: params.unitId,
    limit: MAX_CONVERSATIONS_FOR_ANALYSIS,
    offset: 0,
  });

  if (!conversationsData?.conversations.length) {
    return { transcript: "", messagesAnalyzed: 0, conversationsAnalyzed: 0 };
  }

  const selectedConversations = conversationsData.conversations.slice(
    0,
    MAX_CONVERSATIONS_FOR_ANALYSIS,
  );
  const messageResults = await Promise.all(
    selectedConversations.map(async (conversation, index) => {
      const data = await listAttendanceMessages(session, {
        consultantId: params.consultantId,
        unitId: params.unitId,
        remoteJid: conversation.remoteJid,
        limit: MAX_MESSAGES_PER_CONVERSATION,
        offset: 0,
      }).catch(() => null);

      return {
        label: `Contato ${index + 1}`,
        messages: data?.messages ?? [],
      };
    }),
  );
  const transcriptBlocks = messageResults
    .map((conversation) => {
      const lines = conversation.messages
        .filter((message) => message.content.trim())
        .map((message) => {
          const speaker = message.direction === "outbound" ? "Consultor" : "Lead";
          const content = message.content.replace(/\s+/g, " ").trim();

          return `${new Date(message.sentAt).toISOString()} | ${speaker}: ${content}`;
        });

      if (!lines.length) {
        return "";
      }

      return `### ${conversation.label}\n${lines.join("\n")}`;
    })
    .filter(Boolean);
  const messagesAnalyzed = messageResults.reduce(
    (total, conversation) => total + conversation.messages.length,
    0,
  );

  return {
    transcript: transcriptBlocks.join("\n\n").slice(0, MAX_PROMPT_CHARS),
    messagesAnalyzed,
    conversationsAnalyzed: transcriptBlocks.length,
  };
}

export async function runSalesConversationAnalysis(
  session: AuthSession,
  payload: { unitId: unknown; consultantId: unknown; courseId: unknown },
) {
  const unitId = readString(payload.unitId, 80);
  const consultantId = readString(payload.consultantId, 80);
  const courseId = readString(payload.courseId, 80);

  if (
    !isUuid(unitId) ||
    !isUuid(consultantId) ||
    !isUuid(courseId) ||
    !session.units.some((unit) => unit.id === unitId)
  ) {
    return { error: "Dados inválidos para análise.", status: 400 } as const;
  }

  await Promise.all([ensureCommercialSchema(), ensureEvolutionSchema(), ensureSalesAiSchema()]);

  const [script, consultant] = await Promise.all([
    getScriptForAnalysis(unitId, courseId),
    getConsultantName(consultantId, unitId),
  ]);

  if (!consultant) {
    return {
      error: "Consultor não encontrado ou sem WhatsApp conectado nesta unidade.",
      status: 404,
    } as const;
  }

  if (!script) {
    return {
      error: "Cadastre e ative o script deste curso antes de analisar.",
      status: 400,
    } as const;
  }

  const transcript = await buildConversationTranscript(session, { consultantId, unitId });

  if (transcript.messagesAnalyzed < 8 || !transcript.transcript) {
    return {
      error: "Ainda não há mensagens suficientes para uma análise confiável deste consultor.",
      status: 400,
    } as const;
  }

  const openAiResult = await callOpenAiAnalysis({
    script: script.scriptBody,
    transcript: transcript.transcript,
    consultantName: consultant.name,
    courseName: script.courseName,
  });
  const analysis = openAiResult.analysis;
  const result = await queryDb<AnalysisRow>(
    `
      insert into app_sales_conversation_analyses (
        unit_id,
        consultant_id,
        course_id,
        sales_script_id,
        period_days,
        messages_analyzed,
        conversations_analyzed,
        score,
        script_adherence,
        rapport_score,
        discovery_score,
        objection_score,
        closing_score,
        summary,
        strengths,
        improvements,
        action_items,
        examples,
        model,
        created_by
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19, $20
      )
      returning
        id,
        unit_id,
        (select name from app_units where id = $1) as unit_name,
        consultant_id,
        (select name from app_users where id = $2) as consultant_name,
        course_id,
        (select name from app_courses where id = $3) as course_name,
        sales_script_id as script_id,
        score::text,
        script_adherence::text,
        rapport_score::text,
        discovery_score::text,
        objection_score::text,
        closing_score::text,
        messages_analyzed::text,
        conversations_analyzed::text,
        summary,
        strengths,
        improvements,
        action_items,
        examples,
        model,
        created_at::text,
        (select name from app_users where id = $20) as created_by_name
    `,
    [
      unitId,
      consultantId,
      courseId,
      script.id,
      DEFAULT_ANALYSIS_PERIOD_DAYS,
      transcript.messagesAnalyzed,
      transcript.conversationsAnalyzed,
      analysis.score,
      analysis.scriptAdherence,
      analysis.rapportScore,
      analysis.discoveryScore,
      analysis.objectionScore,
      analysis.closingScore,
      analysis.summary,
      JSON.stringify(analysis.strengths),
      JSON.stringify(analysis.improvements),
      JSON.stringify(analysis.actionItems),
      JSON.stringify(analysis.examples),
      openAiResult.model,
      session.user.id,
    ],
  );

  return { analysis: mapAnalysis(result.rows[0]) } as const;
}
