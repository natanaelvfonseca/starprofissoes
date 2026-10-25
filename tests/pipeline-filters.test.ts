import assert from "node:assert/strict";
import test from "node:test";
import type { LeadRecord } from "../src/lib/commercial-types.ts";
import {
  countActivePipelineFilters,
  emptyPipelineFilters,
  filterPipelineLeads,
} from "../src/lib/pipeline-filters.ts";

const makeLead = (id: string, changes: Partial<LeadRecord> = {}): LeadRecord => ({
  id,
  unitId: "star",
  unitName: "Star QA",
  fullName: `Lead ${id}`,
  phone: "5500000000000",
  phone2: null,
  email: null,
  city: "Belo Horizonte",
  attendanceId: "class-1",
  attendanceName: "Mecânica · BH · 01/11/2026",
  attendanceStatus: "active",
  courseId: "course-1",
  courseName: "Mecânica",
  courseValue: 1500,
  acquisitionChannelId: "meta",
  acquisitionChannelName: "Meta Ads",
  createdById: "me",
  createdByName: "Consultor QA",
  sharedQueue: false,
  observations: null,
  campaignName: null,
  formId: null,
  stage: "Em contato",
  pipelineColumnId: "contact",
  studentPipelineColumnId: null,
  createdAt: "2026-10-20 12:20:30.123456+00",
  updatedAt: "2026-10-20 12:20:30.123456+00",
  ...changes,
});
const leads = [
  makeLead("shared", {
    stage: "Novo lead",
    pipelineColumnId: "new",
    sharedQueue: true,
    createdById: null,
    createdByName: null,
  }),
  makeLead("mine"),
  makeLead("other", {
    createdById: "other",
    createdByName: "Outro consultor",
    acquisitionChannelId: "whatsapp",
    acquisitionChannelName: "WhatsApp",
  }),
  makeLead("previous-day", { createdAt: "2026-10-20T02:59:59.999Z" }),
  makeLead("drone", {
    courseId: "course-2",
    courseName: "Drone",
    attendanceId: "class-2",
    attendanceName: "Drone · Goiânia",
    city: "Goiânia",
    acquisitionChannelId: "whatsapp",
    acquisitionChannelName: "WhatsApp",
    createdAt: "2026-10-18T12:00:00.000Z",
  }),
];
const manager = { search: "", consultantScope: "all" as const, canViewAcquisitionChannel: true };
const consultant = {
  ...manager,
  consultantId: "me",
  consultantScope: "mine" as const,
  canViewAcquisitionChannel: false,
};
const redactedLeads = leads.map((lead) => ({
  ...lead,
  acquisitionChannelId: null,
  acquisitionChannelName: null,
}));
const ids = (result: Array<LeadRecord>) => result.map((lead) => lead.id);

test("origem oculta não elimina os leads do consultor mesmo com seleção antiga", () => {
  const filters = { ...emptyPipelineFilters(), channelId: "meta" };
  assert.deepEqual(ids(filterPipelineLeads(redactedLeads, filters, consultant)), [
    "shared",
    "mine",
    "previous-day",
    "drone",
  ]);
  assert.equal(countActivePipelineFilters(filters, false), 0);
});

test("liderança continua filtrando pela origem sem incluir canais diferentes ou nulos", () => {
  const filters = { ...emptyPipelineFilters(), channelId: "meta" };
  assert.deepEqual(
    ids(
      filterPipelineLeads(
        [...leads, makeLead("no-channel", { acquisitionChannelId: null })],
        filters,
        manager,
      ),
    ),
    ["shared", "mine", "previous-day"],
  );
  assert.equal(countActivePipelineFilters(filters, true), 1);
});

test("filtros por turma, curso, responsável e cidade retornam os IDs correspondentes", () => {
  for (const [key, value, expected] of [
    ["attendanceId", "class-2", ["drone"]],
    ["courseId", "course-2", ["drone"]],
    ["ownerId", "other", ["other"]],
    ["city", "Goiânia", ["drone"]],
  ] as const) {
    assert.deepEqual(
      ids(filterPipelineLeads(leads, { ...emptyPipelineFilters(), [key]: value }, manager)),
      expected,
    );
  }
});

test("filtro de status da turma alterna entre turmas ativas e inativas", () => {
  const statusLeads = [makeLead("active"), makeLead("inactive", { attendanceStatus: "inactive" })];

  assert.deepEqual(
    ids(
      filterPipelineLeads(
        statusLeads,
        { ...emptyPipelineFilters(), attendanceStatus: "active" },
        manager,
      ),
    ),
    ["active"],
  );
  assert.deepEqual(
    ids(
      filterPipelineLeads(
        statusLeads,
        { ...emptyPipelineFilters(), attendanceStatus: "inactive" },
        manager,
      ),
    ),
    ["inactive"],
  );
});

test("combina os filtros sem apagar nem alterar a base de leads", () => {
  const before = structuredClone(leads);
  const filters = {
    ...emptyPipelineFilters(),
    attendanceId: "class-1",
    courseId: "course-1",
    ownerId: "me",
    city: "Belo Horizonte",
    channelId: "meta",
    startDate: "2026-10-20",
    endDate: "2026-10-20",
  };
  assert.deepEqual(ids(filterPipelineLeads(leads, filters, manager)), ["mine"]);
  assert.deepEqual(leads, before);
  assert.equal(countActivePipelineFilters(filters, true), 6);
});

test("filtro de dia usa Brasília e inclui início e final do dia em formatos da API", () => {
  const boundaryLeads = [
    makeLead("before", { createdAt: "2026-10-20T02:59:59.999Z" }),
    makeLead("start", { createdAt: "2026-10-20T03:00:00.000Z" }),
    makeLead("postgres", { createdAt: "2026-10-20 12:20:30.123456+00" }),
    makeLead("end", { createdAt: "2026-10-21 02:59:59.999999+00" }),
    makeLead("after", { createdAt: "2026-10-21T03:00:00Z" }),
  ];
  assert.deepEqual(
    ids(
      filterPipelineLeads(
        boundaryLeads,
        { ...emptyPipelineFilters(), startDate: "2026-10-20", endDate: "2026-10-20" },
        manager,
      ),
    ),
    ["start", "postgres", "end"],
  );
});

test("intervalos abertos e datas sem horário mantêm os limites informados", () => {
  assert.deepEqual(
    ids(
      filterPipelineLeads(leads, { ...emptyPipelineFilters(), startDate: "2026-10-20" }, manager),
    ),
    ["shared", "mine", "other"],
  );
  assert.deepEqual(
    ids(filterPipelineLeads(leads, { ...emptyPipelineFilters(), endDate: "2026-10-19" }, manager)),
    ["previous-day", "drone"],
  );
});

test("data de entrada inválida só exclui o lead quando há filtro de período", () => {
  const invalid = makeLead("invalid", { createdAt: "invalid" });
  assert.deepEqual(ids(filterPipelineLeads([invalid], emptyPipelineFilters(), manager)), [
    "invalid",
  ]);
  assert.deepEqual(
    filterPipelineLeads([invalid], { ...emptyPipelineFilters(), startDate: "2026-10-20" }, manager),
    [],
  );
});

test("consulta por outro responsável respeita o escopo da carteira", () => {
  const filters = { ...emptyPipelineFilters(), ownerId: "other" };
  assert.deepEqual(filterPipelineLeads(redactedLeads, filters, consultant), []);
  assert.deepEqual(
    ids(filterPipelineLeads(redactedLeads, filters, { ...consultant, consultantScope: "all" })),
    ["other"],
  );
});

test("limpar filtros recupera todos os leads da visão e mantém a fila compartilhada", () => {
  assert.deepEqual(
    filterPipelineLeads(
      redactedLeads,
      { ...emptyPipelineFilters(), attendanceId: "class-without-leads" },
      consultant,
    ),
    [],
  );
  assert.deepEqual(ids(filterPipelineLeads(redactedLeads, emptyPipelineFilters(), consultant)), [
    "shared",
    "mine",
    "previous-day",
    "drone",
  ]);
  assert.equal(filterPipelineLeads(leads, emptyPipelineFilters(), manager).length, 5);
  assert.equal(countActivePipelineFilters(emptyPipelineFilters(), true), 0);
});

test("busca combina com os filtros e pode ser limpa sem remover leads", () => {
  assert.deepEqual(
    ids(
      filterPipelineLeads(
        leads,
        { ...emptyPipelineFilters(), city: "Goiânia" },
        { ...manager, search: "  DRONE  " },
      ),
    ),
    ["drone"],
  );
  assert.deepEqual(
    filterPipelineLeads(leads, emptyPipelineFilters(), { ...manager, search: "inexistente" }),
    [],
  );
  assert.equal(filterPipelineLeads(leads, emptyPipelineFilters(), manager).length, 5);
});
