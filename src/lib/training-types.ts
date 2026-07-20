export const TRAINING_TRAILS = [
  {
    id: "plataforma",
    title: "Plataforma",
    subtitle: "Domínio do sistema",
    description: "Aulas sobre CRM, atendimento, processos e operação diária.",
  },
  {
    id: "vendas",
    title: "Vendas",
    subtitle: "Performance comercial",
    description: "Abordagem, follow-up, objeções, matrícula e postura consultiva.",
  },
  {
    id: "escola",
    title: "Escola",
    subtitle: "Cultura Star",
    description: "História, posicionamento, cursos, diferenciais e padrão de atendimento.",
  },
  {
    id: "lideranca",
    title: "Liderança",
    subtitle: "Gestão de time",
    description: "Rotina de gestão, acompanhamento, rituais e desenvolvimento de pessoas.",
  },
] as const;

export type TrainingTrailId = (typeof TRAINING_TRAILS)[number]["id"];

export type TrainingLessonScope = "global" | "unit";
export type TrainingVideoSource = "upload" | "url";

export type TrainingLesson = {
  id: string;
  unitId: string | null;
  scope: TrainingLessonScope;
  trail: TrainingTrailId;
  title: string;
  description: string;
  durationLabel: string;
  orderIndex: number;
  thumbnailDataUrl: string | null;
  videoSource: TrainingVideoSource;
  videoUrl: string | null;
  videoFileName: string;
  videoMimeType: string;
  createdByName: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type TrainingSummary = {
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
};
