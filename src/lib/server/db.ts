import { createServerOnlyFn } from "@tanstack/react-start";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

declare global {
  var __starDbPool: Pool | undefined;
}

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
