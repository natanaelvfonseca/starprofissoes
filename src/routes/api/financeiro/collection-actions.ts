import { createFileRoute } from "@tanstack/react-router";
import { canViewFinancial } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { createCollectionAction } from "@/lib/server/financial";
import { financialError, financialUnitFromBody } from "@/lib/server/financial-auth";

export const Route = createFileRoute("/api/financeiro/collection-actions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canViewFinancial(session.user.role))
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const unit = financialUnitFromBody(session, body);
        if (!unit) return Response.json({ error: "Unidade inválida." }, { status: 403 });
        try {
          return Response.json(
            { action: await createCollectionAction(unit.id, session.user.id, body ?? {}) },
            { status: 201 },
          );
        } catch (error) {
          return Response.json({ error: financialError(error) }, { status: 400 });
        }
      },
    },
  },
});
