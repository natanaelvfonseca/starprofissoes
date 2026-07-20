import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import type { LeadStage } from "@/lib/commercial-types";
import {
  canAccessLeadTransferCenter,
  canTransferLeadsImmediately,
} from "@/lib/auth-types";
import {
  ensureCommercialSchema,
  getUnitFromBody,
  getUnitFromRequest,
  isUuid,
} from "@/lib/server/commercial-schema";
import { getSessionFromRequest } from "@/lib/server/auth";
import { queryDb, withTransaction } from "@/lib/server/db";

type TransferUserRow = QueryResultRow & {
  id: string;
  name: string;
  email: string;
  role: string;
};

type TransferLeadRow = QueryResultRow & {
  id: string;
  full_name: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  city: string | null;
  course_name_snapshot: string | null;
  acquisition_channel_name_snapshot: string | null;
  stage: LeadStage;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  created_by_role: string | null;
  campaign_name: string | null;
  ad_name: string | null;
  age_hours: number | string;
  transferable: boolean;
};

type ExistingTaskTableRow = QueryResultRow & {
  table_name: string | null;
};

type TransferableLeadIdRow = QueryResultRow & {
  id: string;
  created_by: string | null;
};

const MAX_TRANSFER_LEADS = 250;

function uniqueUuidList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(isUuid),
    ),
  ).slice(0, MAX_TRANSFER_LEADS);
}

function mapTransferLead(row: TransferLeadRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    phone2: row.phone2,
    email: row.email,
    city: row.city,
    courseName: row.course_name_snapshot,
    acquisitionChannelName: row.acquisition_channel_name_snapshot,
    stage: row.stage,
    createdAt: row.created_at,
    createdById: row.created_by,
    createdByName: row.created_by_name,
    createdByRole: row.created_by_role,
    campaignName: row.campaign_name,
    adName: row.ad_name,
    ageHours: Number(row.age_hours) || 0,
    transferable: row.transferable,
  };
}

async function listAssignableUsers(unitId: string) {
  const result = await queryDb<TransferUserRow>(
    `
      select distinct
        u.id,
        u.name,
        u.email,
        u.role
      from app_users u
      left join app_user_units uu on uu.user_id = u.id and uu.unit_id = $1
      where u.status = 'active'
        and (
          u.primary_unit_id = $1
          or uu.user_id is not null
          or u.role in ('DEV', 'CEO', 'CVO', 'MARKETING')
        )
      order by u.name asc
    `,
    [unitId],
  );

  return result.rows;
}

async function listTransferLeads(unitId: string, immediateTransfer: boolean, includeMetaEvents: boolean) {
  const metaSelect = includeMetaEvents
    ? "meta.campaign_name, meta.ad_name,"
    : "null::text as campaign_name, null::text as ad_name,";
  const metaJoin = includeMetaEvents
    ? `
      left join lateral (
        select e.campaign_name, e.ad_name
        from app_meta_lead_events e
        where e.lead_id = l.id
        order by e.received_at desc
        limit 1
      ) meta on true
    `
    : "";
  const result = await queryDb<TransferLeadRow>(
    `
      select
        l.id,
        l.full_name,
        l.phone,
        l.phone2,
        l.email,
        l.city,
        l.course_name_snapshot,
        l.acquisition_channel_name_snapshot,
        l.stage,
        l.created_at::text,
        l.created_by,
        owner.name as created_by_name,
        owner.role as created_by_role,
        ${metaSelect}
        floor(extract(epoch from (now() - l.created_at)) / 3600)::int as age_hours,
        ($2::boolean or l.created_at <= now() - interval '48 hours') as transferable
      from app_leads l
      left join app_users owner on owner.id = l.created_by
      ${metaJoin}
      where l.unit_id = $1
        and l.stage <> 'Matriculado'
      order by
        owner.name nulls first,
        l.created_at asc,
        l.full_name asc
    `,
    [unitId, immediateTransfer],
  );

  return result.rows.map(mapTransferLead);
}

async function appCrmTasksExists() {
  const result = await queryDb<ExistingTaskTableRow>(
    `select to_regclass('public.app_crm_tasks')::text as table_name`,
  );

  return Boolean(result.rows[0]?.table_name);
}

async function appMetaLeadEventsExists() {
  const result = await queryDb<ExistingTaskTableRow>(
    `select to_regclass('public.app_meta_lead_events')::text as table_name`,
  );

  return Boolean(result.rows[0]?.table_name);
}

export const Route = createFileRoute("/api/crm/transfer")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Nao autenticado." }, { status: 401 });
        }

        if (!canAccessLeadTransferCenter(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const unit = getUnitFromRequest(session, request);

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponivel." }, { status: 403 });
        }

        await ensureCommercialSchema();

        const immediateTransfer = canTransferLeadsImmediately(session.user.role);
        const [users, metaEventsExists] = await Promise.all([
          listAssignableUsers(unit.id),
          appMetaLeadEventsExists(),
        ]);
        const leads = await listTransferLeads(unit.id, immediateTransfer, metaEventsExists);

        return Response.json(
          {
            consultants: users,
            users,
            leads,
            policy: {
              immediateTransfer,
              requires48Hours: !immediateTransfer,
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Nao autenticado." }, { status: 401 });
        }

        if (!canAccessLeadTransferCenter(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const unit = getUnitFromBody(session, body?.unitId ?? session.activeUnit?.id);
        const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
        const leadIds = uniqueUuidList(body?.leadIds);

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponivel." }, { status: 403 });
        }

        if (!isUuid(targetUserId)) {
          return Response.json({ ok: false, error: "Usuario invalido." }, { status: 400 });
        }

        if (!leadIds.length) {
          return Response.json(
            { ok: false, error: "Selecione ao menos um lead." },
            { status: 400 },
          );
        }

        await ensureCommercialSchema();

        const immediateTransfer = canTransferLeadsImmediately(session.user.role);
        const targetResult = await queryDb<TransferUserRow>(
          `
            select distinct
              u.id,
              u.name,
              u.email,
              u.role
            from app_users u
            left join app_user_units uu on uu.user_id = u.id and uu.unit_id = $2
            where u.id = $1
              and u.status = 'active'
              and (
                u.primary_unit_id = $2
                or uu.user_id is not null
                or u.role in ('DEV', 'CEO', 'CVO', 'MARKETING')
              )
            limit 1
          `,
          [targetUserId, unit.id],
        );

        if (!targetResult.rows[0]) {
          return Response.json(
            { ok: false, error: "Usuario de destino indisponivel." },
            { status: 404 },
          );
        }

        const eligibleResult = await queryDb<TransferableLeadIdRow>(
          `
            select id, created_by
            from app_leads
            where id = any($1::uuid[])
              and unit_id = $2
              and stage <> 'Matriculado'
              and ($3::boolean or created_at <= now() - interval '48 hours')
          `,
          [leadIds, unit.id, immediateTransfer],
        );
        const eligibleIds = eligibleResult.rows.map((row) => row.id);

        if (eligibleIds.length !== leadIds.length) {
          return Response.json(
            {
              ok: false,
              error: immediateTransfer
                ? "Ha leads selecionados fora da unidade ou ja matriculados."
                : "Ha leads selecionados sem 48 horas de criacao ou fora da unidade.",
            },
            { status: 400 },
          );
        }

        const [tasksTableExists, metaEventsTableExists] = await Promise.all([
          appCrmTasksExists(),
          appMetaLeadEventsExists(),
        ]);
        await withTransaction(async (client) => {
          await client.query(
            `
              insert into app_lead_owner_transfers (
                unit_id,
                lead_id,
                previous_owner_id,
                next_owner_id,
                transferred_by,
                reason
              )
              select
                unit_id,
                id,
                created_by,
                $2,
                $4,
                $5
              from app_leads
              where id = any($1::uuid[])
                and unit_id = $3
                and created_by is distinct from $2
            `,
            [
              eligibleIds,
              targetUserId,
              unit.id,
              session.user.id,
              immediateTransfer
                ? "Transferencia imediata pela central de transferencias"
                : "Transferencia apos 48 horas",
            ],
          );

          await client.query(
            `
              update app_leads
              set created_by = $2,
                  updated_at = now()
              where id = any($1::uuid[])
                and unit_id = $3
            `,
            [eligibleIds, targetUserId, unit.id],
          );

          if (tasksTableExists) {
            await client.query(
              `
                update app_crm_tasks
                set created_by = $2,
                    updated_at = now()
                where lead_id = any($1::uuid[])
                  and status <> 'archived'
              `,
              [eligibleIds, targetUserId],
            );
          }

          if (metaEventsTableExists) {
            await client.query(
              `
                update app_meta_lead_events
                set assigned_user_id = $2,
                    updated_at = now()
                where lead_id = any($1::uuid[])
              `,
              [eligibleIds, targetUserId],
            );
          }
        });

        return Response.json({
          ok: true,
          transferredIds: eligibleIds,
          targetUser: targetResult.rows[0],
        });
      },
    },
  },
});
