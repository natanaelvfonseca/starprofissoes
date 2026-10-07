function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function canonicalWhatsappLeadPhone(value: unknown) {
  const raw = digitsOnly(value);
  const local = raw.startsWith("55") && raw.length >= 12 ? raw.slice(2) : raw;

  if (local.length === 10) {
    return `55${local.slice(0, 2)}9${local.slice(2)}`;
  }

  if (local.length === 11 && local[2] === "9") {
    return `55${local}`;
  }

  return "";
}

export function shouldResolveWhatsappLead(input: {
  inbound: boolean;
  instanceStatus: string;
  consultantId: string | null;
  consultantActive: boolean;
  consultantRole: string;
  phone: unknown;
  inboundCount: number;
}) {
  return (
    input.inbound &&
    input.instanceStatus === "connected" &&
    Boolean(input.consultantId) &&
    input.consultantActive &&
    input.consultantRole === "CONSULTOR" &&
    Boolean(canonicalWhatsappLeadPhone(input.phone)) &&
    input.inboundCount >= 1 &&
    input.inboundCount <= 3
  );
}

export function whatsappLeadFallbackName(phone: string) {
  return `Contato WhatsApp ${phone.slice(-4)}`;
}
