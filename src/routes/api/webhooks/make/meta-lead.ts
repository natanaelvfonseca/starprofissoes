import { createFileRoute } from "@tanstack/react-router";
import { archiveMakeMetaLead } from "@/lib/server/make-meta-archive";
import { handleMakeMetaLeadRequest, makeMetaBridgeMode } from "@/lib/server/make-meta-bridge";
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

        const processor =
          makeMetaBridgeMode(process.env.MAKE_META_BRIDGE_MODE) === "archive"
            ? archiveMakeMetaLead
            : receiveMakeMetaLead;
        const result = await handleMakeMetaLeadRequest(request, secret, processor);
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
