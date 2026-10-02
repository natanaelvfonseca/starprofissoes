create table if not exists app_make_meta_lead_archive (
  id uuid primary key default gen_random_uuid(),
  leadgen_id text not null unique,
  form_id text not null,
  page_id text not null,
  payload jsonb not null,
  delivery_count integer not null default 1,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now()
);

create index if not exists app_make_meta_lead_archive_received_idx
  on app_make_meta_lead_archive (last_received_at desc);
