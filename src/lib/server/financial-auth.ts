import type { AuthSession, UnitSummary } from "@/lib/auth-types";

export function financialUnitFromRequest(
  session: AuthSession,
  request: Request,
): UnitSummary | null {
  const params = new URL(request.url).searchParams;
  const requested =
    params.get("unit_id")?.trim() || params.get("unitId")?.trim() || session.activeUnit?.id || "";
  return session.units.find((unit) => unit.id === requested) ?? null;
}

export function financialUnitFromBody(
  session: AuthSession,
  body: Record<string, unknown> | null,
): UnitSummary | null {
  const raw = body?.unit_id ?? body?.unitId;
  const requested =
    typeof raw === "string" && raw.trim() ? raw.trim() : (session.activeUnit?.id ?? "");
  return session.units.find((unit) => unit.id === requested) ?? null;
}

export function financialError(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação financeira.";
}
