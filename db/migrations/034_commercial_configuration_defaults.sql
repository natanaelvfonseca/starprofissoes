-- Execute only with search_path set to star_profissoes,public.
-- The runtime applies the same additive schema using ensureRuntimeSchema.
create table if not exists app_commercial_configuration_defaults (
  unit_id uuid primary key references app_units(id) on delete cascade,
  channels_initialized_at timestamptz not null default now()
);
