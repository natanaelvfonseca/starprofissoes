import { createHash, timingSafeEqual } from "node:crypto";

export type MakeMetaLeadPayload = {
  leadgen_id: string;
  form_id: string;
  form_name: string | null;
  page_id: string;
  name: string;
  phone: string;
  email: string | null;
  created_time: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
};

type MakeMetaProcessorResult = {
  ok: boolean;
  status: number;
  result?: string;
  leadId?: string | null;
  error?: string;
};

type MakeMetaProcessor = (payload: MakeMetaLeadPayload) => Promise<MakeMetaProcessorResult>;

function stringValue(value: unknown, required = false) {
  if (typeof value !== "string") return required ? null : "";
  const normalized = value.trim();
  return normalized || (required ? null : "");
}

function optionalString(value: unknown) {
  return stringValue(value) || null;
}

export function parseMakeMetaLeadPayload(value: unknown): MakeMetaLeadPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const payload = value as Record<string, unknown>;
  const leadgenId = stringValue(payload.leadgen_id, true);
  const formId = stringValue(payload.form_id, true);
  const pageId = stringValue(payload.page_id, true);
  const name = stringValue(payload.name, true);
  const phone = stringValue(payload.phone, true);
  const createdTime = optionalString(payload.created_time);

  if (
    !leadgenId ||
    !formId ||
    !pageId ||
    !name ||
    !phone ||
    (createdTime && Number.isNaN(Date.parse(createdTime)))
  ) {
    return null;
  }

  return {
    leadgen_id: leadgenId,
    form_id: formId,
    form_name: optionalString(payload.form_name),
    page_id: pageId,
    name,
    phone,
    email: optionalString(payload.email),
    created_time: createdTime,
    campaign_id: optionalString(payload.campaign_id),
    campaign_name: optionalString(payload.campaign_name),
    adset_id: optionalString(payload.adset_id),
    adset_name: optionalString(payload.adset_name),
    ad_id: optionalString(payload.ad_id),
    ad_name: optionalString(payload.ad_name),
  };
}

export function verifyMakeMetaBearer(authorization: string | null, secret: string) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1] || !secret) return false;

  const expected = createHash("sha256").update(secret).digest();
  const provided = createHash("sha256").update(match[1].trim()).digest();
  return timingSafeEqual(expected, provided);
}

export async function handleMakeMetaLeadRequest(
  request: Request,
  secret: string,
  processPayload: MakeMetaProcessor,
) {
  if (!verifyMakeMetaBearer(request.headers.get("Authorization"), secret)) {
    return { status: 401, body: { ok: false, error: "Não autorizado." } };
  }

  const body = await request.json().catch(() => null);
  const payload = parseMakeMetaLeadPayload(body);

  if (!payload) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "Payload inválido. leadgen_id, form_id, page_id, name e phone são obrigatórios.",
      },
    };
  }

  try {
    const result = await processPayload(payload);
    return { status: result.status, body: result };
  } catch (error) {
    console.error("[Make Meta Bridge] Falha ao processar lead", {
      leadgen_id: payload.leadgen_id,
      form_id: payload.form_id,
      page_id: payload.page_id,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    return {
      status: 500,
      body: { ok: false, error: "Falha ao processar o lead recebido do Make." },
    };
  }
}
