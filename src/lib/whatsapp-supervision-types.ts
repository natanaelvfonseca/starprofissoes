import type {
  AttendanceConnectionStatus,
  AttendanceMessageDirection,
  AttendanceMessageType,
} from "@/lib/attendance-types";
import type { WhatsappDeliveryStatus } from "@/lib/whatsapp-message-status";

export type WhatsappSupervisionConsultant = {
  id: string;
  name: string;
  avatarUrl: string | null;
  unitId: string;
  unitName: string;
  status: AttendanceConnectionStatus;
  phoneNumber: string | null;
  lastEventAt: string | null;
  conversationCount: number;
  lastMessageAt: string | null;
};

export type WhatsappConversationAnalysis = {
  id: string;
  status: "completed" | "insufficient_context" | "failed";
  rubricType: "course_script" | "general";
  score: number | null;
  stage: string | null;
  intent: string | null;
  summary: string;
  objections: Array<string>;
  strengths: Array<string>;
  risks: Array<string>;
  nextSteps: Array<string>;
  evidence: Array<string>;
  model: string | null;
  createdAt: string;
};

export type WhatsappSupervisionConversation = {
  id: string;
  consultantId: string;
  unitId: string;
  phone: string | null;
  remoteJid: string;
  contactName: string;
  profilePictureUrl: string | null;
  lastMessage: string;
  lastMessageAt: string | null;
  messageType: AttendanceMessageType;
  messageCount: number;
  inboundCount: number;
  outboundCount: number;
  lead: { id: string; name: string; courseName: string | null } | null;
  latestAnalysis: WhatsappConversationAnalysis | null;
};

export type WhatsappSupervisionMessage = {
  id: string;
  direction: AttendanceMessageDirection;
  type: AttendanceMessageType;
  content: string;
  sentAt: string;
  mediaUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  deliveryStatus: WhatsappDeliveryStatus | null;
  intervention: {
    id: string;
    actorName: string;
    actorRole: string;
    status: "pending" | "sent" | "confirmed" | "failed";
  } | null;
};

export type WhatsappInterventionNotification = {
  id: string;
  conversationId: string;
  actorName: string;
  content: string;
  readAt: string | null;
  createdAt: string;
};
