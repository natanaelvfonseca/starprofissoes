create table if not exists app_whatsapp_jid_mappings (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
  lid_jid text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, lid_jid)
);

create index if not exists app_whatsapp_jid_mappings_phone_idx
  on app_whatsapp_jid_mappings (instance_id, phone);
