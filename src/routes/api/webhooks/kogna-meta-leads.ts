import { createFileRoute } from "@tanstack/react-router";
import { handleKognaMetaRelay } from "@/lib/server/kogna-meta-relay";
import { receiveKognaMetaWebhook } from "@/lib/server/meta-leads";

export const Route = createFileRoute("/api/webhooks/kogna-meta-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.KOGNA_META_CONNECT_SECRET?.trim();

        if (!secret) {
          return Response.json(
            { ok: false, error: "O relay seguro da Meta ainda não está configurado." },
            { status: 503 },
          );
        }

        const rawBody = Buffer.from(await request.arrayBuffer());
        const result = await handleKognaMetaRelay(
          rawBody,
          request.headers.get("X-Kogna-Signature"),
          secret,
          receiveKognaMetaWebhook,
        );

        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
