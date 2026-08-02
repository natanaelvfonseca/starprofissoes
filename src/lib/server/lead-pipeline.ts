import type { PoolClient, QueryResultRow } from "pg";
import type { LeadStage } from "@/lib/commercial-types";
import { ensureCommercialSchema, isUuid } from "@/lib/server/commercial-schema";
import { ensureCourseAttendanceSchema } from "@/lib/server/course-attendances";
import { withTransaction } from "@/lib/server/db";

type LeadPipelineRow = QueryResultRow & {
  id: string;
  unit_id: string;
  created_by: string | null;
  attendance_id: string | null;
  stage: LeadStage;
  pipeline_column_id: string | null;
  pre_enrollment_stage?: LeadStage | null;
  pre_enrollment_pipeline_column_id?: string | null;
  shared_queue: boolean;
};

type LeadPipelineColumnRow = QueryResultRow & {
  id: string;
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

export class LeadPipelineMoveError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function hasActiveAttendanceConsultant(
  client: PoolClient,
  attendanceId: string | null,
  userId?: string,
) {
  if (!attendanceId) return false;

  const result = await client.query<{ allowed: boolean }>(
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

export async function moveLeadToPipelineColumn(params: {
  leadId: string;
  pipelineColumnId: string;
  claimUserId?: string | null;
}) {
  if (!isUuid(params.leadId) || !isUuid(params.pipelineColumnId)) {
    throw new LeadPipelineMoveError("Lead ou coluna inválida.", 400);
  }

  await ensureCommercialSchema();
  await ensureCourseAttendanceSchema();

  return withTransaction(async (client) => {
    const leadResult = await client.query<LeadPipelineRow>(
      `
        select id, unit_id, created_by, attendance_id, stage, pipeline_column_id,
          pre_enrollment_stage, pre_enrollment_pipeline_column_id, shared_queue
        from app_leads
        where id = $1
        limit 1
        for update
      `,
      [params.leadId],
    );
    const lead = leadResult.rows[0];

    if (!lead) throw new LeadPipelineMoveError("Lead não encontrado.", 404);

    const columnResult = await client.query<LeadPipelineColumnRow>(
      `
        select id, semantic_stage
        from app_pipeline_columns
        where id = $1 and unit_id = $2 and pipeline_type = 'leads'
        limit 1
      `,
      [params.pipelineColumnId, lead.unit_id],
    );
    const column = columnResult.rows[0];

    if (!column) throw new LeadPipelineMoveError("Coluna não encontrada.", 404);
    if (!column.semantic_stage || !allowedStages.includes(column.semantic_stage)) {
      throw new LeadPipelineMoveError("Coluna comercial inválida.", 400);
    }

    if (lead.pipeline_column_id === column.id && lead.stage === column.semantic_stage) {
      return {
        changed: false,
        claimed: false,
        previousPipelineColumnId: lead.pipeline_column_id,
        pipelineColumnId: column.id,
        stage: lead.stage,
        createdById: lead.created_by,
        sharedQueue: lead.shared_queue,
      };
    }

    const isSharedNewLead =
      lead.shared_queue && lead.stage === "Novo lead" && Boolean(lead.attendance_id);

    if (isSharedNewLead) {
      const claimUserId = params.claimUserId?.trim();
      if (column.semantic_stage === "Novo lead") {
        throw new LeadPipelineMoveError(
          "Mova o lead para outra etapa para iniciar o atendimento.",
          400,
        );
      }
      if (
        !claimUserId ||
        !(await hasActiveAttendanceConsultant(client, lead.attendance_id, claimUserId))
      ) {
        throw new LeadPipelineMoveError("Um consultor da turma deve assumir este lead.", 403);
      }

      const claimed = await client.query<{ id: string }>(
        `
          update app_leads lead
          set pipeline_column_id = $2,
              stage = $3,
              created_by = $4,
              shared_queue = false,
              first_contact_at = coalesce(first_contact_at, now()),
              last_follow_up_at = now(),
              follow_up_count = follow_up_count + 1,
              updated_at = now()
          where lead.id = $1
            and lead.shared_queue = true
            and lead.stage = 'Novo lead'
          returning lead.id
        `,
        [lead.id, column.id, column.semantic_stage, claimUserId],
      );

      if (!claimed.rowCount) {
        throw new LeadPipelineMoveError("Este lead já foi assumido por outro consultor.", 409);
      }

      return {
        changed: true,
        claimed: true,
        previousPipelineColumnId: lead.pipeline_column_id,
        pipelineColumnId: column.id,
        stage: column.semantic_stage,
        createdById: claimUserId,
        sharedQueue: false,
      };
    }

    const releaseToSharedQueue =
      column.semantic_stage === "Novo lead" &&
      (await hasActiveAttendanceConsultant(client, lead.attendance_id));

    await client.query(
      `
        update app_leads
        set pipeline_column_id = $2,
            stage = $3,
            shared_queue = $4,
            created_by = case when $4 then null else created_by end,
            first_contact_at = case
              when $3 <> 'Novo lead' then coalesce(first_contact_at, now())
              else first_contact_at
            end,
            last_follow_up_at = case
              when $3 <> stage and $3 <> 'Novo lead' then now()
              else last_follow_up_at
            end,
            follow_up_count = case
              when $3 <> stage and $3 <> 'Novo lead' then follow_up_count + 1
              else follow_up_count
            end,
            updated_at = now()
        where id = $1
      `,
      [lead.id, column.id, column.semantic_stage, releaseToSharedQueue],
    );

    return {
      changed: true,
      claimed: false,
      previousPipelineColumnId: lead.pipeline_column_id,
      pipelineColumnId: column.id,
      stage: column.semantic_stage,
      createdById: releaseToSharedQueue ? null : lead.created_by,
      sharedQueue: releaseToSharedQueue,
    };
  });
}

export async function returnStudentToLead(leadId: string) {
  if (!isUuid(leadId)) {
    throw new LeadPipelineMoveError("Aluno inválido.", 400);
  }

  await ensureCommercialSchema();

  return withTransaction(async (client) => {
    const leadResult = await client.query<LeadPipelineRow>(
      `
        select id, unit_id, created_by, attendance_id, stage, pipeline_column_id,
          pre_enrollment_stage, pre_enrollment_pipeline_column_id, shared_queue
        from app_leads
        where id = $1
        limit 1
        for update
      `,
      [leadId],
    );
    const lead = leadResult.rows[0];

    if (!lead) throw new LeadPipelineMoveError("Aluno não encontrado.", 404);
    if (lead.stage !== "Matriculado") {
      throw new LeadPipelineMoveError("Este registro já voltou para o pipeline de leads.", 409);
    }

    const previousStage =
      lead.pre_enrollment_stage && lead.pre_enrollment_stage !== "Matriculado"
        ? lead.pre_enrollment_stage
        : "Pagamento pendente";
    const columnResult = await client.query<{ id: string }>(
      `
        select id
        from app_pipeline_columns
        where unit_id = $1
          and pipeline_type = 'leads'
          and (
            id = $2::uuid
            or semantic_stage = $3
            or ($3 = 'Pagamento pendente' and system_key = 'pending_payment')
          )
        order by case
            when id = $2::uuid then 0
            when $3 = 'Pagamento pendente' and system_key = 'pending_payment' then 1
            else 2
          end,
          position,
          created_at
        limit 1
      `,
      [lead.unit_id, lead.pre_enrollment_pipeline_column_id ?? null, previousStage],
    );
    const pipelineColumnId = columnResult.rows[0]?.id ?? null;

    await client.query(
      `
        update app_leads
        set stage = $3,
            pipeline_column_id = $2,
            student_pipeline_column_id = null,
            pre_enrollment_stage = null,
            pre_enrollment_pipeline_column_id = null,
            converted_at = null,
            converted_by = null,
            payment_status = 'pending',
            payment_confirmed_at = null,
            updated_at = now()
        where id = $1
      `,
      [lead.id, pipelineColumnId, previousStage],
    );

    const payments = await client.query(
      `
        update app_student_payments
        set status = 'cancelled',
            paid_at = null,
            updated_at = now()
        where lead_id = $1
          and status = 'paid'
          and description = 'Taxa/matrícula confirmada'
      `,
      [lead.id],
    );

    return {
      stage: previousStage,
      pipelineColumnId,
      cancelledPayments: payments.rowCount ?? 0,
    };
  });
}
