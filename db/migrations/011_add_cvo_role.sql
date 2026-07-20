alter table app_users drop constraint if exists app_users_role_check;

alter table app_users
  add constraint app_users_role_check
  check (role in ('MASTER', 'CEO', 'CVO', 'DIRETOR', 'GERENTE', 'MARKETING', 'CONSULTOR'));
