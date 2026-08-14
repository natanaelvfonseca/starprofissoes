import assert from "node:assert/strict";
import test from "node:test";
import {
  isUsefulWhatsappContactName,
  selectWhatsappContactName,
} from "../src/lib/whatsapp-contact-name.ts";

test("prioriza nome do CRM e depois o nome recebido do contato", () => {
  assert.equal(
    selectWhatsappContactName({
      leadName: "Maria do CRM",
      inboundName: "Maria WhatsApp",
      storedName: "Maria",
      consultantName: "Consultor",
      phone: "5511999999999",
    }),
    "Maria do CRM",
  );
  assert.equal(
    selectWhatsappContactName({
      inboundName: "Maria WhatsApp",
      storedName: "Maria",
      consultantName: "Consultor",
      phone: "5511999999999",
    }),
    "Maria WhatsApp",
  );
});

test("não mostra o nome do próprio consultor como contato", () => {
  assert.equal(
    selectWhatsappContactName({
      storedName: "João Consultor",
      consultantName: "Joao Consultor",
      phone: "5511999999999",
      remoteJid: "5511999999999@s.whatsapp.net",
    }),
    "5511999999999",
  );
});

test("rejeita JID e telefone usados como nome", () => {
  assert.equal(isUsefulWhatsappContactName("123@lid", "Consultor", "5511999999999"), false);
  assert.equal(
    isUsefulWhatsappContactName("55 11 99999-9999", "Consultor", "5511999999999"),
    false,
  );
});
