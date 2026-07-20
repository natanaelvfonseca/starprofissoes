import { createFileRoute } from "@tanstack/react-router";
import { canOperateCrm } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  connectEvolution,
  disconnectEvolution,
  getEvolutionState,
} from "@/lib/server/evolution-whatsapp";

async function requireSession(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session?.activeUnit) {
    return { response: Response.json({ ok: false, error: "Não autenticado." }, { status: 401 }) };
  }
  if (!canOperateCrm(session.user.role)) {
    return { response: Response.json({ ok: false, error: "Acesso negado." }, { status: 403 }) };
  }
  return { session, activeUnit: session.activeUnit };
}

export const Route = createFileRoute("/api/integrations/evolution")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireSession(request);
        if ("response" in auth) return auth.response;

        const state = await getEvolutionState(auth.session.user.id, auth.activeUnit.id);
        return Response.json({ ok: true, ...state }, { headers: { "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        const auth = await requireSession(request);
        if ("response" in auth) return auth.response;

        const body = (await request.json().catch(() => null)) as {
          action?: string;
        } | null;

        try {
          if (body?.action === "connect") {
            const result = await connectEvolution(
              auth.activeUnit,
              {
                id: auth.session.user.id,
                email: auth.session.user.email,
                name: auth.session.user.name,
              },
              request.url,
            );
            return Response.json({ ok: true, ...result });
          }

          if (body?.action === "disconnect") {
            await disconnectEvolution(auth.session.user.id, auth.activeUnit.id);
            return Response.json({ ok: true });
          }

          return Response.json({ ok: false, error: "Ação inválida." }, { status: 400 });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Falha na integração." },
            { status: 400 },
          );
        }
      },
    },
  },
});
