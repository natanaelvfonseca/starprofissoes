alter table app_meta_pages
  add column if not exists unit_id uuid references app_units(id) on delete restrict;

create index if not exists app_meta_pages_unit_idx
  on app_meta_pages (unit_id, status, created_at desc);

create table if not exists app_meta_oauth_unit_contexts (
  id uuid primary key default gen_random_uuid(),
  nonce text not null unique,
  user_id uuid not null references app_users(id) on delete cascade,
  unit_id uuid not null references app_units(id) on delete restrict,
  connect_timestamp bigint not null,
  callback_count integer not null default 0 check (callback_count >= 0),
  last_callback_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists app_meta_oauth_unit_contexts_pending_idx
  on app_meta_oauth_unit_contexts (expires_at desc)
  where completed_at is null;

do $$
declare
  tramandai_id uuid;
  bh_id uuid;
  matched_units integer;
begin
  select count(*), (array_agg(id))[1] into matched_units, tramandai_id
  from app_units
  where name = 'Star Profissões Tramandaí';

  if matched_units <> 1 then
    raise exception 'Unidade Star Profissões Tramandaí ambígua ou ausente para o backfill Meta';
  end if;

  select count(*), (array_agg(id))[1] into matched_units, bh_id
  from app_units
  where name = 'Star Profissões BH';

  if matched_units <> 1 then
    raise exception 'Unidade Star Profissões BH ambígua ou ausente para o backfill Meta';
  end if;

  update app_meta_pages
  set unit_id = case page_id
        when '332184066656163' then tramandai_id
        when '115837666992376' then tramandai_id
        when '102459556104851' then bh_id
        else unit_id
      end,
      updated_at = case
        when page_id in ('332184066656163', '115837666992376', '102459556104851')
          and unit_id is null then now()
        else updated_at
      end
  where page_id in ('332184066656163', '115837666992376', '102459556104851')
    and unit_id is null;

  update app_meta_forms f
  set unit_id = p.unit_id,
      updated_at = now()
  from app_meta_pages p
  where p.id = f.page_id
    and p.unit_id is not null
    and f.unit_id is null;
end
$$;
