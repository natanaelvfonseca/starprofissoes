create table if not exists app_make_meta_form_connections (
  id uuid primary key default gen_random_uuid(),
  form_id text not null unique,
  turma_id uuid not null references app_course_attendances(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_make_meta_form_connections_turma_idx
  on app_make_meta_form_connections (turma_id, active);

insert into app_make_meta_form_connections (form_id, turma_id)
select meta_form_id, attendance_id
from app_meta_forms
where attendance_id is not null
on conflict (form_id) do nothing;
