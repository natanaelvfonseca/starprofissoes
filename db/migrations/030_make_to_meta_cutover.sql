update app_meta_forms as form
set unit_id = attendance.unit_id,
    course_id = attendance.course_id,
    attendance_id = connection.turma_id,
    status = 'active',
    configured_at = coalesce(form.configured_at, now()),
    updated_at = now()
from app_make_meta_form_connections as connection
inner join app_course_attendances as attendance
  on attendance.id = connection.turma_id
 and attendance.status = 'active'
where connection.form_id = form.meta_form_id
  and connection.active = true
  and form.meta_status = 'ACTIVE'
  and exists (
    select 1
    from app_meta_pages as page
    where page.id = form.page_id
      and page.status = 'active'
      and page.subscription_status = 'subscribed'
      and page.unit_id = attendance.unit_id
  );

-- The Make connections intentionally remain active in the database. Pausing the
-- scenario in Make stops deliveries while preserving a ready rollback path.
