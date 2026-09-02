export type MetaImportSummary = {
  formsChecked: number;
  leadsFound: number;
  imported: number;
  duplicates: number;
  pendingConfiguration: number;
  errors: number;
  formErrors: Array<{
    formId: string;
    message: string;
    code: string | null;
    fbtraceId: string | null;
  }>;
};

export function createMetaImportSummary(): MetaImportSummary {
  return {
    formsChecked: 0,
    leadsFound: 0,
    imported: 0,
    duplicates: 0,
    pendingConfiguration: 0,
    errors: 0,
    formErrors: [],
  };
}

export function recordMetaImportResult(summary: MetaImportSummary, result: string) {
  if (result === "processed") summary.imported += 1;
  else if (result === "duplicate") summary.duplicates += 1;
  else if (result === "pending_configuration") summary.pendingConfiguration += 1;
  else summary.errors += 1;
}
