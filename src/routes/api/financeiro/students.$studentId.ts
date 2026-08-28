import { createFileRoute } from "@tanstack/react-router";
import { canViewFinancial } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getFinancialStudentProfile } from "@/lib/server/financial";
import { financialUnitFromRequest } from "@/lib/server/financial-auth";

export const Route = createFileRoute("/api/financeiro/students/$studentId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canViewFinancial(session.user.role))
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        const unit = financialUnitFromRequest(session, request);
        if (!unit) return Response.json({ error: "Unidade inválida." }, { status: 403 });
        const profile = await getFinancialStudentProfile(unit.id, params.studentId);
        return profile
          ? Response.json(profile, { headers: { "Cache-Control": "no-store" } })
          : Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      },
    },
  },
});
