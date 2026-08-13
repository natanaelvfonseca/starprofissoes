create table if not exists app_feature_role_access (
  feature_key text not null,
  role text not null,
  enabled boolean not null default false,
  updated_by uuid references app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (feature_key, role)
);

insert into app_feature_role_access (feature_key, role, enabled)
values
  ('whatsapp_supervision', 'DEV', true),
  ('whatsapp_supervision', 'CEO', false),
  ('whatsapp_supervision', 'DIRETOR', false),
  ('whatsapp_supervision', 'GERENTE', false)
on conflict (feature_key, role) do nothing;

create table if not exists app_whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  consultant_id uuid not null references app_users(id) on delete cascade,
  instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
  canonical_key text not null,
  canonical_phone text,
  primary_remote_jid text not null,
  contact_name text,
  lead_id uuid references app_leads(id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text not null default '',
  last_message_type text not null default 'text',
  message_count integer not null default 0,
  inbound_count integer not null default 0,
  outbound_count integer not null default 0,
  merged_into_id uuid references app_whatsapp_conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, canonical_key)
);

alter table app_whatsapp_conversations
  add column if not exists merged_into_id uuid references app_whatsapp_conversations(id) on delete set null;

create index if not exists app_whatsapp_conversations_unit_consultant_idx
  on app_whatsapp_conversations (unit_id, consultant_id, last_message_at desc);
create index if not exists app_whatsapp_conversations_phone_idx
  on app_whatsapp_conversations (unit_id, canonical_phone)
  where canonical_phone is not null;

create table if not exists app_whatsapp_conversation_aliases (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
  instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
  remote_jid text not null,
  alias_type text not null default 'unknown' check (alias_type in ('phone', 'lid', 'legacy', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, remote_jid)
);

create index if not exists app_whatsapp_conversation_aliases_conversation_idx
  on app_whatsapp_conversation_aliases (conversation_id);

alter table app_whatsapp_messages
  add column if not exists conversation_id uuid references app_whatsapp_conversations(id) on delete set null;
alter table app_whatsapp_messages
  add column if not exists edited_at timestamptz;
alter table app_whatsapp_messages
  add column if not exists deleted_at timestamptz;

create index if not exists app_whatsapp_messages_conversation_sent_idx
  on app_whatsapp_messages (conversation_id, sent_at desc);

create table if not exists app_whatsapp_interventions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  consultant_id uuid not null references app_users(id) on delete cascade,
  conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
  actor_user_id uuid not null references app_users(id) on delete restrict,
  client_request_id text not null,
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'confirmed', 'failed')),
  evolution_message_id text,
  error_message text,
  sent_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_user_id, client_request_id)
);

create index if not exists app_whatsapp_interventions_conversation_idx
  on app_whatsapp_interventions (conversation_id, created_at desc);
create index if not exists app_whatsapp_interventions_pending_idx
  on app_whatsapp_interventions (status, created_at)
  where status in ('pending', 'sent');

create table if not exists app_whatsapp_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  intervention_id uuid not null references app_whatsapp_interventions(id) on delete cascade,
  conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, intervention_id)
);

create index if not exists app_whatsapp_notifications_user_unread_idx
  on app_whatsapp_notifications (user_id, created_at desc)
  where read_at is null;

create table if not exists app_whatsapp_conversation_analyses (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  consultant_id uuid not null references app_users(id) on delete cascade,
  conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
  lead_id uuid references app_leads(id) on delete set null,
  course_id uuid references app_courses(id) on delete set null,
  sales_script_id uuid,
  input_fingerprint text not null,
  status text not null check (status in ('completed', 'insufficient_context', 'failed')),
  rubric_type text not null check (rubric_type in ('course_script', 'general')),
  score numeric(5,2),
  stage text,
  intent text,
  summary text not null,
  objections jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  message_ids jsonb not null default '[]'::jsonb,
  model text,
  prompt_version text not null default 'conversation-v1',
  error_message text,
  created_at timestamptz not null default now(),
  unique (conversation_id, input_fingerprint)
);

create index if not exists app_whatsapp_conversation_analyses_latest_idx
  on app_whatsapp_conversation_analyses (conversation_id, created_at desc);

create table if not exists app_whatsapp_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references app_whatsapp_conversations(id) on delete cascade,
  input_fingerprint text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, input_fingerprint)
);

create index if not exists app_whatsapp_analysis_jobs_queue_idx
  on app_whatsapp_analysis_jobs (status, available_at, created_at);

create table if not exists app_whatsapp_sync_checkpoints (
  instance_id uuid primary key references app_whatsapp_instances(id) on delete cascade,
  history_since timestamptz,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Reiniciável: materializa uma conversa por telefone conhecido, ou por JID quando ainda não resolvido.
insert into app_whatsapp_conversations (
  unit_id, consultant_id, instance_id, canonical_key, canonical_phone,
  primary_remote_jid, contact_name, last_message_at, last_message_preview,
  last_message_type, message_count, inbound_count, outbound_count
)
select
  message.unit_id,
  message.user_id,
  message.instance_id,
  case
    when nullif(regexp_replace(message.phone, '[^0-9]', '', 'g'), '') is not null
      then 'phone:' || regexp_replace(message.phone, '[^0-9]', '', 'g')
    else 'jid:' || lower(message.remote_jid)
  end as canonical_key,
  nullif(regexp_replace(message.phone, '[^0-9]', '', 'g'), '') as canonical_phone,
  (array_agg(message.remote_jid order by message.sent_at desc))[1],
  (array_agg(nullif(message.contact_name, '') order by message.sent_at desc)
    filter (where nullif(message.contact_name, '') is not null))[1],
  max(message.sent_at),
  (array_agg(message.content order by message.sent_at desc))[1],
  (array_agg(message.message_type order by message.sent_at desc))[1],
  count(*)::integer,
  count(*) filter (where message.direction = 'inbound')::integer,
  count(*) filter (where message.direction = 'outbound')::integer
from app_whatsapp_messages message
inner join app_whatsapp_instances instance on instance.id = message.instance_id
where message.user_id is not null
  and left(instance.instance_name, 5) = 'star_'
group by
  message.unit_id,
  message.user_id,
  message.instance_id,
  case
    when nullif(regexp_replace(message.phone, '[^0-9]', '', 'g'), '') is not null
      then 'phone:' || regexp_replace(message.phone, '[^0-9]', '', 'g')
    else 'jid:' || lower(message.remote_jid)
  end,
  nullif(regexp_replace(message.phone, '[^0-9]', '', 'g'), '')
on conflict (instance_id, canonical_key) do update
set
  last_message_at = greatest(app_whatsapp_conversations.last_message_at, excluded.last_message_at),
  updated_at = now();

insert into app_whatsapp_conversation_aliases (conversation_id, instance_id, remote_jid, alias_type)
select distinct
  conversation.id,
  message.instance_id,
  message.remote_jid,
  case
    when lower(message.remote_jid) like '%@lid' then 'lid'
    when lower(message.remote_jid) like '%@s.whatsapp.net' or lower(message.remote_jid) like '%@c.us' then 'phone'
    else 'legacy'
  end
from app_whatsapp_messages message
inner join app_whatsapp_conversations conversation
  on conversation.instance_id = message.instance_id
 and conversation.canonical_key = case
   when nullif(regexp_replace(message.phone, '[^0-9]', '', 'g'), '') is not null
     then 'phone:' || regexp_replace(message.phone, '[^0-9]', '', 'g')
   else 'jid:' || lower(message.remote_jid)
 end
on conflict (instance_id, remote_jid) do nothing;

update app_whatsapp_messages message
set conversation_id = alias.conversation_id
from app_whatsapp_conversation_aliases alias
where alias.instance_id = message.instance_id
  and alias.remote_jid = message.remote_jid
  and message.conversation_id is null;
