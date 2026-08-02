create table if not exists app_whatsapp_labels (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
  label_id text not null,
  label_name text not null,
  color text,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, label_id)
);

create index if not exists app_whatsapp_labels_instance_name_idx
  on app_whatsapp_labels (instance_id, label_name)
  where deleted = false;

alter table app_whatsapp_label_events
  drop column if exists rule_id;

drop table if exists app_whatsapp_label_rules;
