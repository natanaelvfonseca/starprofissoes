import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { createServerOnlyFn } from "@tanstack/react-start";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

declare global {
  var __starDbPool: Pool | undefined;
  var __starDbPoolPromise: Promise<Pool> | undefined;
}

type LeadAuditActor = { id: string; name: string; source: string };
const leadAuditContext = new AsyncLocalStorage<LeadAuditActor>();

export function withLeadAuditActor<T>(user: { id: string; name: string }, source: string, fn: () => Promise<T>) {
  return leadAuditContext.run({ id: user.id, name: user.name, source }, fn);
}

async function setTransactionAuditActor(client: PoolClient) {
  const actor = leadAuditContext.getStore();
  if (actor) {
    await client.query("select set_config('star.audit_actor_id',$1,true), set_config('star.audit_actor_name',$2,true), set_config('star.audit_source',$3,true)", [actor.id, actor.name, actor.source]);
  }
}

const RUNTIME_SCHEMA_LOCK_KEY = "star_profissoes:runtime_schema";

const getDatabaseUrl = createServerOnlyFn(() => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return databaseUrl;
});

const getDatabaseSchema = createServerOnlyFn(() => {
  const schema = process.env.DATABASE_SCHEMA ?? "public";

  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error("DATABASE_SCHEMA is invalid");
  }

  return schema;
});

const getDbPool = createServerOnlyFn(() => {
  if (globalThis.__starDbPool) {
    return Promise.resolve(globalThis.__starDbPool);
  }

  if (!globalThis.__starDbPoolPromise) {
    globalThis.__starDbPoolPromise = import("pg")
      .then(({ Pool }) => {
        const pool = new Pool({
          connectionString: getDatabaseUrl(),
          options: `-c search_path=${getDatabaseSchema()},public`,
          application_name: "star-easypanel",
          connectionTimeoutMillis: 20_000,
          idleTimeoutMillis: 30_000,
          keepAlive: true,
          max: 10,
        });

        globalThis.__starDbPool = pool;
        return pool;
      })
      .catch((error) => {
        globalThis.__starDbPoolPromise = undefined;
        throw error;
      });
  }

  return globalThis.__starDbPoolPromise;
});

export async function queryDb<TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  values: ReadonlyArray<unknown> = [],
): Promise<QueryResult<TRow>> {
  if (leadAuditContext.getStore() && /^\s*(insert|update|delete|with)\b/i.test(text)) {
    return withTransaction((client) => client.query<TRow>(text, [...values]));
  }
  const pool = await getDbPool();

  return pool.query<TRow>(text, [...values]);
}

export async function ensureRuntimeSchema(schemaKey: string, sql: string) {
  const schemaVersion = createHash("sha256").update(sql).digest("hex");

  await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [RUNTIME_SCHEMA_LOCK_KEY]);
    await client.query(`
      create table if not exists app_runtime_schema_versions (
        schema_key text not null,
        schema_version text not null,
        applied_at timestamptz not null default now(),
        primary key (schema_key, schema_version)
      )
    `);

    const applied = await client.query(
      `select 1 from app_runtime_schema_versions
       where schema_key = $1 and schema_version = $2
       limit 1`,
      [schemaKey, schemaVersion],
    );

    if (applied.rowCount) {
      return;
    }

    await client.query(sql);
    await client.query(
      `insert into app_runtime_schema_versions (schema_key, schema_version)
       values ($1, $2)
       on conflict do nothing`,
      [schemaKey, schemaVersion],
    );
  });
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = await getDbPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    await setTransactionAuditActor(client);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
