import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransferLeads,
  canViewAllUnitLeads,
  canViewGrowth,
  canViewSalesAi,
  canViewStudents,
} from "../src/lib/auth-types.ts";

test("consultor acessa alunos, mas não acessa relatórios", () => {
  assert.equal(canViewStudents("CONSULTOR"), true);
  assert.equal(canViewGrowth("CONSULTOR"), false);
});

test("consultor permanece limitado aos próprios leads e alunos", () => {
  assert.equal(canViewAllUnitLeads("CONSULTOR"), false);
  assert.equal(canTransferLeads("CONSULTOR"), false);
});

test("consultor acessa a conexão da IA Comercial", () => {
  assert.equal(canViewSalesAi("CONSULTOR"), true);
  assert.equal(canViewSalesAi("MARKETING"), false);
});

test("liderança mantém acesso aos alunos e relatórios", () => {
  for (const role of ["DEV", "CVO", "CEO", "DIRETOR", "GERENTE"] as const) {
    assert.equal(canViewStudents(role), true);
    assert.equal(canViewGrowth(role), true);
  }
});
