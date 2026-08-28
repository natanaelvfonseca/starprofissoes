import assert from "node:assert/strict";
import test from "node:test";
import { formatFinancialDate } from "../src/lib/financial-date.ts";
import { normalizeFinancialFilterOptions } from "../src/lib/financial-filters.ts";
import {
  assertFinancialSyncReady,
  financialIntegrationResponse,
  FinancialIntegrationStateError,
  isCurrentFinancialResponse,
  normalizeFinancialRows,
  scopedFinancialValue,
} from "../src/lib/financial-unit-state.ts";

test("unidade com integração e dados mantém seu estado", () => {
  const state = { configured: true, active: true, studentsCount: 10, installmentsCount: 18 };
  assert.deepEqual(financialIntegrationResponse(state), { configured: true, integration: state });
});

test("unidade com integração mas sem dados retorna contadores zerados", () => {
  const state = { configured: true, active: true, studentsCount: 0, installmentsCount: 0 };
  assert.equal(financialIntegrationResponse(state).integration?.installmentsCount, 0);
});

test("unidade sem integração retorna estado válido e integração nula", () => {
  const state = { configured: false, active: false, studentsCount: 0, installmentsCount: 0 };
  assert.deepEqual(financialIntegrationResponse(state), { configured: false, integration: null });
});

test("unidade sem sync_runs recebe lista vazia", () => {
  assert.deepEqual(normalizeFinancialRows(null), []);
});

test("unidade sem installments recebe filtros vazios em vez de null", () => {
  assert.deepEqual(normalizeFinancialFilterOptions({ courses: null, classes: null }), {
    courses: [],
    classes: [],
  });
});

test("timestamps null são exibidos com segurança", () => {
  assert.equal(formatFinancialDate(null), "—");
  assert.equal(formatFinancialDate(undefined), "—");
});

test("troca BH para Tramandaí descarta resposta atrasada de BH", () => {
  assert.equal(isCurrentFinancialResponse("tramandai", "bh", 1, 2), false);
  assert.deepEqual(scopedFinancialValue("tramandai", "bh", ["dado-bh"], []), []);
});

test("troca Tramandaí para BH aceita somente a nova resposta de BH", () => {
  assert.equal(isCurrentFinancialResponse("bh", "bh", 3, 3), true);
  assert.deepEqual(scopedFinancialValue("bh", "bh", ["dado-bh"], []), ["dado-bh"]);
});

test("nenhuma informação financeira vaza entre unidades", () => {
  const bhDashboard = { installments: 139 };
  const emptyDashboard = { installments: 0 };
  assert.deepEqual(
    scopedFinancialValue("tramandai", "bh", bhDashboard, emptyDashboard),
    emptyDashboard,
  );
});

test("sync sem integração retorna erro controlado e não erro 500", () => {
  assert.throws(
    () => assertFinancialSyncReady(null),
    (error: unknown) =>
      error instanceof FinancialIntegrationStateError &&
      error.status === 409 &&
      error.message === "Integração financeira não configurada para esta unidade.",
  );
});
