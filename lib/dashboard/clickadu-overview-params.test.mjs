import assert from "node:assert/strict";
import test from "node:test";
import { clickaduOverviewParamsToSearch, parseClickaduOverviewParams, withClickaduOverviewChange } from "./clickadu-overview-params.ts";
import { parseDashboardParams } from "./params.ts";

test("Clickadu overview state preserves date and Meta state while resetting page for a new sort", () => {
  const dashboard = parseDashboardParams({ from: "2026-09-01", to: "2026-09-30", sort_7: "profit", dir_7: "asc", page_7: "3", pageSize_7: "50" }, [7]);
  const state = parseClickaduOverviewParams({ clickaduSort: "commission", clickaduDir: "asc", clickaduPage: "4", clickaduPageSize: "100" });

  const changed = withClickaduOverviewChange(state, { sort: "profit", dir: "desc" });
  const query = clickaduOverviewParamsToSearch(dashboard, changed);

  assert.equal(changed.page, 1);
  assert.equal(query.get("from"), "2026-09-01");
  assert.equal(query.get("to"), "2026-09-30");
  assert.equal(query.get("sort_7"), "profit");
  assert.equal(query.get("page_7"), "3");
  assert.equal(query.get("clickaduSort"), "profit");
  assert.equal(query.get("clickaduDir"), "desc");
  assert.equal(query.get("clickaduPage"), "1");
  assert.equal(query.get("clickaduPageSize"), "100");
});

test("Clickadu overview state rejects unsafe sorting and uses safe pagination defaults", () => {
  assert.deepEqual(parseClickaduOverviewParams({ clickaduSort: "unsafe", clickaduDir: "sideways", clickaduPage: "0", clickaduPageSize: "999" }), {
    sort: "date", dir: "desc", page: 1, pageSize: 25,
  });
});

test("Clickadu sorting retains independent Adsterra overview state", () => {
  const dashboard = parseDashboardParams({ from: "2026-10-01", to: "2026-10-16", sort_1: "date" }, [1]);
  const clickadu = parseClickaduOverviewParams({ clickaduSort: "spendUsd", clickaduPage: "2" });
  const adsterra = { sort: "commission", dir: "asc", page: 3, pageSize: 50 };
  const query = clickaduOverviewParamsToSearch(dashboard, withClickaduOverviewChange(clickadu, { sort: "profit" }), adsterra);
  assert.equal(query.get("clickaduSort"), "profit");
  assert.equal(query.get("clickaduPage"), "1");
  assert.equal(query.get("adsterraSort"), "commission");
  assert.equal(query.get("adsterraDir"), "asc");
  assert.equal(query.get("adsterraPage"), "3");
  assert.equal(query.get("adsterraPageSize"), "50");
});
