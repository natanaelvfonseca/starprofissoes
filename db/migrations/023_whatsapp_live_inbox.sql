alter table app_whatsapp_conversations
  add column if not exists profile_picture_url text;

alter table app_whatsapp_messages
  add column if not exists delivery_status text;

do $$
begin
  alter table app_whatsapp_messages
    add constraint app_whatsapp_messages_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'delivered', 'read', 'played', 'failed'));
exception
  when duplicate_object then null;
end
$$;

alter table app_whatsapp_sync_checkpoints
  add column if not exists contacts_synced_at timestamptz;
