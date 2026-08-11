import { createFileRoute } from "@tanstack/react-router";
import { canManageMetaAds, canViewMetaAds } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  disconnectAllMetaPages,
  disconnectMetaPage,
  duplicateMetaForm,
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

        const search = new URL(request.url).searchParams.get("search") ?? "";
        return Response.json(await listMetaState(search), {
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

        try {
          if (action === "saveIntegration") {
            return Response.json({
              integration: await upsertMetaIntegration(body ?? {}, session.user.id),
            });
          }
          if (action === "savePage") {
            return Response.json({ page: await upsertMetaPage(body ?? {}) });
          }
          if (action === "saveForm") {
            return Response.json({ form: await upsertMetaForm(body ?? {}) });
          }
          if (action === "duplicateForm") {
            return Response.json({ form: await duplicateMetaForm(body ?? {}) });
          }
          if (action === "syncForms") {
            return Response.json({ result: await syncFormsForPage(String(body?.pageDbId ?? "")) });
          }
          if (action === "validatePage") {
            return Response.json({
              result: await validateMetaPageToken(String(body?.pageDbId ?? "")),
            });
          }
          if (action === "subscribePage") {
            return Response.json({ result: await subscribeMetaPage(String(body?.pageDbId ?? "")) });
          }
          if (action === "disconnectPage") {
            return Response.json({
              result: await disconnectMetaPage(String(body?.pageId ?? "")),
            });
          }
          if (action === "disconnectMeta") {
            return Response.json({ result: await disconnectAllMetaPages() });
          }
          if (action === "resetMeta") {
            return Response.json({ result: await resetMetaConnection() });
          }
          if (action === "reprocessEvent") {
            return Response.json({ result: await reprocessMetaEvent(String(body?.eventId ?? "")) });
          }

          return Response.json({ error: "Ação inválida." }, { status: 400 });
        } catch (error) {
          return Response.json({ error: messageFromError(error) }, { status: 400 });
        }
      },
    },
  },
});
