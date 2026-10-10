import assert from "node:assert/strict";
import test from "node:test";
import type { LeadRecord, PipelineColumn } from "../src/lib/commercial-types.ts";
import {
  countPipelineLeads,
  resolveLeadPipelineColumn,
  kanbanHorizontalScrollStep,
} from "../src/lib/pipeline-configuration.ts";

const columns: Array<PipelineColumn> = [
  {
    id: "new",
    unitId: "star",
    pipelineType: "leads",
    name: "Entrada personalizada",
    color: "blue",
    position: 10,
    systemKey: "new",
    semanticStage: "Novo lead",
  },
  {
    id: "contact",
    unitId: "star",
    pipelineType: "leads",
    name: "Atendimento",
    color: "gold",
    position: 20,
    systemKey: "contact",
    semanticStage: "Em contato",
  },
  {
    id: "custom",
    unitId: "star",
    pipelineType: "leads",
    name: "Retorno agendado",
    color: "rose",
    position: 30,
    systemKey: null,
    semanticStage: "Em contato",
  },
  {
    id: "payment",
    unitId: "star",
    pipelineType: "leads",
    name: "Reserva",
    color: "green",
    position: 40,
    systemKey: "pending_payment",
    semanticStage: "Pagamento pendente",
  },
];
const lead = (id: string, pipelineColumnId: string | null, stage = "Em contato"): LeadRecord =>
  ({ id, unitId: "star", pipelineColumnId, stage }) as LeadRecord;

test("Kanban, Dashboard e seletor distinguem etapas customizadas com a mesma semântica", () => {
  const custom = lead("1", "custom");
  assert.equal(resolveLeadPipelineColumn(custom, columns)?.name, "Retorno agendado");
  const counts = countPipelineLeads(
    [custom, lead("2", "contact"), lead("3", null, "Novo lead")],
    columns,
  );
  assert.deepEqual(
    counts.map(({ id, count }) => [id, count]),
    [
      ["new", 1],
      ["contact", 1],
      ["custom", 1],
      ["payment", 0],
    ],
  );
});

test("renomear, recolorir e reordenar não altera o ID nem a contagem do lead", () => {
  const saved = columns
    .map((column) =>
      column.id === "custom"
        ? { ...column, name: "Retomar amanhã", color: "orange", position: 5 }
        : column,
    )
    .sort((a, b) => a.position - b.position);
  const reloaded = JSON.parse(JSON.stringify(saved));
  const counts = countPipelineLeads([lead("1", "custom")], reloaded);
  assert.equal(counts[0].id, "custom");
  assert.equal(counts[0].name, "Retomar amanhã");
  assert.equal(counts[0].color, "orange");
  assert.equal(counts[0].count, 1);
});

test("leads antigos usam semântica e Confirmado resolve Pagamento pendente", () => {
  assert.equal(resolveLeadPipelineColumn(lead("1", null, "Confirmado"), columns)?.id, "payment");
  assert.equal(resolveLeadPipelineColumn(lead("2", null), columns)?.id, "contact");
  assert.equal(resolveLeadPipelineColumn(lead("3", "removed"), columns)?.id, "contact");
});

test("configurações não vazam entre unidades ou para o pipeline de alunos", () => {
  assert.equal(
    resolveLeadPipelineColumn({ ...lead("1", "custom"), unitId: "other" }, columns),
    null,
  );
  assert.equal(resolveLeadPipelineColumn(lead("1", "custom"), []), null);
  assert.equal(
    resolveLeadPipelineColumn(
      lead("1", "custom"),
      columns.map((c) => ({ ...c, pipelineType: "students" })),
    ),
    null,
  );
});

test("rolagem horizontal usa apenas X, inclusive no fim de uma coluna longa", () => {
  const bounds = { left: 100, right: 1100 };
  assert.equal(kanbanHorizontalScrollStep(1100, bounds, 0, 1500), 18);
  assert.equal(kanbanHorizontalScrollStep(100, bounds, 500, 1500), -18);
  assert.equal(kanbanHorizontalScrollStep(600, bounds, 500, 1500), 0);
  assert.equal(kanbanHorizontalScrollStep(1100, bounds, 1500, 1500), 0);
  assert.equal(kanbanHorizontalScrollStep(100, bounds, 0, 1500), 0);
  assert.equal(kanbanHorizontalScrollStep(90, bounds, 500, 1500), 0);
  assert.equal(kanbanHorizontalScrollStep(1120, bounds, 500, 1500), 0);
  assert.equal(kanbanHorizontalScrollStep(100, { left: 100, right: 100 }, 0, 1500), 0);
});
