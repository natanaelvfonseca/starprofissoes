import { createFileRoute } from "@tanstack/react-router";
import { processNextFinancialSyncBatch } from "@/lib/server/financial";

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  return Response.json({ ok: true, result: await processNextFinancialSyncBatch() });
}

export const Route = createFileRoute("/api/cron/financeiro-caez-sync")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
