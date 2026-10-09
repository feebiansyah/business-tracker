import { dashboardParamsToSearch, type DashboardParams } from "./params.ts";

export const adsterraOverviewSortKeys = ["date", "spendUsd", "spendIdr", "commission", "profit", "profitPercent"] as const;
export type AdsterraOverviewSortKey = typeof adsterraOverviewSortKeys[number];
export type AdsterraOverviewDirection = "asc" | "desc";
export type AdsterraOverviewPageSize = 25 | 50 | 100;
export type AdsterraOverviewParams = { sort: AdsterraOverviewSortKey; dir: AdsterraOverviewDirection; page: number; pageSize: AdsterraOverviewPageSize };
type RawParams = Record<string, string | string[] | undefined>;

const scalar = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
const page = (value: string | undefined) => { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1; };
const pageSize = (value: string | undefined): AdsterraOverviewPageSize => { const parsed = Number(value); return parsed === 50 || parsed === 100 ? parsed : 25; };

export function parseAdsterraOverviewParams(raw: RawParams): AdsterraOverviewParams {
  const sort = scalar(raw.adsterraSort);
  return { sort: adsterraOverviewSortKeys.includes(sort as AdsterraOverviewSortKey) ? sort as AdsterraOverviewSortKey : "date", dir: scalar(raw.adsterraDir) === "asc" ? "asc" : "desc", page: page(scalar(raw.adsterraPage)), pageSize: pageSize(scalar(raw.adsterraPageSize)) };
}

export function adsterraOverviewParamsToSearch(dashboard: DashboardParams, state: AdsterraOverviewParams) {
  const params = dashboardParamsToSearch(dashboard);
  params.set("adsterraSort", state.sort);
  params.set("adsterraDir", state.dir);
  params.set("adsterraPage", String(state.page));
  params.set("adsterraPageSize", String(state.pageSize));
  return params;
}

export function withAdsterraOverviewChange(state: AdsterraOverviewParams, change: Partial<AdsterraOverviewParams>): AdsterraOverviewParams {
  const resetsPage = "sort" in change || "dir" in change || "pageSize" in change;
  return { ...state, ...change, page: resetsPage ? 1 : change.page ?? state.page };
}
