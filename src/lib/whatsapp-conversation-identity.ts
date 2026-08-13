export function whatsappDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function whatsappPhoneFromJid(value: unknown) {
  const jid = String(value ?? "").trim().toLowerCase();

  if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@c.us")) {
    return "";
  }

  return whatsappDigits(jid.split("@")[0]);
}

export function whatsappAliasType(remoteJid: string) {
  const jid = remoteJid.toLowerCase();
  if (jid.endsWith("@lid")) return "lid" as const;
  if (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@c.us")) return "phone" as const;
  return "unknown" as const;
}

export function canonicalWhatsappIdentity(input: {
  remoteJid: string;
  alternateJid?: string | null;
  phone?: string | null;
  mappedPhone?: string | null;
}) {
  const phone =
    whatsappDigits(input.phone) ||
    whatsappPhoneFromJid(input.remoteJid) ||
    whatsappPhoneFromJid(input.alternateJid) ||
    whatsappDigits(input.mappedPhone);
  const remoteJid = String(input.remoteJid ?? "").trim().toLowerCase();

  return {
    canonicalKey: phone ? `phone:${phone}` : `jid:${remoteJid}`,
    canonicalPhone: phone || null,
  };
}

export function phonesAreEquivalent(first: unknown, second: unknown) {
  const a = whatsappDigits(first);
  const b = whatsappDigits(second);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 10) return false;
  return a.endsWith(b) || b.endsWith(a);
}
