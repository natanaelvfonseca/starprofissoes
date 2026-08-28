import { createFileRoute } from "@tanstack/react-router";
import { canManageFinancialIntegration, canViewFinancial } from "@/lib/auth-types";
import { FinancialIntegrationStateError } from "@/lib/financial-unit-state";
import { getSessionFromRequest } from "@/lib/server/auth";
import { enqueueFinancialSync, listFinancialSyncRuns } from "@/lib/server/financial";
import {
  financialError,
  financialUnitFromBody,
  financialUnitFromRequest,
} from "@/lib/server/financial-auth";

export const Route = createFileRoute("/api/financeiro/sync")({
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
          { runs: await listFinancialSyncRuns(unit.id) },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canManageFinancialIntegration(session.user.role))
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const unit = financialUnitFromBody(session, body);
        if (!unit) return Response.json({ error: "Unidade inválida." }, { status: 403 });
        try {
          return Response.json({ run: await enqueueFinancialSync(unit.id) }, { status: 202 });
        } catch (error) {
          return Response.json(
            { error: financialError(error) },
            { status: error instanceof FinancialIntegrationStateError ? error.status : 400 },
          );
        }
      },
    },
  },
});
