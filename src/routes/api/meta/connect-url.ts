import { createHmac, randomBytes } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { canConnectMetaAds } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";

const META_CONNECT_BASE_URL = "https://kogna.online/meta/connect";
const META_CONNECT_CLIENT = "star";

export const Route = createFileRoute("/api/meta/connect-url")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ error: "Não autenticado." }, { status: 401 });
        }

        if (!canConnectMetaAds(session.user.role)) {
          return Response.json({ error: "Acesso negado." }, { status: 403 });
        }

        const secret = process.env.KOGNA_META_CONNECT_SECRET?.trim();

        if (!secret) {
          return Response.json(
            { error: "A conexão segura com a Meta ainda não está configurada." },
            { status: 503 },
          );
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = randomBytes(24).toString("hex");
        const payload = `${META_CONNECT_CLIENT}|${timestamp}|${nonce}`;
        const signature = createHmac("sha256", secret).update(payload).digest("hex");
        const connectUrl = new URL(META_CONNECT_BASE_URL);

        connectUrl.searchParams.set("client", META_CONNECT_CLIENT);
        connectUrl.searchParams.set("ts", String(timestamp));
        connectUrl.searchParams.set("nonce", nonce);
        connectUrl.searchParams.set("sig", signature);

        return Response.json(
          { url: connectUrl.toString() },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
