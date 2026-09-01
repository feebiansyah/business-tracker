import assert from "node:assert/strict";
import test from "node:test";
import { compareNullable, formatRupiah, paginateRows, sortRows } from "./table-utils.ts";

test("Rupiah rounds to whole units without decimal digits", () => {
  assert.equal(formatRupiah(26114), "Rp 26.114");
  assert.equal(formatRupiah(27419.7), "Rp 27.420");
  assert.equal(formatRupiah(null), "—");
});

test("numeric sorting compares values instead of formatted strings", () => {
  const rows = [{ value: 100 }, { value: 9 }, { value: 20 }];
  assert.deepEqual(sortRows(rows, (row) => row.value, "asc", "number").map((row) => row.value), [9, 20, 100]);
});

test("date sorting uses chronological order", () => {
  const rows = [{ date: "2026-01-02" }, { date: "2025-12-31" }, { date: "2026-09-01" }];
  assert.deepEqual(sortRows(rows, (row) => row.date, "desc", "date").map((row) => row.date), ["2026-09-01", "2026-01-02", "2025-12-31"]);
});

test("boolean sorting orders false before true", () => {
  assert.equal(compareNullable(false, true, "boolean"), -1);
  assert.equal(compareNullable(true, false, "boolean"), 1);
});

test("null values remain last in both directions", () => {
  const rows = [{ value: null }, { value: 10 }, { value: 5 }];
  assert.deepEqual(sortRows(rows, (row) => row.value, "asc", "number").map((row) => row.value), [5, 10, null]);
  assert.deepEqual(sortRows(rows, (row) => row.value, "desc", "number").map((row) => row.value), [10, 5, null]);
});

test("pagination clamps an invalid page after the result set changes", () => {
  const rows = Array.from({ length: 26 }, (_, index) => index + 1);
  assert.deepEqual(paginateRows(rows, 99, 25), { rows: [26], page: 2, pageCount: 2, total: 26 });
  assert.deepEqual(paginateRows([], 3, 25), { rows: [], page: 1, pageCount: 1, total: 0 });
});
