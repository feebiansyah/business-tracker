export const dashboardSortKeys = ["date", "budget", "costWithFee", "commission", "profit", "profitPercent"] as const;
export type DashboardSortKey = typeof dashboardSortKeys[number];
export type DashboardDirection = "asc" | "desc";
export type DashboardPageSize = 25 | 50 | 100;
export type DashboardAccountParams = { sort: DashboardSortKey; dir: DashboardDirection; page: number; pageSize: DashboardPageSize };
export type DashboardParams = { from: string; to: string; accounts: Record<number, DashboardAccountParams> };
type RawParams = Record<string, string | string[] | undefined>;

const scalar = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
function date(value: string | undefined) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""; const parsed = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : ""; }
function page(value: string | undefined) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1; }
function pageSize(value: string | undefined): DashboardPageSize { const parsed = Number(value); return parsed === 50 || parsed === 100 ? parsed : 25; }

export function parseDashboardParams(raw: RawParams, accountIds: readonly number[]): DashboardParams {
  return { from: date(scalar(raw.from)), to: date(scalar(raw.to)), accounts: Object.fromEntries(accountIds.map((id) => {
    const sort = scalar(raw[`sort_${id}`]);
    return [id, { sort: dashboardSortKeys.includes(sort as DashboardSortKey) ? sort as DashboardSortKey : "date", dir: scalar(raw[`dir_${id}`]) === "asc" ? "asc" : "desc", page: page(scalar(raw[`page_${id}`])), pageSize: pageSize(scalar(raw[`pageSize_${id}`])) }];
  })) };
}

export function dashboardParamsToSearch(state: DashboardParams) {
  const params = new URLSearchParams();
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  for (const [id, value] of Object.entries(state.accounts)) { params.set(`sort_${id}`, value.sort); params.set(`dir_${id}`, value.dir); params.set(`page_${id}`, String(value.page)); params.set(`pageSize_${id}`, String(value.pageSize)); }
  return params;
}

export function withDashboardAccountChange(state: DashboardParams, accountId: number, change: Partial<DashboardAccountParams>): DashboardParams {
  const current = state.accounts[accountId];
  const resetsPage = "sort" in change || "dir" in change || "pageSize" in change;
  return { ...state, accounts: { ...state.accounts, [accountId]: { ...current, ...change, page: resetsPage ? 1 : change.page ?? current.page } } };
}
