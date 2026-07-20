drop index if exists app_whatsapp_instances_user_idx;

create unique index if not exists app_whatsapp_instances_user_unit_idx
  on app_whatsapp_instances (user_id, unit_id)
  where user_id is not null;
