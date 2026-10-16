import { dashboardParamsToSearch, type DashboardParams } from "./params.ts";

export const clickaduOverviewSortKeys = ["date", "spendUsd", "spendIdr", "commission", "profit", "profitPercent"] as const;
export type ClickaduOverviewSortKey = typeof clickaduOverviewSortKeys[number];
export type ClickaduOverviewDirection = "asc" | "desc";
export type ClickaduOverviewPageSize = 25 | 50 | 100;
export type ClickaduOverviewParams = { sort: ClickaduOverviewSortKey; dir: ClickaduOverviewDirection; page: number; pageSize: ClickaduOverviewPageSize };
type RawParams = Record<string, string | string[] | undefined>;

const scalar = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
const page = (value: string | undefined) => { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1; };
const pageSize = (value: string | undefined): ClickaduOverviewPageSize => { const parsed = Number(value); return parsed === 50 || parsed === 100 ? parsed : 25; };

export function parseClickaduOverviewParams(raw: RawParams): ClickaduOverviewParams {
  const sort = scalar(raw.clickaduSort);
  return { sort: clickaduOverviewSortKeys.includes(sort as ClickaduOverviewSortKey) ? sort as ClickaduOverviewSortKey : "date", dir: scalar(raw.clickaduDir) === "asc" ? "asc" : "desc", page: page(scalar(raw.clickaduPage)), pageSize: pageSize(scalar(raw.clickaduPageSize)) };
}

export function clickaduOverviewParamsToSearch(dashboard: DashboardParams, state: ClickaduOverviewParams) {
  const params = dashboardParamsToSearch(dashboard);
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
