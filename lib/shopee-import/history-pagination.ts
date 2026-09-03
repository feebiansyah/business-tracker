export type HistoryPageSize = 25 | 50 | 100;
export type ImportHistoryParams = { commissionPage: number; commissionPageSize: HistoryPageSize; clickPage: number; clickPageSize: HistoryPageSize };
export type HistoryPageInfo = { page: number; pageSize: HistoryPageSize; total: number; pageCount: number; from: number; to: number };
type RawParams = Record<string, string | string[] | undefined>;

function scalar(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function page(value: string | undefined) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1; }
function pageSize(value: string | undefined): HistoryPageSize { const parsed = Number(value); return parsed === 50 || parsed === 100 ? parsed : 25; }

export function parseImportHistoryParams(raw: RawParams): ImportHistoryParams {
  return {
    commissionPage: page(scalar(raw.commissionPage)), commissionPageSize: pageSize(scalar(raw.commissionPageSize)),
    clickPage: page(scalar(raw.clickPage)), clickPageSize: pageSize(scalar(raw.clickPageSize)),
  };
}

export function historyPageInfo(total: number, requestedPage: number, size: HistoryPageSize): HistoryPageInfo {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(requestedPage, pageCount);
  return { page: currentPage, pageSize: size, total, pageCount, from: total === 0 ? 0 : (currentPage - 1) * size + 1, to: Math.min(currentPage * size, total) };
}

export function updateImportHistoryParams(current: ImportHistoryParams, kind: "commission" | "click", change: { page?: number; pageSize?: HistoryPageSize }): ImportHistoryParams {
  const pageKey = `${kind}Page` as const;
  const sizeKey = `${kind}PageSize` as const;
  return { ...current, [pageKey]: change.pageSize === undefined ? change.page ?? current[pageKey] : 1, [sizeKey]: change.pageSize ?? current[sizeKey] };
}

export function importHistoryParamsToSearch(params: ImportHistoryParams) {
  return new URLSearchParams(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])));
}
