import assert from "node:assert/strict";
import test from "node:test";
import type { LeadRecord } from "../src/lib/commercial-types.ts";
import { escapeCsvCell, leadExportFilename, leadsToCsv } from "../src/lib/lead-csv.ts";

const lead: LeadRecord = {
  id: "lead-1",
  unitId: "unit-1",
  unitName: "Star Centro",
  fullName: "Ana da Silva",
  phone: "5511999999999",
  phone2: null,
  email: "ana@example.com",
  city: "São Paulo",
  attendanceId: "attendance-1",
  attendanceName: "Administração · São Paulo/SP · 30/10/2026",
  attendanceStatus: "active",
  courseId: "course-1",
  courseName: "Administração",
  courseValue: 1200,
  acquisitionChannelId: "channel-1",
  acquisitionChannelName: "Meta Ads",
  createdById: "user-1",
  createdByName: "Gerente Star",
  sharedQueue: false,
  observations: "Pediu retorno; prefere manhã",
  campaignName: "Campanha, outubro",
  formId: "form-1",
  stage: "Em contato",
  pipelineColumnId: "column-1",
  studentPipelineColumnId: null,
  createdAt: "2026-10-25T12:00:00.000Z",
  updatedAt: "2026-10-25T13:00:00.000Z",
};

test("CSV exporta todos os campos principais com BOM e separador compatível com Excel", () => {
  const csv = leadsToCsv([lead]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"Nome completo";"Telefone"/);
  assert.match(csv, /"Ana da Silva"/);
  assert.match(csv, /"Pediu retorno; prefere manhã"/);
  assert.match(csv, /"Campanha, outubro"/);
  assert.match(csv, /"Ativa"/);
});

test("CSV neutraliza fórmulas e duplica aspas", () => {
  assert.equal(escapeCsvCell("=IMPORTXML()"), '"\'=IMPORTXML()"');
  assert.equal(escapeCsvCell('Nome "Teste"'), '"Nome ""Teste"""');
});

test("nome do arquivo usa a data de São Paulo", () => {
  assert.equal(
    leadExportFilename(new Date("2026-10-26T01:30:00.000Z")),
    "leads-star-profissoes-2026-10-25.csv",
  );
});
