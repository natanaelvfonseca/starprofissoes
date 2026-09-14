import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/server/auth";
import { canUseWhatsappSupervision, sendLeadershipMedia } from "@/lib/server/whatsapp-supervision";

export const Route = createFileRoute("/api/whatsapp-supervision/conversations/$id/media")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session)
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        if (!(await canUseWhatsappSupervision(session))) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }
        const length = Number(request.headers.get("content-length"));
        if (length > 12 * 1024 * 1024) {
          return Response.json(
            { ok: false, error: "O arquivo deve ter até 10 MB." },
            { status: 413 },
          );
        }
        try {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return Response.json({ ok: false, error: "Selecione um arquivo." }, { status: 400 });
          }
          const intervention = await sendLeadershipMedia(session, {
            conversationId: params.id,
            clientRequestId: String(form.get("clientRequestId") || ""),
            file,
            caption: String(form.get("caption") || ""),
            voiceNote: form.get("voiceNote") === "true",
          });
          if (!intervention) {
            return Response.json({ ok: false, error: "Conversa indisponível." }, { status: 403 });
          }
          return Response.json(
            { ok: true, intervention: { status: intervention.status } },
            { status: intervention.status === "pending" ? 202 : 200 },
          );
        } catch (error) {
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "Falha ao enviar arquivo.",
            },
            { status: 400 },
          );
        }
      },
    },
  },
});
