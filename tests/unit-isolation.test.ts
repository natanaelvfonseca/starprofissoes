import assert from "node:assert/strict";
import test from "node:test";
import type { AuthSession } from "../src/lib/auth-types.ts";
import { activeSessionUnit, resolveActiveSessionUnit } from "../src/lib/unit-isolation.ts";

const bh = { id: "11111111-1111-4111-8111-111111111111", name: "BH", slug: "bh" };
const goiania = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Goiânia",
  slug: "goiania",
};
const session = {
  user: {
    id: "33333333-3333-4333-8333-333333333333",
    email: "dev@example.com",
    name: "Dev",
    role: "DEV",
    avatarUrl: null,
  },
  units: [bh, goiania],
  activeUnit: bh,
  canRegisterUsers: true,
  canCreateUnits: true,
  features: { whatsappSupervision: true },
} satisfies AuthSession;

test("escopo sem parâmetro usa somente a unidade ativa", () => {
  assert.deepEqual(activeSessionUnit(session), bh);
  assert.deepEqual(resolveActiveSessionUnit(session), bh);
});

test("escopo rejeita outra unidade mesmo quando o usuário possui acesso a ela", () => {
  assert.equal(resolveActiveSessionUnit(session, goiania.id), null);
});

test("parâmetro legado de todas as unidades resolve para a ativa sem agregar a rede", () => {
  assert.deepEqual(resolveActiveSessionUnit(session, "all", ["all"]), bh);
  assert.deepEqual(resolveActiveSessionUnit(session, "__all__", ["__all__"]), bh);
});

test("sessão inconsistente não produz escopo de unidade", () => {
  assert.equal(activeSessionUnit({ ...session, units: [goiania] }), null);
  assert.equal(resolveActiveSessionUnit({ ...session, activeUnit: null }), null);
});
