// Used by management reads/writes and exercised against PostgreSQL in the regression tests.
export const readPipelineColumnsSql = `
  select id, unit_id, pipeline_type, name, color, position, system_key, semantic_stage
  from app_pipeline_columns
  where unit_id = $1
  order by pipeline_type, position, created_at, name
`;

export const createPipelineColumnSql = `
  insert into app_pipeline_columns (
    unit_id, pipeline_type, name, color, position, semantic_stage, created_by
  )
  values ($1, $2, $3, $4, $5, $6, $7)
  returning id, unit_id, pipeline_type, name, color, position, system_key, semantic_stage
`;

export const updatePipelineColumnSql = `
  update app_pipeline_columns
  set name = $3, color = $4, position = $5, updated_at = now()
  where id = $1 and unit_id = $2
  returning id, unit_id, pipeline_type, name, color, position, system_key, semantic_stage
`;
