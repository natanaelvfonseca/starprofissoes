import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinancialFilterSql,
  FinancialFilterError,
  financialUnitSql,
  parseFinancialFilters,
} from "../src/lib/financial-filters.ts";

const filters = (query: string) => parseFinancialFilters(new URLSearchParams(query));

test("dashboard aceita período fechado pela data de vencimento", () => {
  const built = buildFinancialFilterSql(filters("start_date=2026-08-01&end_date=2026-08-31"), 2);
  assert.match(built.sql, /i\.due_date >= \$2::date/);
  assert.match(built.sql, /i\.due_date <= \$3::date/);
  assert.deepEqual(built.values, ["2026-08-01", "2026-08-31"]);
});

test("Central de Cobrança usa o mesmo contrato de período", () => {
  const parsed = filters("start_date=2026-08-01&end_date=2026-08-10");
  assert.equal(parsed.hasPeriod, true);
  assert.equal(buildFinancialFilterSql(parsed, 2).values.length, 2);
});

test("aceita start_date sem end_date", () => {
  const built = buildFinancialFilterSql(filters("start_date=2026-08-01"), 2);
  assert.match(built.sql, />= \$2::date/);
  assert.doesNotMatch(built.sql, /<=/);
});

test("aceita end_date sem start_date", () => {
  const built = buildFinancialFilterSql(filters("end_date=2026-08-31"), 2);
  assert.match(built.sql, /<= \$2::date/);
  assert.doesNotMatch(built.sql, />=/);
});

test("rejeita intervalo inválido", () => {
  assert.throws(() => filters("start_date=2026-09-01&end_date=2026-08-31"), FinancialFilterError);
});

test("período sem resultados continua sendo um filtro válido", () => {
  const parsed = filters("start_date=2999-01-01&end_date=2999-01-31");
  assert.equal(parsed.startDate, "2999-01-01");
  assert.equal(parsed.endDate, "2999-01-31");
});

test("combina status e período", () => {
  const built = buildFinancialFilterSql(
    filters("start_date=2026-08-01&end_date=2026-08-31&status=overdue"),
    2,
  );
  assert.match(built.sql, /i\.status = \$4/);
  assert.deepEqual(built.values, ["2026-08-01", "2026-08-31", "overdue"]);
});

test("combina curso e período", () => {
  const built = buildFinancialFilterSql(
    filters("start_date=2026-08-01&course=Mecânica+a+Diesel"),
    2,
  );
  assert.match(built.sql, /e\.course_name = \$3/);
});

test("combina turma e período", () => {
  const built = buildFinancialFilterSql(filters("end_date=2026-08-31&class=BH-01"), 2);
  assert.match(built.sql, /e\.class_name = \$3/);
});

test("isolamento por unidade permanece obrigatório nas consultas", () => {
  assert.equal(financialUnitSql(), "i.unit_id=$1");
  assert.equal(financialUnitSql("s"), "s.unit_id=$1");
});
