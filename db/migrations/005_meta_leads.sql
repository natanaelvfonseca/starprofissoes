create table if not exists app_meta_integrations (
  id uuid primary key default gen_random_uuid(),
  app_id text,
  app_secret text,
  verify_token text,
  graph_api_version text not null default 'v23.0',
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  callback_url text,
  last_communication_at timestamptz,
  total_events_received integer not null default 0 check (total_events_received >= 0),
  total_leads_created integer not null default 0 check (total_leads_created >= 0),
  total_errors integer not null default 0 check (total_errors >= 0),
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_meta_integrations_singleton_idx
  on app_meta_integrations ((true));

create table if not exists app_meta_pages (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references app_meta_integrations(id) on delete cascade,
  page_name text not null,
  page_id text not null,
  page_access_token_encrypted text,
  token_status text not null default 'unknown' check (token_status in ('unknown', 'valid', 'invalid')),
  last_validated_at timestamptz,
  subscription_status text not null default 'unknown' check (subscription_status in ('unknown', 'subscribed', 'not_subscribed', 'error')),
  leads_received_count integer not null default 0 check (leads_received_count >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id)
);

create index if not exists app_meta_pages_integration_idx on app_meta_pages (integration_id);
create index if not exists app_meta_pages_status_idx on app_meta_pages (status);

create table if not exists app_meta_forms (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references app_meta_pages(id) on delete cascade,
  form_name text not null,
  meta_form_id text not null,
  unit_id uuid references app_units(id) on delete set null,
  course_id uuid references app_courses(id) on delete set null,
  funnel_name text,
  initial_stage text not null default 'Novo lead' check (
    initial_stage in (
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
  acquisition_channel_id uuid references app_acquisition_channels(id) on delete set null,
  default_responsible_id uuid references app_users(id) on delete set null,
  distribution_rule text not null default 'unassigned' check (
    distribution_rule in (
      'fixed',
      'round_robin',
      'random',
      'least_open',
      'unit_consultants',
      'selected_consultants',
      'unassigned',
      'keep_existing'
    )
  ),
  round_robin_cursor integer not null default 0 check (round_robin_cursor >= 0),
  field_mapping jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  configured_at timestamptz,
  synced_at timestamptz,
  last_lead_received_at timestamptz,
  leads_received_count integer not null default 0 check (leads_received_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, meta_form_id)
);

create index if not exists app_meta_forms_page_idx on app_meta_forms (page_id);
create index if not exists app_meta_forms_unit_idx on app_meta_forms (unit_id);
create index if not exists app_meta_forms_status_idx on app_meta_forms (status);

create table if not exists app_meta_form_consultants (
  form_id uuid not null references app_meta_forms(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (form_id, user_id)
);

create table if not exists app_meta_lead_events (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid references app_meta_integrations(id) on delete set null,
  page_db_id uuid references app_meta_pages(id) on delete set null,
  form_db_id uuid references app_meta_forms(id) on delete set null,
  lead_id uuid references app_leads(id) on delete set null,
  page_id text not null,
  form_id text not null,
  leadgen_id text not null,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  form_name text,
  page_name text,
  meta_created_time timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (
    status in (
      'received',
      'pending_configuration',
      'processing',
      'processed',
      'duplicate',
      'error'
    )
  ),
  error_message text,
  distribution_reason text,
  payload jsonb not null,
  lead_payload jsonb,
  mapped_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (leadgen_id)
);

create index if not exists app_meta_events_form_idx on app_meta_lead_events (page_id, form_id);
create index if not exists app_meta_events_status_idx on app_meta_lead_events (status, received_at desc);
create index if not exists app_meta_events_lead_idx on app_meta_lead_events (lead_id);
