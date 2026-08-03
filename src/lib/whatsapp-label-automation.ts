export type WhatsappLabelAssociation = {
  action: "add" | "remove";
  chatId: string;
  labelId: string;
  phoneJid?: string;
};

export type WhatsappLabelEdit = {
  labelId: string;
  name: string;
  color: string | null;
  deleted: boolean;
};

export type LeadMatchCandidate = {
  id: string;
  createdBy: string | null;
  stage: string;
  createdAt: string;
};

export type PipelineColumnCandidate = {
  id: string;
  name: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstPresent(...values: Array<unknown>) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function phoneFromWhatsappJid(value: unknown) {
  const jid = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@lid")) {
    return "";
  }

  return digitsOnly(jid.split("@")[0]);
}

function recordsFromEvolutionPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload;

  const payloadRecord = asRecord(payload);
  const messages = asRecord(payloadRecord.messages);
  const data = asRecord(payloadRecord.data);
  const candidates = [messages.records, payloadRecord.records, data.records, payloadRecord.data];

  return candidates.find(Array.isArray) ?? [];
}

export function lidJidsFromEvolutionContacts(payload: unknown) {
  return Array.from(
    new Set(
      recordsFromEvolutionPayload(payload)
        .map((item) => String(asRecord(item).remoteJid ?? "").trim())
        .filter((jid) => jid.toLowerCase().endsWith("@lid")),
    ),
  );
}

export function phoneMappingsFromEvolutionLookup(payload: unknown) {
  return recordsFromEvolutionPayload(payload)
    .map((item) => {
      const record = asRecord(item);
      const lidJid = [record.number, record.lidJid, record.remoteJidAlt]
        .map((value) => String(value ?? "").trim())
        .find((jid) => jid.toLowerCase().endsWith("@lid"));
      const phone = phoneFromWhatsappJid(
        firstPresent(record.jid, record.phoneJid, record.remoteJid),
      );

      return lidJid && brazilianPhoneKeys(phone).size > 0 ? { lidJid, phone } : null;
    })
    .filter((mapping): mapping is { lidJid: string; phone: string } => Boolean(mapping));
}

export function labelIdsFromEvolutionChat(payload: unknown) {
  const record = asRecord(payload);
  return Array.isArray(record.labels)
    ? Array.from(
        new Set(record.labels.map((label) => String(label ?? "").trim()).filter((label) => label)),
      )
    : [];
}

function evolutionChatTimestamp(payload: unknown) {
  const record = asRecord(payload);
  const raw = firstPresent(record.updatedAt, record.updated_at, record.createdAt, record.created_at);
  if (typeof raw === "number") return raw > 10_000_000_000 ? raw : raw * 1000;
  const parsed = Date.parse(String(raw ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function latestEvolutionChatLabelIds(payloads: Array<unknown>) {
  const chats = payloads.filter((payload) => Object.keys(asRecord(payload)).length > 0);
  if (!chats.length) return [];

  const latest = chats.reduce((selected, current) =>
    evolutionChatTimestamp(current) > evolutionChatTimestamp(selected) ? current : selected,
  );

  return labelIdsFromEvolutionChat(latest);
}

export function didEvolutionLabelStateChange(previous: unknown, current: unknown) {
  if (!Array.isArray(previous) || !Array.isArray(current)) return false;
  const normalize = (values: Array<unknown>) =>
    Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))).sort();
  const before = normalize(previous);
  const after = normalize(current);
  return before.length !== after.length || before.some((label, index) => label !== after[index]);
}

export function phoneFromEvolutionNumberLookup(payload: unknown) {
  for (const item of recordsFromEvolutionPayload(payload)) {
    const record = asRecord(item);
    const candidates = [record.jid, record.remoteJid, record.phoneJid, record.number];

    for (const candidate of candidates) {
      const phone = phoneFromWhatsappJid(candidate);
      if (brazilianPhoneKeys(phone).size > 0) return phone;
    }
  }

  return "";
}

export function phoneFromEvolutionMessages(payload: unknown) {
  for (const item of recordsFromEvolutionPayload(payload)) {
    const record = asRecord(item);
    const key = asRecord(record.key);
    const candidates = [
      key.remoteJidAlt,
      key.participantPn,
      record.remoteJidAlt,
      record.senderPn,
      key.remoteJid,
    ];

    for (const candidate of candidates) {
      const phone = phoneFromWhatsappJid(candidate);
      if (brazilianPhoneKeys(phone).size > 0) return phone;
    }
  }

  return "";
}

export function brazilianPhoneKeys(value: unknown) {
  const raw = digitsOnly(value);
  const keys = new Set<string>();

  if (!raw) return keys;

  const local = raw.startsWith("55") && raw.length >= 12 ? raw.slice(2) : raw;
  if (local.length !== 10 && local.length !== 11) return keys;

  keys.add(local);
  keys.add(`55${local}`);

  if (local.length === 10) {
    const withNinthDigit = `${local.slice(0, 2)}9${local.slice(2)}`;
    keys.add(withNinthDigit);
    keys.add(`55${withNinthDigit}`);
  } else if (local[2] === "9") {
    const withoutNinthDigit = `${local.slice(0, 2)}${local.slice(3)}`;
    keys.add(withoutNinthDigit);
    keys.add(`55${withoutNinthDigit}`);
  }

  return keys;
}

export function phonesMatch(first: unknown, second: unknown) {
  const firstKeys = brazilianPhoneKeys(first);
  const secondKeys = brazilianPhoneKeys(second);

  for (const key of firstKeys) {
    if (secondKeys.has(key)) return true;
  }

  return false;
}

export function normalizeWhatsappLabelName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function choosePipelineColumnByLabelName<T extends PipelineColumnCandidate>(
  columns: Array<T>,
  labelName: string,
) {
  const normalizedLabel = normalizeWhatsappLabelName(labelName);
  const matches = normalizedLabel
    ? columns.filter((column) => normalizeWhatsappLabelName(column.name) === normalizedLabel)
    : [];

  return {
    column: matches.length === 1 ? matches[0] : null,
    ambiguous: matches.length > 1,
  };
}

export function parseWhatsappLabelAssociation(payload: unknown): WhatsappLabelAssociation | null {
  const payloadRecord = asRecord(payload);
  const data = asRecord(payloadRecord.data);
  const association = asRecord(data.association);
  const rawAction = String(data.type ?? association.type ?? "").toLowerCase();
  const action = rawAction === "add" || rawAction === "remove" ? rawAction : null;
  const chatId = String(data.chatId ?? association.chatId ?? "").trim();
  const labelId = String(data.labelId ?? association.labelId ?? "").trim();
  const phoneJid = String(
    firstPresent(
      data.chatIdAlt,
      data.remoteJidAlt,
      data.senderPn,
      association.chatIdAlt,
      association.remoteJidAlt,
      association.senderPn,
    ) ?? "",
  ).trim();

  if (!action || !chatId || !labelId) return null;

  return phoneJid ? { action, chatId, labelId, phoneJid } : { action, chatId, labelId };
}

export function evolutionEventSourceId(payload: unknown) {
  const payloadRecord = asRecord(payload);
  const data = asRecord(payloadRecord.data);
  const raw = firstPresent(payloadRecord.id, payloadRecord.eventId, data.eventId);

  if (typeof raw !== "string" && typeof raw !== "number") return null;

  const value = String(raw).trim();
  return value && value.toLowerCase() !== "undefined" && value.toLowerCase() !== "null"
    ? value
    : null;
}

export function parseWhatsappLabelEdit(payload: unknown): WhatsappLabelEdit | null {
  const payloadRecord = asRecord(payload);
  const data = asRecord(payloadRecord.data);
  const labelId = String(data.id ?? data.labelId ?? "").trim();

  if (!labelId) return null;

  return {
    labelId,
    name: String(data.name ?? "").trim(),
    color: data.color === undefined || data.color === null ? null : String(data.color),
    deleted: data.deleted === true,
  };
}

export function chooseLeadCandidate<T extends LeadMatchCandidate>(
  candidates: Array<T>,
  consultantId: string,
) {
  const sorted = [...candidates].sort((first, second) => {
    const ownerDifference =
      Number(second.createdBy === consultantId) - Number(first.createdBy === consultantId);
    if (ownerDifference) return ownerDifference;

    const activeDifference =
      Number(second.stage !== "Matriculado") - Number(first.stage !== "Matriculado");
    if (activeDifference) return activeDifference;

    return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
  });

  const first = sorted[0];
  const second = sorted[1];
  if (!first) return { candidate: null, ambiguous: false };

  if (
    second &&
    first.createdBy === second.createdBy &&
    (first.stage !== "Matriculado") === (second.stage !== "Matriculado") &&
    new Date(first.createdAt).getTime() === new Date(second.createdAt).getTime()
  ) {
    return { candidate: null, ambiguous: true };
  }

  return { candidate: first, ambiguous: false };
}
