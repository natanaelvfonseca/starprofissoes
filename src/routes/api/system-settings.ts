import { createFileRoute } from "@tanstack/react-router";
import { isDevRole } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getSystemSettings, saveSystemLocked } from "@/lib/server/system-settings";

export const Route = createFileRoute("/api/system-settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        return Response.json(
          { settings: await getSystemSettings() },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      PATCH: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!isDevRole(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = await request.json().catch(() => null);
        const systemLocked = Boolean(body?.systemLocked);

        return Response.json(
          { settings: await saveSystemLocked(systemLocked, session.user.id) },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
