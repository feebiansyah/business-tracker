import assert from "node:assert/strict";
import test from "node:test";
import { createSidebarExpansionState, getShopeeNavigationState, reduceSidebarExpansion } from "./navigation-state.ts";

test("marks the Shopee parent active on the Shopee index", () => {
  assert.deepEqual(getShopeeNavigationState("/shopee", 3), {
    shopeeActive: true,
    accountActive: false,
    activeWorkflow: null,
  });
});

test("marks only the matching Shopee account active", () => {
  assert.deepEqual(getShopeeNavigationState("/shopee/3", 3), {
    shopeeActive: true,
    accountActive: true,
    activeWorkflow: "overview",
  });
  assert.equal(getShopeeNavigationState("/shopee/3", 4).accountActive, false);
});

test("identifies the exact Filter workflow", () => {
  assert.equal(getShopeeNavigationState("/shopee/3/filter", 3).activeWorkflow, "filter");
  assert.equal(getShopeeNavigationState("/shopee/3/filter", 4).activeWorkflow, null);
});

test("does not confuse OFF Filter with Filter", () => {
  assert.equal(getShopeeNavigationState("/shopee/3/off-filter", 3).activeWorkflow, "off-filter");
});

test("keeps Shopee navigation inactive on unrelated routes", () => {
  assert.deepEqual(getShopeeNavigationState("/meta", 3), {
    shopeeActive: false,
    accountActive: false,
    activeWorkflow: null,
  });
});

test("identifies Import Shopee without confusing account workflows", () => {
  assert.equal(getShopeeNavigationState("/shopee/3/import", 3).activeWorkflow, "import");
  assert.equal(getShopeeNavigationState("/shopee/4/import", 3).activeWorkflow, null);
  assert.equal(getShopeeNavigationState("/shopee/3/filter", 3).activeWorkflow, "filter");
});

test("identifies every Shopee workflow route and keeps nested detail routes active", () => {
  assert.equal(getShopeeNavigationState("/shopee/3", 3).activeWorkflow, "overview");
  assert.equal(getShopeeNavigationState("/shopee/3/import", 3).activeWorkflow, "import");
  assert.equal(getShopeeNavigationState("/shopee/3/filter/99", 3).activeWorkflow, "filter");
  assert.equal(getShopeeNavigationState("/shopee/3/fix", 3).activeWorkflow, "fix");
  assert.equal(getShopeeNavigationState("/shopee/3/off-filter", 3).activeWorkflow, "off-filter");
  assert.equal(getShopeeNavigationState("/shopee/3/off-fix", 3).activeWorkflow, "off-fix");
  assert.equal(getShopeeNavigationState("/shopee/3/clickadu-roi", 3).activeWorkflow, "clickadu-roi");
});

test("allows the Shopee parent to collapse on an active Shopee route", () => {
  const initial = createSidebarExpansionState("/shopee/3/filter");
  assert.equal(initial.shopeeExpanded, true);
  assert.deepEqual(initial.expandedSubgroups, ["meta-ads"]);
  assert.equal(reduceSidebarExpansion(initial, { type: "TOGGLE_SHOPEE" }).shopeeExpanded, false);
});

test("auto-expands the active account once and allows it to collapse manually", () => {
  const initial = createSidebarExpansionState("/shopee/3/filter");
  assert.equal(initial.expandedAccountId, 3);
  assert.equal(reduceSidebarExpansion(initial, { type: "TOGGLE_ACCOUNT", accountId: 3 }).expandedAccountId, null);
});

test("keeps at most one Shopee account expanded", () => {
  const initial = createSidebarExpansionState("/shopee");
  const first = reduceSidebarExpansion(initial, { type: "TOGGLE_ACCOUNT", accountId: 3 });
  const second = reduceSidebarExpansion(first, { type: "TOGGLE_ACCOUNT", accountId: 4 });
  assert.equal(first.expandedAccountId, 3);
  assert.equal(second.expandedAccountId, 4);
  assert.deepEqual(second.expandedSubgroups, []);
});

test("auto-expands the subgroup for the active workflow", () => {
  assert.deepEqual(createSidebarExpansionState("/shopee/3/filter").expandedSubgroups, ["meta-ads"]);
  assert.deepEqual(createSidebarExpansionState("/shopee/3/fix").expandedSubgroups, ["meta-ads"]);
  assert.deepEqual(createSidebarExpansionState("/shopee/3/off-filter").expandedSubgroups, ["meta-ads"]);
  assert.deepEqual(createSidebarExpansionState("/shopee/3/off-fix").expandedSubgroups, ["meta-ads"]);
  assert.deepEqual(createSidebarExpansionState("/shopee/3/clickadu-roi").expandedSubgroups, ["traffic"]);
  assert.deepEqual(createSidebarExpansionState("/shopee/3/adsterra-roi").expandedSubgroups, ["traffic"]);
  assert.deepEqual(createSidebarExpansionState("/shopee/3/import").expandedSubgroups, []);
});

test("allows Meta Ads and Traffic subgroups to toggle manually", () => {
  const initial = createSidebarExpansionState("/shopee/3/filter");
  const metaClosed = reduceSidebarExpansion(initial, { type: "TOGGLE_SUBGROUP", subgroup: "meta-ads" });
  const trafficOpened = reduceSidebarExpansion(metaClosed, { type: "TOGGLE_SUBGROUP", subgroup: "traffic" });
  const bothOpened = reduceSidebarExpansion(trafficOpened, { type: "TOGGLE_SUBGROUP", subgroup: "meta-ads" });
  assert.deepEqual(metaClosed.expandedSubgroups, []);
  assert.deepEqual(trafficOpened.expandedSubgroups, ["traffic"]);
  assert.deepEqual(bothOpened.expandedSubgroups, ["traffic", "meta-ads"]);
});
