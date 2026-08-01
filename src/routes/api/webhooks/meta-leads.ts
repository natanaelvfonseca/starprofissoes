import { createFileRoute } from "@tanstack/react-router";
import { ensureMetaIntegration, receiveMetaWebhook } from "@/lib/server/meta-leads";

export const Route = createFileRoute("/api/webhooks/meta-leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const integration = await ensureMetaIntegration();

        if (mode === "subscribe" && token && token === integration.verify_token) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }

        return Response.json({ ok: false, error: "Verificação inválida." }, { status: 403 });
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const result = await receiveMetaWebhook(
          rawBody,
          request.headers.get("x-hub-signature-256"),
        );

        return Response.json(
          result.ok
            ? { ok: true, result: result.result, leadId: result.leadId ?? null }
            : { ok: false, error: result.error },
          { status: result.status },
        );
      },
    },
  },
});
