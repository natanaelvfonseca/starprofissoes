import test from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence } from "../src/lib/team-schedule.ts";

test("tarefa pontual não cria próxima ocorrência", () => {
  assert.equal(
    nextOccurrence("2026-11-14T12:00:00.000Z", "2026-11-14T12:00:00.000Z", "none"),
    null,
  );
});

test("recorrência diária preserva horário de São Paulo", () => {
  assert.equal(
    nextOccurrence("2026-11-14T12:00:00.000Z", "2026-11-14T12:00:00.000Z", "daily"),
    "2026-11-15T12:00:00.000Z",
  );
});

test("recorrência em dias úteis salta sábado e domingo", () => {
  // 13/11/2026 é sexta-feira, 09h em São Paulo.
  assert.equal(
    nextOccurrence("2026-11-13T12:00:00.000Z", "2026-11-13T12:00:00.000Z", "weekdays"),
    "2026-11-16T12:00:00.000Z",
  );
});

test("recorrência semanal avança sete dias", () => {
  assert.equal(
    nextOccurrence("2026-11-14T12:00:00.000Z", "2026-11-14T12:00:00.000Z", "weekly"),
    "2026-11-21T12:00:00.000Z",
  );
});

test("recorrência mensal respeita fim do mês e dia âncora", () => {
  const anchor = "2026-01-31T12:00:00.000Z";
  assert.equal(nextOccurrence(anchor, anchor, "monthly"), "2026-02-28T12:00:00.000Z");
  assert.equal(
    nextOccurrence("2026-02-28T12:00:00.000Z", anchor, "monthly"),
    "2026-03-31T12:00:00.000Z",
  );
});

test("data limite impede ocorrências posteriores", () => {
  assert.equal(
    nextOccurrence("2026-11-14T12:00:00.000Z", "2026-11-14T12:00:00.000Z", "daily", "2026-11-14"),
    null,
  );
});
