import assert from "node:assert/strict";
import test from "node:test";
import { countActiveUnitConsultants } from "../src/lib/lead-distribution.ts";

test("distribuição consulta todos os consultores ativos da unidade, sem vínculo por turma", async () => {
  const queries: Array<{ sql: string; params: Array<unknown> }> = [];
  const client = {
    query: async (sql: string, params: Array<unknown>) => {
      queries.push({ sql, params });
      return { rows: [{ total: "7" }] };
    },
  };

  const total = await countActiveUnitConsultants(client, "unit-1");

  assert.equal(total, 7);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, ["unit-1"]);
  assert.match(queries[0].sql, /user_account\.primary_unit_id = \$1/);
  assert.match(queries[0].sql, /app_user_units/);
  assert.doesNotMatch(queries[0].sql, /app_course_attendance_consultants/);
});
