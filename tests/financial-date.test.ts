import assert from "node:assert/strict";
import test from "node:test";
import { formatFinancialDate } from "../src/lib/financial-date.ts";

test("formata timestamp textual do PostgreSQL sem gerar data inválida", () => {
  const formatted = formatFinancialDate("2026-08-28 11:07:08.089+00");
  assert.notEqual(formatted, "—");
  assert.match(formatted, /28\/08\/2026/);
});

test("mantém suporte a datas sem horário e tolera entrada inválida", () => {
  assert.match(formatFinancialDate("2026-08-28"), /28\/08\/2026/);
  assert.equal(formatFinancialDate("valor inválido"), "—");
});
