import type { QueryResultRow } from "pg";
import { isUuid } from "@/lib/server/commercial-schema";
import { queryDb, withTransaction } from "@/lib/server/db";
import { ensureMetaLeadSchema } from "@/lib/server/meta-leads";

type ConnectionRow = QueryResultRow & {
  form_id: string;
  form_name: string | null;
  page_id: string | null;
  turma_id: string | null;
  unit_id: string | null;
  unit_name: string | null;
  course_name: string | null;
  city: string | null;
  state: string | null;
  class_date: string | null;
  connection_active: boolean | null;
  turma_status: "active" | "inactive" | null;
};

type AttendanceRow = QueryResultRow & {
  id: string;
  unit_id: string;
  unit_name: string;
  course_name: string;
  city: string;
  state: string;
  class_date: string;
};

function attendanceName(row: {
  course_name: string | null;
  city: string | null;
  state: string | null;
  class_date: string | null;
}) {
  if (!row.course_name || !row.city || !row.state || !row.class_date) return null;
  const [year, month, day] = row.class_date.slice(0, 10).split("-");
  return `${row.course_name} · ${row.city}/${row.state} · ${day}/${month}/${year}`;
}

export async function listMakeMetaConnections(unitIds: Array<string>) {
  await ensureMetaLeadSchema();
  if (!unitIds.length || unitIds.some((id) => !isUuid(id))) {
    return { forms: [], attendances: [] };
  }

  const [formsResult, attendancesResult] = await Promise.all([
    queryDb<ConnectionRow>(
      `
        with received as (
          select distinct on (event.form_id)
            event.form_id,
            coalesce(nullif(event.form_name, ''), nullif(event.payload->>'form_name', '')) as form_name,
            event.page_id,
            event.received_at
          from app_meta_lead_events event
          where event.payload->>'source' = 'make_meta_bridge'
          order by event.form_id, event.received_at desc
        ), catalog as (
          select form_id from received
          union
          select form_id from app_make_meta_form_connections
        )
        select
          catalog.form_id,
          coalesce(received.form_name, meta_form.form_name) as form_name,
          coalesce(received.page_id, meta_page.page_id) as page_id,
          connection.turma_id,
          attendance.unit_id,
          unit.name as unit_name,
          course.name as course_name,
          attendance.city,
          attendance.state,
          attendance.class_date::text,
          connection.active as connection_active,
          attendance.status as turma_status
        from catalog
        left join received on received.form_id = catalog.form_id
        left join app_make_meta_form_connections connection
          on connection.form_id = catalog.form_id
        left join app_course_attendances attendance on attendance.id = connection.turma_id
        left join app_units unit on unit.id = attendance.unit_id
        left join app_courses course on course.id = attendance.course_id
        left join lateral (
          select form.id, form.form_name, form.page_id
          from app_meta_forms form
          where form.meta_form_id = catalog.form_id
          order by form.updated_at desc
          limit 1
        ) meta_form on true
        left join app_meta_pages meta_page on meta_page.id = meta_form.page_id
        left join app_meta_pages received_page on received_page.page_id = received.page_id
        where
          (connection.turma_id is not null and attendance.unit_id = any($1::uuid[]))
          or (
            connection.turma_id is null
            and (
              coalesce(received_page.unit_id, meta_page.unit_id) = any($1::uuid[])
              or coalesce(received_page.unit_id, meta_page.unit_id) is null
            )
          )
        order by
          (connection.active = true and attendance.status = 'active') asc,
          coalesce(received.form_name, meta_form.form_name, catalog.form_id)
      `,
      [unitIds],
    ),
    queryDb<AttendanceRow>(
      `
        select
          attendance.id,
          attendance.unit_id,
          unit.name as unit_name,
          course.name as course_name,
          attendance.city,
          attendance.state,
          attendance.class_date::text
        from app_course_attendances attendance
        inner join app_units unit on unit.id = attendance.unit_id
        inner join app_courses course on course.id = attendance.course_id
        where attendance.unit_id = any($1::uuid[])
          and attendance.status = 'active'
        order by unit.name, attendance.class_date, course.name, attendance.city
      `,
      [unitIds],
    ),
  ]);

  return {
    forms: formsResult.rows.map((row) => ({
      formId: row.form_id,
      formName: row.form_name,
      pageId: row.page_id,
      turmaId: row.turma_id,
      turmaName: attendanceName(row),
      unitId: row.unit_id,
      unitName: row.unit_name,
      status:
        row.connection_active && row.turma_status === "active"
          ? ("connected" as const)
          : ("pending_configuration" as const),
    })),
    attendances: attendancesResult.rows.map((row) => ({
      id: row.id,
      unitId: row.unit_id,
      unitName: row.unit_name,
      name: attendanceName(row) ?? row.course_name,
    })),
  };
}

export async function saveMakeMetaConnection(
  formId: string,
  turmaId: string,
  allowedUnitIds: Array<string>,
) {
  await ensureMetaLeadSchema();
  const normalizedFormId = formId.trim();
  if (!normalizedFormId || !isUuid(turmaId) || !allowedUnitIds.length) {
    throw new Error("Formulário ou turma inválida.");
  }

  await withTransaction(async (client) => {
    const attendance = await client.query<{ unit_id: string }>(
      `
        select unit_id
        from app_course_attendances
        where id = $1
          and status = 'active'
          and unit_id = any($2::uuid[])
        limit 1
        for update
      `,
      [turmaId, allowedUnitIds],
    );
    if (!attendance.rowCount) throw new Error("Turma indisponível ou sem acesso.");

    const knownForm = await client.query(
      `
        select 1
        from app_meta_lead_events
        where form_id = $1 and payload->>'source' = 'make_meta_bridge'
        union all
        select 1 from app_meta_forms where meta_form_id = $1
        limit 1
      `,
      [normalizedFormId],
    );
    if (!knownForm.rowCount) throw new Error("Formulário ainda não foi recebido ou sincronizado.");

    const existing = await client.query<{ unit_id: string }>(
      `
        select attendance.unit_id
        from app_make_meta_form_connections connection
        inner join app_course_attendances attendance on attendance.id = connection.turma_id
        where connection.form_id = $1
        limit 1
        for update of connection
      `,
      [normalizedFormId],
    );
    if (existing.rows[0] && !allowedUnitIds.includes(existing.rows[0].unit_id)) {
      throw new Error("A conexão existente pertence a uma unidade sem acesso.");
    }

    await client.query(
      `
        insert into app_make_meta_form_connections (form_id, turma_id, active)
        values ($1, $2, true)
        on conflict (form_id) do update
        set turma_id = excluded.turma_id,
            active = true,
            updated_at = now()
      `,
      [normalizedFormId, turmaId],
    );
  });

  return { saved: true };
}
