import { ensureRuntimeSchema } from "@/lib/server/db";
import { ensureEvolutionSchema } from "@/lib/server/evolution-whatsapp";
import { ensureCommercialSchema } from "@/lib/server/commercial-schema";
import { ensureCourseAttendanceSchema } from "@/lib/server/course-attendances";

let schemaPromise: Promise<void> | null = null;

export async function ensureTeamSchema() {
  schemaPromise ??= (async () => {
    await ensureCommercialSchema();
    await ensureCourseAttendanceSchema();
    await ensureEvolutionSchema();
    await ensureRuntimeSchema(
      "team-management-1",
      `
      create table if not exists app_team_tasks (
        id uuid primary key default gen_random_uuid(),
        unit_id uuid not null references app_units(id) on delete cascade,
        title text not null,
        description text not null default '',
        scope text not null check (scope in ('individual','attendance','all')),
        attendance_id uuid references app_course_attendances(id) on delete set null,
        user_ids uuid[] not null default '{}',
        due_at timestamptz not null,
        next_due_at timestamptz,
        repeat_until date,
        recurrence text not null default 'none'
          check (recurrence in ('none','daily','weekdays','weekly','monthly')),
        status text not null default 'active'
          check (status in ('active','paused','archived')),
        created_by uuid references app_users(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (length(title) between 1 and 140)
      );
      create index if not exists app_team_tasks_scheduler_idx
        on app_team_tasks (next_due_at) where status = 'active';
      create index if not exists app_team_tasks_unit_idx
        on app_team_tasks (unit_id, created_at desc);

      create table if not exists app_team_occurrences (
        id uuid primary key default gen_random_uuid(),
        task_id uuid not null references app_team_tasks(id) on delete cascade,
        unit_id uuid not null references app_units(id) on delete cascade,
        due_at timestamptz not null,
        recipient_count integer not null default 0,
        created_at timestamptz not null default now(),
        unique(task_id, due_at)
      );
      create index if not exists app_team_occurrences_unit_idx
        on app_team_occurrences (unit_id, due_at desc);

      create table if not exists app_team_assignments (
        id uuid primary key default gen_random_uuid(),
        occurrence_id uuid not null references app_team_occurrences(id) on delete cascade,
        unit_id uuid not null references app_units(id) on delete cascade,
        user_id uuid not null references app_users(id) on delete cascade,
        status text not null default 'pending' check (status in ('pending','done')),
        completed_at timestamptz,
        completion_note text not null default '',
        created_at timestamptz not null default now(),
        unique (occurrence_id, user_id)
      );
      create index if not exists app_team_assignments_user_idx
        on app_team_assignments (unit_id, user_id, status, created_at desc);

      create table if not exists app_team_notifications (
        id uuid primary key default gen_random_uuid(),
        unit_id uuid not null references app_units(id) on delete cascade,
        user_id uuid not null references app_users(id) on delete cascade,
        kind text not null,
        title text not null,
        body text not null default '',
        href text not null default '/tarefas',
        event_key text not null,
        read_at timestamptz,
        created_at timestamptz not null default now(),
        unique(unit_id, user_id, event_key)
      );
      create index if not exists app_team_notifications_user_idx
        on app_team_notifications (unit_id, user_id, created_at desc);
      create index if not exists app_team_notifications_unread_idx
        on app_team_notifications (user_id, created_at desc) where read_at is null;

      create table if not exists app_team_alert_rules (
        id uuid primary key default gen_random_uuid(),
        unit_id uuid not null references app_units(id) on delete cascade,
        kind text not null check (kind in ('stale','overdue','good','low')),
        enabled boolean not null default false,
        threshold integer not null default 24,
        notification_title text,
        updated_by uuid references app_users(id) on delete set null,
        updated_at timestamptz not null default now(),
        unique(unit_id, kind),
        check (threshold >= 0 and threshold <= 720)
      );

      create table if not exists app_team_contacts (
        unit_id uuid not null references app_units(id) on delete cascade,
        user_id uuid not null references app_users(id) on delete cascade,
        phone text,
        opt_in boolean not null default false,
        consent_at timestamptz,
        updated_at timestamptz not null default now(),
        primary key(unit_id, user_id)
      );

      create table if not exists app_team_sender_settings (
        unit_id uuid primary key references app_units(id) on delete cascade,
        instance_id uuid references app_whatsapp_instances(id) on delete set null,
        enabled boolean not null default false,
        daily_limit integer not null default 25,
        recipient_daily_limit integer not null default 1,
        min_interval_seconds integer not null default 180,
        quiet_from_hour integer not null default 18,
        quiet_to_hour integer not null default 8,
        failed_count integer not null default 0,
        last_sent_at timestamptz,
        last_error text,
        updated_at timestamptz not null default now(),
        check (daily_limit between 1 and 50),
        check (recipient_daily_limit between 1 and 2),
        check (min_interval_seconds between 180 and 3600),
        check (quiet_from_hour between 0 and 23),
        check (quiet_to_hour between 0 and 23)
      );

      create table if not exists app_team_outbox (
        id uuid primary key default gen_random_uuid(),
        unit_id uuid not null references app_units(id) on delete cascade,
        user_id uuid not null references app_users(id) on delete cascade,
        instance_id uuid references app_whatsapp_instances(id) on delete set null,
        phone text not null,
        message text not null,
        dedupe_key text not null,
        status text not null default 'pending'
          check (status in ('pending','sending','sent','failed','cancelled')),
        attempts integer not null default 0,
        provider_message_id text,
        last_error text,
        available_at timestamptz not null default now(),
        claimed_at timestamptz,
        sent_at timestamptz,
        created_at timestamptz not null default now(),
        unique (unit_id, user_id, dedupe_key)
      );
      create index if not exists app_team_outbox_pending_idx
        on app_team_outbox (available_at, created_at) where status = 'pending';
      create index if not exists app_team_outbox_recipient_idx
        on app_team_outbox (unit_id, user_id, sent_at desc);
    `,
    );
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}
