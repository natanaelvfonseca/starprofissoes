import { createFileRoute } from "@tanstack/react-router";
import {
  canAccessSalesAi,
  upsertSalesScript,
} from "@/lib/server/sales-conversation-ai";
import { getSessionFromRequest } from "@/lib/server/auth";

export const Route = createFileRoute("/api/ia-comercial/scripts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await getSessionFromRequest(request);

          if (!session) {
            return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
          }

          if (!canAccessSalesAi(session)) {
            return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
          }

          const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

          if (!body) {
            return Response.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
          }

          const result = await upsertSalesScript(session, {
            unitId: body.unitId,
            courseId: body.courseId,
            title: body.title,
            scriptBody: body.scriptBody,
            active: body.active,
          });

          if ("error" in result) {
            return Response.json({ ok: false, error: result.error }, { status: result.status });
          }

          return Response.json({ ok: true, script: result.script }, { status: 201 });
        } catch (error) {
          return Response.json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Falha ao salvar o script comercial.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
