import type { AuthSession } from "@/lib/auth-types";

export class AuthRequestError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
}

async function readSessionResponse(response: Response) {
  const data = (await response.json().catch(() => ({}))) as AuthSession & { error?: unknown };

  if (!response.ok) {
    const message = typeof data.error === "string" ? data.error : "Falha na requisição.";
    throw new AuthRequestError(message, response.status);
  }

  return data;
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
}

export async function loadAuthSession(
  fetchSession: typeof fetch = fetch,
  retryDelays: ReadonlyArray<number> = [300, 900],
) {
  let lastError: unknown = new AuthRequestError("Falha na requisição.", null);

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (attempt > 0) {
      await wait(retryDelays[attempt - 1]);
    }

    try {
      const response = await fetchSession("/api/auth/session", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      return await readSessionResponse(response);
    } catch (error) {
      lastError = error;

      if (error instanceof AuthRequestError && error.status !== null && error.status < 500) {
        throw error;
      }
    }
  }

  if (lastError instanceof AuthRequestError) {
    throw lastError;
  }

  throw new AuthRequestError(
    lastError instanceof Error ? lastError.message : "Falha na requisição.",
    null,
  );
}

export function isUnauthenticatedError(error: unknown) {
  return error instanceof AuthRequestError && error.status === 401;
}
