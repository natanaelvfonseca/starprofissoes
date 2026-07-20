import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { canViewManagement } from "@/lib/auth-types";
import type { AcquisitionChannelRecord, CommercialStatus } from "@/lib/commercial-types";
import {
  ensureDefaultAcquisitionChannels,
  getUnitFromBody,
  isUniqueError,
  isUuid,
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

export const Route = createFileRoute("/api/gestao/channels/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!canViewManagement(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        if (!isUuid(params.id)) {
          return Response.json({ ok: false, error: "Canal inválido." }, { status: 400 });
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
              update app_acquisition_channels
              set name = $3,
                  type = $4,
                  status = $5,
                  updated_at = now()
              where id = $1 and unit_id = $2
              returning id, unit_id, name, type, status, created_at::text
            `,
            [params.id, unit.id, payload.name, payload.type, payload.status],
          );

          const channel = result.rows[0];

          if (!channel) {
            return Response.json({ ok: false, error: "Canal não encontrado." }, { status: 404 });
          }

          return Response.json({ channel: mapChannel(channel) });
        } catch (error) {
          if (isUniqueError(error)) {
            return Response.json({ ok: false, error: "Canal já cadastrado." }, { status: 409 });
          }

          throw error;
        }
      },
      DELETE: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!isUuid(params.id)) {
          return Response.json({ ok: false, error: "Canal inválido." }, { status: 400 });
        }

        if (!canViewManagement(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const unit = getUnitFromBody(session, new URL(request.url).searchParams.get("unitId"));

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        await ensureDefaultAcquisitionChannels(unit.id);

        const result = await queryDb(
          `
            delete from app_acquisition_channels
            where id = $1 and unit_id = $2
          `,
          [params.id, unit.id],
        );

        if (!result.rowCount) {
          return Response.json({ ok: false, error: "Canal não encontrado." }, { status: 404 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
