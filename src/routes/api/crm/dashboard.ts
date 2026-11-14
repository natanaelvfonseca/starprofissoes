import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { canViewAllUnitLeads } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getUnitFromRequest } from "@/lib/server/commercial-schema";
import { queryDb } from "@/lib/server/db";

const TIME_ZONE = "America/Sao_Paulo";

type CountRow = QueryResultRow & {
  leads_received: string;
  previous_leads: string;
  uncontacted_leads: string;
  enrollments: string;
};

type AttendanceRow = QueryResultRow & {
  id: string | null;
  name: string;
  city: string | null;
  state: string | null;
  class_date: string | null;
  leads: string;
};

type SourceRow = QueryResultRow & { name: string; leads: string };
type TrendRow = QueryResultRow & { bucket: string; leads: string };
type TaskRow = QueryResultRow & { pending: string };

function localToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return [get("year"), get("month"), get("day")].join("-");
}

function shiftDate(day: string, delta: number) {
  const result = new Date(day + "T12:00:00Z");
  result.setUTCDate(result.getUTCDate() + delta);
  return result.toISOString().slice(0, 10);
}

function isDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}

function getPeriod(request: Request) {
  const params = new URL(request.url).searchParams;
  const preset = params.get("period") ?? "today";
  const today = localToday();
  const end = preset === "custom" ? (params.get("endDate") ?? "") : today;
  const start =
    preset === "custom"
      ? (params.get("startDate") ?? "")
      : shiftDate(today, preset === "7d" ? -6 : preset === "30d" ? -29 : 0);

  if (
    !["today", "7d", "30d", "custom"].includes(preset) ||
    !isDate(start) ||
    !isDate(end) ||
    start > end ||
    end > today
  )
    return null;

  const days =
    Math.round((Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000) + 1;
  if (days > 90) return null;

  return { start, end, days, preset };
}

function dateBins(start: string, days: number, todayOnly: boolean) {
  return Array.from({ length: todayOnly ? 24 : days }, (_, index) =>
    todayOnly ? String(index).padStart(2, "0") : shiftDate(start, index),
  );
}

export const Route = createFileRoute("/api/crm/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        const unit = getUnitFromRequest(session, request);
        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        const period = getPeriod(request);
        if (!period) {
          return Response.json(
            { ok: false, error: "Período inválido (máximo de 90 dias)." },
            { status: 400 },
          );
        }

        // A entrada de leads é um dado agregado da unidade. Pendências e matrículas
        // ficam restritas ao responsável no perfil de consultor.
        const individual = !canViewAllUnitLeads(session.user.role);
        const params = [unit.id, session.user.id, individual, period.start, period.end] as const;
        const inPeriod = `l.created_at >= ($4::date::timestamp at time zone 'America/Sao_Paulo')
          and l.created_at < (($5::date + 1)::timestamp at time zone 'America/Sao_Paulo')`;
        const enrollmentInPeriod = `l.converted_at >= ($4::date::timestamp at time zone 'America/Sao_Paulo')
          and l.converted_at < (($5::date + 1)::timestamp at time zone 'America/Sao_Paulo')`;

        const chartParams = [unit.id, period.start, period.end] as const;
        const chartRange = `l.created_at >= ($2::date::timestamp at time zone 'America/Sao_Paulo')
          and l.created_at < (($3::date + 1)::timestamp at time zone 'America/Sao_Paulo')`;

        try {
          const [counts, attendances, sources, trend, taskTable] = await Promise.all([
            queryDb<CountRow>(
              `select
                count(*) filter (where ${inPeriod})::text as leads_received,
                count(*) filter (
                  where l.created_at >= (($4::date - ($5::date - $4::date + 1))::timestamp at time zone 'America/Sao_Paulo')
                    and l.created_at < ($4::date::timestamp at time zone 'America/Sao_Paulo')
                )::text as previous_leads,
                count(*) filter (
                  where l.stage = 'Novo lead' and l.first_contact_at is null
                    and (not $3::boolean or l.created_by = $2 or l.shared_queue = true)
                )::text as uncontacted_leads,
                count(*) filter (
                  where l.stage = 'Matriculado' and ${enrollmentInPeriod}
                    and (not $3::boolean or coalesce(l.converted_by, l.created_by) = $2)
                )::text as enrollments
              from app_leads l where l.unit_id = $1`,
              params,
            ),
            queryDb<AttendanceRow>(
              `select a.id, coalesce(c.name, 'Sem turma vinculada') as name,
                 a.city, a.state, a.class_date::text,
                 count(*)::text as leads
               from app_leads l
               left join app_course_attendances a on a.id = l.attendance_id and a.unit_id = l.unit_id
               left join app_courses c on c.id = a.course_id
               where l.unit_id = $1 and ${chartRange}
               group by a.id, c.name, a.city, a.state, a.class_date
               order by count(*) desc, name asc limit 7`,
              chartParams,
            ),
            queryDb<SourceRow>(
              `select coalesce(nullif(l.acquisition_channel_name_snapshot, ''), ch.name, 'Sem origem') as name,
                  count(*)::text as leads
                from app_leads l
                left join app_acquisition_channels ch on ch.id = l.acquisition_channel_id
                where l.unit_id = $1 and ${chartRange}
                group by 1 order by count(*) desc, name asc`,
              chartParams,
            ),
            queryDb<TrendRow>(
              `select to_char(l.created_at at time zone 'America/Sao_Paulo',
                  case when $4::boolean then 'HH24' else 'YYYY-MM-DD' end) as bucket,
                  count(*)::text as leads
                from app_leads l
                where l.unit_id = $1 and ${chartRange}
                group by 1 order by 1`,
              [...chartParams, period.days === 1],
            ),
            queryDb<{ name: string | null } & QueryResultRow>(
              "select to_regclass('app_crm_tasks')::text as name",
            ),
          ]);

          let pending = 0;
          if (taskTable.rows[0]?.name) {
            const result = await queryDb<TaskRow>(
              `select count(*)::text as pending from app_crm_tasks t
               where t.unit_id = $1
                 and t.status = 'pending'
                 and t.due_at < (((now() at time zone 'America/Sao_Paulo')::date + 1)::timestamp at time zone 'America/Sao_Paulo')
                 and (not $3::boolean or t.created_by = $2)`,
              params.slice(0, 3),
            );
            pending = Number(result.rows[0]?.pending ?? 0);
          }

          const hourly = period.days === 1;
          const trendsByBucket = new Map(trend.rows.map((row) => [row.bucket, Number(row.leads)]));
          return Response.json(
            {
              period: { ...period, hourly },
              scope: individual ? "individual" : "unit",
              metrics: {
                leadsReceived: Number(counts.rows[0]?.leads_received ?? 0),
                previousLeads: Number(counts.rows[0]?.previous_leads ?? 0),
                uncontactedLeads: Number(counts.rows[0]?.uncontacted_leads ?? 0),
                enrollments: Number(counts.rows[0]?.enrollments ?? 0),
                pendingTasks: pending,
              },
              attendances: attendances.rows.map((row) => ({
                id: row.id,
                name: row.name,
                city: row.city,
                state: row.state,
                classDate: row.class_date,
                leads: Number(row.leads),
              })),
              sources: sources.rows.map((row) => ({
                name: row.name,
                leads: Number(row.leads),
              })),
              trend: dateBins(period.start, period.days, hourly).map((bucket) => ({
                bucket,
                leads: trendsByBucket.get(bucket) ?? 0,
              })),
              updatedAt: new Date().toISOString(),
            },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (error) {
          console.error("[crm/dashboard] Failed to load dashboard:", error);
          return Response.json(
            { ok: false, error: "Falha ao carregar os indicadores." },
            { status: 500 },
          );
        }
      },
    },
  },
});
