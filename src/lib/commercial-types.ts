export type CommercialStatus = "active" | "inactive";

export type CourseRecord = {
  id: string;
  unitId: string;
  name: string;
  value: number;
  category: string | null;
  status: CommercialStatus;
  createdAt: string;
};

export type AcquisitionChannelRecord = {
  id: string;
  unitId: string;
  name: string;
  type: string;
  status: CommercialStatus;
  createdAt: string;
};

export type LeadStage =
  | "Novo lead"
  | "Em contato"
  | "Qualificado"
  | "Proposta"
  | "Pagamento pendente"
  | "Confirmado"
  | "Recuperação"
  | "Matriculado";

export type PipelineType = "leads" | "students";

export type PipelineColumn = {
  id: string;
  unitId: string;
  pipelineType: PipelineType;
  name: string;
  color: string;
  position: number;
  systemKey: string | null;
  semanticStage: LeadStage | null;
};

export type LeadRecord = {
  id: string;
  unitId: string;
  unitName: string;
  fullName: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  city: string | null;
  attendanceId: string | null;
  attendanceName: string | null;
  attendanceStatus: CommercialStatus | null;
  courseId: string | null;
  courseName: string | null;
  courseValue: number | null;
  acquisitionChannelId: string | null;
  acquisitionChannelName: string | null;
  createdById: string | null;
  createdByName: string | null;
  sharedQueue: boolean;
  observations: string | null;
  campaignName: string | null;
  formId: string | null;
  stage: LeadStage;
  pipelineColumnId: string | null;
  studentPipelineColumnId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConsultantPipelineScope = "mine" | "all";

export function isSharedLeadQueueEntry(
  lead: Pick<LeadRecord, "sharedQueue" | "stage" | "attendanceId">,
) {
  return lead.sharedQueue && lead.stage === "Novo lead" && Boolean(lead.attendanceId);
}

export function canConsultantOpenPipelineLead(
  lead: Pick<LeadRecord, "createdById" | "sharedQueue" | "stage" | "attendanceId">,
  userId: string,
) {
  return !isSharedLeadQueueEntry(lead) && lead.createdById === userId;
}

export function canConsultantMovePipelineLead(
  lead: Pick<LeadRecord, "createdById" | "sharedQueue" | "stage" | "attendanceId">,
  userId: string,
) {
  return isSharedLeadQueueEntry(lead) || lead.createdById === userId;
}

export function leadMatchesConsultantScope(
  lead: Pick<LeadRecord, "createdById">,
  userId: string,
  scope: ConsultantPipelineScope,
) {
  return scope === "all" || lead.createdById === userId;
}

export function canConsultantAssumePipelineLead(
  lead: Pick<LeadRecord, "createdById" | "sharedQueue" | "stage">,
  userId: string,
) {
  return (
    !lead.sharedQueue &&
    lead.stage !== "Matriculado" &&
    Boolean(lead.createdById) &&
    lead.createdById !== userId
  );
}
