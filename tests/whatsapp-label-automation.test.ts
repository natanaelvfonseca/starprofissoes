import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseLeadCandidate,
  choosePipelineColumnByLabelName,
  normalizeWhatsappLabelName,
  phoneFromWhatsappJid,
  phonesMatch,
  parseWhatsappLabelAssociation,
  parseWhatsappLabelEdit,
} from "../src/lib/whatsapp-label-automation.ts";

test("interpreta o payload real de etiqueta adicionada da Evolution", () => {
  assert.deepEqual(
    parseWhatsappLabelAssociation({
      event: "labels.association",
      data: {
        instance: "star_teste",
        type: "add",
        chatId: "5531999999999@s.whatsapp.net",
        labelId: "12",
      },
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
    parseWhatsappLabelAssociation({
      data: { type: "remove", chatId: "5511999999999@s.whatsapp.net", labelId: "9" },
    })?.action,
    "remove",
  );
});

test("rejeita associação incompleta", () => {
  assert.equal(parseWhatsappLabelAssociation({ data: { type: "add", labelId: "9" } }), null);
});

test("interpreta criação ou edição de etiqueta", () => {
  assert.deepEqual(parseWhatsappLabelEdit({ data: { id: "15", name: "Pagamento", color: "3" } }), {
    labelId: "15",
    name: "Pagamento",
    color: "3",
    deleted: false,
  });
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
      {
        id: "proprio",
        createdBy: "consultor",
        stage: "Em contato",
        createdAt: "2026-08-01T12:00:00Z",
      },
    ],
    "consultor",
  );
  assert.equal(result.candidate?.id, "proprio");
});

test("prioriza lead ativo antes do aluno encerrado", () => {
  const result = chooseLeadCandidate(
    [
      {
        id: "aluno",
        createdBy: "consultor",
        stage: "Matriculado",
        createdAt: "2026-08-02T12:00:00Z",
      },
      {
        id: "lead",
        createdBy: "consultor",
        stage: "Qualificado",
        createdAt: "2026-08-01T12:00:00Z",
      },
    ],
    "consultor",
  );
  assert.equal(result.candidate?.id, "lead");
});

test("prioriza o lead mais recente quando dono e atividade empatam", () => {
  const result = chooseLeadCandidate(
    [
      {
        id: "antigo",
        createdBy: "consultor",
        stage: "Em contato",
        createdAt: "2026-08-01T12:00:00Z",
      },
      {
        id: "recente",
        createdBy: "consultor",
        stage: "Em contato",
        createdAt: "2026-08-02T12:00:00Z",
      },
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

test("normaliza o nome da etiqueta para compará-lo à coluna do CRM", () => {
  assert.equal(normalizeWhatsappLabelName("  Em   Negociação  "), "em negociacao");
});

test("encontra a coluna pelo nome da etiqueta sem cadastro manual", () => {
  const result = choosePipelineColumnByLabelName(
    [
      { id: "novo", name: "Novo lead" },
      { id: "negociacao", name: "Em Negociação" },
    ],
    "em negociacao",
  );

  assert.equal(result.column?.id, "negociacao");
  assert.equal(result.ambiguous, false);
});

test("não escolhe silenciosamente quando há nomes de coluna duplicados", () => {
  const result = choosePipelineColumnByLabelName(
    [
      { id: "a", name: "Contato" },
      { id: "b", name: "CONTATO" },
    ],
    "Contato",
  );

  assert.equal(result.column, null);
  assert.equal(result.ambiguous, true);
});
