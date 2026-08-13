import { createFileRoute } from "@tanstack/react-router";
import { isDevRole, type UserRole } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getWhatsappFeatureRoles, setWhatsappFeatureRole } from "@/lib/server/whatsapp-supervision";

export const Route = createFileRoute("/api/whatsapp-supervision/access")({
  server: { handlers: {
    GET: async ({ request }) => {
      const session = await getSessionFromRequest(request);
      if (!session || !isDevRole(session.user.role)) return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
      return Response.json({ ok: true, roles: await getWhatsappFeatureRoles() });
    },
    PATCH: async ({ request }) => {
      const session = await getSessionFromRequest(request);
      if (!session || !isDevRole(session.user.role)) return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
      const body = await request.json().catch(() => null);
      await setWhatsappFeatureRole(String(body?.role || "") as UserRole, Boolean(body?.enabled), session.user.id);
      return Response.json({ ok: true, roles: await getWhatsappFeatureRoles() });
    },
  } },
});
