create table if not exists app_courses (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  name text not null,
  value numeric(12,2) not null default 0 check (value >= 0),
  category text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_courses_unit_name_lower_idx on app_courses (unit_id, lower(name));
create index if not exists app_courses_unit_status_idx on app_courses (unit_id, status);

create table if not exists app_acquisition_channels (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  name text not null,
  type text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_acquisition_channels_unit_name_lower_idx on app_acquisition_channels (unit_id, lower(name));
create index if not exists app_acquisition_channels_unit_status_idx on app_acquisition_channels (unit_id, status);

create table if not exists app_leads (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text,
  course_id uuid references app_courses(id) on delete set null,
  course_name_snapshot text,
  course_value_snapshot numeric(12,2),
  acquisition_channel_id uuid references app_acquisition_channels(id) on delete set null,
  acquisition_channel_name_snapshot text,
  observations text,
  city text,
  stage text not null default 'Novo lead' check (
    stage in (
      'Novo lead',
      'Em contato',
      'Qualificado',
      'Proposta',
      'Pagamento pendente',
      'Confirmado',
      'Recuperação',
      'Matriculado'
    )
  ),
  first_contact_at timestamptz,
  follow_up_count integer not null default 0 check (follow_up_count >= 0),
  last_follow_up_at timestamptz,
  converted_at timestamptz,
  converted_by uuid references app_users(id) on delete set null,
  payment_status text not null default 'pending' check (
    payment_status in ('pending', 'paid', 'overdue', 'waived', 'refunded')
  ),
  payment_confirmed_at timestamptz,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_leads_unit_stage_idx on app_leads (unit_id, stage);
create index if not exists app_leads_unit_user_stage_idx on app_leads (unit_id, created_by, stage);
create index if not exists app_leads_unit_created_idx on app_leads (unit_id, created_at desc);
create index if not exists app_leads_course_idx on app_leads (course_id);
create index if not exists app_leads_acquisition_channel_idx on app_leads (acquisition_channel_id);
create index if not exists app_leads_unit_user_city_idx on app_leads (unit_id, created_by, city);
create index if not exists app_leads_converted_at_idx on app_leads (converted_at desc);

create table if not exists app_student_payments (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  lead_id uuid not null references app_leads(id) on delete cascade,
  description text not null default 'Pagamento',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'pending' check (
    status in ('pending', 'paid', 'overdue', 'cancelled', 'waived', 'refunded')
  ),
  due_at date,
  paid_at timestamptz,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_student_payments_unit_status_idx on app_student_payments (unit_id, status);
create index if not exists app_student_payments_lead_idx on app_student_payments (lead_id);
create index if not exists app_student_payments_due_idx on app_student_payments (due_at);
create index if not exists app_student_payments_paid_idx on app_student_payments (paid_at desc);

create table if not exists app_student_attendance (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  lead_id uuid not null references app_leads(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (
    status in ('scheduled', 'attended', 'missed', 'no_show', 'risk', 'cancelled')
  ),
  notes text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_student_attendance_unit_status_idx on app_student_attendance (unit_id, status);
create index if not exists app_student_attendance_lead_idx on app_student_attendance (lead_id);
create index if not exists app_student_attendance_scheduled_idx on app_student_attendance (scheduled_at desc);

create table if not exists app_ai_recoveries (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  lead_id uuid references app_leads(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'recovered', 'lost')),
  value_recovered numeric(12,2) not null default 0 check (value_recovered >= 0),
  recovered_at timestamptz,
  notes text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_ai_recoveries_unit_status_idx on app_ai_recoveries (unit_id, status);
create index if not exists app_ai_recoveries_lead_idx on app_ai_recoveries (lead_id);
create index if not exists app_ai_recoveries_recovered_idx on app_ai_recoveries (recovered_at desc);

insert into app_acquisition_channels (unit_id, name, type, status)
select u.id, c.name, c.type, 'active'
from app_units u
cross join (
  values
    ('Meta Ads', 'Pago'),
    ('Google Ads', 'Pago'),
    ('TikTok', 'Pago'),
    ('Instagram Orgânico', 'Orgânico'),
    ('WhatsApp', 'Conversacional'),
    ('Indicação', 'Relacionamento'),
    ('Site', 'Próprio'),
    ('Evento', 'Presencial'),
    ('Parceria', 'Relacionamento')
) as c(name, type)
on conflict do nothing;
