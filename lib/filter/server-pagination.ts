export const filterSortKeys = ["name", "wlName", "budget", "days", "totalSpend", "costWithFee", "totalCommission", "profit", "profitPercent"] as const;
export const historySortKeys = ["date", "spend", "costWithFee", "commission", "profit", "profitPercent", "clickFp", "shopeeClicks", "clickPercent", "cpcFp", "cpcShopee", "note", "completed"] as const;
export type FilterSortKey = typeof filterSortKeys[number];
export type HistorySortKey = typeof historySortKeys[number];
export type Direction = "asc" | "desc";
export type FilterParams = { q: string; sort: FilterSortKey; dir: Direction; page: number; pageSize: 25 | 50 | 100 };
export type HistoryParams = { sort: HistorySortKey; dir: Direction; page: number; pageSize: 25 | 50 | 100 };
type RawParams = Record<string, string | string[] | undefined>;

function scalar(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function positiveInteger(value: string | undefined, fallback: number) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
function pageSize(value: string | undefined): 25 | 50 | 100 { const parsed = Number(value); return parsed === 50 || parsed === 100 ? parsed : 25; }
function direction(value: string | undefined): Direction { return value === "asc" ? "asc" : "desc"; }

export function parseFilterParams(raw: RawParams): FilterParams {
  const sortValue = scalar(raw.sort);
  return {
    q: (scalar(raw.q) ?? "").trim().slice(0, 191),
    sort: filterSortKeys.includes(sortValue as FilterSortKey) ? sortValue as FilterSortKey : "totalSpend",
    dir: direction(scalar(raw.dir)),
    page: positiveInteger(scalar(raw.page), 1),
    pageSize: pageSize(scalar(raw.pageSize)),
  };
}

export function parseHistoryParams(raw: RawParams): HistoryParams {
  const sortValue = scalar(raw.sort);
  return {
    sort: historySortKeys.includes(sortValue as HistorySortKey) ? sortValue as HistorySortKey : "date",
    dir: direction(scalar(raw.dir)),
    page: positiveInteger(scalar(raw.page), 1),
    pageSize: pageSize(scalar(raw.pageSize)),
  };
}

export function withFilterChange(current: FilterParams, change: Partial<FilterParams>): FilterParams {
  const resetsPage = ["q", "sort", "dir", "pageSize"].some((key) => key in change);
  return { ...current, ...change, page: resetsPage ? 1 : change.page ?? current.page };
}

export function filterParamsToSearch(params: FilterParams) {
  return new URLSearchParams({ q: params.q, sort: params.sort, dir: params.dir, page: String(params.page), pageSize: String(params.pageSize) });
}

export function withHistoryChange(current: HistoryParams, change: Partial<HistoryParams>): HistoryParams {
  const resetsPage = ["sort", "dir", "pageSize"].some((key) => key in change);
  return { ...current, ...change, page: resetsPage ? 1 : change.page ?? current.page };
}

export function historyParamsToSearch(params: HistoryParams) {
  return new URLSearchParams({ sort: params.sort, dir: params.dir, page: String(params.page), pageSize: String(params.pageSize) });
}
