import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  handleKognaMetaRelay,
  verifyKognaMetaSignature,
} from "../src/lib/server/kogna-meta-relay.ts";
import {
  parseKognaMetaLeadEvent,
  parseMetaLeadEvents,
} from "../src/lib/server/meta-webhook-payload.ts";

const secret = "test-only-kogna-secret";
const relayPayload = {
  client: "star",
  page_id: "page-1",
  form_id: "form-1",
  leadgen_id: "lead-1",
  meta_event: { field: "leadgen", value: { campaign_id: "campaign-1" } },
};

test("rejeita assinatura Kogna ausente ou inválida", async () => {
  const rawBody = Buffer.from(JSON.stringify(relayPayload));
  let calls = 0;
  const processor = async () => {
    calls += 1;
    return { ok: true };
  };

  assert.equal((await handleKognaMetaRelay(rawBody, null, secret, processor)).status, 401);
  assert.equal(
    (await handleKognaMetaRelay(rawBody, "0".repeat(64), secret, processor)).status,
    403,
  );
  assert.equal(calls, 0);
});

test("valida HMAC do corpo bruto e encaminha payload válido ao processador", async () => {
  const rawBody = Buffer.from(JSON.stringify(relayPayload));
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  let received: Record<string, unknown> | null = null;

  assert.equal(verifyKognaMetaSignature(rawBody, signature, secret), true);

  const result = await handleKognaMetaRelay(rawBody, signature, secret, async (payload) => {
    received = payload;
    return { ok: true, status: 200, result: "pending_configuration" };
  });

  assert.equal(result.status, 200);
  assert.deepEqual(received, relayPayload);
});

test("exige client star no relay", async () => {
  const rawBody = Buffer.from(JSON.stringify({ ...relayPayload, client: "outro" }));
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  const result = await handleKognaMetaRelay(rawBody, signature, secret, async () => ({ ok: true }));

  assert.equal(result.status, 400);
});

test("normaliza o payload relay sem perder os identificadores centrais", () => {
  const event = parseKognaMetaLeadEvent(relayPayload);

  assert.equal(event?.pageId, "page-1");
  assert.equal(event?.formId, "form-1");
  assert.equal(event?.leadgenId, "lead-1");
  assert.equal(event?.campaignId, "campaign-1");
});

test("processa todos os entry/changes leadgen válidos", () => {
  const events = parseMetaLeadEvents({
    entry: [
      {
        id: "page-1",
        changes: [
          { field: "leadgen", value: { form_id: "form-1", leadgen_id: "lead-1" } },
          { field: "ignored", value: { form_id: "form-x", leadgen_id: "lead-x" } },
          { field: "leadgen", value: { form_id: "form-2", leadgen_id: "lead-2" } },
        ],
      },
      {
        id: "page-2",
        changes: [{ field: "leadgen", value: { form_id: "form-3", leadgen_id: "lead-3" } }],
      },
    ],
  });

  assert.deepEqual(
    events.map(({ pageId, formId, leadgenId }) => ({ pageId, formId, leadgenId })),
    [
      { pageId: "page-1", formId: "form-1", leadgenId: "lead-1" },
      { pageId: "page-1", formId: "form-2", leadgenId: "lead-2" },
      { pageId: "page-2", formId: "form-3", leadgenId: "lead-3" },
    ],
  );
});

test("mantém idempotência por leadgen_id dentro do mesmo lote", () => {
  const events = parseMetaLeadEvents({
    entry: [
      {
        id: "page-1",
        changes: [
          { field: "leadgen", value: { form_id: "form-1", leadgen_id: "lead-1" } },
          { field: "leadgen", value: { form_id: "form-1", leadgen_id: "lead-1" } },
        ],
      },
    ],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.leadgenId, "lead-1");
});
