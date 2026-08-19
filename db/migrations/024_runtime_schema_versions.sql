create table if not exists app_runtime_schema_versions (
  schema_key text not null,
  schema_version text not null,
  applied_at timestamptz not null default now(),
  primary key (schema_key, schema_version)
);
