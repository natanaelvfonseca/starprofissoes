create table if not exists app_brand_library_materials (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references app_units(id) on delete cascade,
  course text not null,
  title text not null,
  file_name text not null,
  mime_type text not null,
  media_type text not null check (media_type in ('image', 'video')),
  data_url text not null,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_brand_library_unit_course_idx
  on app_brand_library_materials (unit_id, course);

create index if not exists app_brand_library_unit_created_idx
  on app_brand_library_materials (unit_id, created_at desc);
