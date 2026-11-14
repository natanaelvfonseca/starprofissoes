import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/commercial-schema";
import { listTeamNotifications, markTeamNotificationRead } from "@/lib/server/team-communications";

export const Route = createFileRoute("/api/team/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.activeUnit)
          return Response.json({ error: "Não autenticado." }, { status: 401 });
        try {
          const items = await listTeamNotifications(session.activeUnit.id, session.user.id);
          return Response.json(
            { notifications: items },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (error) {
          console.error("[team/notifications] GET", error);
          return Response.json({ error: "Falha ao carregar avisos." }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.activeUnit)
          return Response.json({ error: "Não autenticado." }, { status: 401 });
        const body = (await request.json().catch(() => null)) as { id?: string } | null;
        if (!isUuid(body?.id ?? ""))
          return Response.json({ error: "Aviso inválido." }, { status: 400 });
        await markTeamNotificationRead(session.activeUnit.id, session.user.id, body!.id!);
        return Response.json({ ok: true });
      },
    },
  },
});
