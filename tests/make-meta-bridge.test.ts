import assert from "node:assert/strict";
import test from "node:test";
import {
  handleMakeMetaLeadRequest,
  parseMakeMetaLeadPayload,
  verifyMakeMetaBearer,
} from "../src/lib/server/make-meta-bridge.ts";

const secret = "make-bridge-test-secret";
const payload = {
  leadgen_id: "lead-1",
  form_id: "form-1",
  form_name: "Formulário principal",
  page_id: "page-1",
  name: "Pessoa Teste",
  phone: "11999999999",
  email: "pessoa@example.com",
  created_time: "2026-09-02T12:00:00Z",
  campaign_id: "campaign-1",
  campaign_name: "Campanha",
  adset_id: "adset-1",
  adset_name: "Conjunto",
  ad_id: "ad-1",
  ad_name: "Anúncio",
};

function request(body: unknown, authorization = `Bearer ${secret}`) {
  return new Request("https://crm.starprofissoes.com.br/api/webhooks/make/meta-lead", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("valida o Bearer do Make sem aceitar segredo incorreto", () => {
  assert.equal(verifyMakeMetaBearer(`Bearer ${secret}`, secret), true);
  assert.equal(verifyMakeMetaBearer("Bearer incorreto", secret), false);
  assert.equal(verifyMakeMetaBearer(null, secret), false);
});

test("endpoint não processa payload sem o Bearer correto", async () => {
  let calls = 0;
  const result = await handleMakeMetaLeadRequest(
    request(payload, "Bearer incorreto"),
    secret,
    async () => {
      calls += 1;
      return { ok: true, status: 200 };
    },
  );

  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});

test("rejeita payload incompleto antes de chamar o processador", async () => {
  let calls = 0;
  const result = await handleMakeMetaLeadRequest(
    request({ form_id: "form-1" }),
    secret,
    async () => {
      calls += 1;
      return { ok: true, status: 200 };
    },
  );

  assert.equal(result.status, 400);
  assert.equal(calls, 0);
});

test("normaliza o payload completo e o entrega uma única vez ao processador", async () => {
  let received: ReturnType<typeof parseMakeMetaLeadPayload> = null;
  const result = await handleMakeMetaLeadRequest(request(payload), secret, async (value) => {
    received = value;
    return { ok: true, status: 200, result: "processed", leadId: "crm-lead-1" };
  });

  assert.equal(result.status, 200);
  assert.equal(received?.leadgen_id, "lead-1");
  assert.equal(received?.campaign_name, "Campanha");
  assert.equal(received?.ad_name, "Anúncio");
  assert.deepEqual(result.body, {
    ok: true,
    status: 200,
    result: "processed",
    leadId: "crm-lead-1",
  });
});

test("pending_configuration é sucesso armazenado e não erro do webhook", async () => {
  const result = await handleMakeMetaLeadRequest(request(payload), secret, async () => ({
    ok: true,
    status: 200,
    result: "pending_configuration",
    leadId: null,
  }));

  assert.equal(result.status, 200);
  assert.equal(result.body.result, "pending_configuration");
});
