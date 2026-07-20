create table if not exists app_login_attempts (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  ip_hash text not null,
  successful boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists app_login_attempts_email_idx on app_login_attempts (email_hash, attempted_at desc);
create index if not exists app_login_attempts_ip_idx on app_login_attempts (ip_hash, attempted_at desc);
create index if not exists app_login_attempts_pair_idx on app_login_attempts (email_hash, ip_hash, attempted_at desc);
