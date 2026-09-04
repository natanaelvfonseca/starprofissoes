import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { LeadOwnershipError, assumeLeadOwnership } from "../src/lib/lead-ownership.ts";

const ids = {
  lead: "11111111-1111-4111-8111-111111111111",
  unit: "22222222-2222-4222-8222-222222222222",
  first: "33333333-3333-4333-8333-333333333333",
  second: "44444444-4444-4444-8444-444444444444",
  third: "55555555-5555-4555-8555-555555555555",
};

function ownershipClient(state: { ownerId: string }) {
  const statements: Array<string> = [];
  const client = {
    async query(sql: string, params: Array<unknown> = []) {
      statements.push(sql);
      if (sql.includes("from app_leads") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: ids.lead,
              unit_id: ids.unit,
              created_by: state.ownerId,
              shared_queue: false,
              stage: "Em contato",
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("from app_users consultant")) {
        return { rows: [{ allowed: true }], rowCount: 1 };
      }
      if (sql.includes("update app_leads")) {
        if (state.ownerId !== params[3]) return { rows: [], rowCount: 0 };
        state.ownerId = String(params[1]);
        return { rows: [{ id: ids.lead }], rowCount: 1 };
      }
      if (sql.includes("to_regclass")) {
        return { rows: [{ tasks_table: null, meta_table: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  return { client: client as unknown as PoolClient, statements };
}

test("assumir atendimento bloqueia a linha e registra histórico", async () => {
  const state = { ownerId: ids.first };
  const { client, statements } = ownershipClient(state);

  const result = await assumeLeadOwnership(client, {
    leadId: ids.lead,
    unitId: ids.unit,
    userId: ids.second,
    expectedOwnerId: ids.first,
  });

  assert.equal(result.changed, true);
  assert.equal(state.ownerId, ids.second);
  assert.ok(statements.some((sql) => /for update/i.test(sql)));
  assert.ok(statements.some((sql) => /insert into app_lead_owner_transfers/i.test(sql)));
});

test("duas tomadas concorrentes não sobrescrevem o novo responsável", async () => {
  const state = { ownerId: ids.first };
  const { client } = ownershipClient(state);

  await assumeLeadOwnership(client, {
    leadId: ids.lead,
    unitId: ids.unit,
    userId: ids.second,
    expectedOwnerId: ids.first,
  });

  await assert.rejects(
    () =>
      assumeLeadOwnership(client, {
        leadId: ids.lead,
        unitId: ids.unit,
        userId: ids.third,
        expectedOwnerId: ids.first,
      }),
    (error: unknown) => error instanceof LeadOwnershipError && error.status === 409,
  );
  assert.equal(state.ownerId, ids.second);
});
