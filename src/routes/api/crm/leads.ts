import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import type { LeadRecord, LeadStage } from "@/lib/commercial-types";
import {
  ensureCommercialSchema,
  getUnitFromBody,
  getUnitFromRequest,
  isUuid,
} from "@/lib/server/commercial-schema";
import { canOperateCrm, canViewAllUnitLeads, canViewStudents } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { ensureCourseAttendanceSchema, normalizeRoutingText } from "@/lib/server/course-attendances";
import { queryDb } from "@/lib/server/db";

type LeadRow = QueryResultRow & {
  id: string;
  unit_id: string;
  unit_name: string;
  full_name: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  city: string | null;
  course_id: string | null;
  course_name_snapshot: string | null;
  course_value_snapshot: string | null;
  acquisition_channel_id: string | null;
  acquisition_channel_name_snapshot: string | null;
  created_by: string | null;
  created_by_name: string | null;
  observations: string | null;
  campaign_name: string | null;
  form_id: string | null;
  stage: LeadStage;
  created_at: string;
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
    courseId: row.course_id,
    courseName: row.course_name_snapshot,
    courseValue: row.course_value_snapshot ? Number(row.course_value_snapshot) : null,
    acquisitionChannelId: exposeAcquisitionChannel ? row.acquisition_channel_id : null,
    acquisitionChannelName: exposeAcquisitionChannel ? row.acquisition_channel_name_snapshot : null,
    createdById: row.created_by,
    createdByName: row.created_by_name,
    observations: row.observations,
    campaignName: row.campaign_name,
    formId: row.form_id,
    stage: row.stage,
    createdAt: row.created_at,
  };
}

function parseLeadPayload(body: unknown) {
  const data = body as {
    fullName?: unknown;
    phone?: unknown;
    phone2?: unknown;
    email?: unknown;
    city?: unknown;
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

        await ensureCommercialSchema();
        await ensureCourseAttendanceSchema();
        await fillMetaLeadCitiesFromCampaigns(unit.id);
        await fillLeadCitiesFromAttendances(unit.id);

        const listView = getLeadListView(request);
        if (listView === "students" && !canViewStudents(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const canManageUnitLeads = canViewAllUnitLeads(session.user.role);
        const exposeAcquisitionChannel = session.user.role !== "CONSULTOR";
        const result = await queryDb<LeadRow>(
          `
            select
              l.id,
              l.unit_id,
              un.name as unit_name,
              l.full_name,
              l.phone,
              l.phone2,
              l.email,
              coalesce(l.city, (
                select a.city
                from app_course_attendances a
                where a.unit_id = l.unit_id
                  and a.course_id = l.course_id
                  and a.status = 'active'
                order by a.created_at asc
                limit 1
              )) as city,
              l.course_id,
              l.course_name_snapshot,
              l.course_value_snapshot::text,
              l.acquisition_channel_id,
              l.acquisition_channel_name_snapshot,
              l.created_by,
              owner.name as created_by_name,
              l.observations,
              coalesce(import_info.campaign_name, meta_info.campaign_name) as campaign_name,
              coalesce(import_info.form_id, meta_info.form_id) as form_id,
              l.stage,
              l.created_at::text
            from app_leads l
            inner join app_units un on un.id = l.unit_id
            left join app_users owner on owner.id = l.created_by
            left join app_lead_import_rows import_info on import_info.lead_id = l.id
            left join lateral (
              select e.campaign_name, e.form_id
              from app_meta_lead_events e
              where e.lead_id = l.id
              order by e.received_at desc
              limit 1
            ) meta_info on true
            where l.unit_id = $1
              and ($4::boolean or l.created_by = $2)
              and (
                ($3 = 'students' and l.stage = 'Matriculado')
                or ($3 = 'pipeline' and l.stage <> 'Matriculado')
              )
            order by l.created_at desc
          `,
          [unit.id, session.user.id, listView, canManageUnitLeads],
        );

        return Response.json(
          { leads: result.rows.map((row) => mapLead(row, exposeAcquisitionChannel)) },
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

        const courseResult = await getCourseSnapshot(payload.courseId, unit.id);

        if (courseResult.error) {
          return Response.json(
            { ok: false, error: courseResult.error },
            { status: courseResult.status },
          );
        }

        const channelResult = await getChannelSnapshot(payload.acquisitionChannelId, unit.id);

        if (channelResult.error) {
          return Response.json(
            { ok: false, error: channelResult.error },
            { status: channelResult.status },
          );
        }

        const course = courseResult.course;
        const channel = channelResult.channel;
        const resolvedCity =
          (await getCourseCity(course?.id ?? payload.courseId, unit.id)) ?? payload.city;
        const result = await queryDb<LeadRow>(
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
              created_by
            )
            values ($1, $2, $3, nullif($4, ''), nullif($5, ''), nullif($6, ''), $7, $8, $9, $10, $11, nullif($12, ''), $13)
            returning
              id,
              unit_id,
              (select name from app_units where id = $1) as unit_name,
              full_name,
              phone,
              phone2,
              email,
              city,
              course_id,
              course_name_snapshot,
              course_value_snapshot::text,
              acquisition_channel_id,
              acquisition_channel_name_snapshot,
              created_by,
              $14::text as created_by_name,
              observations,
              null::text as campaign_name,
              null::text as form_id,
              stage,
              created_at::text
          `,
          [
            unit.id,
            payload.fullName,
            payload.phone,
            payload.phone2,
            payload.email,
            resolvedCity,
            course?.id ?? null,
            course?.name ?? null,
            course ? Number(course.value) : null,
            channel?.id ?? null,
            channel?.name ?? null,
            payload.observations,
            session.user.id,
            session.user.name,
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
