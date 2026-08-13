import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  listSupervisionMessages,
  sendLeadershipReply,
} from "@/lib/server/whatsapp-supervision";

export const Route = createFileRoute("/api/whatsapp-supervision/conversations/$id")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const session = await getSessionFromRequest(request);
      if (!session) return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
      const messages = await listSupervisionMessages(session, params.id, new URL(request.url).searchParams.get("before"));
      if (!messages) return Response.json({ ok: false, error: "Conversa indisponível." }, { status: 403 });
      return Response.json({ ok: true, messages }, { headers: { "Cache-Control": "no-store" } });
    },
    POST: async ({ request, params }) => {
      const session = await getSessionFromRequest(request);
      if (!session) return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
      const body = await request.json().catch(() => null);
      try {
        const intervention = await sendLeadershipReply(session, {
          conversationId: params.id, clientRequestId: String(body?.clientRequestId || ""),
          text: String(body?.text || ""),
        });
        if (!intervention) return Response.json({ ok: false, error: "Conversa indisponível." }, { status: 403 });
        return Response.json({ ok: true, intervention }, { status: intervention.status === "pending" ? 202 : 200 });
      } catch (error) {
        return Response.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao responder." }, { status: 400 });
      }
    },
  } },
});
