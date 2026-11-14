import type { PoolClient, QueryResultRow } from "pg";
import { ensureTeamSchema } from "@/lib/server/team-schema";
import { queryDb, withTransaction } from "@/lib/server/db";
import { ensureCommercialSchema, isUuid } from "@/lib/server/commercial-schema";

export type { TeamRepeat } from "@/lib/team-schedule";
import { nextOccurrence, localFields, type TeamRepeat } from "@/lib/team-schedule";

export type TeamScope = "individual" | "attendance" | "all";

type TaskRow = QueryResultRow & {
  id: string;
  unit_id: string;
  title: string;
  description: string;
  scope: TeamScope;
  attendance_id: string | null;
  user_ids: string[];
  due_at: string;
  next_due_at: string | null;
  repeat_until: string | null;
  recurrence: TeamRepeat;
  status: string;
  created_by: string | null;
};

async function resolveRecipients(client: PoolClient, task: TaskRow) {
  const result = await client.query<{ id: string }>(
    `select distinct u.id
     from app_users u join app_user_units uu on uu.user_id = u.id
     where uu.unit_id = $1 and u.role = 'CONSULTOR' and u.status = 'active'
       and (
         $2::text = 'all'
         or ($2::text = 'individual' and u.id = any($3::uuid[]))
         or ($2::text = 'attendance' and exists (
           select 1 from app_leads l
           where l.unit_id = $1 and l.attendance_id = $4
             and l.created_by = u.id and l.stage <> 'Matriculado'
         ))
       )`,
    [task.unit_id, task.scope, task.user_ids ?? [], task.attendance_id],
  );
  return result.rows.map((row) => row.id);
}

async function createOccurrence(client: PoolClient, task: TaskRow, iso: string) {
  const recipientIds = await resolveRecipients(client, task);
  const inserted = await client.query<{ id: string }>(
    `insert into app_team_occurrences (task_id, unit_id, due_at, recipient_count)
     values ($1, $2, $3, $4)
     on conflict (task_id, due_at) do update set recipient_count = excluded.recipient_count
     returning id`,
    [task.id, task.unit_id, iso, recipientIds.length],
  );
  const occurrenceId = inserted.rows[0].id;
  if (recipientIds.length) {
    await client.query(
      `insert into app_team_assignments (occurrence_id, unit_id, user_id)
       select $1, $2, unnest($3::uuid[])
       on conflict (occurrence_id, user_id) do nothing`,
      [occurrenceId, task.unit_id, recipientIds],
    );
    await client.query(
      `insert into app_team_notifications (unit_id, user_id, kind, title, body, href, event_key)
       select $1, user_id, 'task_new', 'Nova tarefa: ' || $2,
         $3, '/tarefas', $4 || ':' || user_id::text
       from app_team_assignments where occurrence_id = $5
       on conflict (unit_id, user_id, event_key) do nothing`,
      [
        task.unit_id,
        task.title,
        task.description.slice(0, 350),
        `task:new:${occurrenceId}`,
        occurrenceId,
      ],
    );
  }
  return recipientIds.length;
}

async function expandLocked(client: PoolClient, task: TaskRow, horizon: Date, maxRuns: number) {
  let cursor = task.next_due_at;
  let generated = 0;
  let advanced = 0;
  const recentCutoff = Date.now() - 24 * 3600_000;
  // On recovery, do not create a backlog of old recurring notifications.
  while (cursor && advanced < 600 && new Date(cursor).getTime() <= horizon.getTime()) {
    if (task.recurrence === "none" || new Date(cursor).getTime() >= recentCutoff) {
      await createOccurrence(client, task, cursor);
      generated++;
    }
    advanced++;
    cursor = nextOccurrence(cursor, task.due_at, task.recurrence, task.repeat_until);
    if (generated >= maxRuns) break;
  }
  if (advanced) {
    await client.query(
      "update app_team_tasks set next_due_at = $2, updated_at = now() where id = $1",
      [task.id, cursor],
    );
  }
  return generated;
}

export async function materializeTask(taskId: string, firstOnly = false) {
  await ensureTeamSchema();
  return withTransaction(async (client) => {
    const result = await client.query<TaskRow>(
      "select *, due_at::text as due_at, next_due_at::text as next_due_at, repeat_until::text as repeat_until from app_team_tasks where id = $1 and status = 'active' for update",
      [taskId],
    );
    if (!result.rows[0]) return 0;
    return expandLocked(
      client,
      result.rows[0],
      firstOnly ? new Date(result.rows[0].next_due_at ?? 0) : new Date(Date.now() + 10 * 60_000),
      firstOnly ? 1 : 20,
    );
  });
}

export async function materializeScheduledTasks() {
  await ensureTeamSchema();
  return withTransaction(async (client) => {
    const result = await client.query<TaskRow>(
      `select *, due_at::text as due_at, next_due_at::text as next_due_at, repeat_until::text as repeat_until from app_team_tasks where status = 'active' and next_due_at <= now() + interval '10 minutes'
       order by next_due_at limit 40 for update skip locked`,
    );
    let generated = 0;
    for (const task of result.rows) {
      generated += await expandLocked(client, task, new Date(Date.now() + 10 * 60_000), 20);
    }
    return { schedules: result.rowCount ?? 0, occurrences: generated };
  });
}

export async function createTeamTask(input: {
  unitId: string;
  actorId: string;
  title: string;
  description: string;
  scope: TeamScope;
  attendanceId: string | null;
  userIds: string[];
  dueAt: string;
  recurrence: TeamRepeat;
  repeatUntil: string | null;
}) {
  await ensureCommercialSchema();
  await ensureTeamSchema();
  if (!input.title.trim() || input.title.length > 140 || input.description.length > 2000) {
    throw new Error("Informe título de até 140 caracteres e descrição de até 2000.");
  }
  const date = new Date(input.dueAt);
  if (
    Number.isNaN(date.getTime()) ||
    date.getTime() < Date.now() - 60_000 ||
    date.getTime() > Date.now() + 366 * 24 * 3600_000
  ) {
    throw new Error("Escolha um prazo futuro dentro dos próximos 12 meses.");
  }
  if (!["none", "daily", "weekdays", "weekly", "monthly"].includes(input.recurrence)) {
    throw new Error("Recorrência inválida.");
  }
  if (!["individual", "attendance", "all"].includes(input.scope)) {
    throw new Error("Público inválido.");
  }
  if (
    input.repeatUntil &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(input.repeatUntil) ||
      input.repeatUntil <
        localFields(date).year.toString().padStart(4, "0") +
          "-" +
          String(localFields(date).month).padStart(2, "0") +
          "-" +
          String(localFields(date).day).padStart(2, "0"))
  ) {
    throw new Error("A data final da repetição deve ser igual ou posterior ao vencimento.");
  }
  if (
    input.scope === "individual" &&
    (!input.userIds.length || input.userIds.length > 100 || input.userIds.some((id) => !isUuid(id)))
  ) {
    throw new Error("Escolha ao menos um consultor válido.");
  }
  if (input.scope === "attendance" && (!input.attendanceId || !isUuid(input.attendanceId))) {
    throw new Error("Selecione uma turma válida.");
  }

  const id = await withTransaction(async (client) => {
    if (input.scope === "attendance") {
      const check = await client.query(
        "select id from app_course_attendances where id = $1 and unit_id = $2",
        [input.attendanceId, input.unitId],
      );
      if (!check.rowCount) throw new Error("Turma não pertence à unidade.");
    }
    if (input.scope === "individual") {
      const allowed = await client.query(
        `select distinct u.id from app_users u join app_user_units uu on uu.user_id = u.id
         where uu.unit_id = $1 and u.status = 'active' and u.role = 'CONSULTOR'
           and u.id = any($2::uuid[])`,
        [input.unitId, input.userIds],
      );
      if (allowed.rowCount !== new Set(input.userIds).size)
        throw new Error("Consultor não pertence à unidade.");
    }
    const result = await client.query<{ id: string }>(
      `insert into app_team_tasks
        (unit_id,title,description,scope,attendance_id,user_ids,due_at,next_due_at,repeat_until,recurrence,created_by)
       values($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10) returning id`,
      [
        input.unitId,
        input.title.trim(),
        input.description.trim(),
        input.scope,
        input.scope === "attendance" ? input.attendanceId : null,
        input.scope === "individual" ? [...new Set(input.userIds)] : [],
        date.toISOString(),
        input.repeatUntil,
        input.recurrence,
        input.actorId,
      ],
    );
    return result.rows[0].id;
  });
  await materializeTask(id, true);
  return id;
}

export async function teamOptions(unitId: string) {
  await ensureCommercialSchema();
  await ensureTeamSchema();
  const [users, attendances] = await Promise.all([
    queryDb<{ id: string; name: string; status: string }>(
      `select distinct u.id,u.name,u.status from app_users u
       join app_user_units uu on uu.user_id=u.id
       where uu.unit_id=$1 and u.role='CONSULTOR' order by u.name`,
      [unitId],
    ),
    queryDb<{ id: string; name: string; people: string }>(
      `select a.id, concat(c.name, ' · ', a.city, '/', a.state, ' · ', to_char(a.class_date,'DD/MM/YYYY')) as name,
        (select count(distinct l.created_by)::text from app_leads l
         join app_user_units uu on uu.user_id = l.created_by and uu.unit_id = $1
         join app_users u on u.id = l.created_by and u.status = 'active' and u.role = 'CONSULTOR'
         where l.unit_id=$1 and l.attendance_id = a.id and l.stage <> 'Matriculado') as people
       from app_course_attendances a join app_courses c on c.id=a.course_id
       where a.unit_id=$1 order by a.class_date desc limit 150`,
      [unitId],
    ),
  ]);
  return {
    users: users.rows,
    attendances: attendances.rows.map((a) => ({ ...a, people: Number(a.people) || 0 })),
  };
}

export async function listTeamTasks(unitId: string, userId: string, canManage: boolean) {
  await ensureTeamSchema();
  const [tasks, assignments, team, legacy] = await Promise.all([
    queryDb(
      `select t.id, t.title, t.description, t.scope, t.attendance_id, t.recurrence,
         t.status, t.created_by, t.due_at::text, t.next_due_at::text, t.repeat_until::text,
         t.created_at::text, u.name as creator_name,
         count(distinct o.id)::int as run_count,
         count(a.id)::int as assigned_count,
         count(a.id) filter(where a.status='done')::int as done_count
       from app_team_tasks t
       left join app_users u on u.id=t.created_by
       left join app_team_occurrences o on o.task_id=t.id
       left join app_team_assignments a on a.occurrence_id=o.id
       where t.unit_id=$1 and t.status <> 'archived'
         and ($3::boolean or exists(
           select 1 from app_team_assignments mine join app_team_occurrences myrun
             on mine.occurrence_id=myrun.id
           where myrun.task_id=t.id and mine.user_id=$2
         ))
       group by t.id,u.name order by t.created_at desc limit 250`,
      [unitId, userId, canManage],
    ),
    queryDb(
      `select a.id,a.user_id,u.name as recipient_name,a.status,a.completed_at::text,a.completion_note,
        o.id as occurrence_id,o.task_id,o.due_at::text,t.title,t.description,t.scope,t.recurrence,
        creator.name as creator_name
       from app_team_assignments a
       join app_team_occurrences o on o.id=a.occurrence_id and o.unit_id=a.unit_id
       join app_team_tasks t on t.id=o.task_id and t.status <> 'archived'
       left join app_users creator on creator.id=t.created_by
       join app_users u on u.id=a.user_id
       where a.unit_id=$1 and ($3::boolean or a.user_id=$2)
       order by o.due_at desc limit 400`,
      [unitId, userId, canManage],
    ),
    canManage
      ? queryDb(
          `select u.id,u.name,
        count(a.id)::int as total,
        count(a.id) filter(where a.status='done')::int as done,
        count(a.id) filter(where a.status='pending' and o.due_at < now())::int as overdue
       from app_users u join app_user_units uu on uu.user_id=u.id and uu.unit_id=$1
       left join app_team_assignments a on a.user_id=u.id and a.unit_id=$1
       left join app_team_occurrences o on o.id=a.occurrence_id
       where u.role='CONSULTOR' and u.status='active'
       group by u.id,u.name order by overdue desc,u.name`,
          [unitId],
        )
      : Promise.resolve({ rows: [] }),
    queryDb(
      `select t.id, t.title, t.notes as description,t.due_at::text,t.status,
        l.full_name as lead_name,t.lead_id
       from app_crm_tasks t join app_leads l on l.id=t.lead_id and l.unit_id=t.unit_id
       where t.unit_id=$1 and t.created_by=$2 and t.status <> 'archived'
       order by t.due_at asc limit 100`,
      [unitId, userId],
    ).catch(() => ({ rows: [] })),
  ]);
  return {
    tasks: tasks.rows,
    assignments: assignments.rows,
    team: team.rows,
    legacy: legacy.rows,
  };
}

export async function completeTeamAssignment(
  unitId: string,
  userId: string,
  assignmentId: string,
  note: string,
) {
  await ensureTeamSchema();
  const result = await queryDb(
    `update app_team_assignments
     set status='done',completed_at=coalesce(completed_at,now()),completion_note=$4
     where id=$1 and unit_id=$2 and user_id=$3 and status='pending' returning id`,
    [assignmentId, unitId, userId, note.slice(0, 500)],
  );
  if (!result.rowCount) throw new Error("Tarefa não encontrada ou já concluída.");
  return true;
}

export async function changeTeamTaskStatus(
  unitId: string,
  taskId: string,
  status: "active" | "paused" | "archived",
) {
  await ensureTeamSchema();
  return withTransaction(async (client) => {
    const result = await client.query<TaskRow>(
      `select *, due_at::text as due_at, next_due_at::text as next_due_at,
       repeat_until::text as repeat_until
       from app_team_tasks where id=$1 and unit_id=$2 and status <> 'archived'
       for update`,
      [taskId, unitId],
    );
    const task = result.rows[0];
    if (!task) throw new Error("Tarefa não encontrada.");
    let next = task.next_due_at;
    if (status === "active" && task.status === "paused" && next) {
      // Tarefas que ficaram pausadas não disparam dezenas de ocorrências antigas.
      for (let tries = 0; tries < 600 && next && new Date(next).getTime() < Date.now(); tries++) {
        next = nextOccurrence(next, task.due_at, task.recurrence, task.repeat_until);
      }
      if (next && new Date(next).getTime() < Date.now()) {
        throw new Error("Repetição antiga demais; arquive e crie uma nova série.");
      }
    }
    await client.query(
      `update app_team_tasks set status=$3,next_due_at=$4,updated_at=now()
       where id=$1 and unit_id=$2`,
      [taskId, unitId, status, next],
    );
    return true;
  });
}
