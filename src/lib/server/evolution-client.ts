export function isEvolutionConfigured() {
  return Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY);
}

export class EvolutionRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EvolutionRequestError";
    this.status = status;
  }
}

function evolutionConfig() {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!url || !apiKey) {
    throw new Error("A Evolution API ainda não está configurada no servidor.");
  }

  return { url, apiKey };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function requestEvolution(path: string, init: RequestInit = {}) {
  const { url, apiKey } = evolutionConfig();
  const response = await fetch(`${url}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(20_000),
    headers: {
      apikey: apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let data: unknown = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const dataRecord = asRecord(data);
    const detail =
      typeof dataRecord.message === "string"
        ? dataRecord.message
        : typeof dataRecord.error === "string"
          ? dataRecord.error
          : text;
    throw new EvolutionRequestError(
      detail || `Evolution API respondeu com status ${response.status}.`,
      response.status,
    );
  }

  return data;
}

export function evolutionWebhookUrl(requestUrl: string, secret: string) {
  const configured = process.env.PUBLIC_APP_URL?.replace(/\/+$/, "");
  const origin = configured || new URL(requestUrl).origin;
  return `${origin}/api/webhooks/evolution?token=${encodeURIComponent(secret)}`;
}
