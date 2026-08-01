-- Turmas canônicas: preserva IDs e históricos e amplia a identidade com a data.
-- Levantamento antes desta migração no banco Star (2026-08-01):
-- 0 turmas, 0 formulários Meta (0 vinculados e 0 legados), 0 eventos Meta e 1 lead.

alter table app_course_attendances
  add column if not exists class_date date;

update app_course_attendances
set class_date = coalesce(class_date, created_at::date, current_date)
where class_date is null;

alter table app_course_attendances
  alter column class_date set not null;

alter table app_course_attendances
  drop constraint if exists app_course_attendances_unit_id_course_id_city_normalized_st_key;

drop index if exists app_course_attendances_unit_id_course_id_city_normalized_st_key;

create unique index if not exists app_course_attendances_identity_idx
  on app_course_attendances (unit_id, course_id, city_normalized, state, class_date);

alter table app_meta_forms
  add column if not exists attendance_id uuid
  references app_course_attendances(id) on delete set null;

create index if not exists app_meta_forms_attendance_idx
  on app_meta_forms (attendance_id);

alter table app_leads
  add column if not exists attendance_id uuid
  references app_course_attendances(id) on delete set null;

create index if not exists app_leads_attendance_idx
  on app_leads (attendance_id);

-- Inativar uma turma interrompe os formulários ligados. A reativação é manual.
create or replace function app_inactivate_meta_forms_for_attendance()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'active' and new.status = 'inactive' then
    update app_meta_forms
    set status = 'inactive', updated_at = now()
    where attendance_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists app_course_attendances_inactivate_forms_trigger
  on app_course_attendances;

create trigger app_course_attendances_inactivate_forms_trigger
after update of status on app_course_attendances
for each row execute function app_inactivate_meta_forms_for_attendance();
