import assert from "node:assert/strict";
import test from "node:test";
import {
  canConsultantMovePipelineLead,
  canConsultantOpenPipelineLead,
  isSharedLeadQueueEntry,
} from "../src/lib/commercial-types.ts";

test("lead novo de uma turma pode permanecer na fila compartilhada", () => {
  assert.equal(
    isSharedLeadQueueEntry({ sharedQueue: true, stage: "Novo lead", attendanceId: "turma-1" }),
    true,
  );
});

test("lead deixa de ser compartilhado depois que o atendimento começa", () => {
  assert.equal(
    isSharedLeadQueueEntry({ sharedQueue: false, stage: "Em contato", attendanceId: "turma-1" }),
    false,
  );
  assert.equal(
    isSharedLeadQueueEntry({ sharedQueue: true, stage: "Em contato", attendanceId: "turma-1" }),
    false,
  );
});

test("consultor pode pegar lead livre, mas não abrir antes da captura", () => {
  const lead = {
    createdById: null,
    sharedQueue: true,
    stage: "Novo lead" as const,
    attendanceId: "turma-1",
  };

  assert.equal(canConsultantMovePipelineLead(lead, "consultor-1"), true);
  assert.equal(canConsultantOpenPipelineLead(lead, "consultor-1"), false);
});

test("lead assumido fica editável somente para o responsável", () => {
  const lead = {
    createdById: "consultor-1",
    sharedQueue: false,
    stage: "Em contato" as const,
    attendanceId: "turma-1",
  };

  assert.equal(canConsultantOpenPipelineLead(lead, "consultor-1"), true);
  assert.equal(canConsultantMovePipelineLead(lead, "consultor-1"), true);
  assert.equal(canConsultantOpenPipelineLead(lead, "consultor-2"), false);
  assert.equal(canConsultantMovePipelineLead(lead, "consultor-2"), false);
});
