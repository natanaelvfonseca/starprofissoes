type EvolutionConnectionStatus = "disconnected" | "connecting" | "connected";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstValue(...values: Array<unknown>) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function evolutionConnectionState(data: unknown): EvolutionConnectionStatus {
  const dataRecord = asRecord(data);
  const payloadRecord = asRecord(dataRecord.data);
  const instanceRecord = asRecord(dataRecord.instance);
  const payloadInstanceRecord = asRecord(payloadRecord.instance);
  const raw = String(
    firstValue(
      instanceRecord.state,
      payloadInstanceRecord.state,
      payloadRecord.state,
      dataRecord.state,
      payloadRecord.connectionStatus,
      dataRecord.connectionStatus,
    ) ?? "",
  ).toLowerCase();

  if (["open", "connected", "conected"].includes(raw)) return "connected";
  if (["connecting", "qr", "qrcode"].includes(raw)) return "connecting";
  return "disconnected";
}

export function evolutionQrCodeFrom(data: unknown) {
  const dataRecord = asRecord(data);
  const payloadRecord = asRecord(dataRecord.data);
  const qrcodeRecord = asRecord(dataRecord.qrcode);
  const payloadQrcodeRecord = asRecord(payloadRecord.qrcode);
  const value = firstValue(
    dataRecord.base64,
    qrcodeRecord.base64,
    payloadRecord.base64,
    payloadQrcodeRecord.base64,
    dataRecord.code,
    payloadRecord.code,
  );

  if (typeof value !== "string" || !value) return null;
  if (value.startsWith("data:image/")) return value;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 500) {
    return `data:image/png;base64,${value.replace(/\s/g, "")}`;
  }
  return null;
}
