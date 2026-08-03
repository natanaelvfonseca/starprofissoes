alter table app_whatsapp_instances
  add column if not exists labels_reconciled_at timestamptz;
