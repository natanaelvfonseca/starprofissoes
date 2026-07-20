import { createFileRoute } from "@tanstack/react-router";
import {
  canAccessSalesAi,
  listSalesAiDashboard,
} from "@/lib/server/sales-conversation-ai";
import { getSessionFromRequest } from "@/lib/server/auth";

export const Route = createFileRoute("/api/ia-comercial")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await getSessionFromRequest(request);

          if (!session) {
            return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
          }

          if (!canAccessSalesAi(session)) {
            return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
          }

          const url = new URL(request.url);
          const data = await listSalesAiDashboard(session, url.searchParams.get("unitId"));

          if (!data) {
            return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
          }

          return Response.json(
            { ok: true, ...data },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          return Response.json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Falha ao carregar a IA comercial.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
