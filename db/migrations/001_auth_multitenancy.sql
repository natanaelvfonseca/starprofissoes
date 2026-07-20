create extension if not exists pgcrypto;

create table if not exists app_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_units_slug_idx on app_units (slug);
create index if not exists app_units_status_idx on app_units (status);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  avatar_url text,
  role text not null check (role in ('MASTER', 'CEO', 'DIRETOR', 'GERENTE', 'MARKETING', 'CONSULTOR')),
  primary_unit_id uuid not null references app_units(id) on delete restrict,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_users add column if not exists avatar_url text;

create unique index if not exists app_users_email_lower_idx on app_users (lower(email));
create index if not exists app_users_primary_unit_idx on app_users (primary_unit_id);
create index if not exists app_users_role_idx on app_users (role);
create index if not exists app_users_status_idx on app_users (status);

create table if not exists app_user_units (
  user_id uuid not null references app_users(id) on delete cascade,
  unit_id uuid not null references app_units(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);

create index if not exists app_user_units_unit_idx on app_user_units (unit_id);

create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null,
  active_unit_id uuid references app_units(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists app_sessions_token_hash_idx on app_sessions (token_hash);
create index if not exists app_sessions_user_idx on app_sessions (user_id);
create index if not exists app_sessions_expires_idx on app_sessions (expires_at);
