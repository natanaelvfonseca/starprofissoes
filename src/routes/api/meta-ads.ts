import { createFileRoute } from "@tanstack/react-router";
import { canManageMetaAds, canViewMetaAds } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getUnitFromBody, getUnitFromRequest } from "@/lib/server/commercial-schema";
import {
  assertMetaPageInUnit,
  completeMetaOAuthUnitContext,
  disconnectAllMetaPages,
  disconnectMetaPage,
  duplicateMetaForm,
  importHistoricalMetaLeads,
  listMetaState,
  reprocessMetaEvent,
  resetMetaConnection,
  subscribeMetaPage,
  syncFormsForPage,
  upsertMetaForm,
  upsertMetaIntegration,
  upsertMetaPage,
  validateMetaPageToken,
} from "@/lib/server/meta-leads";

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação do Meta Ads.";
}

export const Route = createFileRoute("/api/meta-ads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canViewMetaAds(session.user.role)) {
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        }

        const unit = getUnitFromRequest(session, request);
        if (!unit) return Response.json({ error: "Unidade inválida." }, { status: 403 });

        const search = new URL(request.url).searchParams.get("search") ?? "";
        return Response.json(await listMetaState(unit.id, search), {
          headers: { "Cache-Control": "no-store" },
        });
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canManageMetaAds(session.user.role)) {
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const action = typeof body?.action === "string" ? body.action : "";
        const unit = getUnitFromBody(session, body?.unitId);
        if (!unit) return Response.json({ error: "Unidade inválida." }, { status: 403 });

        try {
          if (action === "saveIntegration") {
            return Response.json({
              integration: await upsertMetaIntegration(body ?? {}, session.user.id),
            });
          }
          if (action === "savePage") {
            return Response.json({ page: await upsertMetaPage(body ?? {}, unit.id) });
          }
          if (action === "saveForm") {
            return Response.json({ form: await upsertMetaForm(body ?? {}, unit.id) });
          }
          if (action === "duplicateForm") {
            return Response.json({ form: await duplicateMetaForm(body ?? {}, unit.id) });
          }
          if (action === "syncForms") {
            const pageDbId = String(body?.pageDbId ?? "");
            await assertMetaPageInUnit(pageDbId, unit.id);
            return Response.json({ result: await syncFormsForPage(pageDbId) });
          }
          if (action === "validatePage") {
            const pageDbId = String(body?.pageDbId ?? "");
            await assertMetaPageInUnit(pageDbId, unit.id);
            return Response.json({
              result: await validateMetaPageToken(pageDbId),
            });
          }
          if (action === "subscribePage") {
            const pageDbId = String(body?.pageDbId ?? "");
            await assertMetaPageInUnit(pageDbId, unit.id);
            return Response.json({ result: await subscribeMetaPage(pageDbId) });
          }
          if (action === "disconnectPage") {
            return Response.json({
              result: await disconnectMetaPage(String(body?.pageId ?? ""), unit.id),
            });
          }
          if (action === "disconnectMeta") {
            return Response.json({ result: await disconnectAllMetaPages(unit.id) });
          }
          if (action === "resetMeta") {
            return Response.json({ result: await resetMetaConnection(unit.id) });
          }
          if (action === "completeMetaConnect") {
            return Response.json({ result: await completeMetaOAuthUnitContext(session.user.id) });
          }
          if (action === "reprocessEvent") {
            return Response.json({
              result: await reprocessMetaEvent(String(body?.eventId ?? ""), unit.id),
            });
          }
          if (action === "importHistoricalLeads") {
            const pageDbId = String(body?.pageDbId ?? "");
            await assertMetaPageInUnit(pageDbId, unit.id);
            return Response.json({
              result: await importHistoricalMetaLeads(
                pageDbId,
                unit.id,
                typeof body?.formDbId === "string" ? body.formDbId : undefined,
              ),
            });
          }

          return Response.json({ error: "Ação inválida." }, { status: 400 });
        } catch (error) {
          return Response.json({ error: messageFromError(error) }, { status: 400 });
        }
      },
    },
  },
});
