export function resolveWhatsappMediaPresentation(
  type: string,
  mimeType: string | null,
  fileName: string | null,
) {
  const normalizedMimeType = mimeType?.toLowerCase() ?? "";
  const mediaType =
    type === "unknown"
      ? normalizedMimeType.startsWith("image/")
        ? "image"
        : normalizedMimeType.startsWith("audio/")
          ? "audio"
          : normalizedMimeType.startsWith("video/")
            ? "video"
            : "document"
      : type;

  return {
    mediaType,
    isPdf: normalizedMimeType === "application/pdf" || /\.pdf$/i.test(fileName ?? ""),
  };
}
