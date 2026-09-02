import { createHmac } from "node:crypto";

export type MetaGraphErrorDetails = {
  httpStatus: number;
  type: string | null;
  code: string | null;
  subcode: string | null;
  fbtraceId: string | null;
  message: string;
};

type MetaGraphErrorPayload = {
  message?: unknown;
  type?: unknown;
  code?: unknown;
  error_subcode?: unknown;
  fbtrace_id?: unknown;
};

type MetaGraphPage<T> = {
  data?: Array<T>;
  paging?: { next?: unknown };
  error?: MetaGraphErrorPayload;
};

type FetchLike = typeof fetch;

export class MetaGraphApiError extends Error {
  readonly details: MetaGraphErrorDetails;

  constructor(details: MetaGraphErrorDetails) {
    super(details.message);
    this.name = "MetaGraphApiError";
    this.details = details;
  }
}

function stringValue(value: unknown) {
  return value === undefined || value === null || value === "" ? null : String(value);
}

function graphUrl(value: string | URL) {
  const url = new URL(value);

  if (url.protocol !== "https:" || url.hostname !== "graph.facebook.com") {
    throw new Error("URL inválida da Graph API.");
  }

  // Paging URLs can contain the access token. Authentication always stays in the header.
  url.searchParams.delete("access_token");
  return url;
}

function appSecretProof(token: string, appSecret?: string | null) {
  return appSecret ? createHmac("sha256", appSecret).update(token).digest("hex") : null;
}

export function metaGraphErrorDetails(error: unknown): MetaGraphErrorDetails | null {
  return error instanceof MetaGraphApiError ? error.details : null;
}

export async function metaGraphRequest<T>(
  urlValue: string | URL,
  options: {
    token: string;
    appSecret?: string | null;
    method?: "GET" | "POST";
    body?: URLSearchParams;
    fetchImpl?: FetchLike;
  },
) {
  const url = graphUrl(urlValue);
  const proof = appSecretProof(options.token, options.appSecret);
  if (proof) url.searchParams.set("appsecret_proof", proof);

  const response = await (options.fetchImpl ?? fetch)(url, {
    method: options.method ?? "GET",
    headers: { Authorization: `Bearer ${options.token}` },
    body: options.body,
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: MetaGraphErrorPayload;
  };

  if (!response.ok || payload.error) {
    const graphError = payload.error;
    throw new MetaGraphApiError({
      httpStatus: response.status,
      type: stringValue(graphError?.type),
      code: stringValue(graphError?.code),
      subcode: stringValue(graphError?.error_subcode),
      fbtraceId: stringValue(graphError?.fbtrace_id),
      message:
        stringValue(graphError?.message) ??
        `A Graph API retornou HTTP ${response.status || "desconhecido"}.`,
    });
  }

  return payload;
}

export async function fetchAllMetaGraphPages<T>(
  initialUrl: string | URL,
  options: {
    token: string;
    appSecret?: string | null;
    fetchImpl?: FetchLike;
    maxPages?: number;
  },
) {
  const items: Array<T> = [];
  const visited = new Set<string>();
  let nextUrl: URL | null = graphUrl(initialUrl);
  let pages = 0;

  while (nextUrl) {
    const currentUrl: URL = nextUrl;
    const key = currentUrl.toString();
    if (visited.has(key)) throw new Error("Paginação repetida da Graph API.");
    visited.add(key);

    if (pages >= (options.maxPages ?? 100)) {
      throw new Error("A paginação da Graph API excedeu o limite de segurança.");
    }

    const payload: MetaGraphPage<T> = await metaGraphRequest<MetaGraphPage<T>>(currentUrl, options);
    items.push(...(Array.isArray(payload.data) ? payload.data : []));
    pages += 1;
    nextUrl = typeof payload.paging?.next === "string" ? graphUrl(payload.paging.next) : null;
  }

  return { items, pages };
}

export type MetaPageSubscription = {
  id?: string;
  name?: string;
  subscribed_fields?: Array<string>;
};

export async function getMetaPageLeadgenSubscription(
  graphApiVersion: string,
  pageId: string,
  appId: string,
  options: { token: string; appSecret?: string | null; fetchImpl?: FetchLike },
) {
  const url = new URL(
    `https://graph.facebook.com/${graphApiVersion}/${encodeURIComponent(pageId)}/subscribed_apps`,
  );
  url.searchParams.set("fields", "id,name,subscribed_fields");
  const payload = await metaGraphRequest<{ data?: Array<MetaPageSubscription> }>(url, options);
  const app = (payload.data ?? []).find((item) => String(item.id) === appId) ?? null;

  return {
    subscribed: Boolean(app),
    leadgenSubscribed: Boolean(app?.subscribed_fields?.includes("leadgen")),
    app,
  };
}

export async function ensureMetaPageLeadgenSubscription(
  graphApiVersion: string,
  pageId: string,
  appId: string,
  options: { token: string; appSecret?: string | null; fetchImpl?: FetchLike },
) {
  const current = await getMetaPageLeadgenSubscription(graphApiVersion, pageId, appId, options);
  if (current.leadgenSubscribed) return { ...current, changed: false };

  const url = `https://graph.facebook.com/${graphApiVersion}/${encodeURIComponent(pageId)}/subscribed_apps`;
  await metaGraphRequest<{ success?: boolean }>(url, {
    ...options,
    method: "POST",
    body: new URLSearchParams({ subscribed_fields: "leadgen" }),
  });
  const confirmed = await getMetaPageLeadgenSubscription(graphApiVersion, pageId, appId, options);

  if (!confirmed.leadgenSubscribed) {
    throw new Error("A Meta não confirmou a inscrição leadgen da Página.");
  }

  return { ...confirmed, changed: true };
}
