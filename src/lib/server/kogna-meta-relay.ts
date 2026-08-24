import { createHmac, timingSafeEqual } from "node:crypto";

type RelayProcessor = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

type RelayResult = {
  status: number;
  body: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function verifyKognaMetaSignature(
  rawBody: Buffer,
  signature: string | null,
  secret: string,
) {
  const providedHex = signature?.trim();

  if (!providedHex || !/^[0-9a-f]{64}$/i.test(providedHex)) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(providedHex, "hex");

  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function handleKognaMetaRelay(
  rawBody: Buffer,
  signature: string | null,
  secret: string,
  processPayload: RelayProcessor,
): Promise<RelayResult> {
  if (!signature?.trim()) {
    return { status: 401, body: { ok: false, error: "Assinatura ausente." } };
  }

  if (!verifyKognaMetaSignature(rawBody, signature, secret)) {
    return { status: 403, body: { ok: false, error: "Assinatura inválida." } };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { status: 400, body: { ok: false, error: "JSON inválido." } };
  }

  if (!isRecord(payload) || payload.client !== "star") {
    return { status: 400, body: { ok: false, error: "Cliente inválido." } };
  }

  try {
    const result = await processPayload(payload);
    const status = typeof result.status === "number" ? result.status : 200;

    return { status, body: result };
  } catch (error) {
    console.error("[Meta Ads] Falha ao processar relay da Kogna", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    return { status: 500, body: { ok: false, error: "Falha ao processar evento Meta." } };
  }
}
