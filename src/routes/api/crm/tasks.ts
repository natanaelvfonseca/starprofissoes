import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { CRM_TASK_STATUSES, type CrmLeadTask, type CrmTaskStatus } from "@/lib/crm-task-types";
import { canTransferLeads } from "@/lib/auth-types";
import { ensureCommercialSchema, isUuid } from "@/lib/server/commercial-schema";
import { getSessionFromRequest } from "@/lib/server/auth";
import { queryDb } from "@/lib/server/db";

type TaskRow = QueryResultRow & {
  id: string;
  unit_id: string;
  unit_name: string | null;
  lead_id: string;
  lead_name: string;
  title: string;
  notes: string | null;
  due_at: string;
  status: CrmTaskStatus;
  created_at: string;
  completed_at: string | null;
};

type LeadAccessRow = QueryResultRow & {
  id: string;
  unit_id: string;
  created_by: string | null;
  full_name: string;
};

type TaskAccessRow = QueryResultRow & {
  id: string;
  unit_id: string;
  created_by: string | null;
};

const MAX_TITLE_LENGTH = 140;
const MAX_NOTES_LENGTH = 1200;

let crmTaskSchemaPromise: Promise<void> | null = null;

function ensureCrmTaskSchema() {
  crmTaskSchemaPromise ??= queryDb(`
    create table if not exists app_crm_tasks (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      lead_id uuid not null references app_leads(id) on delete cascade,
      title text not null,
      notes text not null default '',
      due_at timestamptz not null,
      status text not null default 'pending' check (status in ('pending','done','archived')),
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      completed_at timestamptz
    );

    alter table app_crm_tasks add column if not exists unit_id uuid references app_units(id) on delete cascade;
    alter table app_crm_tasks add column if not exists lead_id uuid references app_leads(id) on delete cascade;
    alter table app_crm_tasks add column if not exists title text;
    alter table app_crm_tasks add column if not exists notes text not null default '';
    alter table app_crm_tasks add column if not exists due_at timestamptz;
    alter table app_crm_tasks add column if not exists status text not null default 'pending';
    alter table app_crm_tasks add column if not exists created_by uuid references app_users(id) on delete set null;
    alter table app_crm_tasks add column if not exists created_at timestamptz not null default now();
    alter table app_crm_tasks add column if not exists updated_at timestamptz not null default now();
    alter table app_crm_tasks add column if not exists completed_at timestamptz;

    create index if not exists app_crm_tasks_lead_idx
      on app_crm_tasks (lead_id, status, due_at asc);

    create index if not exists app_crm_tasks_reminder_idx
      on app_crm_tasks (created_by, status, due_at asc);
  `)
    .then(() => undefined)
    .catch((error) => {
      crmTaskSchemaPromise = null;
      throw error;
    });

  return crmTaskSchemaPromise;
}

function readString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isTaskStatus(value: unknown): value is CrmTaskStatus {
  return typeof value === "string" && CRM_TASK_STATUSES.includes(value as CrmTaskStatus);
}

function mapTask(row: TaskRow): CrmLeadTask {
  return {
    id: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    leadId: row.lead_id,
    leadName: row.lead_name,
    title: row.title,
    notes: row.notes ?? "",
    dueAt: row.due_at,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

async function getLeadForUser(
  leadId: string,
  userId: string,
  unitIds: Array<string>,
  canManageUnitLeads: boolean,
) {
  const result = await queryDb<LeadAccessRow>(
    `
      select id, unit_id, created_by, full_name
      from app_leads
      where id = $1
      limit 1
    `,
    [leadId],
  );
  const lead = result.rows[0];

  if (!lead) {
    return { error: "Lead não encontrado.", status: 404 } as const;
  }

  if (!unitIds.includes(lead.unit_id) || (!canManageUnitLeads && lead.created_by !== userId)) {
    return { error: "Acesso negado.", status: 403 } as const;
  }

  return { lead } as const;
}

async function assertTaskForUser(
  taskId: string,
  userId: string,
  unitIds: Array<string>,
  canManageUnitLeads: boolean,
) {
  const result = await queryDb<TaskAccessRow>(
    `
      select id, unit_id, created_by
      from app_crm_tasks
      where id = $1
      limit 1
    `,
    [taskId],
  );
  const task = result.rows[0];

  if (!task) {
    return { error: "Tarefa não encontrada.", status: 404 } as const;
  }

  if (!unitIds.includes(task.unit_id) || (!canManageUnitLeads && task.created_by !== userId)) {
    return { error: "Acesso negado.", status: 403 } as const;
  }

  return { task } as const;
}

async function listLeadTasks(leadId: string) {
  const result = await queryDb<TaskRow>(
    `
      select
        t.id,
        t.unit_id,
        un.name as unit_name,
        t.lead_id,
        l.full_name as lead_name,
        t.title,
        t.notes,
        t.due_at::text,
        t.status,
        t.created_at::text,
        t.completed_at::text
      from app_crm_tasks t
      inner join app_leads l on l.id = t.lead_id
      left join app_units un on un.id = t.unit_id
      where t.lead_id = $1
        and t.status <> 'archived'
      order by
        case t.status when 'pending' then 1 when 'done' then 2 else 3 end,
        t.due_at asc
    `,
    [leadId],
  );

  return result.rows.map(mapTask);
}

async function listReminderTasks(userId: string) {
  const result = await queryDb<TaskRow>(
    `
      select
        t.id,
        t.unit_id,
        un.name as unit_name,
        t.lead_id,
        l.full_name as lead_name,
        t.title,
        t.notes,
        t.due_at::text,
        t.status,
        t.created_at::text,
        t.completed_at::text
      from app_crm_tasks t
      inner join app_leads l on l.id = t.lead_id
      left join app_units un on un.id = t.unit_id
      where t.created_by = $1
        and t.status = 'pending'
        and t.due_at <= now() + interval '15 minutes'
      order by t.due_at asc
      limit 30
    `,
    [userId],
  );

  return result.rows.map(mapTask);
}

async function getTask(taskId: string) {
  const result = await queryDb<TaskRow>(
    `
      select
        t.id,
        t.unit_id,
        un.name as unit_name,
        t.lead_id,
        l.full_name as lead_name,
        t.title,
        t.notes,
        t.due_at::text,
        t.status,
        t.created_at::text,
        t.completed_at::text
      from app_crm_tasks t
      inner join app_leads l on l.id = t.lead_id
      left join app_units un on un.id = t.unit_id
      where t.id = $1
      limit 1
    `,
    [taskId],
  );

  return result.rows[0] ? mapTask(result.rows[0]) : null;
}

export const Route = createFileRoute("/api/crm/tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        await ensureCommercialSchema();
        await ensureCrmTaskSchema();
        const canManageUnitLeads = canTransferLeads(session.user.role);

        const url = new URL(request.url);
        const view = url.searchParams.get("view");

        if (view === "notifications") {
          return Response.json(
            { tasks: await listReminderTasks(session.user.id) },
            { headers: { "Cache-Control": "no-store" } },
          );
        }

        const leadId = url.searchParams.get("leadId") ?? "";

        if (!isUuid(leadId)) {
          return Response.json({ ok: false, error: "Lead inválido." }, { status: 400 });
        }

        const leadAccess = await getLeadForUser(
          leadId,
          session.user.id,
          session.units.map((unit) => unit.id),
          canManageUnitLeads,
        );

        if ("error" in leadAccess) {
          return Response.json(
            { ok: false, error: leadAccess.error },
            { status: leadAccess.status },
          );
        }

        return Response.json(
          { tasks: await listLeadTasks(leadId) },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const leadId = readString(body?.leadId, 80);
        const title = readString(body?.title, MAX_TITLE_LENGTH);
        const notes = readString(body?.notes, MAX_NOTES_LENGTH);
        const dueAtText = readString(body?.dueAt, 80);
        const dueAt = dueAtText ? new Date(dueAtText) : null;

        if (!isUuid(leadId)) {
          return Response.json({ ok: false, error: "Lead inválido." }, { status: 400 });
        }

        if (!title || !dueAt || Number.isNaN(dueAt.getTime())) {
          return Response.json(
            { ok: false, error: "Preencha o título e a data/hora da tarefa." },
            { status: 400 },
          );
        }

        await ensureCommercialSchema();
        await ensureCrmTaskSchema();
        const canManageUnitLeads = canTransferLeads(session.user.role);

        const leadAccess = await getLeadForUser(
          leadId,
          session.user.id,
          session.units.map((unit) => unit.id),
          canManageUnitLeads,
        );

        if ("error" in leadAccess) {
          return Response.json(
            { ok: false, error: leadAccess.error },
            { status: leadAccess.status },
          );
        }

        const result = await queryDb<TaskRow>(
          `
            insert into app_crm_tasks (
              unit_id,
              lead_id,
              title,
              notes,
              due_at,
              created_by
            )
            values ($1, $2, $3, $4, $5, $6)
            returning
              id,
              unit_id,
              (select name from app_units where id = $1) as unit_name,
              lead_id,
              $7::text as lead_name,
              title,
              notes,
              due_at::text,
              status,
              created_at::text,
              completed_at::text
          `,
          [
            leadAccess.lead.unit_id,
            leadAccess.lead.id,
            title,
            notes,
            dueAt.toISOString(),
            session.user.id,
            leadAccess.lead.full_name,
          ],
        );

        return Response.json({ task: mapTask(result.rows[0]) }, { status: 201 });
      },
      PATCH: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const taskId = readString(body?.taskId, 80);
        const status = isTaskStatus(body?.status) ? body.status : null;

        if (!isUuid(taskId)) {
          return Response.json({ ok: false, error: "Tarefa inválida." }, { status: 400 });
        }

        if (!status) {
          return Response.json({ ok: false, error: "Status inválido." }, { status: 400 });
        }

        await ensureCrmTaskSchema();
        const canManageUnitLeads = canTransferLeads(session.user.role);

        const taskAccess = await assertTaskForUser(
          taskId,
          session.user.id,
          session.units.map((unit) => unit.id),
          canManageUnitLeads,
        );

        if ("error" in taskAccess) {
          return Response.json(
            { ok: false, error: taskAccess.error },
            { status: taskAccess.status },
          );
        }

        await queryDb(
          `
            update app_crm_tasks
            set
              status = $2,
              completed_at = case when $2 = 'done' then coalesce(completed_at, now()) else null end,
              updated_at = now()
            where id = $1
          `,
          [taskId, status],
        );

        const task = await getTask(taskId);

        if (!task) {
          return Response.json({ ok: false, error: "Tarefa não encontrada." }, { status: 404 });
        }

        return Response.json({ task });
      },
      DELETE: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const taskId = readString(body?.taskId, 80);

        if (!isUuid(taskId)) {
          return Response.json({ ok: false, error: "Tarefa inválida." }, { status: 400 });
        }

        await ensureCrmTaskSchema();
        const canManageUnitLeads = canTransferLeads(session.user.role);

        const taskAccess = await assertTaskForUser(
          taskId,
          session.user.id,
          session.units.map((unit) => unit.id),
          canManageUnitLeads,
        );

        if ("error" in taskAccess) {
          return Response.json(
            { ok: false, error: taskAccess.error },
            { status: taskAccess.status },
          );
        }

        await queryDb(
          `
            update app_crm_tasks
            set status = 'archived',
                updated_at = now()
            where id = $1
          `,
          [taskId],
        );

        return Response.json({ ok: true });
      },
    },
  },
});
