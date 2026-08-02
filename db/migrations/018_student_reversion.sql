alter table app_leads
  add column if not exists pre_enrollment_stage text check (
    pre_enrollment_stage is null or pre_enrollment_stage in (
      'Novo lead',
      'Em contato',
      'Qualificado',
      'Proposta',
      'Pagamento pendente',
      'Confirmado',
      'Recuperação'
    )
  );

alter table app_leads
  add column if not exists pre_enrollment_pipeline_column_id uuid
    references app_pipeline_columns(id) on delete set null;
