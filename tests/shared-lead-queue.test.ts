import assert from "node:assert/strict";
import test from "node:test";
import {
  canConsultantAssumePipelineLead,
  canConsultantMovePipelineLead,
  canConsultantOpenPipelineLead,
  isSharedLeadQueueEntry,
  leadMatchesConsultantScope,
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

test("visão Meus leads mostra somente o responsável atual", () => {
  assert.equal(
    leadMatchesConsultantScope({ createdById: "consultor-1" }, "consultor-1", "mine"),
    true,
  );
  assert.equal(
    leadMatchesConsultantScope({ createdById: "consultor-2" }, "consultor-1", "mine"),
    false,
  );
  assert.equal(leadMatchesConsultantScope({ createdById: null }, "consultor-1", "mine"), false);
  assert.equal(
    leadMatchesConsultantScope({ createdById: "consultor-2" }, "consultor-1", "all"),
    true,
  );
});

test("consultor pode assumir atendimento de outro responsável", () => {
  assert.equal(
    canConsultantAssumePipelineLead(
      { createdById: "consultor-2", sharedQueue: false, stage: "Em contato" },
      "consultor-1",
    ),
    true,
  );
  assert.equal(
    canConsultantAssumePipelineLead(
      { createdById: "consultor-1", sharedQueue: false, stage: "Em contato" },
      "consultor-1",
    ),
    false,
  );
  assert.equal(
    canConsultantAssumePipelineLead(
      { createdById: null, sharedQueue: true, stage: "Novo lead" },
      "consultor-1",
    ),
    false,
  );
});
