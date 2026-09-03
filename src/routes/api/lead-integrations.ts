import { createFileRoute } from "@tanstack/react-router";
import { canManageMetaAds } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import {
  listMakeMetaConnections,
  saveMakeMetaConnection,
} from "@/lib/server/make-meta-connections";

export const Route = createFileRoute("/api/lead-integrations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
        if (!canManageMetaAds(session.user.role)) {
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        }

        return Response.json(await listMakeMetaConnections(session.units.map((unit) => unit.id)), {
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
        try {
          return Response.json({
            result: await saveMakeMetaConnection(
              typeof body?.formId === "string" ? body.formId : "",
              typeof body?.turmaId === "string" ? body.turmaId : "",
              session.units.map((unit) => unit.id),
            ),
          });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Falha ao salvar conexão." },
            { status: 400 },
          );
        }
      },
    },
  },
});
