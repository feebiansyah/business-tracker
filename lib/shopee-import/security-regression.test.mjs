import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCommissionOnlyUpdateColumns,
  metricDuplicateUpdateColumns,
} from "./persistence.ts";
import { MAX_CSV_BYTES, MAX_CSV_ROWS } from "./constants.ts";
import { sanitizeFilename } from "./upload.ts";

test("locks the CSV upload limits to the approved security boundary", () => {
  assert.equal(MAX_CSV_BYTES, 10 * 1024 * 1024);
  assert.equal(MAX_CSV_ROWS, 100_000);
});

test("sanitizes traversal and control characters to a filename only", () => {
  assert.equal(sanitizeFilename("..\\private\\secret.csv"), "secret.csv");
  assert.equal(sanitizeFilename("../private/report\u0000.csv"), "report.csv");
});

test("commission persistence rejects expanded duplicate-update ownership", () => {
  assert.doesNotThrow(() => assertCommissionOnlyUpdateColumns(metricDuplicateUpdateColumns));
  for (const field of ["spend", "clickFp", "cpcFp", "shopeeClicks", "note", "completed"]) {
    assert.throws(
      () => assertCommissionOnlyUpdateColumns(["commission", "updatedAt", field]),
      /commission-only/,
    );
  }
});
