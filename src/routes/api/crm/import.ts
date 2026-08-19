import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { isDevRole } from "@/lib/auth-types";
import {
  ensureCommercialSchema,
  getUnitFromBody,
  getUnitFromRequest,
  isUuid,
} from "@/lib/server/commercial-schema";
import { getSessionFromRequest } from "@/lib/server/auth";
import { ensureCourseAttendanceSchema } from "@/lib/server/course-attendances";
import { ensureRuntimeSchema, queryDb, withTransaction } from "@/lib/server/db";

type CourseRow = QueryResultRow & {
  id: string;
  name: string;
  value: string;
  cities: Array<string>;
};
type AttendanceRow = QueryResultRow & {
  id: string;
  courseId: string;
  city: string;
  state: string;
  classDate: string;
  displayName: string;
  consultantIds: Array<string>;
  consultantNames: Array<string>;
};
type ImportRow = {
  fullName: string;
  phone: string;
  phone2: string;
  campaignName: string;
  formId: string;
  observations: string;
};

const MAX_IMPORT_ROWS = 2_000;

async function ensureLeadImportSchema() {
  await ensureRuntimeSchema(
    "lead-import",
    `
    create table if not exists app_lead_import_rows (
      id uuid primary key default gen_random_uuid(),
      lead_id uuid not null unique references app_leads(id) on delete cascade,
      campaign_name text,
      form_id text,
      whatsapp_number text,
      imported_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create index if not exists app_lead_import_rows_campaign_idx on app_lead_import_rows (campaign_name);
  `,
  );
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function parseRows(value: unknown): Array<ImportRow> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_IMPORT_ROWS).map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      fullName: clean(row.fullName, 250),
      phone: clean(row.phone, 80),
      phone2: clean(row.phone2, 80),
      campaignName: clean(row.campaignName, 500),
      formId: clean(row.formId, 200),
      observations: clean(row.observations, 2_000),
    };
  });
}

async function listCourses(unitId: string) {
  const result = await queryDb<CourseRow>(
    `
    select
      c.id,
      c.name,
      c.value::text,
      coalesce(array_agg(distinct a.city order by a.city) filter (where a.status = 'active'), '{}') as cities
    from app_courses c
    left join app_course_attendances a on a.course_id = c.id and a.unit_id = c.unit_id
    where c.unit_id = $1 and c.status = 'active'
    group by c.id, c.name, c.value
    order by c.name
  `,
    [unitId],
  );
  return result.rows;
}

async function listAttendances(unitId: string) {
  const result = await queryDb<{
    id: string;
    course_id: string;
    city: string;
    state: string;
    class_date: string;
    display_name: string;
    consultant_ids: Array<string>;
    consultant_names: Array<string>;
  }>(
    `
    select a.id, a.course_id, a.city, a.state, a.class_date::text,
      concat(c.name, ' · ', a.city, '/', a.state, ' · ', to_char(a.class_date, 'DD/MM/YYYY')) as display_name,
      array(
        select consultant.id::text
        from app_course_attendance_consultants attendance_consultant
        inner join app_users consultant on consultant.id = attendance_consultant.user_id
        where attendance_consultant.attendance_id = a.id
          and consultant.role = 'CONSULTOR'
          and consultant.status = 'active'
        order by consultant.name
      ) as consultant_ids,
      array(
        select consultant.name
        from app_course_attendance_consultants attendance_consultant
        inner join app_users consultant on consultant.id = attendance_consultant.user_id
        where attendance_consultant.attendance_id = a.id
          and consultant.role = 'CONSULTOR'
          and consultant.status = 'active'
        order by consultant.name
      ) as consultant_names
    from app_course_attendances a
    inner join app_courses c on c.id = a.course_id
    where a.unit_id = $1 and a.status = 'active' and c.status = 'active'
    order by a.class_date, c.name, a.city
  `,
    [unitId],
  );
  return result.rows.map(
    (row): AttendanceRow => ({
      id: row.id,
      courseId: row.course_id,
      city: row.city,
      state: row.state,
      classDate: row.class_date,
      displayName: row.display_name,
      consultantIds: row.consultant_ids,
      consultantNames: row.consultant_names,
    }),
  );
}

export const Route = createFileRoute("/api/crm/import")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!isDevRole(session.user.role))
          return Response.json({ error: "Acesso exclusivo para DEV." }, { status: 403 });
        const unit = getUnitFromRequest(session, request);
        if (!unit) return Response.json({ error: "Unidade indisponível." }, { status: 403 });
        await ensureCommercialSchema();
        await ensureCourseAttendanceSchema();
        await ensureLeadImportSchema();
        const [courses, attendances] = await Promise.all([
          listCourses(unit.id),
          listAttendances(unit.id),
        ]);
        return Response.json(
          { courses, attendances },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!isDevRole(session.user.role))
          return Response.json({ error: "Acesso exclusivo para DEV." }, { status: 403 });

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const unit = getUnitFromBody(session, body?.unitId);
        if (!unit) return Response.json({ error: "Unidade indisponível." }, { status: 403 });
        const rows = parseRows(body?.rows);
        const skipDuplicates = body?.skipDuplicates !== false;
        const courseId = typeof body?.courseId === "string" ? body.courseId.trim() : "";
        const attendanceId = typeof body?.attendanceId === "string" ? body.attendanceId.trim() : "";

        if (!rows.length)
          return Response.json({ error: "Nenhuma linha para importar." }, { status: 400 });
        if (!isUuid(courseId))
          return Response.json({ error: "Selecione um curso válido." }, { status: 400 });
        if (!isUuid(attendanceId))
          return Response.json({ error: "Selecione uma turma válida." }, { status: 400 });
        const invalidRows = rows.filter((row) => !row.fullName || !normalizePhone(row.phone));
        if (invalidRows.length)
          return Response.json(
            { error: `${invalidRows.length} linha(s) sem nome ou telefone válido.` },
            { status: 400 },
          );

        await ensureCommercialSchema();
        await ensureCourseAttendanceSchema();
        await ensureLeadImportSchema();
        const courseResult = await queryDb<{
          id: string;
          name: string;
          value: string;
          city: string;
          state: string;
          consultant_ids: Array<string>;
          consultant_names: Array<string>;
        }>(
          `
          select c.id, c.name, c.value::text, a.city, a.state,
            array(
              select consultant.id::text
              from app_course_attendance_consultants attendance_consultant
              inner join app_users consultant on consultant.id = attendance_consultant.user_id
              where attendance_consultant.attendance_id = a.id
                and consultant.role = 'CONSULTOR'
                and consultant.status = 'active'
              order by consultant.name
            ) as consultant_ids,
            array(
              select consultant.name
              from app_course_attendance_consultants attendance_consultant
              inner join app_users consultant on consultant.id = attendance_consultant.user_id
              where attendance_consultant.attendance_id = a.id
                and consultant.role = 'CONSULTOR'
                and consultant.status = 'active'
              order by consultant.name
            ) as consultant_names
          from app_course_attendances a
          inner join app_courses c on c.id = a.course_id
          where a.id = $1 and a.course_id = $2 and a.unit_id = $3
            and a.status = 'active' and c.status = 'active'
          limit 1
        `,
          [attendanceId, courseId, unit.id],
        );
        const course = courseResult.rows[0];
        if (!course)
          return Response.json(
            { error: "A turma não pertence ao curso ou à unidade selecionada." },
            { status: 400 },
          );
        if (!course.consultant_ids.length)
          return Response.json(
            { error: "Selecione ao menos um consultor ativo no cadastro desta turma." },
            { status: 400 },
          );
        const city = `${course.city} - ${course.state}`;

        const result = await withTransaction(async (client) => {
          let imported = 0;
          let duplicates = 0;
          let updated = 0;
          for (const row of rows) {
            const phone = normalizePhone(row.phone);
            const phone2 = normalizePhone(row.phone2);
            if (skipDuplicates) {
              const existing = await client.query<{ id: string; imported: boolean }>(
                `
                select l.id, (i.lead_id is not null) as imported
                from app_leads l
                left join app_lead_import_rows i on i.lead_id = l.id
                where l.unit_id = $1 and (regexp_replace(l.phone, '\\D', '', 'g') = $2 or regexp_replace(coalesce(l.phone2, ''), '\\D', '', 'g') = $2)
                limit 1
              `,
                [unit.id, phone],
              );
              if (existing.rowCount) {
                if (existing.rows[0].imported) {
                  await client.query(
                    `
                    update app_leads
                    set city = $2,
                        attendance_id = $3,
                        course_id = $4,
                        course_name_snapshot = $5,
                        course_value_snapshot = $6,
                        shared_queue = case when stage = 'Novo lead' then true else shared_queue end,
                        created_by = case when stage = 'Novo lead' then null else created_by end,
                        updated_at = now()
                    where id = $1
                  `,
                    [
                      existing.rows[0].id,
                      city,
                      attendanceId,
                      course.id,
                      course.name,
                      Number(course.value),
                    ],
                  );
                  updated += 1;
                } else {
                  duplicates += 1;
                }
                continue;
              }
            }
            const lead = await client.query<{ id: string }>(
              `
              insert into app_leads (
                unit_id, full_name, phone, phone2, city, attendance_id, course_id, course_name_snapshot,
                course_value_snapshot, observations, stage, shared_queue, created_by
              )
              values ($1, $2, $3, nullif($4, ''), $5, $6, $7, $8, $9, nullif($10, ''), 'Novo lead', true, null)
              returning id
            `,
              [
                unit.id,
                row.fullName,
                phone,
                phone2,
                city,
                attendanceId,
                course.id,
                course.name,
                Number(course.value),
                row.observations,
              ],
            );
            await client.query(
              `
              insert into app_lead_import_rows (lead_id, campaign_name, form_id, whatsapp_number, imported_by)
              values ($1, nullif($2, ''), nullif($3, ''), nullif($4, ''), $5)
            `,
              [lead.rows[0].id, row.campaignName, row.formId, phone2, session.user.id],
            );
            imported += 1;
          }
          return {
            imported,
            updated,
            duplicates,
            sharedConsultants: course.consultant_names,
          };
        });
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
