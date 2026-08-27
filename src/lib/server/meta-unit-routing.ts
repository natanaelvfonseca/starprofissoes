export type MetaFormUnitConfiguration = {
  status: "active" | "inactive";
  unitId: string | null;
};

export function resolveMetaPageUnit(existingUnitId: string | null, requestedUnitId: string) {
  if (existingUnitId && existingUnitId !== requestedUnitId) {
    throw new Error(
      "Esta Página Meta já pertence a outra unidade. A transferência precisa ser feita explicitamente.",
    );
  }

  return existingUnitId ?? requestedUnitId;
}

export function getMetaUnitConfigurationIssue(
  pageUnitId: string | null,
  form: MetaFormUnitConfiguration | null,
) {
  if (!pageUnitId) {
    return "A Página Meta ainda não possui unidade configurada.";
  }

  if (!form || form.status !== "active") {
    return "Formulário não configurado ou inativo.";
  }

  if (form.unitId !== pageUnitId) {
    return "A unidade configurada no formulário diverge da unidade da Página Meta.";
  }

  return null;
}
