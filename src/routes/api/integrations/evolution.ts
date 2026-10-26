import { createFileRoute } from "@tanstack/react-router";
import { canOperateCrm } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { EvolutionRequestError } from "@/lib/server/evolution-client";
import {
  connectEvolution,
  disconnectEvolution,
  getEvolutionQrCode,
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

function evolutionErrorResponse(
  error: unknown,
  context: { action: string; userId: string; unitId: string },
) {
  console.error("[Evolution] Falha na conexão do WhatsApp", {
    ...context,
    status: error instanceof EvolutionRequestError ? error.status : null,
    error: error instanceof Error ? error.message : "Erro desconhecido",
  });

  return Response.json(
    {
      ok: false,
      error:
        error instanceof EvolutionRequestError
          ? "A API do WhatsApp não concluiu a conexão. Gere um novo QR Code e tente novamente."
          : error instanceof Error
            ? error.message
            : "Falha na integração.",
    },
    { status: error instanceof EvolutionRequestError ? 502 : 400 },
  );
}

export const Route = createFileRoute("/api/integrations/evolution")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireSession(request);
        if ("response" in auth) return auth.response;

        try {
          const state = await getEvolutionState(
            auth.session.user.id,
            auth.activeUnit.id,
            request.url,
          );
          const includeQrCode = new URL(request.url).searchParams.get("includeQrCode") === "1";
          const qrCode =
            includeQrCode && state.instance?.status !== "connected"
              ? await getEvolutionQrCode(auth.session.user.id, auth.activeUnit.id)
              : null;

          return Response.json(
            { ok: true, ...state, qrCode },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          return evolutionErrorResponse(error, {
            action: "refresh",
            userId: auth.session.user.id,
            unitId: auth.activeUnit.id,
          });
        }
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
          return evolutionErrorResponse(error, {
            action: body?.action ?? "invalid",
            userId: auth.session.user.id,
            unitId: auth.activeUnit.id,
          });
        }
      },
    },
  },
});
