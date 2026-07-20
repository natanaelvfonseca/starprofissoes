import type { QueryResultRow } from "pg";
import type { AuthSession, UnitSummary } from "@/lib/auth-types";
import { queryDb } from "@/lib/server/db";

export const DEFAULT_ACQUISITION_CHANNELS = [
  { name: "Meta Ads", type: "Pago" },
  { name: "Google Ads", type: "Pago" },
  { name: "TikTok", type: "Pago" },
  { name: "Instagram Orgânico", type: "Orgânico" },
  { name: "WhatsApp", type: "Conversacional" },
  { name: "Indicação", type: "Relacionamento" },
  { name: "Site", type: "Próprio" },
  { name: "Evento", type: "Presencial" },
  { name: "Parceria", type: "Relacionamento" },
] as const;

let commercialSchemaPromise: Promise<void> | null = null;

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getUnitFromRequest(session: AuthSession, request: Request): UnitSummary | null {
  const url = new URL(request.url);
  const requestedUnitId = url.searchParams.get("unitId")?.trim();
  const unitId = requestedUnitId || session.activeUnit?.id || "";

  return session.units.find((unit) => unit.id === unitId) ?? null;
}

export function getUnitFromBody(session: AuthSession, unitId: unknown): UnitSummary | null {
  const requestedUnitId = typeof unitId === "string" ? unitId.trim() : "";
  const selectedUnitId = requestedUnitId || session.activeUnit?.id || "";

  return session.units.find((unit) => unit.id === selectedUnitId) ?? null;
}

export function isUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function ensureCommercialSchema() {
  commercialSchemaPromise ??= queryDb(`
    create table if not exists app_courses (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      name text not null,
      value numeric(12,2) not null default 0 check (value >= 0),
      category text,
      status text not null default 'active' check (status in ('active', 'inactive')),
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create unique index if not exists app_courses_unit_name_lower_idx on app_courses (unit_id, lower(name));
    create index if not exists app_courses_unit_status_idx on app_courses (unit_id, status);

    create table if not exists app_acquisition_channels (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      name text not null,
      type text not null,
      status text not null default 'active' check (status in ('active', 'inactive')),
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create unique index if not exists app_acquisition_channels_unit_name_lower_idx on app_acquisition_channels (unit_id, lower(name));
    create index if not exists app_acquisition_channels_unit_status_idx on app_acquisition_channels (unit_id, status);

    create table if not exists app_leads (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      full_name text not null,
      phone text not null,
      phone2 text,
      email text,
      course_id uuid references app_courses(id) on delete set null,
      course_name_snapshot text,
      course_value_snapshot numeric(12,2),
      acquisition_channel_id uuid references app_acquisition_channels(id) on delete set null,
      acquisition_channel_name_snapshot text,
      observations text,
      city text,
      stage text not null default 'Novo lead' check (
        stage in (
          'Novo lead',
          'Em contato',
          'Qualificado',
          'Proposta',
          'Pagamento pendente',
          'Confirmado',
          'Recuperação',
          'Matriculado'
        )
      ),
      first_contact_at timestamptz,
      follow_up_count integer not null default 0 check (follow_up_count >= 0),
      last_follow_up_at timestamptz,
      converted_at timestamptz,
      converted_by uuid references app_users(id) on delete set null,
      payment_status text not null default 'pending' check (
        payment_status in ('pending', 'paid', 'overdue', 'waived', 'refunded')
      ),
      payment_confirmed_at timestamptz,
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table app_leads add column if not exists city text;
    alter table app_leads add column if not exists phone2 text;
    alter table app_leads add column if not exists first_contact_at timestamptz;
    alter table app_leads add column if not exists follow_up_count integer not null default 0 check (follow_up_count >= 0);
    alter table app_leads add column if not exists last_follow_up_at timestamptz;
    alter table app_leads add column if not exists converted_at timestamptz;
    alter table app_leads add column if not exists converted_by uuid references app_users(id) on delete set null;
    alter table app_leads add column if not exists payment_status text not null default 'pending' check (
      payment_status in ('pending', 'paid', 'overdue', 'waived', 'refunded')
    );
    alter table app_leads add column if not exists payment_confirmed_at timestamptz;

    create index if not exists app_leads_unit_stage_idx on app_leads (unit_id, stage);
    create index if not exists app_leads_unit_user_stage_idx on app_leads (unit_id, created_by, stage);
    create index if not exists app_leads_unit_created_idx on app_leads (unit_id, created_at desc);
    create index if not exists app_leads_course_idx on app_leads (course_id);
    create index if not exists app_leads_acquisition_channel_idx on app_leads (acquisition_channel_id);
    create index if not exists app_leads_unit_user_city_idx on app_leads (unit_id, created_by, city);
    create index if not exists app_leads_converted_at_idx on app_leads (converted_at desc);

    create table if not exists app_lead_import_rows (
      id uuid primary key default gen_random_uuid(),
      lead_id uuid not null unique references app_leads(id) on delete cascade,
      campaign_name text,
      form_id text,
      whatsapp_number text,
      imported_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create index if not exists app_lead_import_rows_campaign_idx
      on app_lead_import_rows (campaign_name);

    create or replace function app_assign_default_marketing_owner()
    returns trigger as $$
    begin
      if new.created_by is null then
        select u.id
        into new.created_by
        from app_users u
        where u.status = 'active'
          and u.role = 'MARKETING'
          and (
            u.primary_unit_id = new.unit_id
            or exists (
              select 1
              from app_user_units uu
              where uu.user_id = u.id
                and uu.unit_id = new.unit_id
            )
            or not exists (
              select 1
              from app_users scoped
              where scoped.status = 'active'
                and scoped.role = 'MARKETING'
                and (
                  scoped.primary_unit_id = new.unit_id
                  or exists (
                    select 1
                    from app_user_units scoped_uu
                    where scoped_uu.user_id = scoped.id
                      and scoped_uu.unit_id = new.unit_id
                  )
                )
            )
          )
        order by
          case
            when u.primary_unit_id = new.unit_id then 0
            when exists (
              select 1
              from app_user_units uu
              where uu.user_id = u.id
                and uu.unit_id = new.unit_id
            ) then 1
            else 2
          end,
          u.created_at asc,
          u.name asc
        limit 1;
      end if;

      return new;
    end;
    $$ language plpgsql;

    drop trigger if exists app_leads_default_marketing_owner on app_leads;
    create trigger app_leads_default_marketing_owner
      before insert on app_leads
      for each row
      execute function app_assign_default_marketing_owner();

    update app_leads
    set
      converted_at = coalesce(converted_at, updated_at, created_at),
      payment_status = 'paid',
      payment_confirmed_at = coalesce(payment_confirmed_at, converted_at, updated_at, created_at)
    where stage = 'Matriculado';

    create table if not exists app_student_payments (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      lead_id uuid not null references app_leads(id) on delete cascade,
      description text not null default 'Pagamento',
      amount numeric(12,2) not null default 0 check (amount >= 0),
      status text not null default 'pending' check (
        status in ('pending', 'paid', 'overdue', 'cancelled', 'waived', 'refunded')
      ),
      due_at date,
      paid_at timestamptz,
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists app_student_payments_unit_status_idx on app_student_payments (unit_id, status);
    create index if not exists app_student_payments_lead_idx on app_student_payments (lead_id);
    create index if not exists app_student_payments_due_idx on app_student_payments (due_at);
    create index if not exists app_student_payments_paid_idx on app_student_payments (paid_at desc);

    insert into app_student_payments (
      unit_id,
      lead_id,
      description,
      amount,
      status,
      due_at,
      paid_at,
      created_by
    )
    select
      l.unit_id,
      l.id,
      'Taxa/matrícula confirmada',
      coalesce(l.course_value_snapshot, 0),
      'paid',
      coalesce(l.payment_confirmed_at, l.converted_at, l.updated_at, l.created_at)::date,
      coalesce(l.payment_confirmed_at, l.converted_at, l.updated_at, l.created_at),
      l.created_by
    from app_leads l
    where l.stage = 'Matriculado'
      and not exists (
        select 1
        from app_student_payments p
        where p.lead_id = l.id
          and p.status = 'paid'
      );

    create table if not exists app_student_attendance (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      lead_id uuid not null references app_leads(id) on delete cascade,
      scheduled_at timestamptz not null,
      status text not null default 'scheduled' check (
        status in ('scheduled', 'attended', 'missed', 'no_show', 'risk', 'cancelled')
      ),
      notes text,
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists app_student_attendance_unit_status_idx on app_student_attendance (unit_id, status);
    create index if not exists app_student_attendance_lead_idx on app_student_attendance (lead_id);
    create index if not exists app_student_attendance_scheduled_idx on app_student_attendance (scheduled_at desc);

    create table if not exists app_ai_recoveries (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      lead_id uuid references app_leads(id) on delete set null,
      status text not null default 'open' check (status in ('open', 'recovered', 'lost')),
      value_recovered numeric(12,2) not null default 0 check (value_recovered >= 0),
      recovered_at timestamptz,
      notes text,
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists app_ai_recoveries_unit_status_idx on app_ai_recoveries (unit_id, status);
    create index if not exists app_ai_recoveries_lead_idx on app_ai_recoveries (lead_id);
    create index if not exists app_ai_recoveries_recovered_idx on app_ai_recoveries (recovered_at desc);

    create table if not exists app_lead_owner_transfers (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      lead_id uuid not null references app_leads(id) on delete cascade,
      previous_owner_id uuid references app_users(id) on delete set null,
      next_owner_id uuid references app_users(id) on delete set null,
      transferred_by uuid references app_users(id) on delete set null,
      reason text,
      created_at timestamptz not null default now()
    );

    create index if not exists app_lead_owner_transfers_lead_idx
      on app_lead_owner_transfers (lead_id, created_at desc);

    create index if not exists app_lead_owner_transfers_unit_created_idx
      on app_lead_owner_transfers (unit_id, created_at desc);
  `).then(() => undefined);

  return commercialSchemaPromise;
}

type DefaultMarketingOwnerRow = QueryResultRow & {
  id: string;
  name: string;
};

export async function getDefaultMarketingLeadOwner(unitId: string) {
  const result = await queryDb<DefaultMarketingOwnerRow>(
    `
      select u.id, u.name
      from app_users u
      where u.status = 'active'
        and u.role = 'MARKETING'
        and (
          u.primary_unit_id = $1
          or exists (
            select 1
            from app_user_units uu
            where uu.user_id = u.id
              and uu.unit_id = $1
          )
          or not exists (
            select 1
            from app_users scoped
            where scoped.status = 'active'
              and scoped.role = 'MARKETING'
              and (
                scoped.primary_unit_id = $1
                or exists (
                  select 1
                  from app_user_units scoped_uu
                  where scoped_uu.user_id = scoped.id
                    and scoped_uu.unit_id = $1
                )
              )
          )
        )
      order by
        case
          when u.primary_unit_id = $1 then 0
          when exists (
            select 1
            from app_user_units uu
            where uu.user_id = u.id
              and uu.unit_id = $1
          ) then 1
          else 2
        end,
        u.created_at asc,
        u.name asc
      limit 1
    `,
    [unitId],
  );

  return result.rows[0] ?? null;
}

export async function ensureDefaultAcquisitionChannels(unitId: string) {
  await ensureCommercialSchema();

  await queryDb(
    `
      insert into app_acquisition_channels (unit_id, name, type, status)
      select $1, item.name, item.type, 'active'
      from jsonb_to_recordset($2::jsonb) as item(name text, type text)
      on conflict do nothing
    `,
    [unitId, JSON.stringify(DEFAULT_ACQUISITION_CHANNELS)],
  );
}
