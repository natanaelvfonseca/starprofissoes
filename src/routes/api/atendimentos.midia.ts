import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getAttendanceMedia, requireAttendanceAccess } from "@/lib/server/attendances";

export const Route = createFileRoute("/api/atendimentos/midia")({
  server: { handlers: { GET: async ({ request }) => {
    const session = await getSessionFromRequest(request);
    if (!requireAttendanceAccess(session) || !session) {
      return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
    }
    const params = new URL(request.url).searchParams;
    try {
      const media = await getAttendanceMedia(session, {
        consultantId: params.get("consultantId") || "",
        unitId: params.get("unitId"), remoteJid: params.get("remoteJid") || "",
        messageId: params.get("messageId") || "", direction: params.get("direction"),
        type: params.get("type"),
      });
      if (!media) return Response.json({ ok: false, error: "Mídia indisponível." }, { status: 404 });
      return new Response(new Uint8Array(media.buffer), {
        headers: {
          "Content-Type": media.mimeType,
          "Content-Disposition": `inline; filename="${media.fileName.replace(/["\\]/g, "_")}"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    } catch {
      return Response.json({ ok: false, error: "Não foi possível carregar a mídia." }, { status: 502 });
    }
  } } },
});
