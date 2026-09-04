import assert from "node:assert/strict";
import test from "node:test";
import { canAccessMetaAdsScreen, canManageMetaAds } from "../src/lib/auth-types.ts";

test("somente o e-mail master acessa a tela Meta Ads", () => {
  assert.equal(canAccessMetaAdsScreen("natanaelfonseca@gmail.com"), true);
  assert.equal(canAccessMetaAdsScreen("  NATANAELFONSECA@GMAIL.COM  "), true);
  assert.equal(canAccessMetaAdsScreen("marketing@starprofissoes.com.br"), false);
  assert.equal(canAccessMetaAdsScreen("outro@gmail.com"), false);
  assert.equal(canAccessMetaAdsScreen(null), false);
  assert.equal(canAccessMetaAdsScreen(undefined), false);
});

test("permissão atual de Integrações de Leads permanece inalterada", () => {
  assert.equal(canManageMetaAds("DEV"), true);
  assert.equal(canManageMetaAds("CVO"), true);
  assert.equal(canManageMetaAds("MARKETING"), true);
  assert.equal(canManageMetaAds("DIRETOR"), false);
  assert.equal(canManageMetaAds("GERENTE"), false);
  assert.equal(canManageMetaAds("CONSULTOR"), false);
});
