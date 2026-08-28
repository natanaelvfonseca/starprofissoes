create table if not exists app_financial_integrations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete restrict,
  provider text not null default 'caez' check (provider = 'caez'),
  base_url text not null default 'https://app.caezescola.com.br/api/',
  token_encrypted text not null,
  active boolean not null default true,
  sync_past_days integer not null default 730 check (sync_past_days between 1 and 3650),
  sync_future_days integer not null default 365 check (sync_future_days between 1 and 3650),
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, provider)
);

create table if not exists app_financial_students (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete restrict,
  external_student_id text not null,
  full_name text not null,
  cpf text,
  phone text,
  phone2 text,
  email text,
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, external_student_id)
);

create table if not exists app_financial_enrollments (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete restrict,
  student_id uuid not null references app_financial_students(id) on delete cascade,
  external_enrollment_id text not null,
  external_class_id text,
  class_name text,
  external_course_id text,
  course_name text,
  enrollment_date date,
  start_date date,
  end_date date,
  financial_lookup_status text not null default 'NOT_FOUND'
    check (financial_lookup_status in ('FOUND', 'NOT_FOUND', 'NO_DOCUMENT', 'ERROR')),
  last_financial_lookup_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, external_enrollment_id)
);

create table if not exists app_financial_sync_runs (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete restrict,
  provider text not null default 'caez' check (provider = 'caez'),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  classes_processed integer not null default 0,
  students_processed integer not null default 0,
  installments_found integer not null default 0,
  lookup_not_found integer not null default 0,
  errors_count integer not null default 0,
  checkpoint jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now()
);

create unique index if not exists app_financial_sync_runs_active_unit_idx
  on app_financial_sync_runs (unit_id, provider)
  where status in ('queued', 'running');

create table if not exists app_financial_installments (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete restrict,
  student_id uuid not null references app_financial_students(id) on delete cascade,
  enrollment_id uuid references app_financial_enrollments(id) on delete set null,
  external_title_id text not null,
  due_date date not null,
  original_amount numeric(14,2) not null default 0,
  penalty_amount numeric(14,2) not null default 0,
  interest_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  days_overdue integer not null default 0,
  status text not null check (status in ('upcoming', 'due_today', 'overdue', 'not_returned')),
  boleto_url text,
  course_suspended boolean not null default false,
  restriction_type text,
  responsible_external_id text,
  responsible_name text,
  responsible_document text,
  responsible_phone text,
  responsible_email text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  not_returned_at timestamptz,
  last_seen_sync_run_id uuid references app_financial_sync_runs(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, external_title_id)
);

create table if not exists app_financial_collection_actions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete restrict,
  student_id uuid not null references app_financial_students(id) on delete cascade,
  enrollment_id uuid references app_financial_enrollments(id) on delete set null,
  installment_id uuid references app_financial_installments(id) on delete set null,
  type text not null check (type in ('whatsapp', 'call', 'manual_contact', 'note')),
  status text not null check (status in ('attempted', 'answered', 'no_answer', 'negotiating', 'resolved')),
  notes text,
  performed_by uuid references app_users(id) on delete set null,
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists app_financial_promises (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete restrict,
  student_id uuid not null references app_financial_students(id) on delete cascade,
  installment_id uuid references app_financial_installments(id) on delete set null,
  promised_date date not null,
  promised_amount numeric(14,2) not null check (promised_amount > 0),
  status text not null default 'open' check (status in ('open', 'fulfilled', 'broken', 'cancelled')),
  notes text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_financial_integrations_unit_idx on app_financial_integrations (unit_id);
create index if not exists app_financial_students_unit_idx on app_financial_students (unit_id);
create index if not exists app_financial_students_external_idx on app_financial_students (external_student_id);
create index if not exists app_financial_students_search_idx on app_financial_students (unit_id, lower(full_name));
create index if not exists app_financial_enrollments_unit_idx on app_financial_enrollments (unit_id);
create index if not exists app_financial_enrollments_student_idx on app_financial_enrollments (student_id);
create index if not exists app_financial_enrollments_external_idx on app_financial_enrollments (external_enrollment_id);
create index if not exists app_financial_installments_unit_idx on app_financial_installments (unit_id);
create index if not exists app_financial_installments_student_idx on app_financial_installments (student_id);
create index if not exists app_financial_installments_external_idx on app_financial_installments (external_title_id);
create index if not exists app_financial_installments_due_idx on app_financial_installments (unit_id, due_date);
create index if not exists app_financial_installments_status_idx on app_financial_installments (unit_id, status);
create index if not exists app_financial_installments_overdue_idx on app_financial_installments (unit_id, days_overdue desc);
create index if not exists app_financial_actions_student_idx on app_financial_collection_actions (unit_id, student_id, performed_at desc);
create index if not exists app_financial_promises_student_idx on app_financial_promises (unit_id, student_id, promised_date desc);
create index if not exists app_financial_promises_open_idx on app_financial_promises (unit_id, promised_date) where status = 'open';
create index if not exists app_financial_sync_runs_unit_idx on app_financial_sync_runs (unit_id, created_at desc);
