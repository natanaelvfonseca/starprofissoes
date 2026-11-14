import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { canViewAttendances } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getUnitFromRequest } from "@/lib/server/commercial-schema";
import { ensureSalesAiSchema } from "@/lib/server/sales-conversation-ai";
import { ensureWhatsappSupervisionSchema } from "@/lib/server/whatsapp-supervision";
import { ensureRuntimeSchema, queryDb } from "@/lib/server/db";

type ConsultantRow = QueryResultRow & {
  id: string;
  name: string;
  whatsapp_status: string | null;
  active_conversations: string;
  inbound_messages: string;
  outbound_messages: string;
  last_message_at: string | null;
  analyzed_conversations: string;
  sample_score: string | null;
  sample_at: string | null;
  latest_review_score: string | null;
  latest_review_at: string | null;
  latest_review_summary: string | null;
  latest_review_actions: unknown;
  latest_review_improvements: unknown;
};

function todayInBrazil() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return [get("year"), get("month"), get("day")].join("-");
}

function startDay(period: "today" | "7d" | "30d") {
  const day = todayInBrazil();
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - (period === "7d" ? 6 : period === "30d" ? 29 : 0));
  return date.toISOString().slice(0, 10);
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];
}

export const Route = createFileRoute("/api/ia-comercial/visao")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canViewAttendances(session.user.role)) {
          return Response.json(
            { error: "Apenas a gestão pode consultar os dados da equipe." },
            { status: 403 },
          );
        }
        const unit = getUnitFromRequest(session, request);
        if (!unit) return Response.json({ error: "Unidade indisponível." }, { status: 403 });
        const preset = new URL(request.url).searchParams.get("period") ?? "7d";
        if (!["today", "7d", "30d"].includes(preset)) {
          return Response.json({ error: "Período inválido." }, { status: 400 });
        }
        const period = preset as "today" | "7d" | "30d";
        const start = startDay(period);

        try {
          await Promise.all([ensureSalesAiSchema(), ensureWhatsappSupervisionSchema()]);
          // Index específico para resumos recentes por consultor: sem varrer
          // mensagens/transcrições nem carregar o histórico completo na abertura.
          await ensureRuntimeSchema(
            "commercial-intelligence-perf-1",
            `
          create index if not exists app_whatsapp_ai_unit_consultant_recent_idx
          on app_whatsapp_conversation_analyses (unit_id, consultant_id, created_at desc)
          where status = 'completed' and score is not null;
        `,
          );
          // A visão inicial não carrega mensagens, transcrições ou textos de conversas.
          // Os resumos da IA já foram calculados e persistidos por outros processos.
          const result = await queryDb<ConsultantRow>(
            `select u.id, u.name, i.status as whatsapp_status,
             coalesce(chat.active_conversations,0)::text as active_conversations,
             coalesce(msg.inbound_messages,0)::text as inbound_messages,
             coalesce(msg.outbound_messages,0)::text as outbound_messages,
             chat.last_message_at::text as last_message_at,
             coalesce(reviews.total,0)::text as analyzed_conversations,
             reviews.average_score::text as sample_score,
             reviews.last_analyzed_at::text as sample_at,
             latest.score::text as latest_review_score,
             latest.created_at::text as latest_review_at,
             latest.summary as latest_review_summary,
             latest.action_items as latest_review_actions,
             latest.improvements as latest_review_improvements
           from app_users u
           join app_user_units uu on uu.user_id=u.id and uu.unit_id=$1
           left join app_whatsapp_instances i on i.user_id=u.id and i.unit_id=uu.unit_id
           left join lateral (
             select count(*) as active_conversations,
               max(c.last_message_at) as last_message_at
             from app_whatsapp_conversations c
             where c.unit_id=$1 and c.consultant_id=u.id
               and c.merged_into_id is null
               and c.last_message_at >= ($2::date::timestamp at time zone 'America/Sao_Paulo')
           ) chat on true
           left join lateral (
             select count(*) filter (where m.direction='inbound') as inbound_messages,
               count(*) filter (where m.direction='outbound') as outbound_messages
             from app_whatsapp_messages m
             where m.unit_id=$1 and m.user_id=u.id
               and m.sent_at >= ($2::date::timestamp at time zone 'America/Sao_Paulo')
           ) msg on true
           left join lateral (
             select count(*) as total, round(avg(s.score)) as average_score,
               max(s.created_at) as last_analyzed_at
             from (
               select a.score, a.created_at
               from app_whatsapp_conversation_analyses a
               where a.unit_id=$1 and a.consultant_id=u.id
                 and a.status='completed' and a.score is not null
                 and a.created_at >= ($2::date::timestamp at time zone 'America/Sao_Paulo')
               order by a.created_at desc limit 8
             ) s
           ) reviews on true
           left join lateral (
             select a.score, a.created_at, a.summary, a.action_items, a.improvements
             from app_sales_conversation_analyses a
             where a.unit_id=$1 and a.consultant_id=u.id
             order by a.created_at desc limit 1
           ) latest on true
           where u.role='CONSULTOR' and u.status='active'
           order by chat.active_conversations desc nulls last, u.name asc
           limit 150`,
            [unit.id, start],
          );

          const consultants = result.rows.map((r) => ({
            id: r.id,
            name: r.name,
            whatsappStatus: r.whatsapp_status ?? "disconnected",
            conversations: Number(r.active_conversations ?? 0),
            inbound: Number(r.inbound_messages ?? 0),
            outbound: Number(r.outbound_messages ?? 0),
            lastMessageAt: r.last_message_at,
            sampleCount: Number(r.analyzed_conversations ?? 0),
            sampleScore: r.sample_score === null ? null : Number(r.sample_score),
            sampleAt: r.sample_at,
            latestReview: r.latest_review_at
              ? {
                  score: r.latest_review_score === null ? null : Number(r.latest_review_score),
                  at: r.latest_review_at,
                  summary: r.latest_review_summary,
                  actions: strings(r.latest_review_actions),
                  improvements: strings(r.latest_review_improvements),
                }
              : null,
          }));
          const sampled = consultants.filter((c) => c.sampleScore !== null);
          return Response.json(
            {
              unit: { id: unit.id, name: unit.name },
              period: { preset: period, start, end: todayInBrazil() },
              consultants,
              totals: {
                consultants: consultants.length,
                connected: consultants.filter((c) => c.whatsappStatus === "connected").length,
                conversations: consultants.reduce((acc, c) => acc + c.conversations, 0),
                inbound: consultants.reduce((acc, c) => acc + c.inbound, 0),
                outbound: consultants.reduce((acc, c) => acc + c.outbound, 0),
                analyzed: consultants.reduce((acc, c) => acc + c.sampleCount, 0),
                sampleScore: sampled.length
                  ? Math.round(
                      sampled.reduce((acc, c) => acc + (c.sampleScore ?? 0), 0) / sampled.length,
                    )
                  : null,
              },
              updatedAt: new Date().toISOString(),
            },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (error) {
          console.error("[ia-comercial/visao]", error);
          return Response.json(
            { error: "Não foi possível calcular a visão comercial." },
            { status: 500 },
          );
        }
      },
    },
  },
});
