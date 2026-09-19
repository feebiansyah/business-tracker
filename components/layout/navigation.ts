import { LayoutDashboard, Layers3, Megaphone, Settings, ShoppingBag, type LucideIcon } from "lucide-react";
import type { ShopeeNavigationKey, ShopeeWorkflowGroupKey, ShopeeWorkflowSlug } from "./navigation-state";

export type NavigationItem = { href: string; label: string; icon: LucideIcon };

export const dashboardNavigation: NavigationItem = { href: "/", label: "Dashboard", icon: LayoutDashboard };
export const settingsNavigation: NavigationItem = { href: "/settings", label: "Settings", icon: Settings };

export const metaAdsNavigation = {
  label: "Meta Ads",
  icon: Megaphone,
  items: [{ href: "/wl", label: "Ad Accounts / WL", icon: Layers3 }] satisfies NavigationItem[],
};

export const shopeeNavigation: NavigationItem = { href: "/shopee", label: "Shopee", icon: ShoppingBag };

export type ShopeeWorkflowItem = { key: ShopeeNavigationKey; href: "" | ShopeeWorkflowSlug; label: string };
export type ShopeeWorkflowGroup = { key: ShopeeWorkflowGroupKey; label: string; items: ShopeeWorkflowItem[] };

export const shopeeDirectWorkflows: ShopeeWorkflowItem[] = [
  { key: "overview", href: "", label: "Overview" },
  { key: "import", href: "import", label: "Import Data" },
];

export const shopeeWorkflowGroups: ShopeeWorkflowGroup[] = [
  {
    key: "meta-ads",
    label: "Meta Ads",
    items: [
      { key: "filter", href: "filter", label: "Filter" },
      { key: "fix", href: "fix", label: "Fix" },
      { key: "off-filter", href: "off-filter", label: "OFF Filter" },
      { key: "off-fix", href: "off-fix", label: "OFF Fix" },
    ],
  },
  {
    key: "traffic",
    label: "Traffic",
    items: [
      { key: "clickadu-roi", href: "clickadu-roi", label: "Clickadu" },
      { key: "adsterra-roi", href: "adsterra-roi", label: "Adsterra" },
    ],
  },
];

export const shopeeWorkflows: ShopeeWorkflowItem[] = [
  ...shopeeDirectWorkflows,
  ...shopeeWorkflowGroups.flatMap((group) => group.items),
];

export const mobileNavigationItems: NavigationItem[] = [
  dashboardNavigation,
  metaAdsNavigation.items[0],
  shopeeNavigation,
  settingsNavigation,
];

export function isNavigationItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function getNavigationTitle(pathname: string) {
  if (pathname === "/") return dashboardNavigation.label;
  if (isNavigationItemActive(pathname, "/wl")) return metaAdsNavigation.items[0].label;
  if (isNavigationItemActive(pathname, "/shopee")) return shopeeNavigation.label;
  if (isNavigationItemActive(pathname, "/settings")) return settingsNavigation.label;
  return "Business Tracker";
}
