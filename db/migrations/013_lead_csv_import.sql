create table if not exists app_lead_import_rows (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references app_leads(id) on delete cascade,
  campaign_name text,
  form_id text,
  whatsapp_number text,
  imported_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists app_lead_import_rows_campaign_idx
  on app_lead_import_rows (campaign_name);
