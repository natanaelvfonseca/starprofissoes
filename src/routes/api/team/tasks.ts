import { createFileRoute } from "@tanstack/react-router";
import { canTransferLeads } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/commercial-schema";
import { queryDb } from "@/lib/server/db";
import {
  changeTeamTaskStatus,
  completeTeamAssignment,
  createTeamTask,
  listTeamTasks,
  teamOptions,
  type TeamRepeat,
  type TeamScope,
} from "@/lib/server/team-tasks";
import { ensureTeamSchema } from "@/lib/server/team-schema";

async function guard(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return { error: Response.json({ error: "Não autenticado." }, { status: 401 }) };
  if (!session.activeUnit)
    return { error: Response.json({ error: "Unidade indisponível." }, { status: 403 }) };
  return { session, unit: session.activeUnit };
}
function errorResponse(error: unknown, status = 400) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Não foi possível concluir." },
    { status },
  );
}

export const Route = createFileRoute("/api/team/tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await guard(request);
        if ("error" in auth) return auth.error;
        const { session, unit } = auth;
        const manage = canTransferLeads(session.user.role);
        try {
          const [tasks, options, myContact] = await Promise.all([
            listTeamTasks(unit.id, session.user.id, manage),
            teamOptions(unit.id),
            (async () => {
              await ensureTeamSchema();
              const row = await queryDb(
                `select phone,opt_in,consent_at::text
               from app_team_contacts where unit_id=$1 and user_id=$2`,
                [unit.id, session.user.id],
              );
              return row.rows[0] ?? { phone: "", opt_in: false, consent_at: null };
            })(),
          ]);
          return Response.json(
            { ...tasks, options, myContact, canManage: manage },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (error) {
          console.error("[team/tasks] GET", error);
          return errorResponse(error, 500);
        }
      },
      POST: async ({ request }) => {
        const auth = await guard(request);
        if ("error" in auth) return auth.error;
        const { session, unit } = auth;
        if (!canTransferLeads(session.user.role)) {
          return Response.json(
            { error: "Somente a gestão pode distribuir tarefas." },
            { status: 403 },
          );
        }
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return Response.json({ error: "Dados inválidos." }, { status: 400 });
        try {
          const id = await createTeamTask({
            unitId: unit.id,
            actorId: session.user.id,
            title: String(body.title ?? "").trim(),
            description: String(body.description ?? "").trim(),
            scope: String(body.scope ?? "individual") as TeamScope,
            userIds: Array.isArray(body.userIds) ? body.userIds.map(String) : [],
            attendanceId: typeof body.attendanceId === "string" ? body.attendanceId : null,
            dueAt: String(body.dueAt ?? ""),
            recurrence: String(body.recurrence ?? "none") as TeamRepeat,
            repeatUntil:
              typeof body.repeatUntil === "string" && body.repeatUntil ? body.repeatUntil : null,
          });
          const recipients = await queryDb<{ total: string }>(
            `select count(*)::text as total
           from app_team_assignments a join app_team_occurrences o
             on o.id=a.occurrence_id
           where o.task_id=$1 and o.unit_id=$2`,
            [id, unit.id],
          );
          return Response.json(
            {
              ok: true,
              id,
              recipientCount: Number(recipients.rows[0]?.total ?? 0),
            },
            { status: 201 },
          );
        } catch (error) {
          return errorResponse(error);
        }
      },
      PATCH: async ({ request }) => {
        const auth = await guard(request);
        if ("error" in auth) return auth.error;
        const { session, unit } = auth;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return errorResponse(new Error("Dados inválidos."));
        try {
          if (body.action === "complete") {
            const assignmentId = String(body.assignmentId ?? "");
            if (!isUuid(assignmentId)) throw new Error("Tarefa inválida.");
            await completeTeamAssignment(
              unit.id,
              session.user.id,
              assignmentId,
              String(body.note ?? ""),
            );
            return Response.json({ ok: true });
          }
          if (body.action === "task_status") {
            if (!canTransferLeads(session.user.role))
              return Response.json({ error: "Acesso negado." }, { status: 403 });
            const taskId = String(body.taskId ?? "");
            const status = String(body.status ?? "");
            if (!isUuid(taskId) || !["active", "paused", "archived"].includes(status)) {
              throw new Error("Identificador ou status inválido.");
            }
            await changeTeamTaskStatus(unit.id, taskId, status as "active" | "paused" | "archived");
            return Response.json({ ok: true });
          }
          throw new Error("Ação inválida.");
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
