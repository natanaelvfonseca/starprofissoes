import { createHash } from "node:crypto";
import { createServerOnlyFn } from "@tanstack/react-start";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

declare global {
  var __starDbPool: Pool | undefined;
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

const getDbPool = createServerOnlyFn(async () => {
  if (globalThis.__starDbPool) {
    return globalThis.__starDbPool;
  }

  const { Pool } = await import("pg");

  globalThis.__starDbPool = new Pool({
    connectionString: getDatabaseUrl(),
    options: `-c search_path=${getDatabaseSchema()},public`,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });

  return globalThis.__starDbPool;
});

export async function queryDb<TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  values: ReadonlyArray<unknown> = [],
): Promise<QueryResult<TRow>> {
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
