export type AttendanceConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

export type AttendanceConsultant = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  unitId: string;
  unitName: string;
  status: AttendanceConnectionStatus;
  phoneNumber: string | null;
  lastEventAt: string | null;
  conversationCount: number;
};

export type AttendanceMessageDirection = "inbound" | "outbound";

export type AttendanceMessageType = "text" | "image" | "audio" | "document" | "video" | "unknown";

export type AttendanceConversation = {
  remoteJid: string;
  phone: string;
  contactName: string;
  profilePictureUrl: string | null;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
  messageType: AttendanceMessageType;
};

export type AttendanceMessage = {
  id: string;
  remoteJid: string;
  direction: AttendanceMessageDirection;
  type: AttendanceMessageType;
  content: string;
  sentAt: string;
  mediaUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
};
