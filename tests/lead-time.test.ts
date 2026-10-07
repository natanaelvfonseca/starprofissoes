import assert from "node:assert/strict";
import test from "node:test";
import { formatLeadCardCreatedAt } from "../src/lib/lead-time.ts";

test("card mostra entrada em Brasília com data dd/mm/aa e horário", () => {
  assert.equal(formatLeadCardCreatedAt("2026-10-07T13:05:00.000Z"), "Entrada: 07/10/26 às 10:05");
});

test("card trata uma data de entrada inválida", () => {
  assert.equal(formatLeadCardCreatedAt("data-inválida"), "Entrada indisponível");
});
