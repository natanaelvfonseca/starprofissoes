import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getUnitFromRequest, isUuid } from "@/lib/server/commercial-schema";
import { canViewAllUnitLeads, canViewStudents } from "@/lib/auth-types";
import { queryDb } from "@/lib/server/db";

export const Route = createFileRoute("/api/crm/lead-history")({
  server: { handlers: {
    GET: async ({ request }) => {
      const session = await getSessionFromRequest(request);
      if (!session) return Response.json({error:"Não autenticado."},{status:401});
      const unit = getUnitFromRequest(session, request);
      if (!unit) return Response.json({error:"Unidade indisponível."},{status:403});
      const url = new URL(request.url);
      const leadId = url.searchParams.get("leadId") ?? "";
      if (!isUuid(leadId)) return Response.json({error:"Lead inválido."},{status:400});
      const offset = Math.max(0, Math.min(100000, Number.parseInt(url.searchParams.get("offset") ?? "0",10) || 0));
      const lead = (await queryDb<{created_by:string|null;stage:string}>(
        "select created_by,stage from app_leads where id=$1 and unit_id=$2",
        [leadId,unit.id]
      )).rows[0];
      if (!lead || (!canViewAllUnitLeads(session.user.role) && lead.created_by !== session.user.id) ||
          (lead.stage === "Matriculado" && !canViewStudents(session.user.role))) {
        return Response.json({error:"Lead indisponível."},{status:404});
      }
      const result = await queryDb(
        `select id::text, actor_name as "actorName",source,event_type as "eventType",details,occurred_at as "occurredAt"
          from app_lead_history where unit_id=$1 and lead_id=$2
          order by occurred_at desc,id desc limit 51 offset $3`,[unit.id,leadId,offset]);
      return Response.json({events:result.rows.slice(0,50),hasMore:result.rows.length>50},
        {headers:{"Cache-Control":"private, no-store"}});
    }
  }}
});
