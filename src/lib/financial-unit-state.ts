export function isCurrentFinancialResponse(
  activeUnitId: string,
  requestedUnitId: string,
  requestVersion: number,
  currentVersion: number,
) {
  return (
    Boolean(activeUnitId) && activeUnitId === requestedUnitId && requestVersion === currentVersion
  );
}

export function scopedFinancialValue<T>(
  activeUnitId: string,
  loadedUnitId: string,
  value: T,
  emptyValue: T,
) {
  return activeUnitId && activeUnitId === loadedUnitId ? value : emptyValue;
}

export function normalizeFinancialRows<T>(value: Array<T> | null | undefined) {
  return Array.isArray(value) ? value : [];
}

export class FinancialIntegrationStateError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "FinancialIntegrationStateError";
    this.status = status;
  }
}

export function assertFinancialSyncReady(integration: { active: boolean } | null) {
  if (!integration)
    throw new FinancialIntegrationStateError(
      "Integração financeira não configurada para esta unidade.",
    );
  if (!integration.active)
    throw new FinancialIntegrationStateError("Ative a integração financeira antes de sincronizar.");
}

export function financialIntegrationResponse<T extends { configured: boolean }>(state: T) {
  return {
    configured: state.configured,
    integration: state.configured ? state : null,
  };
}
