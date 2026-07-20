import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { canViewManagement } from "@/lib/auth-types";
import type { CommercialStatus, CourseRecord } from "@/lib/commercial-types";
import {
  ensureCommercialSchema,
  getUnitFromBody,
  isUniqueError,
  isUuid,
} from "@/lib/server/commercial-schema";
import { getSessionFromRequest } from "@/lib/server/auth";
import { queryDb } from "@/lib/server/db";

type CourseRow = QueryResultRow & {
  id: string;
  unit_id: string;
  name: string;
  value: string;
  category: string | null;
  status: CommercialStatus;
  created_at: string;
};

function mapCourse(row: CourseRow): CourseRecord {
  return {
    id: row.id,
    unitId: row.unit_id,
    name: row.name,
    value: Number(row.value),
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
  };
}

function parseCoursePayload(body: unknown) {
  const data = body as {
    name?: unknown;
    value?: unknown;
    category?: unknown;
    status?: unknown;
    unitId?: unknown;
  };
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  const value =
    typeof data?.value === "number"
      ? data.value
      : Number(String(data?.value ?? "").replace(",", "."));
  const category = typeof data?.category === "string" ? data.category.trim() : "";
  const status = data?.status === "inactive" ? "inactive" : "active";

  return { name, value, category, status, unitId: data?.unitId };
}

export const Route = createFileRoute("/api/gestao/courses/$id")({
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
          return Response.json({ ok: false, error: "Curso inválido." }, { status: 400 });
        }

        const body = await request.json().catch(() => null);
        const payload = parseCoursePayload(body);
        const unit = getUnitFromBody(session, payload.unitId);

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        if (!payload.name || Number.isNaN(payload.value) || payload.value < 0) {
          return Response.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
        }

        await ensureCommercialSchema();

        try {
          const result = await queryDb<CourseRow>(
            `
              update app_courses
              set name = $3,
                  value = $4,
                  category = nullif($5, ''),
                  status = $6,
                  updated_at = now()
              where id = $1 and unit_id = $2
              returning id, unit_id, name, value::text, category, status, created_at::text
            `,
            [params.id, unit.id, payload.name, payload.value, payload.category, payload.status],
          );

          const course = result.rows[0];

          if (!course) {
            return Response.json({ ok: false, error: "Curso não encontrado." }, { status: 404 });
          }

          return Response.json({ course: mapCourse(course) });
        } catch (error) {
          if (isUniqueError(error)) {
            return Response.json({ ok: false, error: "Curso já cadastrado." }, { status: 409 });
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
          return Response.json({ ok: false, error: "Curso inválido." }, { status: 400 });
        }

        if (!canViewManagement(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const unit = getUnitFromBody(session, new URL(request.url).searchParams.get("unitId"));

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        await ensureCommercialSchema();

        const result = await queryDb(
          `
            delete from app_courses
            where id = $1 and unit_id = $2
          `,
          [params.id, unit.id],
        );

        if (!result.rowCount) {
          return Response.json({ ok: false, error: "Curso não encontrado." }, { status: 404 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
