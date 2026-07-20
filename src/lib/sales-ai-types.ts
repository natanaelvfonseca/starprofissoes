import type { AttendanceConnectionStatus } from "@/lib/attendance-types";

export type SalesAiCourseOption = {
  id: string;
  unitId: string;
  unitName: string;
  name: string;
  status: "active" | "inactive";
};

export type SalesScriptRecord = {
  id: string;
  unitId: string;
  unitName: string;
  courseId: string;
  courseName: string;
  title: string;
  scriptBody: string;
  active: boolean;
  updatedAt: string;
  updatedByName: string | null;
};

export type SalesAnalysisExample = {
  conversation: string;
  evidence: string;
  recommendation: string;
};

export type SalesConversationAnalysis = {
  id: string;
  unitId: string;
  unitName: string;
  consultantId: string;
  consultantName: string;
  courseId: string;
  courseName: string;
  scriptId: string | null;
  score: number;
  scriptAdherence: number;
  rapportScore: number;
  discoveryScore: number;
  objectionScore: number;
  closingScore: number;
  messagesAnalyzed: number;
  conversationsAnalyzed: number;
  summary: string;
  strengths: Array<string>;
  improvements: Array<string>;
  actionItems: Array<string>;
  examples: Array<SalesAnalysisExample>;
  model: string;
  createdAt: string;
  createdByName: string | null;
};

export type SalesAiConsultantSummary = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  unitId: string;
  unitName: string;
  status: AttendanceConnectionStatus;
  phoneNumber: string | null;
  conversationCount: number;
  messageCount30d: number;
  outboundCount30d: number;
  inboundCount30d: number;
  lastMessageAt: string | null;
  latestAnalysis: SalesConversationAnalysis | null;
};

export type SalesAiDashboardResponse = {
  ok: true;
  selectedUnitId: string | null;
  courses: Array<SalesAiCourseOption>;
  scripts: Array<SalesScriptRecord>;
  consultants: Array<SalesAiConsultantSummary>;
};
