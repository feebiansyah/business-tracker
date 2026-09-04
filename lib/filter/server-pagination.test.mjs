import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dateInFilterRange, filterParamsToSearch, parseFilterParams, parseHistoryParams, resetFilterParams, withFilterChange, withHistoryChange } from "./server-pagination.ts";

test("filter URL state validates defaults, WL, start sorting, and page sizes", () => {
  assert.deepEqual(parseFilterParams({}), { q: "", wl: null, from: "", to: "", sort: "totalSpend", dir: "desc", page: 1, pageSize: 25 });
  assert.deepEqual(parseFilterParams({ q: " baby ", wl: "12", from: "2026-09-01", to: "2026-09-30", sort: "startTime", dir: "asc", page: "3", pageSize: "50" }), { q: "baby", wl: 12, from: "2026-09-01", to: "2026-09-30", sort: "startTime", dir: "asc", page: 3, pageSize: 50 });
  assert.equal(parseFilterParams({ wl: "invalid" }).wl, null);
  assert.equal(parseFilterParams({ pageSize: "99" }).pageSize, 25);
});

test("filter search, sort, direction, and page-size changes reset page", () => {
  const current = parseFilterParams({ q: "one", sort: "name", dir: "asc", page: "4", pageSize: "25" });
  assert.equal(withFilterChange(current, { page: 3 }).page, 3);
  for (const change of [{ q: "two" }, { wl: 9 }, { from: "2026-09-01" }, { to: "2026-09-30" }, { sort: "profit" }, { dir: "desc" }, { pageSize: 50 }]) {
    assert.equal(withFilterChange(current, change).page, 1);
  }
  assert.equal(filterParamsToSearch(withFilterChange(current, { pageSize: 100 })).get("page"), "1");
});

test("campaign aggregate date range supports all dates and inclusive one-sided bounds", () => {
  assert.equal(dateInFilterRange("2026-09-15", "", ""), true);
  assert.equal(dateInFilterRange("2026-09-15", "2026-09-15", ""), true);
  assert.equal(dateInFilterRange("2026-09-14", "2026-09-15", ""), false);
  assert.equal(dateInFilterRange("2026-09-15", "", "2026-09-15"), true);
  assert.equal(dateInFilterRange("2026-09-16", "", "2026-09-15"), false);
  assert.equal(dateInFilterRange("2026-09-01", "2026-09-01", "2026-09-30"), true);
  assert.equal(dateInFilterRange("2026-09-30", "2026-09-01", "2026-09-30"), true);
});

test("filter reset clears search/range/sort/page while preserving page size", () => {
  const current = parseFilterParams({ q: "baby", from: "2026-09-01", to: "2026-09-30", sort: "name", dir: "asc", page: "4", pageSize: "100" });
  assert.deepEqual(resetFilterParams(current), { q: "", wl: null, from: "", to: "", sort: "totalSpend", dir: "desc", page: 1, pageSize: 100 });
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
  assert.match(source, /c\.startTime/);
  assert.match(source, /ma\.id = \$\{params\.wl\}/);
  const join = source.indexOf("LEFT JOIN CampaignDailyMetric");
  const group = source.indexOf("GROUP BY c.id");
  assert.ok(join >= 0 && group > join);
  assert.match(source.slice(join, group), /dm\.date >=/);
  assert.match(source.slice(join, group), /dm\.date <=/);
  assert.doesNotMatch(source, /dailyMetrics:\s*\{\s*select/);
});
