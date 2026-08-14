export function normalizeWhatsappContactName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function isUsefulWhatsappContactName(
  name: unknown,
  consultantName: unknown,
  phone: unknown,
) {
  const value = String(name ?? "").trim();
  if (!value || value.includes("@")) return false;
  if (normalizeWhatsappContactName(value) === normalizeWhatsappContactName(consultantName))
    return false;
  const nameDigits = digits(value);
  if (nameDigits.length >= 10 && nameDigits === digits(phone)) return false;
  return true;
}

export function selectWhatsappContactName(input: {
  leadName?: unknown;
  inboundName?: unknown;
  storedName?: unknown;
  consultantName?: unknown;
  phone?: unknown;
  remoteJid?: unknown;
}) {
  const candidates = [input.leadName, input.inboundName, input.storedName]
    .map((value) => String(value ?? "").trim())
    .filter((value) => isUsefulWhatsappContactName(value, input.consultantName, input.phone));

  return (
    candidates[0] ||
    String(input.phone ?? "").trim() ||
    String(input.remoteJid ?? "").trim() ||
    "Contato do WhatsApp"
  );
}
