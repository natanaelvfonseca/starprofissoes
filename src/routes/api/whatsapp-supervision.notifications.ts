import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/server/auth";
import { listWhatsappNotifications, markWhatsappNotificationRead } from "@/lib/server/whatsapp-supervision";

export const Route = createFileRoute("/api/whatsapp-supervision/notifications")({
  server: { handlers: {
    GET: async ({ request }) => {
      const session = await getSessionFromRequest(request);
      if (!session) return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
      return Response.json({ ok: true, notifications: await listWhatsappNotifications(session) },
        { headers: { "Cache-Control": "no-store" } });
    },
    PATCH: async ({ request }) => {
      const session = await getSessionFromRequest(request);
      if (!session) return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
      const body = await request.json().catch(() => null);
      await markWhatsappNotificationRead(session, String(body?.notificationId || ""));
      return Response.json({ ok: true });
    },
  } },
});
