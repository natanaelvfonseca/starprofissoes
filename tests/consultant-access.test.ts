import assert from "node:assert/strict";
import test from "node:test";
import {
  canClaimLeads,
  canExportLeads,
  canImportLeads,
  canReturnStudentToLead,
  canTransferLeads,
  canViewAllUnitLeads,
  canViewAllUnitPipelineLeads,
  canViewGrowth,
  canViewSalesAi,
  canViewStudents,
} from "../src/lib/auth-types.ts";

test("todos os perfis ativos podem pegar um lead da fila compartilhada", () => {
  for (const role of [
    "DEV",
    "CEO",
    "CVO",
    "DIRETOR",
    "GERENTE",
    "MARKETING",
    "CONSULTOR",
  ] as const) {
    assert.equal(canClaimLeads(role), true);
  }
});

test("consultor acessa alunos, mas não acessa relatórios", () => {
  assert.equal(canViewStudents("CONSULTOR"), true);
  assert.equal(canViewGrowth("CONSULTOR"), false);
});

test("somente o consultor não pode importar nem exportar leads", () => {
  for (const role of ["DEV", "CEO", "CVO", "DIRETOR", "GERENTE", "MARKETING"] as const) {
    assert.equal(canExportLeads(role), true);
    assert.equal(canImportLeads(role), true);
  }

  assert.equal(canExportLeads("CONSULTOR"), false);
  assert.equal(canImportLeads("CONSULTOR"), false);
  assert.equal(canExportLeads("CONSULTOR", "natanaelfonseca@gmail.com"), false);
});

test("consultor pode alternar entre sua carteira e o pipeline da unidade", () => {
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
