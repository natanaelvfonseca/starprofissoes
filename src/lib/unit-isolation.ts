import type { AuthSession, UnitSummary } from "@/lib/auth-types";

export function activeSessionUnit(session: AuthSession): UnitSummary | null {
  const activeUnit = session.activeUnit;

  if (!activeUnit) return null;
  return session.units.some((unit) => unit.id === activeUnit.id) ? activeUnit : null;
}

export function resolveActiveSessionUnit(
  session: AuthSession,
  requestedUnitId?: string | null,
  legacyAllValues: ReadonlyArray<string> = [],
): UnitSummary | null {
  const activeUnit = activeSessionUnit(session);
  const requested = requestedUnitId?.trim();

  if (!activeUnit) return null;
  if (!requested || requested === activeUnit.id || legacyAllValues.includes(requested)) {
    return activeUnit;
  }

  return null;
}
