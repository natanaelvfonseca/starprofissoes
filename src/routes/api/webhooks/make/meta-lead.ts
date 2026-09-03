import { createFileRoute } from "@tanstack/react-router";
import { handleMakeMetaLeadRequest } from "@/lib/server/make-meta-bridge";
import { receiveMakeMetaLead } from "@/lib/server/meta-leads";

export const Route = createFileRoute("/api/webhooks/make/meta-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.MAKE_META_BRIDGE_SECRET?.trim();

        if (!secret) {
          return Response.json(
            { ok: false, error: "O bridge Make ainda não está configurado." },
            { status: 503 },
          );
        }

        const result = await handleMakeMetaLeadRequest(request, secret, receiveMakeMetaLead);
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
