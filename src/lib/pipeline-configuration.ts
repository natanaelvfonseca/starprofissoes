import type { LeadRecord, PipelineColumn } from "./commercial-types";

export const pipelineColorHex: Record<string, string> = {
  blue: "#377DFE",
  indigo: "#16006C",
  gold: "#F4B728",
  orange: "#FF8A1F",
  green: "#10B981",
  rose: "#F43F5E",
};

// IDs distinguish custom columns that share the same business meaning.
export function resolveLeadPipelineColumn(
  lead: Pick<LeadRecord, "unitId" | "pipelineColumnId" | "stage">,
  columns: Array<PipelineColumn>,
) {
  const scoped = columns.filter(
    (column) => column.unitId === lead.unitId && column.pipelineType === "leads",
  );
  const assigned = scoped.find((column) => column.id === lead.pipelineColumnId);
  if (assigned) return assigned;
  const stage = lead.stage === "Confirmado" ? "Pagamento pendente" : lead.stage;
  return scoped.find((column) => column.semanticStage === stage) ?? scoped[0] ?? null;
}

export function countPipelineLeads(leads: Array<LeadRecord>, columns: Array<PipelineColumn>) {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const column = resolveLeadPipelineColumn(lead, columns);
    if (column) counts.set(column.id, (counts.get(column.id) ?? 0) + 1);
  }
  return columns.map((column) => ({ ...column, count: counts.get(column.id) ?? 0 }));
}

export function kanbanHorizontalScrollStep(
  clientX: number,
  bounds: { left: number; right: number },
  scrollLeft: number,
  maxScroll: number,
) {
  const edge = Math.min(80, (bounds.right - bounds.left) / 4);
  if (clientX < bounds.left || clientX > bounds.right || edge <= 0) return 0;
  if (clientX < bounds.left + edge && scrollLeft > 0) {
    return -Math.ceil(18 * (1 - (clientX - bounds.left) / edge));
  }
  if (clientX > bounds.right - edge && scrollLeft < maxScroll) {
    return Math.ceil(18 * (1 - (bounds.right - clientX) / edge));
  }
  return 0;
}
