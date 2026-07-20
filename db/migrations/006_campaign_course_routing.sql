alter table app_users drop constraint if exists app_users_role_check;
alter table app_users
  add constraint app_users_role_check
  check (role in ('MASTER', 'CEO', 'DIRETOR', 'GERENTE', 'MARKETING', 'CONSULTOR'));

create table if not exists app_course_attendances (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  course_id uuid not null references app_courses(id) on delete cascade,
  city text not null,
  city_normalized text not null,
  state text not null,
  round_robin_cursor integer not null default 0 check (round_robin_cursor >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, course_id, city_normalized, state)
);

create table if not exists app_course_attendance_consultants (
  attendance_id uuid not null references app_course_attendances(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (attendance_id, user_id)
);

alter table app_meta_lead_events
  add column if not exists attendance_id uuid references app_course_attendances(id) on delete set null;
alter table app_meta_lead_events
  add column if not exists assigned_user_id uuid references app_users(id) on delete set null;
alter table app_meta_lead_events
  add column if not exists routing_source text;
alter table app_meta_lead_events
  add column if not exists routing_error text;
