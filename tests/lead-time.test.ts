import assert from "node:assert/strict";
import test from "node:test";
import {
  formatLeadCardCreatedAt,
  leadDateFilterValue,
  parseLeadDate,
} from "../src/lib/lead-time.ts";

test("card mostra entrada em Brasília com data dd/mm/aa e horário", () => {
  assert.equal(formatLeadCardCreatedAt("2026-10-07T13:05:00.000Z"), "Entrada: 07/10/26 às 10:05");
});

test("card trata uma data de entrada inválida", () => {
  assert.equal(formatLeadCardCreatedAt("data-inválida"), "Entrada indisponível");
});

test("normaliza timestamps PostgreSQL e offsets preservando o instante para filtros e cards", () => {
  for (const value of [
    "2026-10-20 12:20:30.123456+00",
    "2026-10-20 09:20:30.123456-03",
    "2026-10-20 09:20:30.123456-0300",
    "2026-10-20T09:20:30.123-03:00",
  ]) {
    const date = parseLeadDate(value);
    assert.equal(date.toISOString(), "2026-10-20T12:20:30.123Z");
    assert.equal(leadDateFilterValue(date), "2026-10-20");
    assert.equal(formatLeadCardCreatedAt(value), "Entrada: 20/10/26 às 09:20");
  }
});

test("filtro usa a mesma data do card em Brasília na virada do dia", () => {
  const value = "2026-10-20T02:59:59.000Z";
  assert.equal(leadDateFilterValue(parseLeadDate(value)), "2026-10-19");
  assert.equal(formatLeadCardCreatedAt(value), "Entrada: 19/10/26 às 23:59");
});

test("normalização preserva uma data ISO sem interpretar o dia como offset", () => {
  assert.equal(parseLeadDate("2026-10-20").toISOString(), "2026-10-20T00:00:00.000Z");
});
