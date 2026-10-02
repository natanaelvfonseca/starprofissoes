alter table app_meta_integrations
  alter column graph_api_version set default 'v26.0';

update app_meta_integrations
set graph_api_version = 'v26.0',
    updated_at = now()
where graph_api_version is null
   or graph_api_version = ''
   or graph_api_version = 'v23.0';
