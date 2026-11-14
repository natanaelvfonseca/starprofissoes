import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/server/auth";

// Unidades são administradas fora do CRM. Mantemos somente a leitura para o
// cadastro de usuários e o seletor da unidade ativa, sem mutações públicas.
const disabled = () =>
  Response.json(
    { ok: false, error: "A gestão de unidades está desativada neste CRM." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );

export const Route = createFileRoute("/api/admin/units")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session)
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        return Response.json(
          { units: session.units },
          {
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      },
      POST: disabled,
      PUT: disabled,
      DELETE: disabled,
    },
  },
});
