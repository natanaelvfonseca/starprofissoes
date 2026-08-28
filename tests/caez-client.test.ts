import assert from "node:assert/strict";
import test from "node:test";
import { createCaezClient, formatCaezDate, parseCaezDate } from "../src/lib/server/caez-client.ts";
import { decryptCaezToken, encryptCaezToken } from "../src/lib/server/caez-token-crypto.ts";

test("converte datas entre o formato CAEZ e ISO", () => {
  assert.equal(parseCaezDate("19/10/2026"), "2026-10-19");
  assert.equal(parseCaezDate("2026-10-19"), null);
  assert.equal(formatCaezDate(new Date("2026-08-27T15:00:00-03:00")), "27/08/2026");
});

test("consulta turmas via HTTPS e envia token_integracao somente no header", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedToken = "";
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedToken = new Headers(init?.headers).get("token_integracao") ?? "";
    return Response.json({ total_registros: 1, dados: [{ codigo_turma: 339 }] });
  }) as typeof fetch;

  try {
    const result = await createCaezClient(
      "https://app.caezescola.com.br/api/",
      "secret-test",
    ).getClasses();
    assert.equal(result.total, 1);
    assert.equal(result.data[0]?.codigo_turma, 339);
    assert.equal(requestedUrl, "https://app.caezescola.com.br/api/api00702.aspx");
    assert.equal(requestedToken, "secret-test");
    assert.equal(requestedUrl.includes("secret-test"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejeita base URL sem HTTPS antes de realizar a chamada", async () => {
  await assert.rejects(
    () => createCaezClient("http://app.caezescola.com.br/api/", "secret-test").getClasses(),
    /HTTPS/,
  );
});

test("criptografa token CAEZ com AES-GCM e exige a mesma chave", () => {
  const previous = process.env.CAEZ_TOKEN_ENCRYPTION_KEY;
  try {
    process.env.CAEZ_TOKEN_ENCRYPTION_KEY = "test-key-one";
    const encrypted = encryptCaezToken("token-ficticio");
    assert.equal(encrypted.includes("token-ficticio"), false);
    assert.equal(decryptCaezToken(encrypted), "token-ficticio");

    process.env.CAEZ_TOKEN_ENCRYPTION_KEY = "test-key-two";
    assert.throws(() => decryptCaezToken(encrypted));
  } finally {
    if (previous === undefined) delete process.env.CAEZ_TOKEN_ENCRYPTION_KEY;
    else process.env.CAEZ_TOKEN_ENCRYPTION_KEY = previous;
  }
});
