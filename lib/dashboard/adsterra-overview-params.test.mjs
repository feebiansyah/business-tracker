import assert from "node:assert/strict";
import test from "node:test";
import { adsterraOverviewParamsToSearch, parseAdsterraOverviewParams, withAdsterraOverviewChange } from "./adsterra-overview-params.ts";
import { parseDashboardParams } from "./params.ts";

test("Adsterra overview state preserves date and Meta state while resetting page for a new sort", () => {
  const dashboard = parseDashboardParams({ from: "2026-09-01", to: "2026-09-30", sort_7: "profit", dir_7: "asc", page_7: "3", pageSize_7: "50" }, [7]);
  const state = parseAdsterraOverviewParams({ adsterraSort: "commission", adsterraDir: "asc", adsterraPage: "4", adsterraPageSize: "100" });

  const changed = withAdsterraOverviewChange(state, { sort: "profit", dir: "desc" });
  const query = adsterraOverviewParamsToSearch(dashboard, changed);

  assert.equal(changed.page, 1);
  assert.equal(query.get("from"), "2026-09-01");
  assert.equal(query.get("to"), "2026-09-30");
  assert.equal(query.get("sort_7"), "profit");
  assert.equal(query.get("page_7"), "3");
  assert.equal(query.get("adsterraSort"), "profit");
  assert.equal(query.get("adsterraDir"), "desc");
  assert.equal(query.get("adsterraPage"), "1");
  assert.equal(query.get("adsterraPageSize"), "100");
});

test("Adsterra overview state rejects unsafe sorting and uses safe pagination defaults", () => {
  assert.deepEqual(parseAdsterraOverviewParams({ adsterraSort: "unsafe", adsterraDir: "sideways", adsterraPage: "0", adsterraPageSize: "999" }), {
    sort: "date", dir: "desc", page: 1, pageSize: 25,
  });
});
