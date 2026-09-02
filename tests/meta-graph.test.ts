import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureMetaPageLeadgenSubscription,
  fetchAllMetaGraphPages,
  MetaGraphApiError,
} from "../src/lib/server/meta-graph.ts";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("paginação Meta percorre paging.next e não expõe token na URL", async () => {
  const calls: Array<string> = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    assert.equal(url.searchParams.has("access_token"), false);
    return calls.length === 1
      ? jsonResponse({
          data: [{ id: "form-1" }],
          paging: {
            next: "https://graph.facebook.com/v23.0/page/leadgen_forms?after=abc&access_token=segredo",
          },
        })
      : jsonResponse({ data: [{ id: "form-2" }] });
  };

  const result = await fetchAllMetaGraphPages<{ id: string }>(
    "https://graph.facebook.com/v23.0/page/leadgen_forms?limit=100",
    { token: "segredo", fetchImpl },
  );

  assert.deepEqual(result.items, [{ id: "form-1" }, { id: "form-2" }]);
  assert.equal(result.pages, 2);
  assert.equal(calls.length, 2);
});

test("inscrição leadgen já existente é idempotente", async () => {
  const methods: Array<string> = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    methods.push(init?.method ?? "GET");
    return jsonResponse({
      data: [{ id: "app-1", name: "KognaHub", subscribed_fields: ["leadgen"] }],
    });
  };

  const result = await ensureMetaPageLeadgenSubscription("v23.0", "page-1", "app-1", {
    token: "segredo",
    fetchImpl,
  });

  assert.equal(result.leadgenSubscribed, true);
  assert.equal(result.changed, false);
  assert.deepEqual(methods, ["GET"]);
});

test("inscrição ausente faz POST uma vez e confirma com novo GET", async () => {
  let getCount = 0;
  const methods: Array<string> = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const method = init?.method ?? "GET";
    methods.push(method);
    if (method === "POST") return jsonResponse({ success: true });
    getCount += 1;
    return jsonResponse({
      data:
        getCount === 1 ? [] : [{ id: "app-1", name: "KognaHub", subscribed_fields: ["leadgen"] }],
    });
  };

  const result = await ensureMetaPageLeadgenSubscription("v23.0", "page-1", "app-1", {
    token: "segredo",
    fetchImpl,
  });

  assert.equal(result.leadgenSubscribed, true);
  assert.equal(result.changed, true);
  assert.deepEqual(methods, ["GET", "POST", "GET"]);
});

test("erro da Graph preserva diagnóstico técnico sem incluir credencial", async () => {
  const fetchImpl: typeof fetch = async () =>
    jsonResponse(
      {
        error: {
          message: "Permissão negada",
          type: "OAuthException",
          code: 3,
          error_subcode: 99,
          fbtrace_id: "trace-1",
        },
      },
      400,
    );

  await assert.rejects(
    () =>
      fetchAllMetaGraphPages("https://graph.facebook.com/v23.0/page/leadgen_forms", {
        token: "segredo",
        fetchImpl,
      }),
    (error: unknown) =>
      error instanceof MetaGraphApiError &&
      error.details.code === "3" &&
      error.details.fbtraceId === "trace-1" &&
      !error.message.includes("segredo"),
  );
});
