import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/server/auth";
import { upsertTeamContact } from "@/lib/server/team-communications";

export const Route = createFileRoute("/api/team/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.activeUnit)
          return Response.json({ error: "Não autenticado." }, { status: 401 });
        const body = (await request.json().catch(() => null)) as {
          phone?: unknown;
          optIn?: unknown;
        } | null;
        if (!body || typeof body.phone !== "string" || typeof body.optIn !== "boolean") {
          return Response.json({ error: "Informe telefone e autorização." }, { status: 400 });
        }
        try {
          await upsertTeamContact(session.activeUnit.id, session.user.id, body.phone, body.optIn);
          return Response.json({ ok: true });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Erro ao salvar." },
            { status: 400 },
          );
        }
      },
    },
  },
});
