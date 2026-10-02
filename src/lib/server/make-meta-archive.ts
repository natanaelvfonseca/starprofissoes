import { ensureRuntimeSchema, queryDb } from "@/lib/server/db";
import type { MakeMetaLeadPayload } from "@/lib/server/make-meta-bridge";

let archiveSchemaPromise: Promise<void> | null = null;

async function ensureMakeMetaArchiveSchema() {
  archiveSchemaPromise ??= ensureRuntimeSchema(
    "make-meta-archive",
    `
      create table if not exists app_make_meta_lead_archive (
        id uuid primary key default gen_random_uuid(),
        leadgen_id text not null unique,
        form_id text not null,
        page_id text not null,
        payload jsonb not null,
        delivery_count integer not null default 1,
        first_received_at timestamptz not null default now(),
        last_received_at timestamptz not null default now()
      );

      create index if not exists app_make_meta_lead_archive_received_idx
        on app_make_meta_lead_archive (last_received_at desc);
    `,
  ).catch((error) => {
    archiveSchemaPromise = null;
    throw error;
  });

  await archiveSchemaPromise;
}

export async function archiveMakeMetaLead(payload: MakeMetaLeadPayload) {
  await ensureMakeMetaArchiveSchema();
  await queryDb(
    `
      insert into app_make_meta_lead_archive (leadgen_id, form_id, page_id, payload)
      values ($1, $2, $3, $4::jsonb)
      on conflict (leadgen_id) do update
      set payload = excluded.payload,
          delivery_count = app_make_meta_lead_archive.delivery_count + 1,
          last_received_at = now()
    `,
    [payload.leadgen_id, payload.form_id, payload.page_id, JSON.stringify(payload)],
  );

  return { ok: true, status: 200, result: "archived", leadId: null };
}
