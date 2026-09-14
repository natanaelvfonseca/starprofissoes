export const MAX_WHATSAPP_MEDIA_BYTES = 10 * 1024 * 1024;

export type OutgoingWhatsappMediaType = "image" | "audio" | "video" | "document";

const documentMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

const mimeByExtension: Record<string, string> = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  webm: "video/webm",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function describeOutgoingWhatsappFile(file: { name: string; size: number; type: string }) {
  if (!file.size || file.size > MAX_WHATSAPP_MEDIA_BYTES) {
    throw new Error("O arquivo deve ter até 10 MB.");
  }

  const fileName = file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 180) || "arquivo";
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  const reportedMimeType = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  const mimeType =
    reportedMimeType === "audio/x-m4a"
      ? "audio/mp4"
      : reportedMimeType || mimeByExtension[extension] || "";
  let mediaType: OutgoingWhatsappMediaType;
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) {
    mediaType = "image";
  } else if (
    ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"].includes(mimeType)
  ) {
    mediaType = "audio";
  } else if (["video/mp4", "video/webm"].includes(mimeType)) {
    mediaType = "video";
  } else if (documentMimeTypes.has(mimeType)) {
    mediaType = "document";
  } else {
    throw new Error("Formato de arquivo não suportado.");
  }

  return { fileName, mimeType, mediaType };
}
