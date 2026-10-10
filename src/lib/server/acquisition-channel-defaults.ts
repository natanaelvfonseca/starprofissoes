// Existing units are marked initialized without changing their configured channels.
export const acquisitionChannelInitializationSql = `
  create table if not exists app_commercial_configuration_defaults (
    unit_id uuid primary key references app_units(id) on delete cascade,
    channels_initialized_at timestamptz not null default now()
  );
`;

export const initializeAcquisitionChannelsSql = `
  with initialized as (
    insert into app_commercial_configuration_defaults (unit_id)
    values ($1::uuid)
    on conflict do nothing
    returning unit_id
  )
  insert into app_acquisition_channels (unit_id, name, type, status)
  select initialized.unit_id, item.name, item.type, 'active'
  from initialized
  cross join jsonb_to_recordset($2::jsonb) as item(name text, type text)
  where not exists (select 1 from app_acquisition_channels where unit_id = $1::uuid)
  on conflict do nothing
`;
