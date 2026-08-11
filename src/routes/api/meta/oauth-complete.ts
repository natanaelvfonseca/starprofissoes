import { createHmac, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import {
  getMetaIntegration,
  subscribeMetaPage,
  syncFormsForPage,
  upsertMetaIntegration,
  upsertMetaPage,
  validateMetaPageToken,
} from "@/lib/server/meta-leads";

type MetaOAuthCompletePayload = {
  client?: unknown;
  page?: unknown;
  business?: unknown;
  ad_accounts?: unknown;
};

type MetaOAuthPage = {
  id: string;
  name: string;
  accessToken: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsePage(value: unknown): MetaOAuthPage | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = requiredString(value.id);
  const name = requiredString(value.name);
  const accessToken = requiredString(value.access_token);

  return id && name && accessToken ? { id, name, accessToken } : null;
}

function hasValidSignature(rawBody: Buffer, signature: string | null, secret: string) {
  const providedHex = signature?.trim();

  if (!providedHex || !/^[0-9a-f]{64}$/i.test(providedHex)) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(providedHex, "hex");

  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export const Route = createFileRoute("/api/meta/oauth-complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.KOGNA_META_CONNECT_SECRET?.trim();

        if (!secret) {
          return Response.json(
            { error: "A conexão segura com a Meta ainda não está configurada." },
            { status: 503 },
          );
        }

        const rawBody = Buffer.from(await request.arrayBuffer());
        const signature = request.headers.get("X-Kogna-Signature");

        if (!hasValidSignature(rawBody, signature, secret)) {
          return Response.json({ error: "Assinatura inválida." }, { status: 401 });
        }

        let payload: MetaOAuthCompletePayload;

        try {
          payload = JSON.parse(rawBody.toString("utf8")) as MetaOAuthCompletePayload;
        } catch {
          return Response.json({ error: "JSON inválido." }, { status: 400 });
        }

        if (!isRecord(payload) || payload.client !== "star") {
          return Response.json({ error: "Cliente inválido." }, { status: 400 });
        }

        const page = parsePage(payload.page);

        if (!page) {
          return Response.json({ error: "Página inválida." }, { status: 400 });
        }

        try {
          const integration = await getMetaIntegration();
          const savedPage = await upsertMetaPage({
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.accessToken,
            status: "active",
          });

          await upsertMetaIntegration({
            appId: integration.app_id,
            appSecret: integration.app_secret,
            verifyToken: integration.verify_token,
            graphApiVersion: integration.graph_api_version,
            status: "active",
            callbackUrl: integration.callback_url,
          });

          const validation = await validateMetaPageToken(savedPage.id);

          if (!validation.valid) {
            throw new Error("A Meta rejeitou o token da página.");
          }

          const subscription = await subscribeMetaPage(savedPage.id);

          if (!subscription.subscribed) {
            throw new Error("Não foi possível inscrever a página no webhook.");
          }

          await syncFormsForPage(savedPage.id);

          return Response.json({
            success: true,
            connected: true,
            page: {
              id: page.id,
              name: page.name,
            },
          });
        } catch (error) {
          console.error("[Meta Ads] Falha ao concluir OAuth", {
            pageId: page.id,
            pageName: page.name,
            error: error instanceof Error ? error.message : "Erro desconhecido",
          });
          return Response.json(
            {
              error:
                error instanceof Error && error.message
                  ? error.message
                  : "Falha ao concluir a conexão Meta.",
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
