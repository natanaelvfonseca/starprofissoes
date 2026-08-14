import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeWhatsappDeliveryStatus,
  normalizeWhatsappDeliveryStatus,
  whatsappDeliveryStatusFromPayload,
} from "../src/lib/whatsapp-message-status.ts";

test("normaliza os estados oficiais de entrega da Evolution", () => {
  assert.equal(normalizeWhatsappDeliveryStatus("PENDING"), "pending");
  assert.equal(normalizeWhatsappDeliveryStatus("SERVER_ACK"), "sent");
  assert.equal(normalizeWhatsappDeliveryStatus("DELIVERY_ACK"), "delivered");
  assert.equal(normalizeWhatsappDeliveryStatus("READ"), "read");
  assert.equal(normalizeWhatsappDeliveryStatus("PLAYED"), "played");
  assert.equal(normalizeWhatsappDeliveryStatus("ERROR"), "failed");
});

test("extrai status de formatos distintos do webhook", () => {
  assert.equal(whatsappDeliveryStatusFromPayload({ data: { status: "READ" } }), "read");
  assert.equal(
    whatsappDeliveryStatusFromPayload({ data: { update: { status: "DELIVERY_ACK" } } }),
    "delivered",
  );
});

test("não regride confirmação quando eventos chegam fora de ordem", () => {
  assert.equal(mergeWhatsappDeliveryStatus("read", "sent"), "read");
  assert.equal(mergeWhatsappDeliveryStatus("sent", "delivered"), "delivered");
  assert.equal(mergeWhatsappDeliveryStatus("delivered", "failed"), "delivered");
});
