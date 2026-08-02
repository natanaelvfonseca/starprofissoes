import assert from "node:assert/strict";
import test from "node:test";
import { canSwitchActiveUnit, type UserRole } from "../src/lib/auth-types.ts";

test("DEV, CEO e CVO podem trocar a unidade ativa", () => {
  for (const role of ["DEV", "CEO", "CVO"] satisfies Array<UserRole>) {
    assert.equal(canSwitchActiveUnit(role), true);
  }
});

test("demais perfis não podem trocar a unidade ativa", () => {
  for (const role of ["DIRETOR", "GERENTE", "MARKETING", "CONSULTOR"] satisfies Array<UserRole>) {
    assert.equal(canSwitchActiveUnit(role), false);
  }
});
