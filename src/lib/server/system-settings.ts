import type { QueryResultRow } from "pg";
import { queryDb } from "@/lib/server/db";

type SettingRow = QueryResultRow & {
  value: string;
};

export type SystemSettings = {
  systemLocked: boolean;
};

let systemSettingsSchemaPromise: Promise<void> | null = null;

export function ensureSystemSettingsSchema() {
  systemSettingsSchemaPromise ??= queryDb(`
    create table if not exists app_system_settings (
      key text primary key,
      value text not null,
      updated_by uuid references app_users(id) on delete set null,
      updated_at timestamptz not null default now()
    );

    insert into app_system_settings (key, value)
    values ('system_locked', 'true')
    on conflict (key) do nothing;
  `)
    .then(() => undefined)
    .catch((error) => {
      systemSettingsSchemaPromise = null;
      throw error;
    });

  return systemSettingsSchemaPromise;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  await ensureSystemSettingsSchema();

  const result = await queryDb<SettingRow>(
    `
      select value
      from app_system_settings
      where key = 'system_locked'
      limit 1
    `,
  );

  return {
    systemLocked: result.rows[0]?.value === "true",
  };
}

export async function saveSystemLocked(systemLocked: boolean, userId: string) {
  await ensureSystemSettingsSchema();

  await queryDb(
    `
      insert into app_system_settings (key, value, updated_by, updated_at)
      values ('system_locked', $1, $2, now())
      on conflict (key) do update
      set
        value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now()
    `,
    [systemLocked ? "true" : "false", userId],
  );

  return { systemLocked };
}
