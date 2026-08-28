export const FINANCIAL_STATUSES = [
  "overdue",
  "due_today",
  "upcoming",
  "not_found",
  "not_returned",
] as const;

export const FINANCIAL_SORTS = ["due_date", "days_overdue", "amount"] as const;

export type FinancialStatus = (typeof FINANCIAL_STATUSES)[number];
export type FinancialSort = (typeof FINANCIAL_SORTS)[number];

export type FinancialFilters = {
  startDate: string | null;
  endDate: string | null;
  status: FinancialStatus | null;
  course: string;
  className: string;
  search: string;
  sort: FinancialSort;
  direction: "asc" | "desc";
  hasPeriod: boolean;
};

export class FinancialFilterError extends Error {}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function optionalDate(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim() ?? "";
  if (!value) return null;
  if (!validDate(value)) throw new FinancialFilterError(`${key} deve usar o formato YYYY-MM-DD.`);
  return value;
}

export function parseFinancialFilters(params: URLSearchParams): FinancialFilters {
  const startDate = optionalDate(params, "start_date");
  const endDate = optionalDate(params, "end_date");
  if (startDate && endDate && startDate > endDate)
    throw new FinancialFilterError("A data inicial não pode ser posterior à data final.");

  const rawStatus = params.get("status")?.trim() ?? "";
  if (rawStatus && !FINANCIAL_STATUSES.includes(rawStatus as FinancialStatus))
    throw new FinancialFilterError("Status financeiro inválido.");
  const rawSort = params.get("sort")?.trim() ?? "due_date";
  if (!FINANCIAL_SORTS.includes(rawSort as FinancialSort))
    throw new FinancialFilterError("Ordenação financeira inválida.");
  const direction = params.get("direction")?.trim().toLowerCase() === "asc" ? "asc" : "desc";

  return {
    startDate,
    endDate,
    status: (rawStatus || null) as FinancialStatus | null,
    course: (params.get("course")?.trim() ?? "").slice(0, 160),
    className: (params.get("class")?.trim() ?? "").slice(0, 160),
    search: (params.get("search")?.trim() ?? "").slice(0, 160),
    sort: rawSort as FinancialSort,
    direction,
    hasPeriod: Boolean(startDate || endDate),
  };
}

type SqlAliases = { installment: string; enrollment: string; student: string };

export function buildFinancialFilterSql(
  filters: FinancialFilters,
  firstParameter: number,
  aliases: SqlAliases = { installment: "i", enrollment: "e", student: "s" },
) {
  const conditions: Array<string> = [];
  const values: Array<unknown> = [];
  const add = (sql: (parameter: string) => string, value: unknown) => {
    values.push(value);
    conditions.push(sql(`$${firstParameter + values.length - 1}`));
  };
  if (filters.startDate)
    add((p) => `${aliases.installment}.due_date >= ${p}::date`, filters.startDate);
  if (filters.endDate) add((p) => `${aliases.installment}.due_date <= ${p}::date`, filters.endDate);
  if (filters.status === "not_found") {
    conditions.push(`${aliases.enrollment}.financial_lookup_status = 'NOT_FOUND'`);
  } else if (filters.status) {
    add((p) => `${aliases.installment}.status = ${p}`, filters.status);
  }
  if (filters.course) add((p) => `${aliases.enrollment}.course_name = ${p}`, filters.course);
  if (filters.className) add((p) => `${aliases.enrollment}.class_name = ${p}`, filters.className);
  if (filters.search)
    add(
      (p) =>
        `concat_ws(' ',${aliases.student}.full_name,${aliases.student}.cpf,${aliases.student}.phone,${aliases.student}.phone2,${aliases.enrollment}.external_enrollment_id,${aliases.installment}.responsible_name,${aliases.installment}.responsible_document,${aliases.installment}.responsible_phone) ilike '%'||${p}||'%'`,
      filters.search,
    );
  return { sql: conditions.length ? ` and ${conditions.join(" and ")}` : "", values };
}

export function financialUnitSql(alias = "i") {
  return `${alias}.unit_id=$1`;
}

export function normalizeFinancialFilterOptions(
  value: {
    courses?: Array<string> | null;
    classes?: Array<string> | null;
  } | null,
) {
  return {
    courses: Array.isArray(value?.courses) ? value.courses : [],
    classes: Array.isArray(value?.classes) ? value.classes : [],
  };
}

export function financialOrderSql(filters: FinancialFilters) {
  const column = {
    due_date: "i.due_date",
    days_overdue: "i.days_overdue",
    amount: "i.total_amount",
  }[filters.sort];
  return `${column} ${filters.direction}`;
}
