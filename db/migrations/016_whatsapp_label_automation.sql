alter table app_whatsapp_instances
  add column if not exists labels_synced_at timestamptz;

alter table app_whatsapp_instances
  add column if not exists label_webhook_configured_at timestamptz;

create table if not exists app_whatsapp_label_rules (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
  label_id text not null,
  label_name text not null,
  pipeline_column_id uuid not null references app_pipeline_columns(id) on delete cascade,
  active boolean not null default true,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, label_id)
);

create index if not exists app_whatsapp_label_rules_unit_idx
  on app_whatsapp_label_rules (unit_id, active, updated_at desc);

create index if not exists app_whatsapp_label_rules_column_idx
  on app_whatsapp_label_rules (pipeline_column_id);

create table if not exists app_whatsapp_label_events (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
  consultant_id uuid references app_users(id) on delete set null,
  lead_id uuid references app_leads(id) on delete set null,
  rule_id uuid references app_whatsapp_label_rules(id) on delete set null,
  event_key text not null unique,
  source_event_id text,
  event_type text not null,
  action text not null,
  label_id text,
  label_name text,
  remote_jid text,
  phone text,
  previous_pipeline_column_id uuid references app_pipeline_columns(id) on delete set null,
  next_pipeline_column_id uuid references app_pipeline_columns(id) on delete set null,
  status text not null check (status in ('processing', 'processed', 'ignored', 'unresolved', 'error')),
  reason text,
  error_message text,
  event_received_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_whatsapp_label_events_unit_created_idx
  on app_whatsapp_label_events (unit_id, created_at desc);

create index if not exists app_whatsapp_label_events_instance_created_idx
  on app_whatsapp_label_events (instance_id, created_at desc);

create index if not exists app_whatsapp_label_events_lead_idx
  on app_whatsapp_label_events (lead_id, created_at desc);
