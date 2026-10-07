import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalWhatsappLeadPhone,
  shouldResolveWhatsappLead,
  whatsappLeadFallbackName,
} from "../src/lib/whatsapp-lead-intake.ts";

test("normaliza telefone brasileiro e tolera a variação histórica do nono dígito", () => {
  assert.equal(canonicalWhatsappLeadPhone("(51) 99999-1234"), "5551999991234");
  assert.equal(canonicalWhatsappLeadPhone("+55 51 99999-1234"), "5551999991234");
  assert.equal(canonicalWhatsappLeadPhone("51 9999-1234"), "5551999991234");
  assert.equal(canonicalWhatsappLeadPhone("90129888755887"), "");
});

test("só consulta o CRM nas primeiras mensagens recebidas de uma instância conectada", () => {
  const base = {
    inbound: true,
    instanceStatus: "connected",
    consultantId: "consultant-1",
    consultantActive: true,
    consultantRole: "CONSULTOR",
    phone: "5551999991234",
    inboundCount: 1,
  };

  assert.equal(shouldResolveWhatsappLead(base), true);
  assert.equal(shouldResolveWhatsappLead({ ...base, inbound: false }), false);
  assert.equal(shouldResolveWhatsappLead({ ...base, instanceStatus: "disconnected" }), false);
  assert.equal(shouldResolveWhatsappLead({ ...base, consultantId: null }), false);
  assert.equal(shouldResolveWhatsappLead({ ...base, inboundCount: 4 }), false);
  assert.equal(shouldResolveWhatsappLead({ ...base, phone: "90129888755887" }), false);
});

test("gera nome neutro sem confundir telefone com nome do contato", () => {
  assert.equal(whatsappLeadFallbackName("5551999991234"), "Contato WhatsApp 1234");
});
