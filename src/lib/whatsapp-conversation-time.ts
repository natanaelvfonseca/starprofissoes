export function formatConversationLastMessageParts(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const day = part("day");
  const month = part("month");
  const year = part("year");
  const hour = part("hour");
  const minute = part("minute");

  return {
    date: `${day}/${month}`,
    time: `${hour}:${minute}`,
    full: `${day}/${month}/${year} ${hour}:${minute}`,
  };
}

export function formatConversationLastMessageAt(value: string | null) {
  return formatConversationLastMessageParts(value)?.full ?? "";
}
