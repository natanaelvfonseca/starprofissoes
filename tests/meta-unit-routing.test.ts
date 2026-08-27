import assert from "node:assert/strict";
import test from "node:test";
import {
  getMetaUnitConfigurationIssue,
  resolveMetaPageUnit,
} from "../src/lib/server/meta-unit-routing.ts";

test("uma Página nova herda a unidade autenticada da conexão", () => {
  assert.equal(resolveMetaPageUnit(null, "unit-tramandai"), "unit-tramandai");
});

test("uma Página existente não pode ser reassociada silenciosamente", () => {
  assert.throws(() => resolveMetaPageUnit("unit-bh", "unit-tramandai"), /transferência/i);
});

test("Página sem unidade fica pendente e não pode rotear lead", () => {
  assert.match(
    getMetaUnitConfigurationIssue(null, { status: "active", unitId: "unit-tramandai" }) ?? "",
    /não possui unidade/i,
  );
});

test("formulário só fica apto quando herda a mesma unidade da Página", () => {
  assert.match(
    getMetaUnitConfigurationIssue("unit-tramandai", { status: "active", unitId: "unit-bh" }) ?? "",
    /diverge/i,
  );
  assert.equal(
    getMetaUnitConfigurationIssue("unit-tramandai", {
      status: "active",
      unitId: "unit-tramandai",
    }),
    null,
  );
});
