import type { LeadRecord } from "./commercial-types.ts";

const CSV_HEADERS = [
  "ID",
  "Nome completo",
  "Telefone",
  "Telefone 2",
  "E-mail",
  "Cidade",
  "Turma",
  "Status da turma",
  "Curso",
  "Valor do curso",
  "Origem",
  "Responsável",
  "Fila compartilhada",
  "Observações",
  "Campanha",
  "ID do formulário",
  "Etapa",
  "Unidade",
  "Criado em",
  "Atualizado em",
] as const;

function protectSpreadsheetFormula(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: unknown) {
  const text = protectSpreadsheetFormula(
    value === null || value === undefined ? "" : String(value),
  );
  return `"${text.replaceAll('"', '""')}"`;
}

function statusLabel(status: LeadRecord["attendanceStatus"]) {
  if (status === "active") return "Ativa";
  if (status === "inactive") return "Inativa";
  return "";
}

export function leadsToCsv(leads: Array<LeadRecord>) {
  const rows = leads.map((lead) => [
    lead.id,
    lead.fullName,
    lead.phone,
    lead.phone2,
    lead.email,
    lead.city,
    lead.attendanceName,
    statusLabel(lead.attendanceStatus),
    lead.courseName,
    lead.courseValue,
    lead.acquisitionChannelName,
    lead.createdByName,
    lead.sharedQueue ? "Sim" : "Não",
    lead.observations,
    lead.campaignName,
    lead.formId,
    lead.stage,
    lead.unitName,
    lead.createdAt,
    lead.updatedAt,
  ]);

  return `\uFEFF${[CSV_HEADERS, ...rows]
    .map((row) => row.map((value) => escapeCsvCell(value)).join(";"))
    .join("\r\n")}`;
}

export function leadExportFilename(now = new Date()) {
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `leads-star-profissoes-${stamp}.csv`;
}
