import { createHash, randomBytes } from "node:crypto";
import type { QueryResultRow } from "pg";
import { queryDb } from "@/lib/server/db";

type InstanceRow = QueryResultRow & {
  id: string;
  unit_id: string;
  user_id: string | null;
  instance_name: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  phone_number: string | null;
  webhook_secret: string;
  connected_at: string | null;
  last_event_at: string | null;
};

let schemaPromise: Promise<void> | null = null;

export async function ensureEvolutionSchema() {
  if (!schemaPromise) {
    schemaPromise = queryDb(`
      create table if not exists app_whatsapp_instances (
        id uuid primary key default gen_random_uuid(),
        unit_id uuid not null references app_units(id) on delete cascade,
        user_id uuid references app_users(id) on delete cascade,
        instance_name text not null unique,
        status text not null default 'disconnected' check (
          status in ('disconnected', 'connecting', 'connected', 'error')
        ),
        phone_number text,
        webhook_secret text not null,
        connected_at timestamptz,
        last_event_at timestamptz,
        created_by uuid references app_users(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists app_whatsapp_messages (
        id uuid primary key default gen_random_uuid(),
        unit_id uuid not null references app_units(id) on delete cascade,
        user_id uuid references app_users(id) on delete cascade,
        instance_id uuid not null references app_whatsapp_instances(id) on delete cascade,
        evolution_message_id text not null,
        remote_jid text not null,
        phone text not null,
        contact_name text,
        direction text not null check (direction in ('inbound', 'outbound')),
        message_type text not null default 'text',
        content text not null default '',
        media_url text,
        media_mime_type text,
        media_file_name text,
        sent_at timestamptz not null,
        created_at timestamptz not null default now(),
        unique (instance_id, evolution_message_id)
      );

      create index if not exists app_whatsapp_messages_unit_contact_idx
        on app_whatsapp_messages (unit_id, remote_jid, sent_at desc);
      create index if not exists app_whatsapp_messages_unit_sent_idx
        on app_whatsapp_messages (unit_id, sent_at desc);

      alter table app_whatsapp_instances
        add column if not exists user_id uuid references app_users(id) on delete cascade;
      update app_whatsapp_instances
      set user_id = created_by
      where user_id is null and created_by is not null;
      alter table app_whatsapp_instances
        drop constraint if exists app_whatsapp_instances_unit_id_key;
      drop index if exists app_whatsapp_instances_user_idx;
      create unique index if not exists app_whatsapp_instances_user_unit_idx
        on app_whatsapp_instances (user_id, unit_id)
        where user_id is not null;
      create index if not exists app_whatsapp_instances_unit_idx
        on app_whatsapp_instances (unit_id);

      alter table app_whatsapp_messages
        add column if not exists user_id uuid references app_users(id) on delete cascade;
      alter table app_whatsapp_messages
        add column if not exists media_url text;
      alter table app_whatsapp_messages
        add column if not exists media_mime_type text;
      alter table app_whatsapp_messages
        add column if not exists media_file_name text;
      update app_whatsapp_messages message
      set user_id = instance.user_id
      from app_whatsapp_instances instance
      where message.instance_id = instance.id and message.user_id is null;
      create index if not exists app_whatsapp_messages_user_sent_idx
        on app_whatsapp_messages (user_id, sent_at desc);
    `)
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }

  return schemaPromise;
}

function evolutionConfig() {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!url || !apiKey) {
    throw new Error("A Evolution API ainda não está configurada no servidor.");
  }

  return { url, apiKey };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstValue(...values: Array<unknown>) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

async function evolutionFetch(path: string, init: RequestInit = {}) {
  const { url, apiKey } = evolutionConfig();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let data: unknown = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const dataRecord = asRecord(data);
    const detail =
      typeof dataRecord.message === "string"
        ? dataRecord.message
        : typeof dataRecord.error === "string"
          ? dataRecord.error
          : text;
    throw new Error(detail || `Evolution API respondeu com status ${response.status}.`);
  }

  return data;
}

export async function requestEvolution(path: string, init: RequestInit = {}) {
  return evolutionFetch(path, init);
}

function instancePart(value: string, fallback = "star_profissoes") {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function connectionState(data: unknown) {
  const dataRecord = asRecord(data);
  const instanceRecord = asRecord(dataRecord.instance);
  const raw = String(
    firstValue(instanceRecord.state, dataRecord.state, dataRecord.connectionStatus) ?? "",
  ).toLowerCase();

  if (["open", "connected", "conected"].includes(raw)) return "connected";
  if (["connecting", "qr", "qrcode"].includes(raw)) return "connecting";
  return "disconnected";
}

function qrCodeFrom(data: unknown) {
  const dataRecord = asRecord(data);
  const qrcodeRecord = asRecord(dataRecord.qrcode);
  const value = firstValue(dataRecord.base64, qrcodeRecord.base64, dataRecord.code);

  if (typeof value !== "string" || !value) return null;
  if (value.startsWith("data:image/")) return value;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 500) {
    return `data:image/png;base64,${value.replace(/\s/g, "")}`;
  }
  return null;
}

function publicWebhookUrl(requestUrl: string, secret: string) {
  const configured = process.env.PUBLIC_APP_URL?.replace(/\/+$/, "");
  const origin = configured || new URL(requestUrl).origin;
  return `${origin}/api/webhooks/evolution?token=${encodeURIComponent(secret)}`;
}

function remoteInstanceName(item: unknown) {
  const itemRecord = asRecord(item);
  const instanceRecord = asRecord(itemRecord.instance);

  return String(
    firstValue(
      itemRecord.name,
      itemRecord.instanceName,
      instanceRecord.instanceName,
      instanceRecord.name,
      "",
    ),
  );
}

async function remoteInstanceExists(instanceName: string) {
  const instances = await evolutionFetch("/instance/fetchInstances");
  const instancesRecord = asRecord(instances);
  const items = Array.isArray(instances)
    ? instances
    : Array.isArray(instancesRecord.instances)
      ? instancesRecord.instances
      : [];

  return items.some((item) => remoteInstanceName(item) === instanceName);
}

async function createRemoteInstance(instanceName: string) {
  await evolutionFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      token: "",
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      rejectCall: false,
      groupsIgnore: true,
    }),
  });
}

async function getInstance(userId: string, unitId: string) {
  await ensureEvolutionSchema();
  const result = await queryDb<InstanceRow>(
    `select * from app_whatsapp_instances where user_id = $1 and unit_id = $2 limit 1`,
    [userId, unitId],
  );
  return result.rows[0] ?? null;
}

export async function getEvolutionState(userId: string, unitId: string) {
  let instance = await getInstance(userId, unitId);

  if (instance) {
    try {
      const stateData = await evolutionFetch(
        `/instance/connectionState/${encodeURIComponent(instance.instance_name)}`,
      );
      const status = connectionState(stateData);
      const updated = await queryDb<InstanceRow>(
        `
          update app_whatsapp_instances
          set status = $2,
              connected_at = case when $2 = 'connected' then coalesce(connected_at, now()) else connected_at end,
              updated_at = now()
          where id = $1
          returning *
        `,
        [instance.id, status],
      );
      instance = updated.rows[0] ?? instance;
    } catch {
      // The local state remains useful when Evolution is temporarily unavailable.
    }
  }

  return {
    configured: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY),
    instance: instance
      ? {
          id: instance.id,
          name: instance.instance_name,
          status: instance.status,
          phoneNumber: instance.phone_number,
          connectedAt: instance.connected_at,
          lastEventAt: instance.last_event_at,
        }
      : null,
  };
}

export async function getEvolutionQrCode(userId: string, unitId: string) {
  const instance = await getInstance(userId, unitId);

  if (!instance || instance.status === "connected") {
    return null;
  }

  const qrData = await evolutionFetch(
    `/instance/connect/${encodeURIComponent(instance.instance_name)}`,
  );

  return qrCodeFrom(qrData);
}

export async function connectEvolution(
  unit: { id: string; name: string },
  user: { id: string; email: string; name: string },
  requestUrl: string,
) {
  await ensureEvolutionSchema();
  let instance = await getInstance(user.id, unit.id);
  const unitName = instancePart(unit.name, "Unidade");
  const consultantEmail = instancePart(
    user.email.toLowerCase(),
    createHash("sha256").update(user.id).digest("hex").slice(0, 10),
  );
  const desiredInstanceName = `star_${unitName}_${consultantEmail}`.slice(0, 100);

  if (!instance) {
    const secret = randomBytes(24).toString("base64url");
    const created = await queryDb<InstanceRow>(
      `
        insert into app_whatsapp_instances
          (unit_id, user_id, instance_name, status, webhook_secret, created_by)
        values ($1, $2, $3, 'connecting', $4, $2)
        returning *
      `,
      [unit.id, user.id, desiredInstanceName, secret],
    );
    instance = created.rows[0];
  } else if (instance.instance_name !== desiredInstanceName && instance.status !== "connected") {
    await evolutionFetch(`/instance/logout/${encodeURIComponent(instance.instance_name)}`, {
      method: "DELETE",
    }).catch(() => null);
    await evolutionFetch(`/instance/delete/${encodeURIComponent(instance.instance_name)}`, {
      method: "DELETE",
    }).catch(() => null);

    const renamed = await queryDb<InstanceRow>(
      `
        update app_whatsapp_instances
        set unit_id = $2, instance_name = $3, status = 'connecting', updated_at = now()
        where id = $1
        returning *
      `,
      [instance.id, unit.id, desiredInstanceName],
    );
    instance = renamed.rows[0] ?? instance;
  }

  if (!(await remoteInstanceExists(instance.instance_name))) {
    try {
      await createRemoteInstance(instance.instance_name);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("already") && !message.includes("exist")) throw error;
    }
  }

  const webhookUrl = publicWebhookUrl(requestUrl, instance.webhook_secret);
  await evolutionFetch(`/webhook/set/${encodeURIComponent(instance.instance_name)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });

  await evolutionFetch(`/settings/set/${encodeURIComponent(instance.instance_name)}`, {
    method: "POST",
    body: JSON.stringify({
      groupsIgnore: true,
      rejectCall: false,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
    }),
  }).catch(() => null);

  const stateData = await evolutionFetch(
    `/instance/connectionState/${encodeURIComponent(instance.instance_name)}`,
  ).catch(() => null);

  if (stateData && connectionState(stateData) === "connected") {
    await queryDb(
      `
        update app_whatsapp_instances
        set status = 'connected', connected_at = coalesce(connected_at, now()), updated_at = now()
        where id = $1
      `,
      [instance.id],
    );
    return { status: "connected", qrCode: null };
  }

  const qrData = await evolutionFetch(
    `/instance/connect/${encodeURIComponent(instance.instance_name)}`,
  );
  await queryDb(
    `update app_whatsapp_instances set status = 'connecting', updated_at = now() where id = $1`,
    [instance.id],
  );

  return { status: "connecting", qrCode: qrCodeFrom(qrData) };
}

export async function disconnectEvolution(userId: string, unitId: string) {
  const instance = await getInstance(userId, unitId);
  if (!instance) return;

  await evolutionFetch(`/instance/logout/${encodeURIComponent(instance.instance_name)}`, {
    method: "DELETE",
  }).catch(() => null);
  await queryDb(
    `update app_whatsapp_instances set status = 'disconnected', updated_at = now() where id = $1`,
    [instance.id],
  );
}

function eventName(payload: unknown) {
  const payloadRecord = asRecord(payload);

  return String(firstValue(payloadRecord.event, payloadRecord.type, ""))
    .toLowerCase()
    .replace(/_/g, ".");
}

function extractMessage(payload: unknown) {
  const payloadRecord = asRecord(payload);
  const data = asRecord(payloadRecord.data);
  const message = asRecord(data.message);
  const key = asRecord(firstValue(data.key, message.key));
  const extendedTextMessage = asRecord(message.extendedTextMessage);
  const imageMessage = asRecord(message.imageMessage);
  const videoMessage = asRecord(message.videoMessage);
  const documentMessage = asRecord(message.documentMessage);
  const media =
    message.imageMessage ??
    message.audioMessage ??
    message.videoMessage ??
    message.documentMessage ??
    null;
  const mediaRecord = asRecord(media);
  const content =
    message.conversation ??
    extendedTextMessage.text ??
    imageMessage.caption ??
    videoMessage.caption ??
    documentMessage.fileName ??
    (message?.audioMessage ? "[Áudio]" : "");
  const type =
    message?.conversation || message?.extendedTextMessage
      ? "text"
      : message?.imageMessage
        ? "image"
        : message?.audioMessage
          ? "audio"
          : message?.videoMessage
            ? "video"
            : message?.documentMessage
              ? "document"
              : "unknown";

  return {
    id: String(key?.id ?? data?.id ?? ""),
    remoteJid: String(key?.remoteJid ?? data?.remoteJid ?? ""),
    fromMe: Boolean(key?.fromMe),
    contactName: String(data?.pushName ?? data?.notify ?? "").trim() || null,
    content: String(content || (type === "unknown" ? "[Mensagem]" : `[${type}]`)),
    type,
    mediaUrl:
      typeof mediaRecord.url === "string"
        ? mediaRecord.url
        : typeof data?.mediaUrl === "string"
          ? data.mediaUrl
          : null,
    mimeType:
      typeof mediaRecord.mimetype === "string"
        ? mediaRecord.mimetype
        : typeof mediaRecord.mimeType === "string"
          ? mediaRecord.mimeType
          : null,
    fileName:
      typeof mediaRecord.fileName === "string"
        ? mediaRecord.fileName
        : typeof documentMessage.title === "string"
          ? documentMessage.title
          : null,
    timestamp: Number(data.messageTimestamp ?? payloadRecord.date_time ?? Date.now() / 1000),
  };
}

export async function receiveEvolutionWebhook(payload: unknown, token: string | null) {
  await ensureEvolutionSchema();
  const payloadRecord = asRecord(payload);
  const dataRecord = asRecord(payloadRecord.data);
  const instanceName = String(firstValue(payloadRecord.instance, payloadRecord.instanceName, ""));
  if (!instanceName || !token) return { ok: false, status: 401 };

  const instanceResult = await queryDb<InstanceRow>(
    `
      select *
      from app_whatsapp_instances
      where instance_name = $1 and webhook_secret = $2
      limit 1
    `,
    [instanceName, token],
  );
  const instance = instanceResult.rows[0];
  if (!instance) return { ok: false, status: 401 };

  const event = eventName(payload);
  if (event === "connection.update") {
    const status = connectionState(payloadRecord.data ?? payload);
    const phone = String(
      firstValue(dataRecord.wuid, dataRecord.phoneNumber, payloadRecord.sender, ""),
    )
      .split("@")[0]
      .replace(/\D/g, "");
    await queryDb(
      `
        update app_whatsapp_instances
        set status = $2,
            phone_number = coalesce(nullif($3, ''), phone_number),
            connected_at = case when $2 = 'connected' then coalesce(connected_at, now()) else connected_at end,
            last_event_at = now(),
            updated_at = now()
        where id = $1
      `,
      [instance.id, status, phone],
    );
  }

  if (event === "messages.upsert" || event === "message") {
    const parsed = extractMessage(payload);
    if (parsed.id && parsed.remoteJid && !parsed.remoteJid.endsWith("@g.us")) {
      const phone = parsed.remoteJid.split("@")[0].replace(/\D/g, "");
      const sentAt = new Date(
        parsed.timestamp > 10_000_000_000 ? parsed.timestamp : parsed.timestamp * 1000,
      );
      await queryDb(
        `
          insert into app_whatsapp_messages (
            unit_id, user_id, instance_id, evolution_message_id, remote_jid, phone,
            contact_name, direction, message_type, content, media_url, media_mime_type,
            media_file_name, sent_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          on conflict (instance_id, evolution_message_id) do update
          set contact_name = coalesce(excluded.contact_name, app_whatsapp_messages.contact_name),
              content = excluded.content,
              message_type = excluded.message_type,
              media_url = coalesce(excluded.media_url, app_whatsapp_messages.media_url),
              media_mime_type = coalesce(excluded.media_mime_type, app_whatsapp_messages.media_mime_type),
              media_file_name = coalesce(excluded.media_file_name, app_whatsapp_messages.media_file_name)
        `,
        [
          instance.unit_id,
          instance.user_id,
          instance.id,
          parsed.id,
          parsed.remoteJid,
          phone,
          parsed.contactName,
          parsed.fromMe ? "outbound" : "inbound",
          parsed.type,
          parsed.content,
          parsed.mediaUrl,
          parsed.mimeType,
          parsed.fileName,
          Number.isNaN(sentAt.getTime()) ? new Date() : sentAt,
        ],
      );
      await queryDb(
        `update app_whatsapp_instances set last_event_at = now(), updated_at = now() where id = $1`,
        [instance.id],
      );
    }
  }

  return { ok: true, status: 200 };
}
