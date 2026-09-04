import assert from "node:assert/strict";
import test from "node:test";
import {
  canReturnStudentToLead,
  canTransferLeads,
  canViewAllUnitLeads,
  canViewAllUnitPipelineLeads,
  canViewGrowth,
  canViewSalesAi,
  canViewStudents,
} from "../src/lib/auth-types.ts";

test("consultor acessa alunos, mas não acessa relatórios", () => {
  assert.equal(canViewStudents("CONSULTOR"), true);
  assert.equal(canViewGrowth("CONSULTOR"), false);
});

test("consultor vê o pipeline da unidade, mas alunos permanecem limitados", () => {
  assert.equal(canViewAllUnitLeads("CONSULTOR"), false);
  assert.equal(canViewAllUnitPipelineLeads("CONSULTOR"), true);
  assert.equal(canTransferLeads("CONSULTOR"), false);
  assert.equal(canReturnStudentToLead("CONSULTOR"), true);
});

test("consultor acessa a conexão da IA Comercial", () => {
  assert.equal(canViewSalesAi("CONSULTOR"), true);
  assert.equal(canViewSalesAi("MARKETING"), false);
});

test("liderança mantém acesso aos alunos e relatórios", () => {
  for (const role of ["DEV", "CVO", "CEO", "DIRETOR", "GERENTE"] as const) {
    assert.equal(canViewStudents(role), true);
    assert.equal(canViewGrowth(role), true);
    assert.equal(canReturnStudentToLead(role), true);
  }
});

test("marketing não altera matrícula nem retorna aluno para lead", () => {
  assert.equal(canReturnStudentToLead("MARKETING"), false);
});
