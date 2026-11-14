import { createFileRoute } from "@tanstack/react-router";
import { processTeamOperations } from "@/lib/server/team-communications";

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const result = await processTeamOperations();
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[cron/team-management]", error);
    return Response.json({ ok: false, error: "Falha na rotina." }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/team-management")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
