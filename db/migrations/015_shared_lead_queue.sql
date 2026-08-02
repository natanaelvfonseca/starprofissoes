begin;

alter table app_leads
  add column if not exists shared_queue boolean not null default false;

create index if not exists app_leads_shared_queue_idx
  on app_leads (attendance_id, created_at desc)
  where shared_queue = true and stage = 'Novo lead';

create or replace function app_assign_default_marketing_owner()
returns trigger as $$
begin
  if new.created_by is null and not new.shared_queue then
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

update app_leads lead
set shared_queue = true,
    created_by = null,
    updated_at = now()
where lead.stage = 'Novo lead'
  and lead.attendance_id is not null
  and not lead.shared_queue
  and exists (
    select 1
    from app_course_attendance_consultants attendance_consultant
    inner join app_users consultant on consultant.id = attendance_consultant.user_id
    where attendance_consultant.attendance_id = lead.attendance_id
      and consultant.role = 'CONSULTOR'
      and consultant.status = 'active'
  );

commit;
