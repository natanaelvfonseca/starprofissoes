import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { canViewManagement } from "@/lib/auth-types";
import type { LeadStage, PipelineColumn, PipelineType } from "@/lib/commercial-types";
import {
  ensureCommercialSchema,
  ensureDefaultPipelineColumns,
  getUnitFromBody,
  getUnitFromRequest,
  isUniqueError,
  isUuid,
} from "@/lib/server/commercial-schema";
import { getSessionFromRequest } from "@/lib/server/auth";
import { queryDb } from "@/lib/server/db";

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

const allowedColors = ["blue", "indigo", "gold", "orange", "green", "rose"] as const;

function mapColumn(row: PipelineColumnRow): PipelineColumn {
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

function parsePayload(body: unknown) {
  const data = body as {
    id?: unknown;
    unitId?: unknown;
    pipelineType?: unknown;
    name?: unknown;
    color?: unknown;
    position?: unknown;
  };
  const pipelineType = data?.pipelineType === "students" ? "students" : "leads";
  const color = allowedColors.includes(data?.color as (typeof allowedColors)[number])
    ? (data.color as string)
    : "blue";

  return {
    id: typeof data?.id === "string" ? data.id.trim() : "",
    unitId: data?.unitId,
    pipelineType: pipelineType as PipelineType,
    name: typeof data?.name === "string" ? data.name.trim() : "",
    color,
    position: Math.max(0, Number.parseInt(String(data?.position ?? "0"), 10) || 0),
  };
}

async function readColumns(unitId: string) {
  const result = await queryDb<PipelineColumnRow>(
    `
      select id, unit_id, pipeline_type, name, color, position, system_key, semantic_stage
      from app_pipeline_columns
      where unit_id = $1
      order by pipeline_type, position, created_at, name
    `,
    [unitId],
  );

  return result.rows.map(mapColumn);
}

export const Route = createFileRoute("/api/gestao/pipeline-columns")({
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
        return Response.json(
          { columns: await readColumns(unit.id) },
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

        const payload = parsePayload(await request.json().catch(() => null));
        const unit = getUnitFromBody(session, payload.unitId);
        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }
        if (payload.name.length < 2 || payload.name.length > 60) {
          return Response.json(
            { ok: false, error: "Informe um nome entre 2 e 60 caracteres." },
            { status: 400 },
          );
        }

        await ensureDefaultPipelineColumns(unit.id);
        const count = await queryDb<{ total: string }>(
          `select count(*)::text as total from app_pipeline_columns where unit_id = $1 and pipeline_type = $2`,
          [unit.id, payload.pipelineType],
        );
        if (Number(count.rows[0]?.total ?? 0) >= 12) {
          return Response.json(
            { ok: false, error: "Cada pipeline pode ter no máximo 12 colunas." },
            { status: 400 },
          );
        }

        try {
          const result = await queryDb<PipelineColumnRow>(
            `
              insert into app_pipeline_columns (
                unit_id, pipeline_type, name, color, position, semantic_stage, created_by
              )
              values ($1, $2, $3, $4, $5, $6, $7)
              returning id, unit_id, pipeline_type, name, color, position, system_key, semantic_stage
            `,
            [
              unit.id,
              payload.pipelineType,
              payload.name,
              payload.color,
              payload.position,
              payload.pipelineType === "leads" ? "Em contato" : null,
              session.user.id,
            ],
          );
          return Response.json({ column: mapColumn(result.rows[0]) }, { status: 201 });
        } catch (error) {
          if (isUniqueError(error)) {
            return Response.json(
              { ok: false, error: "Já existe uma coluna com esse nome." },
              { status: 409 },
            );
          }
          throw error;
        }
      },
      PATCH: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }
        if (!canViewManagement(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const payload = parsePayload(await request.json().catch(() => null));
        const unit = getUnitFromBody(session, payload.unitId);
        if (!unit || !isUuid(payload.id)) {
          return Response.json({ ok: false, error: "Coluna inválida." }, { status: 400 });
        }
        if (payload.name.length < 2 || payload.name.length > 60) {
          return Response.json(
            { ok: false, error: "Informe um nome entre 2 e 60 caracteres." },
            { status: 400 },
          );
        }

        await ensureCommercialSchema();
        try {
          const result = await queryDb<PipelineColumnRow>(
            `
              update app_pipeline_columns
              set name = $3, color = $4, position = $5, updated_at = now()
              where id = $1 and unit_id = $2
              returning id, unit_id, pipeline_type, name, color, position, system_key, semantic_stage
            `,
            [payload.id, unit.id, payload.name, payload.color, payload.position],
          );
          if (!result.rows[0]) {
            return Response.json({ ok: false, error: "Coluna não encontrada." }, { status: 404 });
          }
          return Response.json({ column: mapColumn(result.rows[0]) });
        } catch (error) {
          if (isUniqueError(error)) {
            return Response.json(
              { ok: false, error: "Já existe uma coluna com esse nome." },
              { status: 409 },
            );
          }
          throw error;
        }
      },
    },
  },
});
