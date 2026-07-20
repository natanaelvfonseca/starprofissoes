import { createFileRoute } from "@tanstack/react-router";
import { receiveEvolutionWebhook } from "@/lib/server/evolution-whatsapp";

export const Route = createFileRoute("/api/webhooks/evolution")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, service: "evolution-webhook" }),
      POST: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        const payload = await request.json().catch(() => null);
        const result = await receiveEvolutionWebhook(payload, token);

        if (!result.ok) {
          return Response.json(
            { ok: false, error: "Webhook não autorizado." },
            { status: result.status },
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
