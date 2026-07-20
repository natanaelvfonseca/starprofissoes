import * as React from "react";
import type { AuthSession } from "@/lib/auth-types";

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  refreshSession: () => Promise<AuthSession | null>;
  logout: () => Promise<void>;
  setActiveUnit: (unitId: string) => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    const message =
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Falha na requisição.";
    throw new Error(message);
  }

  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<AuthSession | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refreshSession = React.useCallback(async () => {
    try {
      const nextSession = await readJson<AuthSession>(
        await fetch("/api/auth/session", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
      );

      setSession(nextSession);
      return nextSession;
    } catch {
      setSession(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const logout = React.useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    setSession(null);
    window.location.assign("/login");
  }, []);

  const setActiveUnit = React.useCallback(async (unitId: string) => {
    const nextSession = await readJson<AuthSession>(
      await fetch("/api/auth/session", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ activeUnitId: unitId }),
      }),
    );

    setSession(nextSession);
  }, []);

  const value = React.useMemo(
    () => ({ session, loading, refreshSession, logout, setActiveUnit }),
    [loading, logout, refreshSession, session, setActiveUnit],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
