alter table app_whatsapp_messages
  add column if not exists media_url text;

alter table app_whatsapp_messages
  add column if not exists media_mime_type text;

alter table app_whatsapp_messages
  add column if not exists media_file_name text;
