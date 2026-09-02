alter table app_meta_pages
  add column if not exists leadgen_subscribed_at timestamptz;

alter table app_meta_pages
  add column if not exists forms_synced_at timestamptz;

alter table app_meta_forms
  add column if not exists meta_status text not null default 'UNKNOWN';

alter table app_meta_forms
  add column if not exists meta_created_time timestamptz;

alter table app_meta_forms
  add column if not exists last_seen_at timestamptz;

alter table app_meta_lead_events
  add column if not exists processing_stage text;

alter table app_meta_lead_events
  add column if not exists error_type text;

alter table app_meta_lead_events
  add column if not exists error_code text;

alter table app_meta_lead_events
  add column if not exists error_subcode text;

alter table app_meta_lead_events
  add column if not exists fbtrace_id text;
