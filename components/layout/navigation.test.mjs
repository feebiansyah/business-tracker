import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardNavigation,
  getNavigationTitle,
  isNavigationItemActive,
  metaAdsNavigation,
  mobileNavigationItems,
  settingsNavigation,
  shopeeDirectWorkflows,
  shopeeNavigation,
  shopeeWorkflowGroups,
  shopeeWorkflows,
} from "./navigation.ts";

test("renders only the approved application navigation", () => {
  assert.deepEqual(dashboardNavigation, { href: "/", label: "Dashboard", icon: dashboardNavigation.icon });
  assert.equal(metaAdsNavigation.label, "Meta Ads");
  assert.deepEqual(metaAdsNavigation.items.map(({ href, label }) => ({ href, label })), [
    { href: "/wl", label: "Ad Accounts / WL" },
  ]);
  assert.equal(shopeeNavigation.label, "Shopee");
  assert.equal(settingsNavigation.href, "/settings");

  const visibleHrefs = mobileNavigationItems.map((item) => item.href);
  assert.deepEqual(visibleHrefs, ["/", "/wl", "/shopee", "/settings"]);
  for (const hidden of ["/adu", "/terra", "/roi-tracker", "/meta"]) assert.equal(visibleHrefs.includes(hidden), false);
});

test("keeps Overview and Import Data as direct account workflows", () => {
  assert.deepEqual(shopeeDirectWorkflows.map(({ href, label }) => ({ href, label })), [
    { href: "", label: "Overview" },
    { href: "import", label: "Import Data" },
  ]);
});

test("groups Meta Ads and Traffic workflows without changing routes", () => {
  assert.deepEqual(shopeeWorkflowGroups.map(({ key, label, items }) => ({
    key,
    label,
    items: items.map(({ href, label: itemLabel }) => ({ href, label: itemLabel })),
  })), [
    {
      key: "meta-ads",
      label: "Meta Ads",
      items: [
        { href: "filter", label: "Filter" },
        { href: "fix", label: "Fix" },
        { href: "off-filter", label: "OFF Filter" },
        { href: "off-fix", label: "OFF Fix" },
      ],
    },
    {
      key: "traffic",
      label: "Traffic",
      items: [
        { href: "clickadu-roi", label: "Clickadu" },
        { href: "adsterra-roi", label: "Adsterra" },
      ],
    },
  ]);

  assert.deepEqual(shopeeWorkflows.map(({ href, label }) => ({ href, label })), [
    { href: "", label: "Overview" },
    { href: "import", label: "Import Data" },
    { href: "filter", label: "Filter" },
    { href: "fix", label: "Fix" },
    { href: "off-filter", label: "OFF Filter" },
    { href: "off-fix", label: "OFF Fix" },
    { href: "clickadu-roi", label: "Clickadu" },
    { href: "adsterra-roi", label: "Adsterra" },
  ]);
});

test("marks top-level and nested navigation routes active without prefix collisions", () => {
  assert.equal(isNavigationItemActive("/", "/"), true);
  assert.equal(isNavigationItemActive("/wl", "/wl"), true);
  assert.equal(isNavigationItemActive("/wl/19", "/wl"), true);
  assert.equal(isNavigationItemActive("/shopee/2/import", "/shopee"), true);
  assert.equal(isNavigationItemActive("/settings", "/settings"), true);
  assert.equal(isNavigationItemActive("/wlong", "/wl"), false);
  assert.equal(isNavigationItemActive("/shopee", "/"), false);
});

test("resolves concise topbar titles for approved sections", () => {
  assert.equal(getNavigationTitle("/"), "Dashboard");
  assert.equal(getNavigationTitle("/wl/19"), "Ad Accounts / WL");
  assert.equal(getNavigationTitle("/shopee/2/filter"), "Shopee");
  assert.equal(getNavigationTitle("/settings"), "Settings");
});
