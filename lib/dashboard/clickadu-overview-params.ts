import { dashboardParamsToSearch, type DashboardParams } from "./params.ts";

export const clickaduOverviewSortKeys = ["date", "spendUsd", "spendIdr", "commission", "profit", "profitPercent"] as const;
export type ClickaduOverviewSortKey = typeof clickaduOverviewSortKeys[number];
export type ClickaduOverviewParams = {
  sort: ClickaduOverviewSortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: 25 | 50 | 100;
};
type RawParams = Record<string, string | string[] | undefined>;
const scalar = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;

export function parseClickaduOverviewParams(raw: RawParams): ClickaduOverviewParams {
  const sort = scalar(raw.clickaduSort);
  const page = Number(scalar(raw.clickaduPage));
  const pageSize = Number(scalar(raw.clickaduPageSize));
  return {
    sort: clickaduOverviewSortKeys.includes(sort as ClickaduOverviewSortKey) ? sort as ClickaduOverviewSortKey : "date",
    dir: scalar(raw.clickaduDir) === "asc" ? "asc" : "desc",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: pageSize === 50 || pageSize === 100 ? pageSize : 25,
  };
}

export function clickaduOverviewParamsToSearch(dashboard: DashboardParams, state: ClickaduOverviewParams, preservedSearch = "") {
  const params = dashboardParamsToSearch(dashboard, preservedSearch);
  params.set("clickaduSort", state.sort);
  params.set("clickaduDir", state.dir);
  params.set("clickaduPage", String(state.page));
  params.set("clickaduPageSize", String(state.pageSize));
  return params;
}

export function withClickaduOverviewChange(state: ClickaduOverviewParams, change: Partial<ClickaduOverviewParams>): ClickaduOverviewParams {
  const resetsPage = "sort" in change || "dir" in change || "pageSize" in change;
  return { ...state, ...change, page: resetsPage ? 1 : change.page ?? state.page };
}
