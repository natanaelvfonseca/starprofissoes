import type { PoolClient, QueryResultRow } from "pg";

type LeadOwnerRow = QueryResultRow & {
  id: string;
  unit_id: string;
  created_by: string | null;
  shared_queue: boolean;
  stage: string;
};

type UserAccessRow = QueryResultRow & { allowed: boolean };

export class LeadOwnershipError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function assumeLeadOwnership(
  client: PoolClient,
  params: {
    leadId: string;
    unitId: string;
    userId: string;
    expectedOwnerId: string;
  },
) {
  const leadResult = await client.query<LeadOwnerRow>(
    `
      select id, unit_id, created_by, shared_queue, stage
      from app_leads
      where id = $1
      limit 1
      for update
    `,
    [params.leadId],
  );
  const lead = leadResult.rows[0];

  if (!lead || lead.unit_id !== params.unitId || lead.stage === "Matriculado") {
    throw new LeadOwnershipError("Lead indisponível nesta unidade.", 404);
  }
  if (lead.shared_queue || !lead.created_by) {
    throw new LeadOwnershipError("Use Pegar atendimento para um lead ainda livre.", 409);
  }
  if (lead.created_by !== params.expectedOwnerId) {
    throw new LeadOwnershipError(
      "O responsável mudou. Atualize o pipeline e tente novamente.",
      409,
    );
  }
  if (lead.created_by === params.userId) {
    return { changed: false, previousOwnerId: lead.created_by };
  }

  const accessResult = await client.query<UserAccessRow>(
    `
      select exists (
        select 1
        from app_users consultant
        where consultant.id = $1
          and consultant.role = 'CONSULTOR'
          and consultant.status = 'active'
          and (
            consultant.primary_unit_id = $2
            or exists (
              select 1
              from app_user_units user_unit
              where user_unit.user_id = consultant.id
                and user_unit.unit_id = $2
            )
          )
      ) as allowed
    `,
    [params.userId, params.unitId],
  );

  if (accessResult.rows[0]?.allowed !== true) {
    throw new LeadOwnershipError("Consultor sem acesso ativo a esta unidade.", 403);
  }

  const updated = await client.query<{ id: string }>(
    `
      update app_leads
      set created_by = $2, shared_queue = false, updated_at = now()
      where id = $1
        and unit_id = $3
        and created_by = $4
        and shared_queue = false
        and stage <> 'Matriculado'
      returning id
    `,
    [params.leadId, params.userId, params.unitId, params.expectedOwnerId],
  );

  if (!updated.rowCount) {
    throw new LeadOwnershipError(
      "O responsável mudou. Atualize o pipeline e tente novamente.",
      409,
    );
  }

  await client.query(
    `
      insert into app_lead_owner_transfers (
        unit_id, lead_id, previous_owner_id, next_owner_id, transferred_by, reason
      )
      values ($1, $2, $3, $4, $4, $5)
    `,
    [
      params.unitId,
      params.leadId,
      params.expectedOwnerId,
      params.userId,
      "Atendimento assumido pelo consultor",
    ],
  );

  const tables = await client.query<{ tasks_table: string | null; meta_table: string | null }>(
    `
      select
        to_regclass('app_crm_tasks')::text as tasks_table,
        to_regclass('app_meta_lead_events')::text as meta_table
    `,
  );

  if (tables.rows[0]?.tasks_table) {
    await client.query(
      `
        update app_crm_tasks
        set created_by = $2, updated_at = now()
        where lead_id = $1 and status <> 'archived'
      `,
      [params.leadId, params.userId],
    );
  }
  if (tables.rows[0]?.meta_table) {
    await client.query(
      `update app_meta_lead_events set assigned_user_id = $2, updated_at = now() where lead_id = $1`,
      [params.leadId, params.userId],
    );
  }

  return { changed: true, previousOwnerId: params.expectedOwnerId };
}
