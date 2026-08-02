import assert from "node:assert/strict";
import test from "node:test";
import { isSharedLeadQueueEntry } from "../src/lib/commercial-types.ts";

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
