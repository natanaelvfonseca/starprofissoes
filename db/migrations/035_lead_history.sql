-- Lead audit: append-only events; no FK to lead so deletion remains auditable.
create table if not exists app_lead_history (
  id bigint generated always as identity primary key,
  unit_id uuid not null,
  lead_id uuid not null,
  actor_id uuid,
  actor_name text,
  source text not null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  legacy_key text unique
);
create index if not exists app_lead_history_lookup_idx on app_lead_history(unit_id,lead_id,occurred_at desc,id desc);

create or replace function app_capture_lead_history() returns trigger
language plpgsql set search_path from current as $$
declare
  a jsonb := '{}'::jsonb;
  b jsonb := '{}'::jsonb;
  actor uuid := nullif(current_setting('star.audit_actor_id',true),'')::uuid;
  actor_label text := nullif(current_setting('star.audit_actor_name',true),'');
  src text := coalesce(nullif(current_setting('star.audit_source',true),''),'system');
  kind text;
  info jsonb := '{}'::jsonb;
  fields text[];
  changed text[];
  lid uuid;
  uid uuid;
  old_owner text;
  new_owner text;
  old_column text;
  new_column text;
begin
  if TG_OP <> 'INSERT' then a := to_jsonb(OLD); end if;
  if TG_OP <> 'DELETE' then b := to_jsonb(NEW); end if;
  uid := coalesce(b->>'unit_id',a->>'unit_id')::uuid;
  if TG_TABLE_NAME = 'app_crm_tasks' then
    lid := coalesce(b->>'lead_id',a->>'lead_id')::uuid;
    if lid is null or uid is null then return null; end if;
    if TG_OP='INSERT' then kind:='task_created';
    elsif TG_OP='DELETE' then kind:='task_removed';
    elsif a->>'status' is distinct from b->>'status' then
      kind:=case b->>'status' when 'done' then 'task_completed' when 'pending' then 'task_reopened' when 'archived' then 'task_removed' else 'task_updated' end;
    elsif (a - array['updated_at','created_by']) is distinct from (b - array['updated_at','created_by']) then kind:='task_updated';
    else return null;
    end if;
    info:=jsonb_build_object('title',coalesce(b->>'title',a->>'title'),'from',a->>'status','to',b->>'status');
    insert into app_lead_history(unit_id,lead_id,actor_id,actor_name,source,event_type,details)
    values(uid,lid,actor,actor_label,src,kind,info);
    return null;
  end if;
  lid := coalesce(b->>'id',a->>'id')::uuid;
  if TG_OP='INSERT' then
    select name into new_owner from app_users where id=(b->>'created_by')::uuid;
    insert into app_lead_history(unit_id,lead_id,actor_id,actor_name,source,event_type,details)
    values(uid,lid,actor,actor_label,src,'created',jsonb_build_object('stage',b->>'stage','owner',new_owner,'origin',b->>'external_source','queue',b->>'shared_queue'));
    return null;
  elsif TG_OP='DELETE' then
    insert into app_lead_history(unit_id,lead_id,actor_id,actor_name,source,event_type)
    values(uid,lid,actor,actor_label,src,'deleted');
    return null;
  end if;
  if a->>'stage' is distinct from b->>'stage' or a->>'pipeline_column_id' is distinct from b->>'pipeline_column_id' or a->>'student_pipeline_column_id' is distinct from b->>'student_pipeline_column_id' then
    select name into old_column from app_pipeline_columns where id=(case when a->>'stage'='Matriculado' then a->>'student_pipeline_column_id' else a->>'pipeline_column_id' end)::uuid;
    select name into new_column from app_pipeline_columns where id=(case when b->>'stage'='Matriculado' then b->>'student_pipeline_column_id' else b->>'pipeline_column_id' end)::uuid;
    kind:=case when b->>'stage'='Matriculado' and a->>'stage'<>'Matriculado' then 'enrolled' when a->>'stage'='Matriculado' and b->>'stage'<>'Matriculado' then 'returned' else 'stage_changed' end;
    insert into app_lead_history(unit_id,lead_id,actor_id,actor_name,source,event_type,details)
    values(uid,lid,actor,actor_label,src,kind,jsonb_build_object('from',coalesce(old_column,a->>'stage'),'to',coalesce(new_column,b->>'stage')));
  end if;
  if a->>'created_by' is distinct from b->>'created_by' or a->>'shared_queue' is distinct from b->>'shared_queue' then
    select name into old_owner from app_users where id=(a->>'created_by')::uuid;
    select name into new_owner from app_users where id=(b->>'created_by')::uuid;
    kind:=case when b->>'shared_queue'='true' then 'released' when a->>'shared_queue'='true' or src='assume' then 'claimed' when b->>'created_by' is null then 'unassigned' when a->>'created_by' is null then 'assigned' else 'transferred' end;
    insert into app_lead_history(unit_id,lead_id,actor_id,actor_name,source,event_type,details)
    values(uid,lid,actor,actor_label,src,kind,jsonb_build_object('from',coalesce(old_owner,'Sem responsável'),'to',coalesce(new_owner,case when b->>'shared_queue'='true' then 'Fila compartilhada' else 'Sem responsável' end)));
  end if;
  if a->>'payment_status' is distinct from b->>'payment_status' then
    insert into app_lead_history(unit_id,lead_id,actor_id,actor_name,source,event_type,details)
    values(uid,lid,actor,actor_label,src,'payment_changed',jsonb_build_object('from',a->>'payment_status','to',b->>'payment_status'));
  end if;
  fields:=array['full_name','phone','phone2','email','city','course_id','course_name_snapshot','course_value_snapshot','attendance_id','acquisition_channel_id','acquisition_channel_name_snapshot','observations','unit_id'];
  select array_agg(k order by k) into changed from unnest(fields) k where a->k is distinct from b->k;
  if changed is not null then
    insert into app_lead_history(unit_id,lead_id,actor_id,actor_name,source,event_type,details)
    values(uid,lid,actor,actor_label,src,'data_changed',jsonb_build_object('fields',to_jsonb(changed)));
  end if;
  if a->>'last_follow_up_at' is distinct from b->>'last_follow_up_at' and a->>'stage' is not distinct from b->>'stage' and a->>'pipeline_column_id' is not distinct from b->>'pipeline_column_id' then
    insert into app_lead_history(unit_id,lead_id,actor_id,actor_name,source,event_type)
    values(uid,lid,actor,actor_label,src,'follow_up');
  end if;
  return null;
end $$;

-- Backfill only factual existing records; never infer past stage or creator.
insert into app_lead_history(unit_id,lead_id,source,event_type,occurred_at,legacy_key)
select unit_id,id,'legacy','legacy_created',created_at,'created:'||id
from app_leads l where not exists(select 1 from app_lead_history h where h.lead_id=l.id and h.event_type='created')
on conflict (legacy_key) do nothing;
insert into app_lead_history(unit_id,lead_id,actor_id,actor_name,source,event_type,details,occurred_at,legacy_key)
select t.unit_id,t.lead_id,t.transferred_by,actor.name,'legacy',
case when t.reason ilike '%assumid%' then 'claimed' else 'transferred' end,
jsonb_build_object('from',coalesce(prev.name,'Sem responsável'),'to',coalesce(next_user.name,'Sem responsável'),'reason',t.reason),
t.created_at,'transfer:'||t.id
from app_lead_owner_transfers t
left join app_users actor on actor.id=t.transferred_by
left join app_users prev on prev.id=t.previous_owner_id
left join app_users next_user on next_user.id=t.next_owner_id
where not exists(select 1 from app_lead_history h where h.source<>'legacy' and h.lead_id=t.lead_id and h.event_type in ('claimed','transferred','assigned','released') and h.occurred_at between t.created_at-interval '2 seconds' and t.created_at+interval '2 seconds')
on conflict (legacy_key) do nothing;
drop trigger if exists app_lead_history_capture on app_leads;
create trigger app_lead_history_capture after insert or update or delete on app_leads for each row execute function app_capture_lead_history();
drop trigger if exists app_lead_task_history_capture on app_crm_tasks;
create trigger app_lead_task_history_capture after insert or update or delete on app_crm_tasks for each row execute function app_capture_lead_history();
