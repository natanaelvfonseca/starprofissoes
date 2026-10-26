import assert from "node:assert/strict";
import test from "node:test";
import { evolutionConnectionState, evolutionQrCodeFrom } from "../src/lib/evolution-connection.ts";

test("normaliza os formatos de estado retornados pela Evolution", () => {
  assert.equal(evolutionConnectionState({ instance: { state: "open" } }), "connected");
  assert.equal(
    evolutionConnectionState({ data: { instance: { state: "connected" } } }),
    "connected",
  );
  assert.equal(evolutionConnectionState({ data: { state: "connecting" } }), "connecting");
  assert.equal(evolutionConnectionState({ instance: { state: "refused" } }), "disconnected");
});

test("lê o QR Code nos formatos raiz e aninhado da Evolution", () => {
  const image = `data:image/png;base64,${"A".repeat(600)}`;
  const rawBase64 = "A".repeat(600);

  assert.equal(evolutionQrCodeFrom({ base64: image }), image);
  assert.equal(evolutionQrCodeFrom({ data: { qrcode: { base64: image } } }), image);
  assert.equal(
    evolutionQrCodeFrom({ data: { base64: rawBase64 } }),
    `data:image/png;base64,${rawBase64}`,
  );
  assert.equal(evolutionQrCodeFrom({ count: 0 }), null);
});
