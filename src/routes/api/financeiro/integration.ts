import { createFileRoute } from "@tanstack/react-router";
import { canManageFinancialIntegration, canViewFinancial } from "@/lib/auth-types";
import { financialIntegrationResponse } from "@/lib/financial-unit-state";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  financialError,
  financialUnitFromBody,
  financialUnitFromRequest,
} from "@/lib/server/financial-auth";
import {
  getFinancialIntegrationState,
  saveFinancialIntegration,
  testFinancialIntegration,
} from "@/lib/server/financial";

export const Route = createFileRoute("/api/financeiro/integration")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canViewFinancial(session.user.role))
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        const unit = financialUnitFromRequest(session, request);
        if (!unit) return Response.json({ error: "Unidade inválida." }, { status: 403 });
        const state = await getFinancialIntegrationState(unit.id);
        return Response.json(financialIntegrationResponse(state), {
          headers: { "Cache-Control": "no-store" },
        });
      },
      PUT: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canManageFinancialIntegration(session.user.role))
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const unit = financialUnitFromBody(session, body);
        if (!unit) return Response.json({ error: "Unidade inválida." }, { status: 403 });
        try {
          return Response.json({
            integration: await saveFinancialIntegration(unit.id, body ?? {}),
          });
        } catch (error) {
          return Response.json({ error: financialError(error) }, { status: 400 });
        }
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
          return Response.json({
            result: await testFinancialIntegration(
              unit.id,
              typeof body?.token === "string" ? body.token : undefined,
            ),
          });
        } catch (error) {
          return Response.json({ error: financialError(error) }, { status: 400 });
        }
      },
    },
  },
});
