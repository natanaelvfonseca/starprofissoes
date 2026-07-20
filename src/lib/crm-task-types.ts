export const CRM_TASK_STATUSES = ["pending", "done", "archived"] as const;

export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number];

export type CrmLeadTask = {
  id: string;
  unitId: string;
  unitName: string | null;
  leadId: string;
  leadName: string;
  title: string;
  notes: string;
  dueAt: string;
  status: CrmTaskStatus;
  createdAt: string;
  completedAt: string | null;
};
