export type MetaGraphErrorPayload = {
  success?: boolean;
  error?: {
    code?: number;
    error_subcode?: number;
    message?: string;
    type?: string;
  };
};

export function isMetaConnectionAlreadyUnavailable(data: MetaGraphErrorPayload) {
  const code = data.error?.code;
  const message = data.error?.message?.toLowerCase() ?? "";

  return (
    code === 100 ||
    code === 190 ||
    message.includes("already") ||
    message.includes("does not exist") ||
    message.includes("cannot be loaded") ||
    message.includes("invalid oauth access token") ||
    message.includes("session has been invalidated") ||
    message.includes("expired")
  );
}
