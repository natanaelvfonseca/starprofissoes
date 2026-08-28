export function formatFinancialDate(value?: string | null) {
  if (!value) return "—";

  const raw = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const normalized = dateOnly
    ? `${raw}T12:00:00`
    : raw.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(!dateOnly ? { timeStyle: "short" as const } : {}),
  }).format(parsed);
}
