import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import {
  canAccessSystemFeedback,
  canManageSystemFeedback,
  canSubmitSystemFeedback,
  type UserRole,
} from "@/lib/auth-types";
import {
  SYSTEM_FEEDBACK_CATEGORIES,
  SYSTEM_FEEDBACK_PRIORITIES,
  SYSTEM_FEEDBACK_STATUSES,
  type SystemFeedbackCategory,
  type SystemFeedbackPriority,
  type SystemFeedbackStatus,
  type SystemFeedbackTicket,
} from "@/lib/system-feedback-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getUnitFromBody, isUuid } from "@/lib/server/commercial-schema";
import { ensureRuntimeSchema, queryDb } from "@/lib/server/db";

type FeedbackTicketRow = QueryResultRow & {
  id: string;
  unit_id: string | null;
  unit_name: string | null;
  title: string;
  category: SystemFeedbackCategory;
  priority: SystemFeedbackPriority;
  status: SystemFeedbackStatus;
  description: string;
  team_note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_by_role: UserRole | null;
  created_at: string;
  updated_at: string;
};

const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 2400;
const MAX_TEAM_NOTE_LENGTH = 1600;

let feedbackSchemaPromise: Promise<void> | null = null;

function ensureFeedbackSchema() {
  feedbackSchemaPromise ??= ensureRuntimeSchema(
    "system-feedback",
    `
    create table if not exists app_system_feedback_tickets (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid references app_units(id) on delete set null,
      title text not null,
      category text not null default 'melhoria' check (category in ('melhoria','ajuste','erro','ideia')),
      priority text not null default 'media' check (priority in ('baixa','media','alta','urgente')),
      status text not null default 'novo' check (status in ('novo','em_analise','planejado','concluido','arquivado')),
      description text not null,
      team_note text not null default '',
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table app_system_feedback_tickets add column if not exists unit_id uuid references app_units(id) on delete set null;
    alter table app_system_feedback_tickets add column if not exists title text;
    alter table app_system_feedback_tickets add column if not exists category text not null default 'melhoria';
    alter table app_system_feedback_tickets add column if not exists priority text not null default 'media';
    alter table app_system_feedback_tickets add column if not exists status text not null default 'novo';
    alter table app_system_feedback_tickets add column if not exists description text not null default '';
    alter table app_system_feedback_tickets add column if not exists team_note text not null default '';
    alter table app_system_feedback_tickets add column if not exists created_by uuid references app_users(id) on delete set null;
    alter table app_system_feedback_tickets add column if not exists created_at timestamptz not null default now();
    alter table app_system_feedback_tickets add column if not exists updated_at timestamptz not null default now();

    create index if not exists app_system_feedback_status_idx
      on app_system_feedback_tickets (status, created_at desc);

    create index if not exists app_system_feedback_creator_idx
      on app_system_feedback_tickets (created_by, created_at desc);

    create index if not exists app_system_feedback_unit_idx
      on app_system_feedback_tickets (unit_id, created_at desc);
  `,
  )
    .then(() => undefined)
    .catch((error) => {
      feedbackSchemaPromise = null;
      throw error;
    });

  return feedbackSchemaPromise;
}

function readString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isCategory(value: unknown): value is SystemFeedbackCategory {
  return (
    typeof value === "string" &&
    SYSTEM_FEEDBACK_CATEGORIES.includes(value as SystemFeedbackCategory)
  );
}

function isPriority(value: unknown): value is SystemFeedbackPriority {
  return (
    typeof value === "string" &&
    SYSTEM_FEEDBACK_PRIORITIES.includes(value as SystemFeedbackPriority)
  );
}

function isStatus(value: unknown): value is SystemFeedbackStatus {
  return (
    typeof value === "string" && SYSTEM_FEEDBACK_STATUSES.includes(value as SystemFeedbackStatus)
  );
}

function mapTicket(row: FeedbackTicketRow): SystemFeedbackTicket {
  return {
    id: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    title: row.title,
    category: row.category,
    priority: row.priority,
    status: row.status,
    description: row.description,
    teamNote: row.team_note ?? "",
    createdById: row.created_by,
    createdByName: row.created_by_name,
    createdByRole: row.created_by_role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listTickets(userId: string, manageAll: boolean) {
  const result = await queryDb<FeedbackTicketRow>(
    `
      select
        t.id,
        t.unit_id,
        un.name as unit_name,
        t.title,
        t.category,
        t.priority,
        t.status,
        t.description,
        t.team_note,
        t.created_by,
        u.name as created_by_name,
        u.role as created_by_role,
        t.created_at::text,
        t.updated_at::text
      from app_system_feedback_tickets t
      left join app_units un on un.id = t.unit_id
      left join app_users u on u.id = t.created_by
      where ($1::boolean or t.created_by = $2)
      order by
        case t.status
          when 'novo' then 1
          when 'em_analise' then 2
          when 'planejado' then 3
          when 'concluido' then 4
          else 5
        end,
        case t.priority
          when 'urgente' then 1
          when 'alta' then 2
          when 'media' then 3
          else 4
        end,
        t.created_at desc
    `,
    [manageAll, userId],
  );

  return result.rows.map(mapTicket);
}

async function getTicket(id: string) {
  const result = await queryDb<FeedbackTicketRow>(
    `
      select
        t.id,
        t.unit_id,
        un.name as unit_name,
        t.title,
        t.category,
        t.priority,
        t.status,
        t.description,
        t.team_note,
        t.created_by,
        u.name as created_by_name,
        u.role as created_by_role,
        t.created_at::text,
        t.updated_at::text
      from app_system_feedback_tickets t
      left join app_units un on un.id = t.unit_id
      left join app_users u on u.id = t.created_by
      where t.id = $1
      limit 1
    `,
    [id],
  );

  return result.rows[0] ? mapTicket(result.rows[0]) : null;
}

export const Route = createFileRoute("/api/system-feedback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!canAccessSystemFeedback(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        await ensureFeedbackSchema();

        const canManage = canManageSystemFeedback(session.user.role);
        const tickets = await listTickets(session.user.id, canManage);

        return Response.json(
          {
            tickets,
            canSubmit: canSubmitSystemFeedback(session.user.role),
            canManage,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!canSubmitSystemFeedback(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

        if (!body) {
          return Response.json({ ok: false, error: "Envio inválido." }, { status: 400 });
        }

        const unit = getUnitFromBody(session, body.unitId ?? session.activeUnit?.id);
        const title = readString(body.title, MAX_TITLE_LENGTH);
        const description = readString(body.description, MAX_DESCRIPTION_LENGTH);
        const category = isCategory(body.category) ? body.category : "melhoria";
        const priority = isPriority(body.priority) ? body.priority : "media";

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        if (!title || !description) {
          return Response.json(
            { ok: false, error: "Preencha o título e a descrição do feedback." },
            { status: 400 },
          );
        }

        await ensureFeedbackSchema();

        const result = await queryDb<FeedbackTicketRow>(
          `
            insert into app_system_feedback_tickets (
              unit_id,
              title,
              category,
              priority,
              description,
              created_by
            )
            values ($1, $2, $3, $4, $5, $6)
            returning
              id,
              unit_id,
              (select name from app_units where id = $1) as unit_name,
              title,
              category,
              priority,
              status,
              description,
              team_note,
              created_by,
              $7::text as created_by_name,
              $8::text as created_by_role,
              created_at::text,
              updated_at::text
          `,
          [
            unit.id,
            title,
            category,
            priority,
            description,
            session.user.id,
            session.user.name,
            session.user.role,
          ],
        );

        return Response.json({ ticket: mapTicket(result.rows[0]) }, { status: 201 });
      },
      PATCH: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!canManageSystemFeedback(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const ticketId = readString(body?.ticketId, 80);

        if (!ticketId || !isUuid(ticketId)) {
          return Response.json({ ok: false, error: "Ticket inválido." }, { status: 400 });
        }

        const nextStatus = isStatus(body?.status) ? body.status : null;
        const nextPriority = isPriority(body?.priority) ? body.priority : null;
        const nextTeamNote =
          typeof body?.teamNote === "string"
            ? readString(body.teamNote, MAX_TEAM_NOTE_LENGTH)
            : null;

        if (!nextStatus && !nextPriority && nextTeamNote === null) {
          return Response.json({ ok: false, error: "Nenhuma alteração enviada." }, { status: 400 });
        }

        await ensureFeedbackSchema();

        await queryDb(
          `
            update app_system_feedback_tickets
            set
              status = coalesce($2, status),
              priority = coalesce($3, priority),
              team_note = coalesce($4, team_note),
              updated_at = now()
            where id = $1
          `,
          [ticketId, nextStatus, nextPriority, nextTeamNote],
        );

        const ticket = await getTicket(ticketId);

        if (!ticket) {
          return Response.json({ ok: false, error: "Ticket não encontrado." }, { status: 404 });
        }

        return Response.json({ ticket });
      },
      DELETE: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!canManageSystemFeedback(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const ticketId = readString(body?.ticketId, 80);

        if (!ticketId || !isUuid(ticketId)) {
          return Response.json({ ok: false, error: "Ticket inválido." }, { status: 400 });
        }

        await ensureFeedbackSchema();
        await queryDb(
          `
            delete from app_system_feedback_tickets
            where id = $1
          `,
          [ticketId],
        );

        return Response.json({ ok: true });
      },
    },
  },
});
