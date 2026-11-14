import test from "node:test";
import assert from "node:assert/strict";
import { isTeamManagementInstance } from "../src/lib/team-message-guards.ts";

test("WhatsApp da gestão é isolado do fluxo comercial de leads", () => {
  assert.equal(isTeamManagementInstance("star_gestao_abcdef", null), true);
  assert.equal(isTeamManagementInstance("star_gestao_abcdef", "some-user"), false);
  assert.equal(isTeamManagementInstance("star_sjc_consultor", null), false);
});
