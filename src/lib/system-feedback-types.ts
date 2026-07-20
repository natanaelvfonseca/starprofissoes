import type { UserRole } from "@/lib/auth-types";

export const SYSTEM_FEEDBACK_CATEGORIES = ["melhoria", "ajuste", "erro", "ideia"] as const;
export const SYSTEM_FEEDBACK_PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
export const SYSTEM_FEEDBACK_STATUSES = [
  "novo",
  "em_analise",
  "planejado",
  "concluido",
  "arquivado",
] as const;

export type SystemFeedbackCategory = (typeof SYSTEM_FEEDBACK_CATEGORIES)[number];
export type SystemFeedbackPriority = (typeof SYSTEM_FEEDBACK_PRIORITIES)[number];
export type SystemFeedbackStatus = (typeof SYSTEM_FEEDBACK_STATUSES)[number];

export type SystemFeedbackTicket = {
  id: string;
  unitId: string | null;
  unitName: string | null;
  title: string;
  category: SystemFeedbackCategory;
  priority: SystemFeedbackPriority;
  status: SystemFeedbackStatus;
  description: string;
  teamNote: string;
  createdById: string | null;
  createdByName: string | null;
  createdByRole: UserRole | null;
  createdAt: string;
  updatedAt: string;
};

export const systemFeedbackCategoryLabels: Record<SystemFeedbackCategory, string> = {
  melhoria: "Melhoria",
  ajuste: "Ajuste",
  erro: "Erro",
  ideia: "Ideia",
};

export const systemFeedbackPriorityLabels: Record<SystemFeedbackPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const systemFeedbackStatusLabels: Record<SystemFeedbackStatus, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  planejado: "Planejado",
  concluido: "Concluído",
  arquivado: "Arquivado",
};
