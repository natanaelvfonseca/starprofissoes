create table if not exists app_lead_owner_transfers (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  lead_id uuid not null references app_leads(id) on delete cascade,
  previous_owner_id uuid references app_users(id) on delete set null,
  next_owner_id uuid references app_users(id) on delete set null,
  transferred_by uuid references app_users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists app_lead_owner_transfers_lead_idx
  on app_lead_owner_transfers (lead_id, created_at desc);

create index if not exists app_lead_owner_transfers_unit_created_idx
  on app_lead_owner_transfers (unit_id, created_at desc);

create or replace function app_assign_default_marketing_owner()
returns trigger as $$
begin
  if new.created_by is null then
    select u.id
    into new.created_by
    from app_users u
    where u.status = 'active'
      and u.role = 'MARKETING'
      and (
        u.primary_unit_id = new.unit_id
        or exists (
          select 1
          from app_user_units uu
          where uu.user_id = u.id
            and uu.unit_id = new.unit_id
        )
        or not exists (
          select 1
          from app_users scoped
          where scoped.status = 'active'
            and scoped.role = 'MARKETING'
            and (
              scoped.primary_unit_id = new.unit_id
              or exists (
                select 1
                from app_user_units scoped_uu
                where scoped_uu.user_id = scoped.id
                  and scoped_uu.unit_id = new.unit_id
              )
            )
        )
      )
    order by
      case
        when u.primary_unit_id = new.unit_id then 0
        when exists (
          select 1
          from app_user_units uu
          where uu.user_id = u.id
            and uu.unit_id = new.unit_id
        ) then 1
        else 2
      end,
      u.created_at asc,
      u.name asc
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists app_leads_default_marketing_owner on app_leads;
create trigger app_leads_default_marketing_owner
  before insert on app_leads
  for each row
  execute function app_assign_default_marketing_owner();
