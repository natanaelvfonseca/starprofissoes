import { createFileRoute } from "@tanstack/react-router";
import { LeadOwnershipError, assumeLeadOwnership } from "@/lib/lead-ownership";
import { getSessionFromRequest } from "@/lib/server/auth";
import { ensureCommercialSchema, getUnitFromBody, isUuid } from "@/lib/server/commercial-schema";
import { withTransaction } from "@/lib/server/db";

export const Route = createFileRoute("/api/crm/leads/$id/assume")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }
        if (session.user.role !== "CONSULTOR") {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const unit = getUnitFromBody(session, body?.unitId);
        const expectedOwnerId =
          typeof body?.expectedOwnerId === "string" ? body.expectedOwnerId.trim() : "";

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }
        if (!isUuid(params.id) || !isUuid(expectedOwnerId)) {
          return Response.json(
            { ok: false, error: "Lead ou responsável inválido." },
            { status: 400 },
          );
        }

        await ensureCommercialSchema();

        try {
          const result = await withTransaction((client) =>
            assumeLeadOwnership(client, {
              leadId: params.id,
              unitId: unit.id,
              userId: session.user.id,
              expectedOwnerId,
            }),
          );

          return Response.json({
            ok: true,
            changed: result.changed,
            createdById: session.user.id,
            createdByName: session.user.name,
          });
        } catch (error) {
          if (error instanceof LeadOwnershipError) {
            return Response.json({ ok: false, error: error.message }, { status: error.status });
          }
          throw error;
        }
      },
    },
  },
});
