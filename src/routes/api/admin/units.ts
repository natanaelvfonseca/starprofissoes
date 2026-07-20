import { createFileRoute } from "@tanstack/react-router";
import { canManageUnits } from "@/lib/auth-types";
import { getSessionFromRequest, slugifyUnitName } from "@/lib/server/auth";
import { queryDb, withTransaction } from "@/lib/server/db";

type UnitRow = {
  id: string;
  name: string;
  slug: string;
};

function isUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export const Route = createFileRoute("/api/admin/units")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        return Response.json(
          { units: session.units },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!session.canCreateUnits) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = await request.json().catch(() => null);
        const name = typeof body?.name === "string" ? body.name.trim() : "";

        if (name.length < 2) {
          return Response.json({ ok: false, error: "Informe o nome da unidade." }, { status: 400 });
        }

        try {
          const result = await queryDb<UnitRow>(
            `
              insert into app_units (name, slug)
              values ($1, $2)
              returning id, name, slug
            `,
            [name, slugifyUnitName(name)],
          );

          return Response.json({ unit: result.rows[0] }, { status: 201 });
        } catch (error) {
          if (isUniqueError(error)) {
            return Response.json({ ok: false, error: "Unidade já cadastrada." }, { status: 409 });
          }

          throw error;
        }
      },
      PUT: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!canManageUnits(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = await request.json().catch(() => null);
        const unitId = typeof body?.unitId === "string" ? body.unitId.trim() : "";
        const name = typeof body?.name === "string" ? body.name.trim() : "";

        if (!unitId || name.length < 2) {
          return Response.json({ ok: false, error: "Informe o nome da unidade." }, { status: 400 });
        }

        if (!session.units.some((unit) => unit.id === unitId)) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        try {
          const result = await queryDb<UnitRow>(
            `
              update app_units
              set name = $2, slug = $3, updated_at = now()
              where id = $1 and status = 'active'
              returning id, name, slug
            `,
            [unitId, name, slugifyUnitName(name)],
          );
          const unit = result.rows[0];

          if (!unit) {
            return Response.json({ ok: false, error: "Unidade não encontrada." }, { status: 404 });
          }

          return Response.json({ unit });
        } catch (error) {
          if (isUniqueError(error)) {
            return Response.json({ ok: false, error: "Unidade já cadastrada." }, { status: 409 });
          }

          throw error;
        }
      },
      DELETE: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!canManageUnits(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = await request.json().catch(() => null);
        const unitId = typeof body?.unitId === "string" ? body.unitId.trim() : "";

        if (!unitId) {
          return Response.json({ ok: false, error: "Unidade inválida." }, { status: 400 });
        }

        if (!session.units.some((unit) => unit.id === unitId)) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        const result = await withTransaction(async (client) => {
          const unitResult = await client.query<UnitRow>(
            `
              select id, name, slug
              from app_units
              where id = $1 and status = 'active'
              for update
            `,
            [unitId],
          );
          const unit = unitResult.rows[0];

          if (!unit) {
            return { status: "not_found" as const };
          }

          const userResult = await client.query<{ count: number }>(
            `
              select count(distinct user_id)::integer as count
              from (
                select id as user_id from app_users where primary_unit_id = $1
                union
                select user_id from app_user_units where unit_id = $1
              ) linked_users
            `,
            [unitId],
          );

          if (userResult.rows[0].count > 0) {
            return { status: "has_users" as const };
          }

          await client.query("delete from app_units where id = $1", [unitId]);
          return { status: "deleted" as const };
        });

        if (result.status === "not_found") {
          return Response.json({ ok: false, error: "Unidade não encontrada." }, { status: 404 });
        }

        if (result.status === "has_users") {
          return Response.json(
            {
              ok: false,
              error: "A unidade possui usuários vinculados. Remova-os antes de excluir a unidade.",
            },
            { status: 409 },
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
