export type WhatsappDeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "played"
  | "failed";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstValue(...values: Array<unknown>) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function normalizeWhatsappDeliveryStatus(value: unknown): WhatsappDeliveryStatus | null {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s.-]+/g, "_");

  if (normalized === "PENDING") return "pending";
  if (["SERVER_ACK", "SENT"].includes(normalized)) return "sent";
  if (["DELIVERY_ACK", "DELIVERED"].includes(normalized)) return "delivered";
  if (normalized === "READ") return "read";
  if (normalized === "PLAYED") return "played";
  if (["ERROR", "FAILED"].includes(normalized)) return "failed";

  return null;
}

export function whatsappDeliveryStatusFromPayload(payload: unknown) {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const update = asRecord(data.update);
  const message = asRecord(data.message);

  return normalizeWhatsappDeliveryStatus(
    firstValue(data.status, update.status, message.status, root.status),
  );
}

const STATUS_RANK: Record<WhatsappDeliveryStatus, number> = {
  failed: 0,
  pending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  played: 5,
};

export function mergeWhatsappDeliveryStatus(
  current: WhatsappDeliveryStatus | null | undefined,
  incoming: WhatsappDeliveryStatus | null | undefined,
) {
  if (!incoming) return current ?? null;
  if (!current) return incoming;
  if (incoming === "failed" && current !== "pending" && current !== "failed") return current;
  return STATUS_RANK[incoming] >= STATUS_RANK[current] ? incoming : current;
}
