import { createFileRoute } from "@tanstack/react-router";
import { isDevRole } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { whatsappOperationalStatus } from "@/lib/server/whatsapp-conversation-ai";
import {
  canUseWhatsappSupervision,
  listSupervisionConsultants,
  listSupervisionConversations,
  reconcileCanonicalHistory,
} from "@/lib/server/whatsapp-supervision";

export const Route = createFileRoute("/api/whatsapp-supervision")({
  server: { handlers: { GET: async ({ request }) => {
    const session = await getSessionFromRequest(request);
    if (!session) return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    if (!(await canUseWhatsappSupervision(session))) {
      return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
    }
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "consultants";
    if (view === "status") {
      if (!isDevRole(session.user.role)) return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
      return Response.json({ ok: true, status: await whatsappOperationalStatus() });
    }
    if (view === "reconcile") {
      if (!isDevRole(session.user.role)) return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
      return Response.json({ ok: true, processed: await reconcileCanonicalHistory() });
    }
    if (view === "conversations") {
      const conversations = await listSupervisionConversations(session, {
        consultantId: url.searchParams.get("consultantId") || "",
        unitId: url.searchParams.get("unitId"), search: url.searchParams.get("search"),
        before: url.searchParams.get("before"), limit: Number(url.searchParams.get("limit")),
      });
      if (!conversations) return Response.json({ ok: false, error: "Escopo inválido." }, { status: 403 });
      return Response.json({ ok: true, conversations }, { headers: { "Cache-Control": "no-store" } });
    }
    const consultants = await listSupervisionConsultants(session, url.searchParams.get("unitId"));
    if (!consultants) return Response.json({ ok: false, error: "Escopo inválido." }, { status: 403 });
    return Response.json({ ok: true, consultants }, { headers: { "Cache-Control": "no-store" } });
  } } },
});
