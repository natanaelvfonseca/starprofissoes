import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import type { LeadRecord, LeadStage, PipelineColumn, PipelineType } from "@/lib/commercial-types";
import {
  ensureCommercialSchema,
  ensureDefaultPipelineColumns,
  getUnitFromBody,
  getUnitFromRequest,
  isUuid,
} from "@/lib/server/commercial-schema";
import { canOperateCrm, canViewAllUnitLeads, canViewStudents } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  ensureCourseAttendanceSchema,
  normalizeRoutingText,
} from "@/lib/server/course-attendances";
import { queryDb } from "@/lib/server/db";
import { reconcileEvolutionLabelsForUser } from "@/lib/server/evolution-label-automation";

type LeadRow = QueryResultRow & {
  id: string;
  unit_id: string;
  unit_name: string;
  full_name: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  city: string | null;
  attendance_id: string | null;
  attendance_name: string | null;
  attendance_status: "active" | "inactive" | null;
  course_id: string | null;
  course_name_snapshot: string | null;
  course_value_snapshot: string | null;
  acquisition_channel_id: string | null;
  acquisition_channel_name_snapshot: string | null;
  created_by: string | null;
  created_by_name: string | null;
  shared_queue: boolean;
  observations: string | null;
  campaign_name: string | null;
  form_id: string | null;
  stage: LeadStage;
  pipeline_column_id: string | null;
  student_pipeline_column_id: string | null;
  created_at: string;
};

type PipelineColumnRow = QueryResultRow & {
  id: string;
  unit_id: string;
  pipeline_type: PipelineType;
  name: string;
  color: string;
  position: number;
  system_key: string | null;
  semantic_stage: LeadStage | null;
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

type AttendanceCityRow = QueryResultRow & {
  city: string;
};

type AttendanceSnapshotRow = QueryResultRow & {
  id: string;
  unit_id: string;
  course_id: string;
  course_name: string;
  course_value: string;
  city: string;
  state: string;
  has_consultants: boolean;
};

type MetaLeadCampaignRow = QueryResultRow & {
  id: string;
  city: string | null;
  campaign_name: string;
};

type AttendanceMatchRow = QueryResultRow & {
  course_name: string;
  city: string;
  state: string;
};

function mapLead(row: LeadRow, exposeAcquisitionChannel: boolean): LeadRecord {
  return {
    id: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    fullName: row.full_name,
    phone: row.phone,
    phone2: row.phone2,
    email: row.email,
    city: row.city,
    attendanceId: row.attendance_id,
    attendanceName: row.attendance_name,
    attendanceStatus: row.attendance_status,
    courseId: row.course_id,
    courseName: row.course_name_snapshot,
    courseValue: row.course_value_snapshot ? Number(row.course_value_snapshot) : null,
    acquisitionChannelId: exposeAcquisitionChannel ? row.acquisition_channel_id : null,
    acquisitionChannelName: exposeAcquisitionChannel ? row.acquisition_channel_name_snapshot : null,
    createdById: row.created_by,
    createdByName: row.created_by_name,
    sharedQueue: row.shared_queue,
    observations: row.observations,
    campaignName: row.campaign_name,
    formId: row.form_id,
    stage: row.stage,
    pipelineColumnId: row.pipeline_column_id ?? null,
    studentPipelineColumnId: row.student_pipeline_column_id ?? null,
    createdAt: row.created_at,
  };
}

function mapPipelineColumn(row: PipelineColumnRow): PipelineColumn {
  return {
    id: row.id,
    unitId: row.unit_id,
    pipelineType: row.pipeline_type,
    name: row.name,
    color: row.color,
    position: Number(row.position),
    systemKey: row.system_key,
    semanticStage: row.semantic_stage,
  };
}

function parseLeadPayload(body: unknown) {
  const data = body as {
    fullName?: unknown;
    phone?: unknown;
    phone2?: unknown;
    email?: unknown;
    city?: unknown;
    attendanceId?: unknown;
    courseId?: unknown;
    acquisitionChannelId?: unknown;
    unitId?: unknown;
    observations?: unknown;
  };

  return {
    fullName: typeof data?.fullName === "string" ? data.fullName.trim() : "",
    phone: typeof data?.phone === "string" ? data.phone.trim() : "",
    phone2: typeof data?.phone2 === "string" ? data.phone2.trim() : "",
    email: typeof data?.email === "string" ? data.email.trim() : "",
    city: typeof data?.city === "string" ? data.city.trim() : "",
    attendanceId: typeof data?.attendanceId === "string" ? data.attendanceId.trim() : "",
    courseId: typeof data?.courseId === "string" ? data.courseId.trim() : "",
    acquisitionChannelId:
      typeof data?.acquisitionChannelId === "string" ? data.acquisitionChannelId.trim() : "",
    unitId: data?.unitId,
    observations: typeof data?.observations === "string" ? data.observations.trim() : "",
  };
}

function getLeadListView(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("view") === "students" ? "students" : "pipeline";
}

async function getCourseSnapshot(courseId: string, unitId: string) {
  if (!courseId) {
    return { course: null };
  }

  if (!isUuid(courseId)) {
    return { error: "Curso inválido.", status: 400 };
  }

  const result = await queryDb<CourseSnapshotRow>(
    `
      select id, name, value::text
      from app_courses
      where id = $1 and unit_id = $2
      limit 1
    `,
    [courseId, unitId],
  );

  const course = result.rows[0];

  if (!course) {
    return { error: "Curso não encontrado.", status: 404 };
  }

  return { course };
}

async function getChannelSnapshot(channelId: string, unitId: string) {
  if (!channelId) {
    return { channel: null };
  }

  if (!isUuid(channelId)) {
    return { error: "Canal inválido.", status: 400 };
  }

  const result = await queryDb<ChannelSnapshotRow>(
    `
      select id, name
      from app_acquisition_channels
      where id = $1 and unit_id = $2
      limit 1
    `,
    [channelId, unitId],
  );

  const channel = result.rows[0];

  if (!channel) {
    return { error: "Canal não encontrado.", status: 404 };
  }

  return { channel };
}

async function getCourseCity(courseId: string, unitId: string) {
  if (!courseId || !isUuid(courseId)) {
    return null;
  }

  const result = await queryDb<AttendanceCityRow>(
    `
      select city
      from app_course_attendances
      where unit_id = $1
        and course_id = $2
        and status = 'active'
        and not exists (
          select 1
          from app_course_attendances other
          where other.unit_id = app_course_attendances.unit_id
            and other.course_id = app_course_attendances.course_id
            and other.status = 'active'
            and other.id <> app_course_attendances.id
        )
      order by created_at asc
      limit 1
    `,
    [unitId, courseId],
  );

  return result.rows[0]?.city ?? null;
}

function campaignMatchesAttendance(campaignName: string, attendance: AttendanceMatchRow) {
  const normalizedCampaign = ` ${normalizeRoutingText(campaignName)} `;
  const normalizedCourse = ` ${normalizeRoutingText(attendance.course_name)} `;
  const normalizedCity = ` ${normalizeRoutingText(attendance.city)} `;
  const normalizedState = ` ${normalizeRoutingText(attendance.state)} `;

  return (
    normalizedCampaign.includes(normalizedCourse) &&
    normalizedCampaign.includes(normalizedCity) &&
    normalizedCampaign.includes(normalizedState)
  );
}

async function fillMetaLeadCitiesFromCampaigns(unitId: string) {
  const [leadsResult, attendancesResult] = await Promise.all([
    queryDb<MetaLeadCampaignRow>(
      `
        select
          l.id,
          l.city,
          e.campaign_name
        from app_leads l
        inner join app_meta_lead_events e on e.lead_id = l.id
        where l.unit_id = $1
          and e.campaign_name is not null
      `,
      [unitId],
    ),
    queryDb<AttendanceMatchRow>(
      `
        select
          c.name as course_name,
          a.city,
          a.state
        from app_course_attendances a
        inner join app_courses c on c.id = a.course_id
        where a.status = 'active'
          and c.status = 'active'
      `,
    ),
  ]);

  for (const lead of leadsResult.rows) {
    const matches = attendancesResult.rows.filter((attendance) =>
      campaignMatchesAttendance(lead.campaign_name, attendance),
    );
    const matchedCity = matches.length === 1 ? matches[0].city : null;

    if (matchedCity && matchedCity !== lead.city) {
      await queryDb(
        `
          update app_leads
          set city = $2,
              updated_at = now()
          where id = $1
        `,
        [lead.id, matchedCity],
      );
    }
  }
}

async function fillLeadCitiesFromAttendances(unitId: string) {
  await queryDb(
    `
      update app_leads l
      set
        city = (
          select a.city
        from app_course_attendances a
        where a.unit_id = l.unit_id
          and a.course_id = l.course_id
          and a.status = 'active'
          and not exists (
            select 1
            from app_course_attendances other
            where other.unit_id = a.unit_id
              and other.course_id = a.course_id
              and other.status = 'active'
              and other.id <> a.id
          )
        order by a.created_at asc
        limit 1
        ),
        updated_at = now()
      where l.unit_id = $1
        and nullif(l.city, '') is null
        and exists (
          select 1
          from app_course_attendances a
          where a.unit_id = l.unit_id
            and a.course_id = l.course_id
            and a.status = 'active'
            and not exists (
              select 1
              from app_course_attendances other
              where other.unit_id = a.unit_id
                and other.course_id = a.course_id
                and other.status = 'active'
                and other.id <> a.id
            )
        )
    `,
    [unitId],
  );
}

export const Route = createFileRoute("/api/crm/leads")({
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

        await ensureDefaultPipelineColumns(unit.id);
        await ensureCourseAttendanceSchema();

        const listView = getLeadListView(request);
        if (listView === "students" && !canViewStudents(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        if (listView === "pipeline" && session.user.role === "CONSULTOR") {
          await reconcileEvolutionLabelsForUser(session.user.id, unit.id, request.url).catch(
            (error) => {
              console.error("[Evolution labels] Falha ao reconciliar etiquetas", {
                userId: session.user.id,
                unitId: unit.id,
                error: error instanceof Error ? error.message : String(error),
              });
              return null;
            },
          );
        }

        const canManageUnitLeads = canViewAllUnitLeads(session.user.role);
        const exposeAcquisitionChannel = session.user.role !== "CONSULTOR";
        const [result, columnsResult] = await Promise.all([
          queryDb<LeadRow>(
            `
            select
              l.id,
              l.unit_id,
              un.name as unit_name,
              l.full_name,
              l.phone,
              l.phone2,
              l.email,
              l.city,
              l.attendance_id,
              case when attendance.id is not null then
                concat(attendance_course.name, ' · ', attendance.city, '/', attendance.state, ' · ', to_char(attendance.class_date, 'DD/MM/YYYY'))
              end as attendance_name,
              attendance.status as attendance_status,
              l.course_id,
              l.course_name_snapshot,
              l.course_value_snapshot::text,
              l.acquisition_channel_id,
              l.acquisition_channel_name_snapshot,
              l.created_by,
              owner.name as created_by_name,
              l.shared_queue,
              l.observations,
              coalesce(import_info.campaign_name, meta_info.campaign_name) as campaign_name,
              coalesce(import_info.form_id, meta_info.form_id) as form_id,
              l.stage,
              l.pipeline_column_id,
              l.student_pipeline_column_id,
              l.created_at::text
            from app_leads l
            inner join app_units un on un.id = l.unit_id
            left join app_users owner on owner.id = l.created_by
            left join app_course_attendances attendance on attendance.id = l.attendance_id
            left join app_courses attendance_course on attendance_course.id = attendance.course_id
            left join app_lead_import_rows import_info on import_info.lead_id = l.id
            left join lateral (
              select e.campaign_name, e.form_id
              from app_meta_lead_events e
              where e.lead_id = l.id
              order by e.received_at desc
              limit 1
            ) meta_info on true
            where l.unit_id = $1
              and (
                $4::boolean
                or l.created_by = $2
                or (
                  $5::boolean
                  and l.shared_queue = true
                  and l.stage = 'Novo lead'
                  and exists (
                    select 1
                    from app_course_attendance_consultants attendance_consultant
                    where attendance_consultant.attendance_id = l.attendance_id
                      and attendance_consultant.user_id = $2
                  )
                )
              )
              and (
                ($3 = 'students' and l.stage = 'Matriculado')
                or ($3 = 'pipeline' and l.stage <> 'Matriculado')
              )
            order by l.created_at desc
          `,
            [
              unit.id,
              session.user.id,
              listView,
              canManageUnitLeads,
              session.user.role === "CONSULTOR",
            ],
          ),
          queryDb<PipelineColumnRow>(
            `
              select id, unit_id, pipeline_type, name, color, position, system_key, semantic_stage
              from app_pipeline_columns
              where unit_id = $1 and pipeline_type = $2
              order by position, created_at, name
            `,
            [unit.id, listView === "students" ? "students" : "leads"],
          ),
        ]);

        return Response.json(
          {
            leads: result.rows.map((row) => mapLead(row, exposeAcquisitionChannel)),
            pipelineColumns: columnsResult.rows.map(mapPipelineColumn),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!canOperateCrm(session.user.role)) {
          return Response.json(
            { ok: false, error: "Acesso somente para leitura." },
            { status: 403 },
          );
        }

        const body = await request.json().catch(() => null);
        const payload = parseLeadPayload(body);
        const unit = getUnitFromBody(session, payload.unitId);

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        if (!payload.fullName || !payload.phone) {
          return Response.json(
            { ok: false, error: "Nome completo e telefone são obrigatórios." },
            { status: 400 },
          );
        }

        await ensureCommercialSchema();
        await ensureCourseAttendanceSchema();

        if (!isUuid(payload.attendanceId)) {
          return Response.json({ ok: false, error: "Selecione uma turma ativa." }, { status: 400 });
        }

        const attendanceResult = await queryDb<AttendanceSnapshotRow>(
          `
            select a.id, a.unit_id, a.course_id, c.name as course_name, c.value::text as course_value,
              a.city, a.state,
              exists (
                select 1
                from app_course_attendance_consultants attendance_consultant
                inner join app_users consultant on consultant.id = attendance_consultant.user_id
                where attendance_consultant.attendance_id = a.id
                  and consultant.role = 'CONSULTOR'
                  and consultant.status = 'active'
              ) as has_consultants
            from app_course_attendances a
            inner join app_courses c on c.id = a.course_id
            where a.id = $1 and a.unit_id = $2 and a.status = 'active' and c.status = 'active'
            limit 1
          `,
          [payload.attendanceId, unit.id],
        );
        const attendance = attendanceResult.rows[0];
        if (!attendance) {
          return Response.json(
            { ok: false, error: "Turma inativa ou indisponível nesta unidade." },
            { status: 400 },
          );
        }
        if (!attendance.has_consultants) {
          return Response.json(
            { ok: false, error: "Selecione ao menos um consultor ativo no cadastro desta turma." },
            { status: 400 },
          );
        }

        const channelResult = await getChannelSnapshot(payload.acquisitionChannelId, unit.id);

        if (channelResult.error) {
          return Response.json(
            { ok: false, error: channelResult.error },
            { status: channelResult.status },
          );
        }

        const channel = channelResult.channel;
        const resolvedCity = `${attendance.city} - ${attendance.state}`;
        const result = await queryDb<LeadRow>(
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
              shared_queue,
              created_by
            )
            values ($1, $2, $3, $4, nullif($5, ''), nullif($6, ''), nullif($7, ''), $8, $9, $10, $11, $12, nullif($13, ''), true, $14)
            returning
              id,
              unit_id,
              (select name from app_units where id = $1) as unit_name,
              full_name,
              phone,
              phone2,
              email,
              city,
              attendance_id,
              (select concat(c.name, ' · ', a.city, '/', a.state, ' · ', to_char(a.class_date, 'DD/MM/YYYY'))
                from app_course_attendances a inner join app_courses c on c.id = a.course_id where a.id = attendance_id) as attendance_name,
              'active'::text as attendance_status,
              course_id,
              course_name_snapshot,
              course_value_snapshot::text,
              acquisition_channel_id,
              acquisition_channel_name_snapshot,
              created_by,
              null::text as created_by_name,
              shared_queue,
              observations,
              null::text as campaign_name,
              null::text as form_id,
              stage,
              created_at::text
          `,
          [
            unit.id,
            attendance.id,
            payload.fullName,
            payload.phone,
            payload.phone2,
            payload.email,
            resolvedCity,
            attendance.course_id,
            attendance.course_name,
            Number(attendance.course_value),
            channel?.id ?? null,
            channel?.name ?? null,
            payload.observations,
            session.user.id,
          ],
        );

        return Response.json(
          { lead: mapLead(result.rows[0], session.user.role !== "CONSULTOR") },
          { status: 201 },
        );
      },
    },
  },
});
