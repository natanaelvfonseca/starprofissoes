import assert from "node:assert/strict";
import test from "node:test";
import {
  describeOutgoingWhatsappFile,
  MAX_WHATSAPP_MEDIA_BYTES,
} from "../src/lib/whatsapp-outgoing-media.ts";
import { requestEvolution } from "../src/lib/server/evolution-client.ts";

test("classifica imagem, PDF e áudio gravado pelos tipos e extensões permitidos", () => {
  assert.equal(
    describeOutgoingWhatsappFile({ name: "foto.png", size: 123, type: "image/png" }).mediaType,
    "image",
  );
  assert.equal(
    describeOutgoingWhatsappFile({ name: "proposta.pdf", size: 123, type: "" }).mediaType,
    "document",
  );
  assert.equal(
    describeOutgoingWhatsappFile({ name: "voz.webm", size: 123, type: "audio/webm;codecs=opus" })
      .mediaType,
    "audio",
  );
});

test("rejeita arquivo vazio, grande ou de tipo não autorizado", () => {
  assert.throws(() =>
    describeOutgoingWhatsappFile({ name: "vazio.pdf", size: 0, type: "application/pdf" }),
  );
  assert.throws(() =>
    describeOutgoingWhatsappFile({
      name: "grande.pdf",
      size: MAX_WHATSAPP_MEDIA_BYTES + 1,
      type: "application/pdf",
    }),
  );
  assert.throws(() =>
    describeOutgoingWhatsappFile({
      name: "script.exe",
      size: 200,
      type: "application/x-msdownload",
    }),
  );
});

test("Evolution recebe multipart sem Content-Type JSON e texto mantém JSON", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.EVOLUTION_API_URL;
  const previousKey = process.env.EVOLUTION_API_KEY;
  process.env.EVOLUTION_API_URL = "https://example.invalid";
  process.env.EVOLUTION_API_KEY = "test-key";
  const requests: Array<{ headers: Headers; body: BodyInit | null | undefined }> = [];
  globalThis.fetch = async (_url, init) => {
    requests.push({ headers: new Headers(init?.headers), body: init?.body });
    return Response.json({ key: { id: "fake-message" } });
  };
  try {
    const form = new FormData();
    form.set("file", new File(["fake"], "fake.txt", { type: "text/plain" }));
    await requestEvolution("/message/sendMedia/test", { method: "POST", body: form });
    await requestEvolution("/message/sendText/test", { method: "POST", body: "{}" });
    assert.equal(requests[0]?.headers.get("content-type"), null);
    assert.ok(requests[0]?.body instanceof FormData);
    assert.equal(requests[1]?.headers.get("content-type"), "application/json");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.EVOLUTION_API_URL;
    else process.env.EVOLUTION_API_URL = previousUrl;
    if (previousKey === undefined) delete process.env.EVOLUTION_API_KEY;
    else process.env.EVOLUTION_API_KEY = previousKey;
  }
});
