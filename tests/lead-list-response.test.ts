import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { leadListResponse } from "../src/lib/server/lead-list-response.ts";
const payload = { leads: Array.from({length: 1000}, (_, i) => ({id: i, stage: "Novo lead", observations: "texto de exemplo"})), pipelineColumns: [], owners: [] };
const req = (headers: HeadersInit = {}) => new Request("http://localhost/api/crm/leads", {headers});
test("gzip preserva todos os registros e respeita negociação", async () => {
  const response = await leadListResponse(req({"Accept-Encoding": "br, gzip"}), payload);
  assert.equal(response.headers.get("Content-Encoding"), "gzip");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length < JSON.stringify(payload).length / 5);
  assert.deepEqual(JSON.parse(gunzipSync(bytes).toString()), payload);
  const plain = await leadListResponse(req({"Accept-Encoding": "gzip;q=0, *;q=1"}), payload);
  assert.equal(plain.headers.get("Content-Encoding"), null);
  assert.deepEqual(await plain.json(), payload);
});
test("ETag só reutiliza conteúdo idêntico e não permite cache compartilhado", async () => {
  const original = await leadListResponse(req(), payload);
  const etag = original.headers.get("ETag")!;
  const unchanged = await leadListResponse(req({"If-None-Match": etag}), payload);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");
  assert.match(unchanged.headers.get("Cache-Control")!, /private, no-store/);
  const changed = await leadListResponse(req({"If-None-Match": etag}), {...payload, leads: payload.leads.slice(1)});
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("ETag"), etag);
});
