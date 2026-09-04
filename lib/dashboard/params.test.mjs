import assert from "node:assert/strict";
import test from "node:test";
import { dashboardParamsToSearch, parseDashboardParams, withDashboardAccountChange } from "./params.ts";

test("dashboard params validate dates and use safe per-account pagination defaults", () => {
  assert.deepEqual(parseDashboardParams({}, [2, 7]), {
    from: "", to: "", accounts: { 2: { sort: "date", dir: "desc", page: 1, pageSize: 25 }, 7: { sort: "date", dir: "desc", page: 1, pageSize: 25 } },
  });
  assert.deepEqual(parseDashboardParams({ from: "2026-09-01", to: "bad", sort_2: "profit", dir_2: "asc", page_2: "3", pageSize_2: "50", sort_7: "unsafe", pageSize_7: "999" }, [2, 7]), {
    from: "2026-09-01", to: "", accounts: { 2: { sort: "profit", dir: "asc", page: 3, pageSize: 50 }, 7: { sort: "date", dir: "desc", page: 1, pageSize: 25 } },
  });
});

test("dashboard account sorting and page size reset only that account page", () => {
  const state = parseDashboardParams({ page_2: "3", page_7: "4" }, [2, 7]);
  const changed = withDashboardAccountChange(state, 2, { sort: "budget", dir: "asc" });
  assert.equal(changed.accounts[2].page, 1);
  assert.equal(changed.accounts[7].page, 4);
});

test("dashboard URL state keeps account pagination independent", () => {
  const state = parseDashboardParams({ page_2: "3", page_7: "4", pageSize_7: "100" }, [2, 7]);
  const query = dashboardParamsToSearch(state);
  assert.equal(query.get("page_2"), "3");
  assert.equal(query.get("page_7"), "4");
  assert.equal(query.get("pageSize_7"), "100");
});
