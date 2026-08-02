import assert from "node:assert/strict";
import test from "node:test";
import { canManageWhatsappLabelAutomation } from "../src/lib/auth-types.ts";
import {
  chooseLeadCandidate,
  phoneFromWhatsappJid,
  phonesMatch,
  parseWhatsappLabelAssociation,
  parseWhatsappLabelEdit,
} from "../src/lib/whatsapp-label-automation.ts";

test("interpreta o payload real de etiqueta adicionada da Evolution", () => {
  assert.deepEqual(
    parseWhatsappLabelAssociation({
      event: "labels.association",
      data: { instance: "star_teste", type: "add", chatId: "5531999999999@s.whatsapp.net", labelId: "12" },
    }),
    { action: "add", chatId: "5531999999999@s.whatsapp.net", labelId: "12" },
  );
});

test("aceita o payload aninhado da biblioteca Baileys para compatibilidade", () => {
  assert.deepEqual(
    parseWhatsappLabelAssociation({
      data: { type: "add", association: { chatId: "5531999999999@s.whatsapp.net", labelId: "7" } },
    }),
    { action: "add", chatId: "5531999999999@s.whatsapp.net", labelId: "7" },
  );
});

test("identifica remoção de etiqueta sem convertê-la em adição", () => {
  assert.equal(
    parseWhatsappLabelAssociation({ data: { type: "remove", chatId: "5511999999999@s.whatsapp.net", labelId: "9" } })?.action,
    "remove",
  );
});

test("rejeita associação incompleta", () => {
  assert.equal(parseWhatsappLabelAssociation({ data: { type: "add", labelId: "9" } }), null);
});

test("interpreta criação ou edição de etiqueta", () => {
  assert.deepEqual(
    parseWhatsappLabelEdit({ data: { id: "15", name: "Pagamento", color: "3" } }),
    { labelId: "15", name: "Pagamento", color: "3", deleted: false },
  );
});

test("identifica etiqueta excluída", () => {
  assert.equal(parseWhatsappLabelEdit({ data: { id: "15", deleted: true } })?.deleted, true);
});

test("normaliza +55 e telefone local brasileiro", () => {
  assert.equal(phonesMatch("+55 (31) 99999-1234", "31999991234"), true);
});

test("normaliza telefone internacional sem formatação", () => {
  assert.equal(phonesMatch("5531999991234", "31 99999-1234"), true);
});

test("tolera variação histórica do nono dígito", () => {
  assert.equal(phonesMatch("3133334444", "31933334444"), true);
});

test("não trata grupo ou LID como telefone", () => {
  assert.equal(phoneFromWhatsappJid("120363000000@g.us"), "");
  assert.equal(phoneFromWhatsappJid("123456789@lid"), "");
});

test("prioriza lead do consultor da instância", () => {
  const result = chooseLeadCandidate(
    [
      { id: "novo", createdBy: "outro", stage: "Em contato", createdAt: "2026-08-02T12:00:00Z" },
      { id: "proprio", createdBy: "consultor", stage: "Em contato", createdAt: "2026-08-01T12:00:00Z" },
    ],
    "consultor",
  );
  assert.equal(result.candidate?.id, "proprio");
});

test("prioriza lead ativo antes do aluno encerrado", () => {
  const result = chooseLeadCandidate(
    [
      { id: "aluno", createdBy: "consultor", stage: "Matriculado", createdAt: "2026-08-02T12:00:00Z" },
      { id: "lead", createdBy: "consultor", stage: "Qualificado", createdAt: "2026-08-01T12:00:00Z" },
    ],
    "consultor",
  );
  assert.equal(result.candidate?.id, "lead");
});

test("prioriza o lead mais recente quando dono e atividade empatam", () => {
  const result = chooseLeadCandidate(
    [
      { id: "antigo", createdBy: "consultor", stage: "Em contato", createdAt: "2026-08-01T12:00:00Z" },
      { id: "recente", createdBy: "consultor", stage: "Em contato", createdAt: "2026-08-02T12:00:00Z" },
    ],
    "consultor",
  );
  assert.equal(result.candidate?.id, "recente");
});

test("marca como ambíguo quando toda a prioridade empata", () => {
  const result = chooseLeadCandidate(
    [
      { id: "a", createdBy: "consultor", stage: "Em contato", createdAt: "2026-08-02T12:00:00Z" },
      { id: "b", createdBy: "consultor", stage: "Em contato", createdAt: "2026-08-02T12:00:00Z" },
    ],
    "consultor",
  );
  assert.equal(result.ambiguous, true);
  assert.equal(result.candidate, null);
});

test("consultor não administra regras, enquanto perfis de gestão administram", () => {
  assert.equal(canManageWhatsappLabelAutomation("CONSULTOR"), false);
  assert.equal(canManageWhatsappLabelAutomation("DEV"), true);
  assert.equal(canManageWhatsappLabelAutomation("CEO"), true);
  assert.equal(canManageWhatsappLabelAutomation("GERENTE"), true);
});
