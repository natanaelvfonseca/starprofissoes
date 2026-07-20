import type { QueryResultRow } from "pg";
import type {
  AttendanceConnectionStatus,
  AttendanceConsultant,
  AttendanceConversation,
  AttendanceMessage,
  AttendanceMessageDirection,
  AttendanceMessageType,
} from "@/lib/attendance-types";
import type { AuthSession, UserRole } from "@/lib/auth-types";
import { canViewAttendances, isExecutiveRole, isMasterRole } from "@/lib/auth-types";
import { isUuid } from "@/lib/server/commercial-schema";
import { queryDb } from "@/lib/server/db";
import { ensureEvolutionSchema, requestEvolution } from "@/lib/server/evolution-whatsapp";

export const ATTENDANCE_ALL_UNITS = "__all__";

const DEFAULT_CONVERSATION_LIMIT = 30;
const DEFAULT_MESSAGE_LIMIT = 40;
const MAX_REMOTE_LOOKAHEAD = 120;

type AttendanceUnitScope = {
  unitIds: Array<string>;
  selectedUnitId: string | null;
};

type ConsultantInstanceRow = QueryResultRow & {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  unit_id: string;
  unit_name: string;
  instance_id: string;
  instance_name: string;
  status: AttendanceConnectionStatus;
  phone_number: string | null;
  last_event_at: string | null;
  conversation_count: number | string;
};

type LocalConversationRow = QueryResultRow & {
  remote_jid: string;
  phone: string;
  contact_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  message_type: AttendanceMessageType | string | null;
};

type LocalSelfNameRow = QueryResultRow & {
  contact_name: string;
};

type LocalMessageRow = QueryResultRow & {
  id: string;
  evolution_message_id: string;
  remote_jid: string;
  direction: AttendanceMessageDirection;
  message_type: AttendanceMessageType | string;
  content: string;
  media_url: string | null;
  media_mime_type: string | null;
  media_file_name: string | null;
  sent_at: string;
  total_count: number | string;
};

type AttendanceMediaFile = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
};

export function canUseGlobalAttendanceUnitFilter(role: UserRole) {
  return isMasterRole(role) || isExecutiveRole(role);
}

export function requireAttendanceAccess(session: AuthSession | null) {
  return Boolean(session && canViewAttendances(session.user.role) && session.units.length);
}

export function getAttendanceUnitScope(
  session: AuthSession,
  requestedUnitId?: string | null,
): AttendanceUnitScope | null {
  const requested = requestedUnitId?.trim();
  const canUseAllUnits = canUseGlobalAttendanceUnitFilter(session.user.role);

  if (requested && requested !== ATTENDANCE_ALL_UNITS) {
    if (!isUuid(requested)) {
      return null;
    }

    const unit = session.units.find((item) => item.id === requested);

    return unit ? { unitIds: [unit.id], selectedUnitId: unit.id } : null;
  }

  if ((requested === ATTENDANCE_ALL_UNITS || !requested) && canUseAllUnits) {
    return { unitIds: session.units.map((unit) => unit.id), selectedUnitId: null };
  }

  return session.units.length
    ? { unitIds: session.units.map((unit) => unit.id), selectedUnitId: null }
    : null;
}

function safeLimit(value: unknown, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function safeOffset(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(Math.trunc(parsed), 0);
}

function normalizeStatus(value: string | null | undefined): AttendanceConnectionStatus {
  if (value === "connected" || value === "connecting" || value === "error") {
    return value;
  }

  return "disconnected";
}

function normalizeMessageType(value: unknown): AttendanceMessageType {
  const raw = String(value ?? "").toLowerCase();

  if (raw.includes("image")) return "image";
  if (raw.includes("audio")) return "audio";
  if (raw.includes("video")) return "video";
  if (raw.includes("document") || raw.includes("file")) return "document";
  if (raw.includes("text") || raw.includes("conversation") || raw.includes("extended")) {
    return "text";
  }

  return raw ? "unknown" : "text";
}

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function phoneFromJid(remoteJid: string) {
  return digitsOnly(remoteJid.split("@")[0]);
}

function isPhoneRemoteJid(remoteJid: string) {
  return remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@c.us");
}

function phonesMatch(first: unknown, second: unknown) {
  const firstDigits = digitsOnly(first);
  const secondDigits = digitsOnly(second);

  if (!firstDigits || !secondDigits) {
    return false;
  }

  if (firstDigits === secondDigits) {
    return true;
  }

  if (Math.min(firstDigits.length, secondDigits.length) < 10) {
    return false;
  }

  return firstDigits.endsWith(secondDigits) || secondDigits.endsWith(firstDigits);
}

function normalizeRemoteJid(value: unknown) {
  const remoteJid = String(value ?? "").trim();

  if (!remoteJid || !remoteJid.includes("@")) {
    return "";
  }

  return remoteJid;
}

function isOwnRemoteJid(remoteJid: string, ownPhone?: string | null) {
  return Boolean(ownPhone && phonesMatch(phoneFromJid(remoteJid), ownPhone));
}

function pickConversationRemoteJid(candidates: Array<unknown>, ownPhone?: string | null) {
  const remoteJids = candidates
    .map(normalizeRemoteJid)
    .filter((remoteJid) => remoteJid && !remoteJid.endsWith("@g.us"));

  return remoteJids.find((remoteJid) => !isOwnRemoteJid(remoteJid, ownPhone)) ?? "";
}

function formatContactName(remoteJid: string, name?: string | null, phone?: string | null) {
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanPhone = typeof phone === "string" ? digitsOnly(phone) : "";

  return cleanName || cleanPhone || phoneFromJid(remoteJid) || remoteJid;
}

function isPhoneLikeName(value: unknown) {
  const normalized = normalizeText(value);
  const digits = digitsOnly(normalized);
  const onlyPhoneChars = normalized.replace(/[+\d\s().-]/g, "") === "";

  return digits.length >= 10 && onlyPhoneChars;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function timestampsClose(first: string | null, second: string | null) {
  const firstTime = new Date(first ?? 0).getTime();
  const secondTime = new Date(second ?? 0).getTime();

  if (!firstTime || !secondTime) {
    return false;
  }

  return Math.abs(firstTime - secondTime) <= 120_000;
}

function toIsoDate(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "number") {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === "string") {
    const numeric = Number(value);

    if (Number.isFinite(numeric) && /^\d+$/.test(value)) {
      return toIsoDate(numeric);
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function compareIsoDesc(first: string | null, second: string | null) {
  return new Date(second ?? 0).getTime() - new Date(first ?? 0).getTime();
}

function isHttpOrDataUrl(value: unknown) {
  return typeof value === "string" && (/^https?:\/\//i.test(value) || value.startsWith("data:"));
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function isBase64Like(value: string) {
  const clean = value.replace(/\s/g, "");

  return clean.length > 40 && /^[A-Za-z0-9+/]+=*$/.test(clean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function firstValue(...values: Array<unknown>) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function extractArray(value: unknown, depth = 0): Array<unknown> {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object" || depth > 4) {
    return [];
  }

  const record = asRecord(value);
  const priorityKeys = ["chats", "messages", "records", "items", "data", "result", "response"];

  for (const key of priorityKeys) {
    const found = extractArray(record[key], depth + 1);

    if (found.length) {
      return found;
    }
  }

  for (const nested of Object.values(record)) {
    const found = extractArray(nested, depth + 1);

    if (found.length) {
      return found;
    }
  }

  return [];
}

function extractStringByKeys(value: unknown, keys: Array<string>, depth = 0): string | null {
  if (!value || depth > 5) {
    return null;
  }

  if (typeof value === "string") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractStringByKeys(item, keys, depth + 1);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = asRecord(value);

  for (const key of keys) {
    const found = record[key];

    if (typeof found === "string" && found.trim()) {
      return found.trim();
    }
  }

  for (const nested of Object.values(record)) {
    const found = extractStringByKeys(nested, keys, depth + 1);

    if (found) {
      return found;
    }
  }

  return null;
}

function extractBase64(value: unknown): string | null {
  if (typeof value === "string") {
    if (value.startsWith("data:")) {
      return parseDataUrl(value)?.base64 ?? null;
    }

    return isBase64Like(value) ? value.replace(/\s/g, "") : null;
  }

  const found = extractStringByKeys(value, [
    "base64",
    "b64",
    "dataUrl",
    "data_url",
    "media",
    "file",
    "buffer",
  ]);

  if (!found) {
    return null;
  }

  if (found.startsWith("data:")) {
    return parseDataUrl(found)?.base64 ?? null;
  }

  return isBase64Like(found) ? found.replace(/\s/g, "") : null;
}

function extractMimeType(value: unknown, fallback: string) {
  const dataUrl = extractStringByKeys(value, ["dataUrl", "data_url", "base64", "media", "file"]);

  if (dataUrl?.startsWith("data:")) {
    return parseDataUrl(dataUrl)?.mimeType ?? fallback;
  }

  return (
    extractStringByKeys(value, [
      "mimetype",
      "mimeType",
      "mime_type",
      "contentType",
      "content-type",
    ]) ?? fallback
  );
}

function extensionFromMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes("jpeg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("pdf")) return "pdf";

  return "bin";
}

function defaultMimeType(type?: string | null) {
  if (type === "image") return "image/jpeg";
  if (type === "video") return "video/mp4";
  if (type === "audio") return "audio/ogg";
  if (type === "document") return "application/octet-stream";

  return "application/octet-stream";
}

function mediaProxyUrl(params: {
  consultantId: string;
  unitId: string | null;
  remoteJid: string;
  messageId: string;
  direction: AttendanceMessageDirection;
  type: AttendanceMessageType;
}) {
  if (!params.messageId || params.type === "text" || params.type === "unknown") {
    return null;
  }

  const searchParams = new URLSearchParams({
    consultantId: params.consultantId,
    remoteJid: params.remoteJid,
    messageId: params.messageId,
    direction: params.direction,
    type: params.type,
  });

  if (params.unitId) {
    searchParams.set("unitId", params.unitId);
  }

  return `/api/atendimentos/midia?${searchParams.toString()}`;
}

function inferMessageType(message: unknown, raw?: unknown): AttendanceMessageType {
  const messageRecord = asRecord(message);
  const rawRecord = asRecord(raw);

  if (messageRecord.conversation || messageRecord.extendedTextMessage) return "text";
  if (messageRecord.imageMessage) return "image";
  if (messageRecord.audioMessage) return "audio";
  if (messageRecord.videoMessage) return "video";
  if (messageRecord.documentMessage) return "document";

  return normalizeMessageType(rawRecord.messageType ?? rawRecord.type ?? rawRecord.mediaType);
}

function contentFromMessage(
  message: unknown,
  type: AttendanceMessageType,
  fallback?: string | null,
) {
  const messageRecord = asRecord(message);
  const extendedTextMessage = asRecord(messageRecord.extendedTextMessage);
  const imageMessage = asRecord(messageRecord.imageMessage);
  const videoMessage = asRecord(messageRecord.videoMessage);
  const documentMessage = asRecord(messageRecord.documentMessage);
  const text =
    messageRecord.conversation ??
    extendedTextMessage.text ??
    imageMessage.caption ??
    videoMessage.caption ??
    documentMessage.fileName ??
    fallback;

  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }

  if (type === "image") return "[Imagem]";
  if (type === "audio") return "[Áudio]";
  if (type === "video") return "[Vídeo]";
  if (type === "document") return "[Documento]";

  return "[Mensagem]";
}

function mediaFromMessage(message: unknown, raw?: unknown) {
  const messageRecord = asRecord(message);
  const rawRecord = asRecord(raw);
  const rawMessageRecord = asRecord(rawRecord.message);
  const media =
    messageRecord.imageMessage ??
    messageRecord.audioMessage ??
    messageRecord.videoMessage ??
    messageRecord.documentMessage ??
    rawRecord.media ??
    rawRecord.mediaMessage ??
    null;
  const mediaRecord = asRecord(media);

  const mediaUrl =
    mediaRecord.url ??
    rawRecord.mediaUrl ??
    rawRecord.url ??
    rawMessageRecord.mediaUrl ??
    rawMessageRecord.url ??
    null;

  return {
    mediaUrl: isHttpOrDataUrl(mediaUrl) ? String(mediaUrl) : null,
    mimeType:
      typeof mediaRecord.mimetype === "string"
        ? mediaRecord.mimetype
        : typeof mediaRecord.mimeType === "string"
          ? mediaRecord.mimeType
          : null,
    fileName:
      typeof mediaRecord.fileName === "string"
        ? mediaRecord.fileName
        : typeof mediaRecord.title === "string"
          ? mediaRecord.title
          : null,
  };
}

function mapConsultant(row: ConsultantInstanceRow): AttendanceConsultant {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    unitId: row.unit_id,
    unitName: row.unit_name,
    status: normalizeStatus(row.status),
    phoneNumber: row.phone_number,
    lastEventAt: row.last_event_at,
    conversationCount: Number(row.conversation_count) || 0,
  };
}

async function getConsultantInstance(
  session: AuthSession,
  consultantId: string,
  requestedUnitId?: string | null,
) {
  if (!isUuid(consultantId)) {
    return null;
  }

  const scope = getAttendanceUnitScope(session, requestedUnitId);

  if (!scope?.unitIds.length) {
    return null;
  }

  await ensureEvolutionSchema();

  const result = await queryDb<ConsultantInstanceRow>(
    `
      select
        u.id,
        u.name,
        u.email,
        u.avatar_url,
        instance.unit_id,
        unit.name as unit_name,
        instance.id as instance_id,
        instance.instance_name,
        instance.status,
        instance.phone_number,
        instance.last_event_at::text,
        0 as conversation_count
      from app_whatsapp_instances instance
      inner join app_users u on u.id = instance.user_id
      inner join app_units unit on unit.id = instance.unit_id
      where u.id = $1
        and instance.unit_id = any($2::uuid[])
        and u.role = 'CONSULTOR'
        and u.status = 'active'
        and (
          u.primary_unit_id = instance.unit_id
          or exists (
            select 1 from app_user_units uu
            where uu.user_id = u.id and uu.unit_id = instance.unit_id
          )
        )
      limit 1
    `,
    [consultantId, scope.unitIds],
  );

  return result.rows[0] ?? null;
}

async function fetchLocalConversations(
  instanceId: string,
  unitId: string,
  userId: string,
  ownPhone?: string | null,
) {
  const [result, selfNameResult] = await Promise.all([
    queryDb<LocalConversationRow>(
      `
      select
        remote_jid,
        (array_agg(phone order by sent_at desc))[1] as phone,
        coalesce(
          (array_agg(nullif(contact_name, '') order by sent_at desc) filter (where direction = 'inbound'))[1],
          (array_agg(nullif(contact_name, '') order by sent_at desc))[1]
        ) as contact_name,
        (array_agg(content order by sent_at desc))[1] as last_message,
        max(sent_at)::text as last_message_at,
        (array_agg(message_type order by sent_at desc))[1] as message_type
      from app_whatsapp_messages
      where instance_id = $1
        and unit_id = $2
        and user_id = $3
      group by remote_jid
    `,
      [instanceId, unitId, userId],
    ),
    queryDb<LocalSelfNameRow>(
      `
        select contact_name
        from app_whatsapp_messages
        where instance_id = $1
          and unit_id = $2
          and user_id = $3
          and direction = 'outbound'
          and nullif(contact_name, '') is not null
        group by contact_name
        having count(distinct remote_jid) > 1
        order by count(*) desc
        limit 5
      `,
      [instanceId, unitId, userId],
    ),
  ]);
  const selfNames = new Set(selfNameResult.rows.map((row) => normalizeText(row.contact_name)));

  return result.rows
    .filter((row) => !isOwnRemoteJid(row.remote_jid, ownPhone))
    .map<AttendanceConversation>((row) => {
      const formattedName = formatContactName(row.remote_jid, row.contact_name, row.phone);
      const contactName = selfNames.has(normalizeText(formattedName))
        ? row.phone || phoneFromJid(row.remote_jid)
        : formattedName;

      return {
        remoteJid: row.remote_jid,
        phone: row.phone,
        contactName,
        profilePictureUrl: null,
        lastMessage: row.last_message || "[Mensagem]",
        lastMessageAt: row.last_message_at,
        unreadCount: 0,
        messageType: normalizeMessageType(row.message_type),
      };
    });
}

async function fetchRemoteChats(
  instanceName: string,
  limit: number,
  offset: number,
  ownPhone?: string | null,
) {
  const payload = await requestEvolution(`/chat/findChats/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      limit: Math.min(Math.max(limit + offset, DEFAULT_CONVERSATION_LIMIT), MAX_REMOTE_LOOKAHEAD),
      offset: 0,
      sort: { field: "updatedAt", order: "desc" },
    }),
  });
  const rawChats = extractArray(payload);
  const payloadRecord = asRecord(payload);
  const total = Number(payloadRecord.total ?? payloadRecord.count ?? rawChats.length);

  return {
    total: Number.isFinite(total) ? total : rawChats.length,
    chats: rawChats
      .map((rawItem) => {
        const item = asRecord(rawItem);
        const key = asRecord(item.key);
        const chat = asRecord(item.chat);
        const itemMessages = Array.isArray(item.messages) ? item.messages : [];
        const lastMessage = firstValue(item.lastMessage, item.message, itemMessages[0], {}) ?? {};
        const lastMessageRecord = asRecord(lastMessage);
        const lastMessagePayload = asRecord(lastMessageRecord.message);
        const lastMessageKey = asRecord(firstValue(lastMessageRecord.key, lastMessagePayload.key));
        const remoteJid = pickConversationRemoteJid(
          [
            lastMessageKey.remoteJid,
            key.remoteJid,
            chat.remoteJid,
            item.remoteJid,
            item.jid,
            item.id,
          ],
          ownPhone,
        );

        if (!remoteJid || remoteJid.endsWith("@g.us")) {
          return null;
        }

        const message = firstValue(lastMessageRecord.message, lastMessage) ?? {};
        const messageType = inferMessageType(message, lastMessage);
        const phone = phoneFromJid(remoteJid);
        const profilePictureUrl = firstValue(
          item.profilePictureUrl,
          item.profilePicUrl,
          item.picture,
          item.avatar,
        );

        return {
          remoteJid,
          phone,
          contactName: formatContactName(
            remoteJid,
            asString(firstValue(item.name, item.pushName, item.contactName, item.verifiedName)),
            phone,
          ),
          profilePictureUrl: typeof profilePictureUrl === "string" ? profilePictureUrl : null,
          lastMessage: contentFromMessage(message, messageType, asString(item.lastMessageText)),
          lastMessageAt:
            toIsoDate(
              firstValue(
                item.updatedAt,
                item.lastMessageAt,
                lastMessageRecord.messageTimestamp,
                lastMessageRecord.timestamp,
              ),
            ) ?? null,
          unreadCount:
            Number(firstValue(item.unreadCount, item.unreadMessages, item.unread, 0)) || 0,
          messageType,
        } satisfies AttendanceConversation;
      })
      .filter((item): item is AttendanceConversation => Boolean(item)),
  };
}

function conversationTime(value: AttendanceConversation) {
  return new Date(value.lastMessageAt ?? 0).getTime();
}

function chooseConversationBase(
  first: AttendanceConversation,
  second: AttendanceConversation,
): AttendanceConversation {
  if (isPhoneRemoteJid(first.remoteJid) && !isPhoneRemoteJid(second.remoteJid)) {
    return first;
  }

  if (isPhoneRemoteJid(second.remoteJid) && !isPhoneRemoteJid(first.remoteJid)) {
    return second;
  }

  if (second.profilePictureUrl && !first.profilePictureUrl) {
    return second;
  }

  return conversationTime(second) > conversationTime(first) ? second : first;
}

function mergeConversationData(
  first: AttendanceConversation,
  second: AttendanceConversation,
): AttendanceConversation {
  const base = chooseConversationBase(first, second);
  const other = base === first ? second : first;
  const baseNameLooksLikePhone = isPhoneLikeName(base.contactName);
  const otherNameLooksLikePhone = isPhoneLikeName(other.contactName);
  const otherIsNewer = conversationTime(other) > conversationTime(base);
  const useOtherName =
    Boolean(other.contactName) &&
    (!base.contactName ||
      baseNameLooksLikePhone ||
      (!otherNameLooksLikePhone && other.contactName.length > base.contactName.length));

  return {
    ...base,
    phone:
      isPhoneRemoteJid(base.remoteJid) || !isPhoneRemoteJid(other.remoteJid)
        ? base.phone || other.phone
        : other.phone || base.phone,
    contactName: useOtherName ? other.contactName : base.contactName,
    profilePictureUrl: base.profilePictureUrl ?? other.profilePictureUrl,
    lastMessage: otherIsNewer ? other.lastMessage : base.lastMessage,
    lastMessageAt: otherIsNewer ? other.lastMessageAt : base.lastMessageAt,
    messageType: otherIsNewer ? other.messageType : base.messageType,
    unreadCount: Math.max(base.unreadCount, other.unreadCount),
  };
}

function areMirrorConversations(first: AttendanceConversation, second: AttendanceConversation) {
  if (first.remoteJid === second.remoteJid) {
    return true;
  }

  if (
    phonesMatch(
      first.phone || phoneFromJid(first.remoteJid),
      second.phone || phoneFromJid(second.remoteJid),
    )
  ) {
    return true;
  }

  const hasDifferentJidKind =
    isPhoneRemoteJid(first.remoteJid) !== isPhoneRemoteJid(second.remoteJid);

  if (!hasDifferentJidKind) {
    return false;
  }

  const sameName =
    Boolean(normalizeText(first.contactName)) &&
    normalizeText(first.contactName) === normalizeText(second.contactName);
  const sameLastMessage =
    Boolean(normalizeText(first.lastMessage)) &&
    normalizeText(first.lastMessage) === normalizeText(second.lastMessage);
  const oneNameLooksLikePhone =
    isPhoneLikeName(first.contactName) || isPhoneLikeName(second.contactName);

  return (
    (sameName || oneNameLooksLikePhone) &&
    sameLastMessage &&
    timestampsClose(first.lastMessageAt, second.lastMessageAt)
  );
}

function dedupeMirrorConversations(conversations: Array<AttendanceConversation>) {
  return conversations.reduce<Array<AttendanceConversation>>((items, conversation) => {
    const index = items.findIndex((item) => areMirrorConversations(item, conversation));

    if (index === -1) {
      items.push(conversation);
      return items;
    }

    items[index] = mergeConversationData(items[index], conversation);
    return items;
  }, []);
}

function mergeConversations(
  localConversations: Array<AttendanceConversation>,
  remoteConversations: Array<AttendanceConversation>,
) {
  const map = new Map<string, AttendanceConversation>();

  remoteConversations.forEach((conversation) => {
    map.set(conversation.remoteJid, conversation);
  });

  localConversations.forEach((conversation) => {
    const current = map.get(conversation.remoteJid);

    if (!current) {
      map.set(conversation.remoteJid, conversation);
      return;
    }

    const localIsNewer =
      new Date(conversation.lastMessageAt ?? 0).getTime() >
      new Date(current.lastMessageAt ?? 0).getTime();

    map.set(
      conversation.remoteJid,
      mergeConversationData(current, {
        ...conversation,
        lastMessage: localIsNewer ? conversation.lastMessage : current.lastMessage,
        lastMessageAt: localIsNewer ? conversation.lastMessageAt : current.lastMessageAt,
        messageType: localIsNewer ? conversation.messageType : current.messageType,
      }),
    );
  });

  return dedupeMirrorConversations(Array.from(map.values())).sort((first, second) =>
    compareIsoDesc(first.lastMessageAt, second.lastMessageAt),
  );
}

function mapRemoteMessage(rawItem: unknown): AttendanceMessage | null {
  const item = asRecord(rawItem);
  const itemMessage = asRecord(item.message);
  const key = asRecord(firstValue(item.key, itemMessage.key));
  const message = firstValue(itemMessage.message, item.message, item) ?? {};
  const chat = asRecord(item.chat);
  const remoteJid = String(
    firstValue(key.remoteJid, chat.remoteJid, item.remoteJid, item.jid, item.chatId) ?? "",
  );

  if (!remoteJid || remoteJid.endsWith("@g.us")) {
    return null;
  }

  const messageType = inferMessageType(message, item);
  const sentAt =
    toIsoDate(firstValue(item.messageTimestamp, item.timestamp, item.createdAt, item.updatedAt)) ??
    new Date().toISOString();
  const media = mediaFromMessage(message, item);
  const id = String(
    firstValue(key.id, item.id, item.messageId, `${remoteJid}-${sentAt}-${Math.random()}`),
  );
  const fromMe = Boolean(firstValue(key.fromMe, item.fromMe, item.sender === "me"));

  return {
    id,
    remoteJid,
    direction: fromMe ? "outbound" : "inbound",
    type: messageType,
    content: contentFromMessage(
      message,
      messageType,
      asString(firstValue(item.content, item.text)),
    ),
    sentAt,
    mediaUrl: media.mediaUrl,
    mimeType: media.mimeType,
    fileName: media.fileName,
  };
}

async function fetchRemoteMessages(
  instanceName: string,
  remoteJid: string,
  limit: number,
  offset: number,
) {
  const body = {
    where: { key: { remoteJid } },
    limit: Math.min(Math.max(limit + offset, DEFAULT_MESSAGE_LIMIT), MAX_REMOTE_LOOKAHEAD),
    offset: 0,
    sort: { messageTimestamp: "desc" },
  };
  const requestInit = { method: "POST", body: JSON.stringify(body) };
  let payload: unknown;

  try {
    payload = await requestEvolution(
      `/chat/findMessages/${encodeURIComponent(instanceName)}`,
      requestInit,
    );
  } catch {
    payload = await requestEvolution(
      `/messages/findMessages/${encodeURIComponent(instanceName)}`,
      requestInit,
    );
  }

  const rawMessages = extractArray(payload);
  const payloadRecord = asRecord(payload);
  const total = Number(payloadRecord.total ?? payloadRecord.count ?? rawMessages.length);
  const messages = rawMessages
    .map(mapRemoteMessage)
    .filter((item): item is AttendanceMessage => Boolean(item))
    .filter((item) => item.remoteJid === remoteJid);

  return {
    total: Number.isFinite(total) ? total : messages.length,
    messages,
  };
}

async function fetchLocalMessages(
  instanceId: string,
  unitId: string,
  userId: string,
  remoteJid: string,
  limit: number,
  offset: number,
) {
  const result = await queryDb<LocalMessageRow>(
    `
      select
        id,
        evolution_message_id,
        remote_jid,
        direction,
        message_type,
        content,
        media_url,
        media_mime_type,
        media_file_name,
        sent_at::text,
        count(*) over()::text as total_count
      from app_whatsapp_messages
      where instance_id = $1
        and unit_id = $2
        and user_id = $3
        and remote_jid = $4
      order by sent_at desc
      limit $5
      offset 0
    `,
    [instanceId, unitId, userId, remoteJid, Math.min(limit + offset, MAX_REMOTE_LOOKAHEAD)],
  );

  return {
    total: Number(result.rows[0]?.total_count ?? 0) || 0,
    messages: result.rows.map<AttendanceMessage>((row) => ({
      id: row.evolution_message_id || row.id,
      remoteJid: row.remote_jid,
      direction: row.direction,
      type: normalizeMessageType(row.message_type),
      content: row.content || "[Mensagem]",
      sentAt: toIsoDate(row.sent_at) ?? row.sent_at,
      mediaUrl: row.media_url,
      mimeType: row.media_mime_type,
      fileName: row.media_file_name,
    })),
  };
}

function mergeMessages(
  localMessages: Array<AttendanceMessage>,
  remoteMessages: Array<AttendanceMessage>,
  offset: number,
  limit: number,
) {
  const map = new Map<string, AttendanceMessage>();

  [...remoteMessages, ...localMessages].forEach((message) => {
    const key = message.id || `${message.remoteJid}-${message.sentAt}-${message.direction}`;
    const current = map.get(key);

    if (!current) {
      map.set(key, message);
      return;
    }

    map.set(key, {
      ...current,
      content: message.content || current.content,
      mediaUrl: current.mediaUrl ?? message.mediaUrl,
      mimeType: current.mimeType ?? message.mimeType,
      fileName: current.fileName ?? message.fileName,
    });
  });

  const sortedDesc = Array.from(map.values()).sort((first, second) =>
    compareIsoDesc(first.sentAt, second.sentAt),
  );

  return sortedDesc.slice(offset, offset + limit).reverse();
}

function withMediaProxyUrls(
  messages: Array<AttendanceMessage>,
  params: { consultantId: string; unitId: string | null; remoteJid: string },
) {
  return messages.map<AttendanceMessage>((message) => {
    if (message.type === "text" || message.type === "unknown") {
      return message;
    }

    if (message.mediaUrl?.startsWith("data:")) {
      return message;
    }

    const proxiedMediaUrl = mediaProxyUrl({
      consultantId: params.consultantId,
      unitId: params.unitId,
      remoteJid: params.remoteJid,
      messageId: message.id,
      direction: message.direction,
      type: message.type,
    });

    return {
      ...message,
      mediaUrl: proxiedMediaUrl ?? message.mediaUrl,
    };
  });
}

export async function listAttendanceConsultants(session: AuthSession, requestedUnitId?: string) {
  const scope = getAttendanceUnitScope(session, requestedUnitId);

  if (!scope?.unitIds.length) {
    return null;
  }

  await ensureEvolutionSchema();

  const result = await queryDb<ConsultantInstanceRow>(
    `
      select
        u.id,
        u.name,
        u.email,
        u.avatar_url,
        instance.unit_id,
        unit.name as unit_name,
        instance.id as instance_id,
        instance.instance_name,
        instance.status,
        instance.phone_number,
        instance.last_event_at::text,
        count(distinct message.remote_jid)::text as conversation_count
      from app_whatsapp_instances instance
      inner join app_users u on u.id = instance.user_id
      inner join app_units unit on unit.id = instance.unit_id
      left join app_whatsapp_messages message
        on message.instance_id = instance.id
        and message.unit_id = instance.unit_id
        and message.user_id = u.id
      where instance.unit_id = any($1::uuid[])
        and u.role = 'CONSULTOR'
        and u.status = 'active'
        and (
          u.primary_unit_id = instance.unit_id
          or exists (
            select 1 from app_user_units uu
            where uu.user_id = u.id and uu.unit_id = instance.unit_id
          )
        )
      group by
        u.id,
        u.name,
        u.email,
        u.avatar_url,
        instance.unit_id,
        unit.name,
        instance.id,
        instance.instance_name,
        instance.status,
        instance.phone_number,
        instance.last_event_at
      order by
        case instance.status when 'connected' then 0 when 'connecting' then 1 else 2 end,
        u.name asc
    `,
    [scope.unitIds],
  );

  return {
    selectedUnitId: scope.selectedUnitId,
    consultants: result.rows.map(mapConsultant),
  };
}

export async function listAttendanceConversations(
  session: AuthSession,
  params: {
    consultantId: string;
    unitId?: string | null;
    search?: string | null;
    limit?: unknown;
    offset?: unknown;
  },
) {
  const limit = safeLimit(params.limit, DEFAULT_CONVERSATION_LIMIT);
  const offset = safeOffset(params.offset);
  const consultant = await getConsultantInstance(session, params.consultantId, params.unitId);

  if (!consultant) {
    return null;
  }

  const localConversations = await fetchLocalConversations(
    consultant.instance_id,
    consultant.unit_id,
    consultant.id,
    consultant.phone_number,
  );
  let remoteConversations: Array<AttendanceConversation> = [];
  let remoteTotal = 0;

  if (consultant.status === "connected") {
    try {
      const remote = await fetchRemoteChats(
        consultant.instance_name,
        limit,
        offset,
        consultant.phone_number,
      );
      remoteConversations = remote.chats;
      remoteTotal = remote.total;
    } catch {
      remoteConversations = [];
    }
  }

  const query = params.search?.trim().toLowerCase() ?? "";
  const conversations = mergeConversations(localConversations, remoteConversations).filter(
    (conversation) => {
      if (!query) {
        return true;
      }

      return [conversation.contactName, conversation.phone, conversation.remoteJid]
        .join(" ")
        .toLowerCase()
        .includes(query);
    },
  );
  const page = conversations.slice(offset, offset + limit);

  return {
    consultant: mapConsultant(consultant),
    conversations: page,
    pagination: {
      limit,
      offset,
      hasMore: conversations.length > offset + limit || remoteTotal > offset + limit,
      total: Math.max(conversations.length, remoteTotal),
    },
  };
}

export async function listAttendanceMessages(
  session: AuthSession,
  params: {
    consultantId: string;
    unitId?: string | null;
    remoteJid: string;
    limit?: unknown;
    offset?: unknown;
  },
) {
  const remoteJid = params.remoteJid.trim();
  const limit = safeLimit(params.limit, DEFAULT_MESSAGE_LIMIT);
  const offset = safeOffset(params.offset);
  const consultant = await getConsultantInstance(session, params.consultantId, params.unitId);

  if (
    !consultant ||
    !remoteJid ||
    remoteJid.endsWith("@g.us") ||
    isOwnRemoteJid(remoteJid, consultant.phone_number)
  ) {
    return null;
  }

  const local = await fetchLocalMessages(
    consultant.instance_id,
    consultant.unit_id,
    consultant.id,
    remoteJid,
    limit,
    offset,
  );
  let remote = { total: 0, messages: [] as Array<AttendanceMessage> };

  if (consultant.status === "connected") {
    try {
      remote = await fetchRemoteMessages(consultant.instance_name, remoteJid, limit, offset);
    } catch {
      remote = { total: 0, messages: [] };
    }
  }

  const messages = withMediaProxyUrls(
    mergeMessages(local.messages, remote.messages, offset, limit),
    {
      consultantId: consultant.id,
      unitId: params.unitId ?? consultant.unit_id,
      remoteJid,
    },
  );
  const total = Math.max(local.total, remote.total, offset + messages.length);

  return {
    consultant: mapConsultant(consultant),
    messages,
    pagination: {
      limit,
      offset,
      hasMore: total > offset + limit,
      total,
    },
  };
}

export async function getAttendanceMedia(
  session: AuthSession,
  params: {
    consultantId: string;
    unitId?: string | null;
    remoteJid: string;
    messageId: string;
    direction?: string | null;
    type?: string | null;
  },
): Promise<AttendanceMediaFile | null> {
  const remoteJid = params.remoteJid.trim();
  const messageId = params.messageId.trim();
  const consultant = await getConsultantInstance(session, params.consultantId, params.unitId);

  if (
    !consultant ||
    consultant.status !== "connected" ||
    !remoteJid ||
    !messageId ||
    remoteJid.endsWith("@g.us") ||
    isOwnRemoteJid(remoteJid, consultant.phone_number)
  ) {
    return null;
  }

  const type = normalizeMessageType(params.type);
  const fallbackMimeType = defaultMimeType(type);
  const fromMe = params.direction === "outbound";
  const payload = await requestEvolution(
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(consultant.instance_name)}`,
    {
      method: "POST",
      body: JSON.stringify({
        message: {
          key: {
            id: messageId,
            remoteJid,
            fromMe,
          },
        },
        convertToMp4: false,
      }),
    },
  );
  const base64 = extractBase64(payload);

  if (!base64) {
    return null;
  }

  const mimeType = extractMimeType(payload, fallbackMimeType);
  const fileName =
    extractStringByKeys(payload, ["fileName", "filename", "file_name", "title"]) ??
    `atendimento-${messageId}.${extensionFromMimeType(mimeType)}`;

  return {
    buffer: Buffer.from(base64, "base64"),
    mimeType,
    fileName,
  };
}
