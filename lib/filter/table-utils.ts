export type SortDirection = "asc" | "desc";
export type SortValue = string | number | boolean | null;
export type SortType = "text" | "number" | "date" | "boolean";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatRupiah(value: number | null) {
  return value === null ? "—" : rupiah.format(value);
}

export function compareNullable(left: SortValue, right: SortValue, type: SortType) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (type === "text") return String(left).localeCompare(String(right), "id", { numeric: true, sensitivity: "base" });
  if (type === "date") return Date.parse(String(left)) - Date.parse(String(right));
  if (type === "boolean") return Number(left) - Number(right);
  return Number(left) - Number(right);
}

export function sortRows<T>(rows: T[], getValue: (row: T) => SortValue, direction: SortDirection, type: SortType) {
  return rows.map((row, index) => ({ row, index })).sort((left, right) => {
    const compared = compareNullable(getValue(left.row), getValue(right.row), type);
    if (compared === 0) return left.index - right.index;
    if (getValue(left.row) === null || getValue(right.row) === null) return compared;
    return direction === "asc" ? compared : -compared;
  }).map(({ row }) => row);
}

export function paginateRows<T>(rows: T[], requestedPage: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page, pageCount, total: rows.length };
}
