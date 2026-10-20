const leadDateFilterFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parseLeadDate(value: string) {
  // PostgreSQL ::text timestamps are not ISO 8601. Normalize before browser parsing.
  const normalized = value
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
    .replace(/(T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2})$/, "$1:00");
  return new Date(normalized);
}

export function leadDateFilterValue(date: Date) {
  const parts = leadDateFilterFormatter.formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function formatLeadCardCreatedAt(value: string) {
  const date = parseLeadDate(value);

  if (Number.isNaN(date.getTime())) {
    return "Entrada indisponível";
  }

  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `Entrada: ${part("day")}/${part("month")}/${part("year")} às ${part("hour")}:${part("minute")}`;
}
