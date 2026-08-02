import { createFileRoute } from "@tanstack/react-router";
import { canManageWhatsappLabelAutomation } from "@/lib/auth-types";
import {
  getUnitFromBody,
  getUnitFromRequest,
  isUuid,
} from "@/lib/server/commercial-schema";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  deleteEvolutionLabelRule,
  getEvolutionLabelAutomationDashboard,
  saveEvolutionLabelRule,
  updateEvolutionLabelRule,
} from "@/lib/server/evolution-label-automation";

async function requireManager(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { response: Response.json({ ok: false, error: "Não autenticado." }, { status: 401 }) };
  }
  if (!canManageWhatsappLabelAutomation(session.user.role)) {
    return { response: Response.json({ ok: false, error: "Acesso negado." }, { status: 403 }) };
  }
  return { session };
}

function badRequest(message: string) {
  return Response.json({ ok: false, error: message }, { status: 400 });
}

export const Route = createFileRoute("/api/integrations/evolution-labels")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireManager(request);
        if ("response" in auth) return auth.response;

        const unit = getUnitFromRequest(auth.session, request);
        if (!unit) return badRequest("Unidade indisponível.");
        const instanceId = new URL(request.url).searchParams.get("instanceId")?.trim() ?? "";
        if (instanceId && !isUuid(instanceId)) return badRequest("Instância inválida.");

        const dashboard = await getEvolutionLabelAutomationDashboard({
          unitId: unit.id,
          instanceId,
          requestUrl: request.url,
        });
        return Response.json(
          { ok: true, ...dashboard },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const auth = await requireManager(request);
        if ("response" in auth) return auth.response;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const unit = getUnitFromBody(auth.session, body?.unitId);
        const instanceId = typeof body?.instanceId === "string" ? body.instanceId.trim() : "";
        const labelId = typeof body?.labelId === "string" ? body.labelId.trim() : "";
        const pipelineColumnId =
          typeof body?.pipelineColumnId === "string" ? body.pipelineColumnId.trim() : "";

        if (!unit || !isUuid(instanceId) || !labelId || !isUuid(pipelineColumnId)) {
          return badRequest("Instância, etiqueta ou etapa inválida.");
        }

        try {
          const rule = await saveEvolutionLabelRule({
            unitId: unit.id,
            instanceId,
            labelId,
            pipelineColumnId,
            active: body?.active !== false,
            userId: auth.session.user.id,
          });
          return Response.json({ ok: true, rule }, { status: 201 });
        } catch (error) {
          return badRequest(error instanceof Error ? error.message : "Falha ao salvar a regra.");
        }
      },
      PATCH: async ({ request }) => {
        const auth = await requireManager(request);
        if ("response" in auth) return auth.response;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const unit = getUnitFromBody(auth.session, body?.unitId);
        const ruleId = typeof body?.ruleId === "string" ? body.ruleId.trim() : "";
        const pipelineColumnId =
          typeof body?.pipelineColumnId === "string" ? body.pipelineColumnId.trim() : "";

        if (!unit || !isUuid(ruleId) || !isUuid(pipelineColumnId)) {
          return badRequest("Regra ou etapa inválida.");
        }

        try {
          const rule = await updateEvolutionLabelRule({
            unitId: unit.id,
            ruleId,
            pipelineColumnId,
            active: body?.active !== false,
          });
          return Response.json({ ok: true, rule });
        } catch (error) {
          return badRequest(error instanceof Error ? error.message : "Falha ao atualizar a regra.");
        }
      },
      DELETE: async ({ request }) => {
        const auth = await requireManager(request);
        if ("response" in auth) return auth.response;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const unit = getUnitFromBody(auth.session, body?.unitId);
        const ruleId = typeof body?.ruleId === "string" ? body.ruleId.trim() : "";

        if (!unit || !isUuid(ruleId)) return badRequest("Regra inválida.");

        try {
          await deleteEvolutionLabelRule(unit.id, ruleId);
          return Response.json({ ok: true });
        } catch (error) {
          return badRequest(error instanceof Error ? error.message : "Falha ao excluir a regra.");
        }
      },
    },
  },
});
