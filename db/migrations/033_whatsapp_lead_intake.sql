create table if not exists app_whatsapp_lead_intake_checks (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  consultant_id uuid not null references app_users(id) on delete cascade,
  instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
  conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
  identity_key text not null,
  lead_id uuid references app_leads(id) on delete set null,
  status text not null check (status in ('processing', 'linked', 'created', 'ambiguous')),
  checked_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, identity_key)
);

create index if not exists app_whatsapp_lead_intake_unit_phone_idx
  on app_whatsapp_lead_intake_checks (unit_id, identity_key);

create index if not exists app_whatsapp_lead_intake_lead_idx
  on app_whatsapp_lead_intake_checks (lead_id) where lead_id is not null;
