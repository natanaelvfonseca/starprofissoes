import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import type { LeadStage } from "@/lib/commercial-types";
import { canOperateCrm, canTransferLeads } from "@/lib/auth-types";
import { ensureCommercialSchema, isUuid } from "@/lib/server/commercial-schema";
import { getSessionFromRequest } from "@/lib/server/auth";
import { ensureCourseAttendanceSchema } from "@/lib/server/course-attendances";
import { queryDb } from "@/lib/server/db";
import { LeadPipelineMoveError, moveLeadToPipelineColumn } from "@/lib/server/lead-pipeline";

type LeadUnitRow = QueryResultRow & {
  unit_id: string;
  created_by: string | null;
};

type LeadEditableRow = QueryResultRow & {
  unit_id: string;
  created_by: string | null;
  full_name: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  city: string | null;
  attendance_id: string | null;
  course_id: string | null;
  acquisition_channel_id: string | null;
  acquisition_channel_name_snapshot: string | null;
  observations: string | null;
  stage: LeadStage;
  shared_queue: boolean;
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
  course_id: string;
  course_name: string;
  course_value: string;
  city: string;
  state: string;
  status: "active" | "inactive";
};

type PipelineMoveRow = QueryResultRow & {
  id: string;
  pipeline_type: "leads" | "students";
  semantic_stage: LeadStage | null;
};

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

function parseStage(body: unknown) {
  const data = body as { stage?: unknown };
  return typeof data?.stage === "string" ? data.stage.trim() : "";
}

function parseLeadUpdate(body: unknown) {
  const data = body as {
    fullName?: unknown;
    phone?: unknown;
    phone2?: unknown;
    email?: unknown;
    city?: unknown;
    attendanceId?: unknown;
    courseId?: unknown;
    acquisitionChannelId?: unknown;
    observations?: unknown;
    stage?: unknown;
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
    observations: typeof data?.observations === "string" ? data.observations.trim() : "",
    stage: typeof data?.stage === "string" ? data.stage.trim() : "",
  };
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

async function recordPaidStudentPayment(leadId: string, userId: string) {
  await queryDb(
    `
      insert into app_student_payments (
        unit_id,
        lead_id,
        description,
        amount,
        status,
        due_at,
        paid_at,
        created_by
      )
      select
        l.unit_id,
        l.id,
        'Taxa/matrícula confirmada',
        coalesce(l.course_value_snapshot, 0),
        'paid',
        coalesce(l.payment_confirmed_at, l.converted_at, now())::date,
        coalesce(l.payment_confirmed_at, l.converted_at, now()),
        $2
      from app_leads l
      where l.id = $1
        and not exists (
          select 1
          from app_student_payments p
          where p.lead_id = l.id
            and p.status = 'paid'
        )
    `,
    [leadId, userId],
  );
}

async function hasActiveAttendanceConsultant(attendanceId: string | null, userId?: string) {
  if (!attendanceId) {
    return false;
  }

  const result = await queryDb<{ allowed: boolean }>(
    `
      select exists (
        select 1
        from app_course_attendance_consultants attendance_consultant
        inner join app_users consultant on consultant.id = attendance_consultant.user_id
        where attendance_consultant.attendance_id = $1
          and consultant.role = 'CONSULTOR'
          and consultant.status = 'active'
          and ($2::uuid is null or consultant.id = $2)
      ) as allowed
    `,
    [attendanceId, userId ?? null],
  );

  return result.rows[0]?.allowed === true;
}

export const Route = createFileRoute("/api/crm/leads/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
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

        if (!isUuid(params.id)) {
          return Response.json({ ok: false, error: "Lead inválido." }, { status: 400 });
        }

        const body = await request.json().catch(() => null);
        const payload = parseLeadUpdate(body);
        const nextStage = payload.stage || parseStage(body);
        const pipelineMove = body as {
          pipelineColumnId?: unknown;
          studentPipelineColumnId?: unknown;
        } | null;

        await ensureCommercialSchema();
        await ensureCourseAttendanceSchema();

        const leadResult = await queryDb<LeadEditableRow>(
          `
            select
              unit_id,
              created_by,
              full_name,
              phone,
              phone2,
              email,
              city,
              attendance_id,
              course_id,
              acquisition_channel_id,
              acquisition_channel_name_snapshot,
              observations,
              stage,
              shared_queue
            from app_leads
            where id = $1
            limit 1
          `,
          [params.id],
        );

        const lead = leadResult.rows[0];

        if (!lead) {
          return Response.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
        }

        if (!session.units.some((unit) => unit.id === lead.unit_id)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const canManageUnitLeads = canTransferLeads(session.user.role);
        const isSharedNewLead =
          lead.shared_queue && lead.stage === "Novo lead" && Boolean(lead.attendance_id);
        const consultantCanAccessSharedLead =
          session.user.role === "CONSULTOR" &&
          isSharedNewLead &&
          (await hasActiveAttendanceConsultant(lead.attendance_id, session.user.id));

        if (
          !canManageUnitLeads &&
          lead.created_by !== session.user.id &&
          !consultantCanAccessSharedLead
        ) {
          return Response.json(
            {
              ok: false,
              error:
                session.user.role === "CONSULTOR"
                  ? "Este lead já foi assumido por outro consultor."
                  : "Acesso negado.",
            },
            { status: session.user.role === "CONSULTOR" ? 409 : 403 },
          );
        }

        const requestedLeadColumnId =
          typeof pipelineMove?.pipelineColumnId === "string"
            ? pipelineMove.pipelineColumnId.trim()
            : "";
        const requestedStudentColumnId =
          typeof pipelineMove?.studentPipelineColumnId === "string"
            ? pipelineMove.studentPipelineColumnId.trim()
            : "";

        if (requestedLeadColumnId || requestedStudentColumnId) {
          const columnId = requestedLeadColumnId || requestedStudentColumnId;
          if (!isUuid(columnId)) {
            return Response.json({ ok: false, error: "Coluna inválida." }, { status: 400 });
          }

          const expectedPipeline = requestedLeadColumnId ? "leads" : "students";
          const columnResult = await queryDb<PipelineMoveRow>(
            `
              select id, pipeline_type, semantic_stage
              from app_pipeline_columns
              where id = $1 and unit_id = $2 and pipeline_type = $3
              limit 1
            `,
            [columnId, lead.unit_id, expectedPipeline],
          );
          const column = columnResult.rows[0];
          if (!column) {
            return Response.json({ ok: false, error: "Coluna não encontrada." }, { status: 404 });
          }

          if (expectedPipeline === "students") {
            if (lead.stage !== "Matriculado") {
              return Response.json(
                { ok: false, error: "Este registro ainda não é um aluno." },
                { status: 400 },
              );
            }
            await queryDb(
              `update app_leads set student_pipeline_column_id = $2, updated_at = now() where id = $1`,
              [params.id, column.id],
            );
            return Response.json({ ok: true, studentPipelineColumnId: column.id });
          }

          if (
            isSharedNewLead &&
            (session.user.role !== "CONSULTOR" || !consultantCanAccessSharedLead)
          ) {
            return Response.json(
              { ok: false, error: "Um consultor da turma deve assumir este lead." },
              { status: 403 },
            );
          }

          try {
            const moved = await moveLeadToPipelineColumn({
              leadId: params.id,
              pipelineColumnId: column.id,
              claimUserId: session.user.role === "CONSULTOR" ? session.user.id : null,
            });

            return Response.json({
              ok: true,
              claimed: moved.claimed,
              stage: moved.stage,
              pipelineColumnId: moved.pipelineColumnId,
              createdById: moved.createdById,
              createdByName: moved.claimed ? session.user.name : undefined,
              sharedQueue: moved.sharedQueue,
            });
          } catch (error) {
            if (error instanceof LeadPipelineMoveError) {
              return Response.json({ ok: false, error: error.message }, { status: error.status });
            }
            throw error;
          }
        }

        if (isSharedNewLead && session.user.role === "CONSULTOR") {
          return Response.json(
            { ok: false, error: "Mova o lead para outra etapa para iniciar o atendimento." },
            { status: 409 },
          );
        }

        if (!payload.fullName || !payload.phone) {
          if (!nextStage || !allowedStages.includes(nextStage as LeadStage)) {
            return Response.json(
              { ok: false, error: "Nome completo e telefone são obrigatórios." },
              { status: 400 },
            );
          }
        }

        const hasLeadFields =
          payload.fullName ||
          payload.phone ||
          payload.phone2 !== "" ||
          payload.email !== "" ||
          payload.city !== "" ||
          payload.attendanceId !== "" ||
          payload.courseId !== "" ||
          payload.acquisitionChannelId !== "" ||
          payload.observations !== "";

        if (!hasLeadFields && (!nextStage || !allowedStages.includes(nextStage as LeadStage))) {
          return Response.json({ ok: false, error: "Dados insuficientes." }, { status: 400 });
        }

        const resolvedStage =
          nextStage && allowedStages.includes(nextStage as LeadStage)
            ? (nextStage as LeadStage)
            : lead.stage;

        if (isSharedNewLead && resolvedStage !== "Novo lead") {
          return Response.json(
            { ok: false, error: "Um consultor da turma deve assumir o lead pelo pipeline." },
            { status: 409 },
          );
        }

        if (payload.fullName && payload.phone) {
          if (!isUuid(payload.attendanceId)) {
            return Response.json(
              { ok: false, error: "Selecione uma turma válida." },
              { status: 400 },
            );
          }
          const attendanceResult = await queryDb<AttendanceSnapshotRow>(
            `
              select a.id, a.course_id, c.name as course_name, c.value::text as course_value,
                a.city, a.state, a.status
              from app_course_attendances a
              inner join app_courses c on c.id = a.course_id
              where a.id = $1 and a.unit_id = $2
                and (a.status = 'active' or a.id = $3)
              limit 1
            `,
            [payload.attendanceId, lead.unit_id, lead.attendance_id],
          );
          const attendance = attendanceResult.rows[0];
          if (!attendance) {
            return Response.json(
              { ok: false, error: "Não é permitido escolher outra turma inativa." },
              { status: 400 },
            );
          }

          const consultantEditingOwnLead = session.user.role === "CONSULTOR";
          const channelResult = consultantEditingOwnLead
            ? { channel: null }
            : await getChannelSnapshot(payload.acquisitionChannelId, lead.unit_id);

          if ("error" in channelResult && channelResult.error) {
            return Response.json(
              { ok: false, error: channelResult.error },
              { status: channelResult.status },
            );
          }

          const resolvedCity = `${attendance.city} - ${attendance.state}`;
          const releaseToSharedQueue =
            resolvedStage === "Novo lead" && (await hasActiveAttendanceConsultant(attendance.id));

          await queryDb(
            `
              update app_leads
              set
                full_name = $2,
                phone = $3,
                phone2 = nullif($4, ''),
                email = nullif($5, ''),
                city = nullif($6, ''),
                attendance_id = $7,
                course_id = $8,
                course_name_snapshot = $9,
                course_value_snapshot = $10,
                acquisition_channel_id = $11,
                acquisition_channel_name_snapshot = $12,
                observations = nullif($13, ''),
                pipeline_column_id = case when $14 <> stage then null else pipeline_column_id end,
                stage = $14,
                shared_queue = $16,
                created_by = case when $16 then null else created_by end,
                first_contact_at = case
                  when $14 <> 'Novo lead' then coalesce(first_contact_at, now())
                  else first_contact_at
                end,
                last_follow_up_at = case
                  when $14 <> stage and $14 <> 'Novo lead' then now()
                  else last_follow_up_at
                end,
                follow_up_count = case
                  when $14 <> stage and $14 <> 'Novo lead' then follow_up_count + 1
                  else follow_up_count
                end,
                converted_at = case
                  when $14 = 'Matriculado' then coalesce(converted_at, now())
                  else converted_at
                end,
                converted_by = case
                  when $14 = 'Matriculado' then coalesce(converted_by, $15)
                  else converted_by
                end,
                payment_status = case
                  when $14 = 'Matriculado' then 'paid'
                  else payment_status
                end,
                payment_confirmed_at = case
                  when $14 = 'Matriculado' then coalesce(payment_confirmed_at, now())
                  else payment_confirmed_at
                end,
                updated_at = now()
              where id = $1
            `,
            [
              params.id,
              payload.fullName,
              payload.phone,
              payload.phone2,
              payload.email,
              resolvedCity,
              attendance.id,
              attendance.course_id,
              attendance.course_name,
              Number(attendance.course_value),
              consultantEditingOwnLead
                ? lead.acquisition_channel_id
                : (channelResult.channel?.id ?? null),
              consultantEditingOwnLead
                ? lead.acquisition_channel_name_snapshot
                : (channelResult.channel?.name ?? null),
              payload.observations,
              resolvedStage,
              session.user.id,
              releaseToSharedQueue,
            ],
          );

          if (resolvedStage === "Matriculado") {
            await recordPaidStudentPayment(params.id, session.user.id);
          }

          return Response.json({
            ok: true,
            stage: resolvedStage,
            sharedQueue: releaseToSharedQueue,
          });
        }

        if (!nextStage || !allowedStages.includes(nextStage as LeadStage)) {
          return Response.json({ ok: false, error: "Estágio inválido." }, { status: 400 });
        }

        const releaseToSharedQueue =
          nextStage === "Novo lead" && (await hasActiveAttendanceConsultant(lead.attendance_id));

        await queryDb(
          `
            update app_leads
            set
              pipeline_column_id = case when $2 <> stage then null else pipeline_column_id end,
              stage = $2,
              shared_queue = $4,
              created_by = case when $4 then null else created_by end,
              first_contact_at = case
                when $2 <> 'Novo lead' then coalesce(first_contact_at, now())
                else first_contact_at
              end,
              last_follow_up_at = case
                when $2 <> stage and $2 <> 'Novo lead' then now()
                else last_follow_up_at
              end,
              follow_up_count = case
                when $2 <> stage and $2 <> 'Novo lead' then follow_up_count + 1
                else follow_up_count
              end,
              converted_at = case
                when $2 = 'Matriculado' then coalesce(converted_at, now())
                else converted_at
              end,
              converted_by = case
                when $2 = 'Matriculado' then coalesce(converted_by, $3)
                else converted_by
              end,
              payment_status = case
                when $2 = 'Matriculado' then 'paid'
                else payment_status
              end,
              payment_confirmed_at = case
                when $2 = 'Matriculado' then coalesce(payment_confirmed_at, now())
                else payment_confirmed_at
              end,
              updated_at = now()
            where id = $1
          `,
          [params.id, nextStage, session.user.id, releaseToSharedQueue],
        );

        if (nextStage === "Matriculado") {
          await recordPaidStudentPayment(params.id, session.user.id);
        }

        return Response.json({ ok: true, stage: nextStage, sharedQueue: releaseToSharedQueue });
      },
      DELETE: async ({ request, params }) => {
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

        if (!isUuid(params.id)) {
          return Response.json({ ok: false, error: "Lead inválido." }, { status: 400 });
        }

        await ensureCommercialSchema();

        const leadResult = await queryDb<LeadUnitRow>(
          `
            select unit_id, created_by
            from app_leads
            where id = $1
            limit 1
          `,
          [params.id],
        );
        const lead = leadResult.rows[0];

        if (!lead) {
          return Response.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
        }

        if (!session.units.some((unit) => unit.id === lead.unit_id)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        if (!canTransferLeads(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        await queryDb(
          `
            delete from app_leads
            where id = $1
          `,
          [params.id],
        );

        return Response.json({ ok: true });
      },
    },
  },
});
