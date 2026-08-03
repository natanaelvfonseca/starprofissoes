create table if not exists app_whatsapp_label_snapshots (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
  lid_jid text not null,
  label_ids text[] not null default '{}',
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, lid_jid)
);

create index if not exists app_whatsapp_label_snapshots_instance_idx
  on app_whatsapp_label_snapshots (instance_id, updated_at desc);

alter table app_whatsapp_instances
  add column if not exists label_snapshots_initialized_at timestamptz;
