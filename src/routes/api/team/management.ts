import { createFileRoute } from "@tanstack/react-router";
import { canTransferLeads } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  connectTeamSender,
  disconnectTeamSender,
  listTeamCommunications,
  refreshTeamSender,
  teamSenderQr,
  updateSenderSettings,
  updateTeamRule,
  type AlertKind,
} from "@/lib/server/team-communications";

export const Route = createFileRoute("/api/team/management")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.activeUnit)
          return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canTransferLeads(session.user.role))
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        try {
          const settings = await listTeamCommunications(session.activeUnit.id);
          return Response.json(settings, { headers: { "Cache-Control": "private, no-store" } });
        } catch (error) {
          console.error("[team/management] GET", error);
          return Response.json({ error: "Falha ao consultar configurações." }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.activeUnit)
          return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canTransferLeads(session.user.role))
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return Response.json({ error: "Requisição inválida." }, { status: 400 });
        const unitId = session.activeUnit.id;
        try {
          if (body.action === "connect") {
            return Response.json({
              ok: true,
              ...(await connectTeamSender(unitId, session.user.id, request.url)),
            });
          }
          if (body.action === "disconnect") {
            await disconnectTeamSender(unitId);
            return Response.json({ ok: true });
          }
          if (body.action === "state") {
            return Response.json({ ok: true, ...(await refreshTeamSender(unitId)) });
          }
          if (body.action === "qr") {
            const qrCode = await teamSenderQr(unitId);
            return Response.json({ ok: true, qrCode });
          }
          if (body.action === "sender_settings") {
            const settings = await updateSenderSettings(unitId, body);
            return Response.json({ ok: true, settings });
          }
          if (body.action === "rule") {
            await updateTeamRule(
              unitId,
              session.user.id,
              String(body.kind) as AlertKind,
              body.enabled === true,
              Number(body.threshold),
            );
            return Response.json({ ok: true });
          }
          return Response.json({ error: "Ação inválida." }, { status: 400 });
        } catch (error) {
          console.error(
            "[team/management] POST:",
            body.action,
            error instanceof Error ? error.message : "Erro",
          );
          return Response.json(
            { error: error instanceof Error ? error.message : "Falha na operação." },
            { status: 400 },
          );
        }
      },
    },
  },
});
