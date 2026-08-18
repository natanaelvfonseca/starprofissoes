import assert from "node:assert/strict";
import test from "node:test";
import { canManageMetaAds } from "../src/lib/auth-types.ts";
import { isMetaConnectionAlreadyUnavailable } from "../src/lib/server/meta-disconnect.ts";

test("permite gerenciamento do Meta Ads para perfis master e Marketing", () => {
  assert.equal(canManageMetaAds("DEV"), true);
  assert.equal(canManageMetaAds("CVO"), true);
  assert.equal(canManageMetaAds("MARKETING"), true);
  assert.equal(canManageMetaAds("CEO"), false);
  assert.equal(canManageMetaAds("DIRETOR"), false);
  assert.equal(canManageMetaAds("GERENTE"), false);
  assert.equal(canManageMetaAds("CONSULTOR"), false);
});

test("permite limpeza local quando o token Meta está inválido ou expirado", () => {
  assert.equal(
    isMetaConnectionAlreadyUnavailable({
      error: { code: 190, error_subcode: 463, message: "Error validating access token" },
    }),
    true,
  );
  assert.equal(
    isMetaConnectionAlreadyUnavailable({ error: { message: "OAuth access token has expired" } }),
    true,
  );
});

test("permite limpeza local quando a página já foi desinscrita externamente", () => {
  assert.equal(
    isMetaConnectionAlreadyUnavailable({
      error: { code: 100, message: "Object does not exist or cannot be loaded" },
    }),
    true,
  );
  assert.equal(
    isMetaConnectionAlreadyUnavailable({ error: { message: "App is already unsubscribed" } }),
    true,
  );
});

test("não autoriza limpeza local em erro inesperado da Graph API", () => {
  assert.equal(
    isMetaConnectionAlreadyUnavailable({
      error: { code: 200, message: "Unexpected permissions error" },
    }),
    false,
  );
  assert.equal(isMetaConnectionAlreadyUnavailable({ success: false }), false);
});
