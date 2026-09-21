import assert from "node:assert/strict";
import test from "node:test";
import { parseAdsterraHistoryParams, withAdsterraHistoryChange } from "./server-pagination.ts";

test("Adsterra history params are whitelisted and default to date desc/25", () => {
  assert.deepEqual(parseAdsterraHistoryParams({}), { sort: "date", dir: "desc", page: 1, pageSize: 25 });
  for (const sort of ["date", "spendUsd", "spendIdr", "commission", "profit"]) assert.equal(parseAdsterraHistoryParams({ sort, dir: "asc", page: "2", pageSize: "50" }).sort, sort);
  assert.deepEqual(parseAdsterraHistoryParams({ sort: "SQL", dir: "x", page: -1, pageSize: 12 }), { sort: "date", dir: "desc", page: 1, pageSize: 25 });
  assert.equal(parseAdsterraHistoryParams({ pageSize: 100 }).pageSize, 100);
});

test("sort and size reset page while page navigation does not", () => {
  const current = { sort: "date", dir: "desc", page: 4, pageSize: 25 };
  assert.equal(withAdsterraHistoryChange(current, { sort: "profit", dir: "asc" }).page, 1);
  assert.equal(withAdsterraHistoryChange(current, { pageSize: 50 }).page, 1);
  assert.equal(withAdsterraHistoryChange(current, { page: 3 }).page, 3);
});
