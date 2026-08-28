import { createFileRoute } from "@tanstack/react-router";
import { canViewFinancial } from "@/lib/auth-types";
import { FinancialFilterError } from "@/lib/financial-filters";
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
        try {
          return Response.json(
            { collections: await listTodayCollections(unit.id, new URL(request.url).searchParams) },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          const invalid = error instanceof FinancialFilterError;
          return Response.json(
            { error: invalid ? error.message : "Falha ao consultar as cobranças." },
            { status: invalid ? 400 : 500 },
          );
        }
      },
    },
  },
});
