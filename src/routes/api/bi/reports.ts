import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { canViewGrowth } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getUnitFromRequest, isUuid } from "@/lib/server/commercial-schema";
import { queryDb } from "@/lib/server/db";

const TIME_ZONE = "America/Sao_Paulo";

type SummaryRow = QueryResultRow & {
  leads: string;
  enrollments: string;
  active_attendances: string;
  without_attendance: string;
  without_converter: string;
};
type TrendRow = QueryResultRow & { bucket: string; leads: string; enrollments: string };
type AttendanceRow = QueryResultRow & {
  id: string;
  course: string;
  city: string;
  state: string;
  class_date: string;
  status: string;
  leads: string;
  enrollments: string;
};
type GroupRow = QueryResultRow & { name: string; leads: string };
type ConsultantRow = QueryResultRow & {
  id: string;
  name: string;
  status: string;
  portfolio: string;
  received: string;
  enrollments: string;
};
type DetailAttendanceRow = QueryResultRow & {
  id: string;
  name: string;
  leads: string;
  enrollments: string;
};
type LeadRow = QueryResultRow & {
  id: string;
  name: string;
  created_at: string;
  stage: string;
  attendance: string | null;
  owner: string | null;
};

function localToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function shiftDay(day: string, offset: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function validDay(day: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(Date.parse(day + "T12:00:00Z")) &&
    new Date(day + "T12:00:00Z").toISOString().slice(0, 10) === day
  );
}
function readPeriod(request: Request) {
  const query = new URL(request.url).searchParams;
  const preset = query.get("period") ?? "today";
  const today = localToday();
  if (!["today", "7d", "30d", "custom"].includes(preset)) return null;
  const start =
    preset === "custom"
      ? (query.get("startDate") ?? "")
      : shiftDay(today, preset === "7d" ? -6 : preset === "30d" ? -29 : 0);
  const end = preset === "custom" ? (query.get("endDate") ?? "") : today;
  if (!validDay(start) || !validDay(end) || start > end || end > today) return null;
  const days =
    Math.round((Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000) + 1;
  if (days < 1 || days > 366) return null;
  return { preset, start, end, days, hourly: days === 1 };
}
const leadPeriod = `l.created_at >= ($2::date::timestamp at time zone 'America/Sao_Paulo')
  and l.created_at < (($3::date + 1)::timestamp at time zone 'America/Sao_Paulo')`;
const enrollmentPeriod = `l.stage = 'Matriculado'
  and l.converted_at >= ($2::date::timestamp at time zone 'America/Sao_Paulo')
  and l.converted_at < (($3::date + 1)::timestamp at time zone 'America/Sao_Paulo')`;
const attendanceFilter = "($4::uuid is null or l.attendance_id = $4)";
const bucket = (column: string) => `to_char(${column} at time zone 'America/Sao_Paulo',
  case when $5::boolean then 'HH24' else 'YYYY-MM-DD' end)`;
const n = (v: unknown) => Number(v ?? 0) || 0;

export const Route = createFileRoute("/api/bi/reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canViewGrowth(session.user.role)) {
          return Response.json({ error: "Sem acesso aos relatórios." }, { status: 403 });
        }
        const unit = getUnitFromRequest(session, request);
        if (!unit) return Response.json({ error: "Unidade não autorizada." }, { status: 403 });
        const period = readPeriod(request);
        if (!period)
          return Response.json({ error: "Período inválido (máximo 366 dias)." }, { status: 400 });
        const search = new URL(request.url).searchParams;
        const attendanceId = search.get("attendanceId") ?? "";
        const consultantId = search.get("consultantId") ?? "";
        if ((attendanceId && !isUuid(attendanceId)) || (consultantId && !isUuid(consultantId))) {
          return Response.json({ error: "Filtro inválido." }, { status: 400 });
        }
        const params = [unit.id, period.start, period.end, attendanceId || null] as const;
        try {
          if (attendanceId) {
            const allowed = await queryDb(
              "select id from app_course_attendances where id = $1 and unit_id = $2",
              [attendanceId, unit.id],
            );
            if (!allowed.rowCount)
              return Response.json({ error: "Turma não pertence à unidade." }, { status: 403 });
          }

          const [
            summary,
            trend,
            attendances,
            sources,
            courses,
            cities,
            campaigns,
            consultants,
            preview,
          ] = await Promise.all([
            queryDb<SummaryRow>(
              `select count(*) filter (where ${leadPeriod})::text as leads,
                count(*) filter (where ${enrollmentPeriod})::text as enrollments,
                count(distinct l.attendance_id) filter (where ${leadPeriod})::text as active_attendances,
                count(*) filter (where ${leadPeriod} and l.attendance_id is null)::text as without_attendance,
                count(*) filter (where ${enrollmentPeriod} and l.converted_by is null)::text as without_converter
              from app_leads l where l.unit_id = $1 and ${attendanceFilter}`,
              params,
            ),
            queryDb<TrendRow>(
              `select bucket, sum(leads)::text as leads, sum(enrollments)::text as enrollments from (
                select ${bucket("l.created_at")} as bucket, count(*) as leads, 0::bigint as enrollments
                from app_leads l where l.unit_id = $1 and ${attendanceFilter} and ${leadPeriod} group by 1
                union all
                select ${bucket("l.converted_at")} as bucket, 0::bigint as leads, count(*) as enrollments
                from app_leads l where l.unit_id = $1 and ${attendanceFilter} and ${enrollmentPeriod} group by 1
              ) activity group by bucket order by bucket`,
              [...params, period.hourly],
            ),
            queryDb<AttendanceRow>(
              `select a.id, c.name as course, a.city, a.state, a.class_date::text, a.status,
                count(l.id) filter (where ${leadPeriod})::text as leads,
                count(l.id) filter (where ${enrollmentPeriod})::text as enrollments
              from app_course_attendances a
              join app_courses c on c.id = a.course_id and c.unit_id = a.unit_id
              left join app_leads l on l.attendance_id = a.id and l.unit_id = a.unit_id
                and (${leadPeriod} or ${enrollmentPeriod})
              where a.unit_id = $1 and ($4::uuid is null or a.id = $4)
              group by a.id, c.name, a.city, a.state, a.class_date, a.status
              order by count(l.id) filter (where ${leadPeriod}) desc,
                count(l.id) filter (where ${enrollmentPeriod}) desc, a.class_date desc`,
              params,
            ),
            queryDb<GroupRow>(
              `select coalesce(nullif(btrim(l.acquisition_channel_name_snapshot), ''), ch.name, 'Sem origem') as name,
                count(*)::text as leads from app_leads l
              left join app_acquisition_channels ch on ch.id = l.acquisition_channel_id and ch.unit_id = l.unit_id
              where l.unit_id = $1 and ${attendanceFilter} and ${leadPeriod}
              group by 1 order by count(*) desc, name`,
              params,
            ),
            queryDb<GroupRow>(
              `select coalesce(nullif(btrim(l.course_name_snapshot), ''), c.name, 'Sem curso') as name,
                count(*)::text as leads from app_leads l
              left join app_courses c on c.id = l.course_id and c.unit_id = l.unit_id
              where l.unit_id = $1 and ${attendanceFilter} and ${leadPeriod}
              group by 1 order by count(*) desc, name`,
              params,
            ),
            queryDb<GroupRow>(
              `select coalesce(nullif(btrim(l.city), ''), 'Cidade não informada') as name,
                count(*)::text as leads from app_leads l
              where l.unit_id = $1 and ${attendanceFilter} and ${leadPeriod}
              group by 1 order by count(*) desc, name`,
              params,
            ),
            queryDb<GroupRow>(
              `select coalesce(nullif(btrim(evt.campaign_name), ''), 'Campanha sem nome') as name,
                count(*)::text as leads from app_leads l
              join lateral (
                select e.campaign_name from app_meta_lead_events e
                where e.lead_id = l.id order by e.received_at desc, e.id desc limit 1
              ) evt on true
              where l.unit_id = $1 and ${attendanceFilter} and ${leadPeriod}
              group by 1 order by count(*) desc, name`,
              params,
            ),
            queryDb<ConsultantRow>(
              `select u.id, u.name, u.status,
                 count(l.id) filter (where l.stage <> 'Matriculado')::text as portfolio,
                 count(l.id) filter (where ${leadPeriod})::text as received,
                 (select count(*) from app_leads m
                    where m.unit_id = $1 and ($4::uuid is null or m.attendance_id = $4)
                      and m.converted_by = u.id and m.stage = 'Matriculado'
                      and m.converted_at >= ($2::date::timestamp at time zone 'America/Sao_Paulo')
                      and m.converted_at < (($3::date + 1)::timestamp at time zone 'America/Sao_Paulo')
                 )::text as enrollments
              from app_users u
              join app_user_units uu on uu.user_id = u.id and uu.unit_id = $1
              left join app_leads l on l.unit_id = $1 and l.created_by = u.id and ${attendanceFilter}
              where u.role = 'CONSULTOR'
              group by u.id, u.name, u.status order by u.name`,
              params,
            ),
            queryDb<LeadRow>(
              `select l.id, l.full_name as name, l.created_at::text as created_at, l.stage,
                case when a.id is null then null else concat(c.name, ' · ', a.city, '/', a.state) end as attendance,
                owner.name as owner
              from app_leads l
              left join app_course_attendances a on a.id = l.attendance_id and a.unit_id = l.unit_id
              left join app_courses c on c.id = a.course_id and c.unit_id = l.unit_id
              left join app_users owner on owner.id = l.created_by
              where l.unit_id = $1 and ${attendanceFilter} and ${leadPeriod}
              order by l.created_at desc, l.id desc limit 40`,
              params,
            ),
          ]);

          const consultantList = consultants.rows
            .map((row) => ({
              id: row.id,
              name: row.name,
              status: row.status,
              portfolio: n(row.portfolio),
              received: n(row.received),
              enrollments: n(row.enrollments),
            }))
            .sort(
              (a, b) =>
                b.enrollments - a.enrollments ||
                b.received - a.received ||
                a.name.localeCompare(b.name, "pt-BR"),
            );
          if (consultantId && !consultantList.some((item) => item.id === consultantId)) {
            return Response.json({ error: "Consultor não pertence à unidade." }, { status: 403 });
          }

          let consultantDetail: {
            trend: Array<{ bucket: string; leads: number; enrollments: number }>;
            attendances: Array<{ id: string; name: string; leads: number; enrollments: number }>;
          } | null = null;
          if (consultantId) {
            const [history, classes] = await Promise.all([
              queryDb<TrendRow>(
                `select bucket, sum(leads)::text as leads, sum(enrollments)::text as enrollments from (
                  select ${bucket("l.created_at")} as bucket, count(*) as leads, 0::bigint as enrollments
                  from app_leads l
                  where l.unit_id = $1 and ${attendanceFilter} and ${leadPeriod} and l.created_by = $6 group by 1
                  union all
                  select ${bucket("l.converted_at")} as bucket, 0::bigint as leads, count(*) as enrollments
                  from app_leads l
                  where l.unit_id = $1 and ${attendanceFilter} and ${enrollmentPeriod} and l.converted_by = $6 group by 1
                ) activity group by bucket order by bucket`,
                [...params, period.hourly, consultantId],
              ),
              queryDb<DetailAttendanceRow>(
                `select a.id,
                    concat(c.name, ' · ', a.city, '/', a.state, ' · ', to_char(a.class_date, 'DD/MM/YYYY')) as name,
                    count(l.id) filter (where ${leadPeriod} and l.created_by = $5)::text as leads,
                    count(l.id) filter (where ${enrollmentPeriod} and l.converted_by = $5)::text as enrollments
                  from app_course_attendances a
                  join app_courses c on c.id = a.course_id and c.unit_id = a.unit_id
                  left join app_leads l on l.unit_id = a.unit_id and l.attendance_id = a.id
                    and (${leadPeriod} or ${enrollmentPeriod})
                  where a.unit_id = $1 and ($4::uuid is null or a.id = $4)
                  group by a.id, c.name, a.city, a.state, a.class_date
                  having count(l.id) filter (where ${leadPeriod} and l.created_by = $5) > 0
                    or count(l.id) filter (where ${enrollmentPeriod} and l.converted_by = $5) > 0
                  order by count(l.id) filter (where ${leadPeriod} and l.created_by = $5) desc`,
                [...params, consultantId],
              ),
            ]);
            consultantDetail = {
              trend: history.rows.map((row) => ({
                bucket: row.bucket,
                leads: n(row.leads),
                enrollments: n(row.enrollments),
              })),
              attendances: classes.rows.map((row) => ({
                id: row.id,
                name: row.name,
                leads: n(row.leads),
                enrollments: n(row.enrollments),
              })),
            };
          }
          const result = summary.rows[0];
          return Response.json(
            {
              unit: { id: unit.id, name: unit.name },
              period,
              metrics: {
                leadsReceived: n(result?.leads),
                enrollments: n(result?.enrollments),
                attendancesWithLeads: n(result?.active_attendances),
                withoutAttendance: n(result?.without_attendance),
                enrollmentsWithoutConverter: n(result?.without_converter),
              },
              trend: trend.rows.map((row) => ({
                bucket: row.bucket,
                leads: n(row.leads),
                enrollments: n(row.enrollments),
              })),
              attendances: attendances.rows.map((row) => ({
                id: row.id,
                course: row.course,
                city: row.city,
                state: row.state,
                classDate: row.class_date,
                status: row.status,
                leads: n(row.leads),
                enrollments: n(row.enrollments),
              })),
              sources: sources.rows.map((row) => ({ name: row.name, leads: n(row.leads) })),
              courses: courses.rows.map((row) => ({ name: row.name, leads: n(row.leads) })),
              cities: cities.rows.map((row) => ({ name: row.name, leads: n(row.leads) })),
              campaigns: campaigns.rows.map((row) => ({ name: row.name, leads: n(row.leads) })),
              consultants: consultantList,
              consultantDetail,
              preview: preview.rows.map((row) => ({
                id: row.id,
                name: row.name,
                createdAt: row.created_at,
                stage: row.stage,
                attendance: row.attendance,
                owner: row.owner,
              })),
              updatedAt: new Date().toISOString(),
            },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (error) {
          console.error("[bi/reports] Erro na consulta:", error);
          return Response.json({ error: "Falha ao consultar os relatórios." }, { status: 500 });
        }
      },
    },
  },
});
