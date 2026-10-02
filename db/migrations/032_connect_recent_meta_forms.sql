with form_attendance(meta_form_id, attendance_id) as (
  values
    ('4261294080813302', 'def2c8aa-ce4f-43da-ace2-ee075d3009d1'::uuid),
    ('1380601170942945', '9e54cd14-b48e-472d-9788-a149d89c6d45'::uuid)
)
update app_meta_forms form
set unit_id = page.unit_id,
    attendance_id = attendance.id,
    course_id = attendance.course_id,
    status = 'active',
    configured_at = now(),
    updated_at = now()
from form_attendance mapping
inner join app_course_attendances attendance
  on attendance.id = mapping.attendance_id
 and attendance.status = 'active'
inner join app_meta_pages page
  on page.unit_id = attendance.unit_id
 and page.status = 'active'
where form.meta_form_id = mapping.meta_form_id
  and form.page_id = page.id
  and form.meta_status = 'ACTIVE';
