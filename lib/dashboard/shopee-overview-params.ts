export const shopeeOverviewTabs = ["meta", "clickadu", "adsterra"] as const;
export type ShopeeOverviewTab = typeof shopeeOverviewTabs[number];

export function parseShopeeOverviewTab(value: string | string[] | undefined): ShopeeOverviewTab {
  return typeof value === "string" && shopeeOverviewTabs.includes(value as ShopeeOverviewTab)
    ? value as ShopeeOverviewTab : "meta";
}

export function withShopeeOverviewTab(search: string, tab: ShopeeOverviewTab) {
  const params = new URLSearchParams(search);
  params.set("overviewTab", parseShopeeOverviewTab(tab));
  return params;
}
