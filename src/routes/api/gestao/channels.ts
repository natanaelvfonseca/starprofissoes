import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { canViewManagement } from "@/lib/auth-types";
import type { AcquisitionChannelRecord, CommercialStatus } from "@/lib/commercial-types";
import {
  ensureDefaultAcquisitionChannels,
  getUnitFromBody,
  getUnitFromRequest,
  isUniqueError,
} from "@/lib/server/commercial-schema";
import { getSessionFromRequest } from "@/lib/server/auth";
import { queryDb } from "@/lib/server/db";

type ChannelRow = QueryResultRow & {
  id: string;
  unit_id: string;
  name: string;
  type: string;
  status: CommercialStatus;
  created_at: string;
};

function mapChannel(row: ChannelRow): AcquisitionChannelRecord {
  return {
    id: row.id,
    unitId: row.unit_id,
    name: row.name,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
  };
}

function parseChannelPayload(body: unknown) {
  const data = body as {
    name?: unknown;
    type?: unknown;
    status?: unknown;
    unitId?: unknown;
  };

  return {
    name: typeof data?.name === "string" ? data.name.trim() : "",
    type: typeof data?.type === "string" ? data.type.trim() : "",
    status: data?.status === "inactive" ? "inactive" : "active",
    unitId: data?.unitId,
  };
}

export const Route = createFileRoute("/api/gestao/channels")({
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

        await ensureDefaultAcquisitionChannels(unit.id);

        const result = await queryDb<ChannelRow>(
          `
            select id, unit_id, name, type, status, created_at::text
            from app_acquisition_channels
            where unit_id = $1
            order by
              case status when 'active' then 1 else 2 end,
              name asc
          `,
          [unit.id],
        );

        return Response.json(
          { channels: result.rows.map(mapChannel) },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!canViewManagement(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = await request.json().catch(() => null);
        const payload = parseChannelPayload(body);
        const unit = getUnitFromBody(session, payload.unitId);

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        if (!payload.name || !payload.type) {
          return Response.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
        }

        await ensureDefaultAcquisitionChannels(unit.id);

        try {
          const result = await queryDb<ChannelRow>(
            `
              insert into app_acquisition_channels (unit_id, name, type, status, created_by)
              values ($1, $2, $3, $4, $5)
              returning id, unit_id, name, type, status, created_at::text
            `,
            [unit.id, payload.name, payload.type, payload.status, session.user.id],
          );

          return Response.json({ channel: mapChannel(result.rows[0]) }, { status: 201 });
        } catch (error) {
          if (isUniqueError(error)) {
            return Response.json({ ok: false, error: "Canal já cadastrado." }, { status: 409 });
          }

          throw error;
        }
      },
    },
  },
});
