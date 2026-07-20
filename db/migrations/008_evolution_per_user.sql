alter table app_whatsapp_instances
  add column if not exists user_id uuid references app_users(id) on delete cascade;

update app_whatsapp_instances
set user_id = created_by
where user_id is null
  and created_by is not null;

alter table app_whatsapp_instances
  drop constraint if exists app_whatsapp_instances_unit_id_key;

create unique index if not exists app_whatsapp_instances_user_idx
  on app_whatsapp_instances (user_id)
  where user_id is not null;

create index if not exists app_whatsapp_instances_unit_idx
  on app_whatsapp_instances (unit_id);

alter table app_whatsapp_messages
  add column if not exists user_id uuid references app_users(id) on delete cascade;

update app_whatsapp_messages message
set user_id = instance.user_id
from app_whatsapp_instances instance
where message.instance_id = instance.id
  and message.user_id is null;

create index if not exists app_whatsapp_messages_user_sent_idx
  on app_whatsapp_messages (user_id, sent_at desc);
