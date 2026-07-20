import { createFileRoute } from "@tanstack/react-router";
import {
  SESSION_COOKIE_NAME,
  getCookie,
  getSessionFromRequest,
  hashSessionToken,
} from "@/lib/server/auth";
import { queryDb } from "@/lib/server/db";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        return Response.json(session, {
          headers: { "Cache-Control": "no-store" },
        });
      },
      PATCH: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const activeUnitId = typeof body?.activeUnitId === "string" ? body.activeUnitId : "";
        const activeUnit = session.units.find((unit) => unit.id === activeUnitId);

        if (!activeUnit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        const token = getCookie(request, SESSION_COOKIE_NAME);

        if (!token) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        await queryDb(
          `
            update app_sessions
            set active_unit_id = $2, last_seen_at = now()
            where token_hash = $1 and revoked_at is null and expires_at > now()
          `,
          [hashSessionToken(token), activeUnit.id],
        );

        return Response.json(
          {
            ...session,
            activeUnit,
          },
          {
            headers: { "Cache-Control": "no-store" },
          },
        );
      },
    },
  },
});
