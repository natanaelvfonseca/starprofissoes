import { createFileRoute } from "@tanstack/react-router";
import { queryDb } from "@/lib/server/db";

type DbHealthRow = {
  schema_name: string;
  checked_at: string;
};

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/health/db")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await queryDb<DbHealthRow>(`
            select
              current_schema() as schema_name,
              now()::text as checked_at
          `);

          const row = result.rows[0];

          return Response.json(
            {
              ok: true,
              schema: row?.schema_name ?? null,
              checkedAt: row?.checked_at ?? null,
            },
            { headers: noStoreHeaders },
          );
        } catch (error) {
          console.error("[db-health] Database health check failed", error);

          return Response.json(
            {
              ok: false,
              error: "Database health check failed",
            },
            { status: 500, headers: noStoreHeaders },
          );
        }
      },
    },
  },
});
