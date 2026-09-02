import assert from "node:assert/strict";
import test from "node:test";
import { createMetaImportSummary, recordMetaImportResult } from "../src/lib/meta-import-summary.ts";

test("importação histórica diferencia importados, duplicados, pendentes e erros", () => {
  const summary = createMetaImportSummary();
  for (const result of ["processed", "duplicate", "pending_configuration", "error"]) {
    recordMetaImportResult(summary, result);
  }

  assert.deepEqual(summary, {
    formsChecked: 0,
    leadsFound: 0,
    imported: 1,
    duplicates: 1,
    pendingConfiguration: 1,
    errors: 1,
    formErrors: [],
  });
});

test("retry do mesmo lead é contabilizado como duplicado e não como importado", () => {
  const summary = createMetaImportSummary();
  recordMetaImportResult(summary, "duplicate");
  assert.equal(summary.imported, 0);
  assert.equal(summary.duplicates, 1);
});
