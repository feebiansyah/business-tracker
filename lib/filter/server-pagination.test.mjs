import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterParamsToSearch, parseFilterParams, parseHistoryParams, withFilterChange, withHistoryChange } from "./server-pagination.ts";

test("filter URL state validates defaults and allowed page sizes", () => {
  assert.deepEqual(parseFilterParams({}), { q: "", sort: "totalSpend", dir: "desc", page: 1, pageSize: 25 });
  assert.deepEqual(parseFilterParams({ q: " baby ", sort: "profit", dir: "asc", page: "3", pageSize: "50" }), { q: "baby", sort: "profit", dir: "asc", page: 3, pageSize: 50 });
  assert.equal(parseFilterParams({ pageSize: "99" }).pageSize, 25);
});

test("filter search, sort, direction, and page-size changes reset page", () => {
  const current = parseFilterParams({ q: "one", sort: "name", dir: "asc", page: "4", pageSize: "25" });
  assert.equal(withFilterChange(current, { page: 3 }).page, 3);
  for (const change of [{ q: "two" }, { sort: "profit" }, { dir: "desc" }, { pageSize: 50 }]) {
    assert.equal(withFilterChange(current, change).page, 1);
  }
  assert.equal(filterParamsToSearch(withFilterChange(current, { pageSize: 100 })).get("page"), "1");
});

test("history URL state defaults to newest date and validates paging", () => {
  assert.deepEqual(parseHistoryParams({}), { sort: "date", dir: "desc", page: 1, pageSize: 25 });
  assert.deepEqual(parseHistoryParams({ sort: "commission", dir: "asc", page: "2", pageSize: "100" }), { sort: "commission", dir: "asc", page: 2, pageSize: 100 });
});

test("history sorting and page-size changes reset its server page", () => {
  const current = parseHistoryParams({ sort: "date", dir: "desc", page: "4", pageSize: "25" });
  assert.equal(withHistoryChange(current, { page: 2 }).page, 2);
  assert.equal(withHistoryChange(current, { sort: "profit" }).page, 1);
  assert.equal(withHistoryChange(current, { pageSize: 50 }).page, 1);
});

test("queries paginate and order aggregated campaign/history data on the server", async () => {
  const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
  assert.match(source, /LIMIT/);
  assert.match(source, /OFFSET/);
  assert.match(source, /COUNT\(DISTINCT dm\.date\)/);
  assert.doesNotMatch(source, /dailyMetrics:\s*\{\s*select/);
});
