export const clickaduHistorySortKeys = ["date", "spendUsd", "spendIdr", "commission", "profit"] as const;
export type ClickaduHistorySortKey = typeof clickaduHistorySortKeys[number];
export type ClickaduHistoryDirection = "asc" | "desc";
export type ClickaduHistoryPageSize = 25 | 50 | 100;
export type ClickaduHistoryParams = {
  sort: ClickaduHistorySortKey;
  dir: ClickaduHistoryDirection;
  page: number;
  pageSize: ClickaduHistoryPageSize;
};

type RawParams = Record<string, unknown>;

export function parseClickaduHistoryParams(raw: RawParams): ClickaduHistoryParams {
  const sort = typeof raw.sort === "string" && clickaduHistorySortKeys.includes(raw.sort as ClickaduHistorySortKey)
    ? raw.sort as ClickaduHistorySortKey
    : "date";
  const page = Number(raw.page);
  const requestedSize = Number(raw.pageSize);
  return {
    sort,
    dir: raw.dir === "asc" ? "asc" : "desc",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: requestedSize === 50 || requestedSize === 100 ? requestedSize : 25,
  };
}

export function withClickaduHistoryChange(current: ClickaduHistoryParams, change: Partial<ClickaduHistoryParams>) {
  const resetPage = "sort" in change || "dir" in change || "pageSize" in change;
  return { ...current, ...change, page: resetPage ? 1 : change.page ?? current.page };
}
