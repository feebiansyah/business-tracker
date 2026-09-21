import assert from "node:assert/strict";
import test from "node:test";

import { parseClickaduHistoryParams, withClickaduHistoryChange } from "./server-pagination.ts";

test("history params default to date descending and 25 rows", () => {
  assert.deepEqual(parseClickaduHistoryParams({}), { sort: "date", dir: "desc", page: 1, pageSize: 25 });
});

test("history params whitelist sorting, direction, page, and page size", () => {
  for (const sort of ["date", "spendUsd", "spendIdr", "commission", "profit"]) {
    assert.equal(parseClickaduHistoryParams({ sort, dir: "asc", page: "2", pageSize: "50" }).sort, sort);
  }
  assert.deepEqual(parseClickaduHistoryParams({ sort: "raw sql", dir: "sideways", page: "-2", pageSize: "999" }), { sort: "date", dir: "desc", page: 1, pageSize: 25 });
  assert.equal(parseClickaduHistoryParams({ pageSize: "100" }).pageSize, 100);
});

test("sort and page-size changes reset page while page navigation does not", () => {
  const current = { sort: "date", dir: "desc", page: 4, pageSize: 25 };
  assert.equal(withClickaduHistoryChange(current, { sort: "profit", dir: "asc" }).page, 1);
  assert.equal(withClickaduHistoryChange(current, { pageSize: 50 }).page, 1);
  assert.equal(withClickaduHistoryChange(current, { page: 3 }).page, 3);
});
