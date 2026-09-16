export const TRAFFIC_ROI_PAGE_SIZES = [25, 50, 100] as const;

export function getClientPagination(totalRows: number, requestedPage: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const startIndex = totalRows === 0 ? 0 : (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);
  return { page, pageCount, startIndex, endIndex, from: totalRows === 0 ? 0 : startIndex + 1, to: endIndex };
}
