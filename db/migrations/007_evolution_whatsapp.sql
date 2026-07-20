create table if not exists app_whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null unique references app_units(id) on delete cascade,
  instance_name text not null unique,
  status text not null default 'disconnected' check (
    status in ('disconnected', 'connecting', 'connected', 'error')
  ),
  phone_number text,
  webhook_secret text not null,
  connected_at timestamptz,
  last_event_at timestamptz,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_whatsapp_instances_status_idx
  on app_whatsapp_instances (status);

create table if not exists app_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
  evolution_message_id text not null,
  remote_jid text not null,
  phone text not null,
  contact_name text,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text',
  content text not null default '',
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (instance_id, evolution_message_id)
);

create index if not exists app_whatsapp_messages_unit_contact_idx
  on app_whatsapp_messages (unit_id, remote_jid, sent_at desc);

create index if not exists app_whatsapp_messages_unit_sent_idx
  on app_whatsapp_messages (unit_id, sent_at desc);
