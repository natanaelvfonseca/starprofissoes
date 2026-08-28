import { createFileRoute } from "@tanstack/react-router";
import { canViewFinancial } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { listTodayCollections } from "@/lib/server/financial";
import { financialUnitFromRequest } from "@/lib/server/financial-auth";

export const Route = createFileRoute("/api/financeiro/collections/today")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canViewFinancial(session.user.role))
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        const unit = financialUnitFromRequest(session, request);
        if (!unit) return Response.json({ error: "Unidade inválida." }, { status: 403 });
        return Response.json(
          { collections: await listTodayCollections(unit.id) },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
