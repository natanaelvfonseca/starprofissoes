import { createFileRoute } from "@tanstack/react-router";
import {
  enqueueChangedWhatsappConversations,
  processWhatsappAnalysisQueue,
} from "@/lib/server/whatsapp-conversation-ai";
import { reconcileCanonicalHistory } from "@/lib/server/whatsapp-supervision";
import { syncStarEvolutionHistory } from "@/lib/server/evolution-whatsapp";

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("queueOnly") === "1") {
    const requestedLimit = Number(url.searchParams.get("limit") || 40);
    const processed = await processWhatsappAnalysisQueue(
      Number.isFinite(requestedLimit) ? requestedLimit : 40,
    );
    return Response.json({ ok: true, mode: "queue", processed });
  }
  const sync = await syncStarEvolutionHistory();
  const reconciled = await reconcileCanonicalHistory();
  const shouldEnqueue = new Date().getUTCHours() === 6 || url.searchParams.get("force") === "1";
  const enqueue = shouldEnqueue
    ? await enqueueChangedWhatsappConversations()
    : { scanned: 0, queued: 0 };
  const processed = await processWhatsappAnalysisQueue(50);
  return Response.json({ ok: true, sync, reconciled, enqueue, processed });
}

export const Route = createFileRoute("/api/cron/whatsapp-analysis")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
