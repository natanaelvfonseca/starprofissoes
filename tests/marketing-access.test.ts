import assert from "node:assert/strict";
import test from "node:test";
import {
  canConnectMetaAds,
  canCreateUnits,
  canDeleteUsers,
  canEditUsers,
  canManageMetaAds,
  canManageUnits,
  canRegisterUsers,
  canViewManagement,
  canViewMetaAds,
} from "../src/lib/auth-types.ts";

test("Marketing possui acesso administrativo operacional", () => {
  assert.equal(canRegisterUsers("MARKETING"), true);
  assert.equal(canEditUsers("MARKETING"), true);
  assert.equal(canDeleteUsers("MARKETING"), true);
  assert.equal(canCreateUnits("MARKETING"), true);
  assert.equal(canManageUnits("MARKETING"), true);
  assert.equal(canViewManagement("MARKETING"), true);
});

test("Marketing pode configurar e gerenciar o Meta Ads", () => {
  assert.equal(canViewMetaAds("MARKETING"), true);
  assert.equal(canConnectMetaAds("MARKETING"), true);
  assert.equal(canManageMetaAds("MARKETING"), true);
});
