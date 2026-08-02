import assert from "node:assert/strict";
import test from "node:test";
import {
  canViewCrmFinancialSwitcher,
  canViewStudentSwitcher,
  type UserRole,
} from "../src/lib/auth-types.ts";

test("DEV visualiza CRM, Financeiro e Aluno no topo", () => {
  assert.equal(canViewCrmFinancialSwitcher("DEV"), true);
  assert.equal(canViewStudentSwitcher("DEV"), true);
});

test("CEO visualiza somente CRM e Financeiro no topo", () => {
  assert.equal(canViewCrmFinancialSwitcher("CEO"), true);
  assert.equal(canViewStudentSwitcher("CEO"), false);
});

test("demais perfis não visualizam o seletor de sistemas", () => {
  const roles: Array<UserRole> = ["CVO", "DIRETOR", "GERENTE", "MARKETING", "CONSULTOR"];

  for (const role of roles) {
    assert.equal(canViewCrmFinancialSwitcher(role), false);
    assert.equal(canViewStudentSwitcher(role), false);
  }
});
