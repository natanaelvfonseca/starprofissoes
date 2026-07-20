alter table app_leads
  add column if not exists external_source text,
  add column if not exists external_page_url text,
  add column if not exists external_payload jsonb;

create index if not exists app_leads_unit_external_source_created_idx
  on app_leads (unit_id, external_source, created_at desc);
