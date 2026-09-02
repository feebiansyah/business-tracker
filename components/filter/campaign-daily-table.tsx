"use client";

import { useMemo, useState, useTransition } from "react";
import { updateDailyMetricManualAction } from "@/app/shopee/[id]/filter/actions";
import { SortableHeader } from "@/components/filter/sortable-header";
import { TablePagination } from "@/components/filter/table-pagination";
import type { FilterCampaignDetail } from "@/lib/filter/queries";
import { dailyCommissionDisplay } from "@/lib/filter/view-model";
import { formatRupiah, paginateRows, sortRows, type SortDirection, type SortType, type SortValue } from "@/lib/filter/table-utils";

type DailyRow = FilterCampaignDetail["dailyMetrics"][number];
type SortKey = keyof Pick<DailyRow, "date" | "spend" | "costWithFee" | "commission" | "profit" | "profitPercent" | "clickFp" | "shopeeClicks" | "clickPercent" | "cpcFp" | "cpcShopee" | "note" | "completed">;
const columns: { key: SortKey; label: string; type: SortType }[] = [
  { key: "date", label: "Tanggal", type: "date" }, { key: "spend", label: "Spend", type: "number" }, { key: "costWithFee", label: "+5%", type: "number" },
  { key: "commission", label: "Komisi", type: "number" }, { key: "profit", label: "Profit", type: "number" }, { key: "profitPercent", label: "% Profit", type: "number" },
  { key: "clickFp", label: "Klik FP", type: "number" }, { key: "shopeeClicks", label: "Klik Shopee", type: "number" }, { key: "clickPercent", label: "% Klik", type: "number" },
  { key: "cpcFp", label: "CPC FP", type: "number" }, { key: "cpcShopee", label: "CPC Shopee", type: "number" }, { key: "note", label: "Note", type: "text" }, { key: "completed", label: "Selesai", type: "boolean" },
];
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
function numeric(value: number | null) { return value === null ? "—" : number.format(value); }
function percent(value: number | null) { return value === null ? "—" : `${value.toFixed(2)}%`; }
function commission(value: number | null, imported: boolean) { const display = dailyCommissionDisplay(value, imported); return typeof display === "number" ? formatRupiah(display) : display; }

function ManualCells({ shopeeAccountId, campaignId, row, compact, onChange }: { shopeeAccountId: number; campaignId: number; row: DailyRow; compact: boolean; onChange: (patch: Partial<Pick<DailyRow, "note" | "completed">>) => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function save(next: DailyRow) {
    setMessage("");
    startTransition(async () => {
      const result = await updateDailyMetricManualAction(shopeeAccountId, campaignId, next.id, next.note ?? "", next.completed);
      setMessage(result.success ? "Tersimpan" : result.message);
    });
  }
  return <>
    <td className="px-4 py-3"><input value={row.note ?? ""} maxLength={2000} placeholder="Tambahkan note" onChange={(event) => onChange({ note: event.target.value })} onBlur={(event) => save({ ...row, note: event.currentTarget.value })} className={`${compact ? "w-full min-w-28 max-w-44 px-1.5 py-1 text-xs" : "w-56 px-2 py-1.5 text-sm"} rounded-md border border-slate-300`} />{(pending || message) && <span className={`mt-1 block text-xs ${message && message !== "Tersimpan" ? "text-red-600" : "text-slate-500"}`}>{pending ? "Menyimpan…" : message}</span>}</td>
    <td className="px-4 py-3 text-center"><input type="checkbox" checked={row.completed} disabled={pending} onChange={(event) => { const next = { ...row, completed: event.target.checked }; onChange({ completed: next.completed }); save(next); }} className="size-4 accent-slate-900" aria-label={`Selesai ${row.date}`} /></td>
  </>;
}

export function CampaignDailyTable({ shopeeAccountId, campaignId, rows: initialRows, compact = false }: { shopeeAccountId: number; campaignId: number; rows: FilterCampaignDetail["dailyMetrics"]; compact?: boolean }) {
  const [rows, setRows] = useState(initialRows);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const sorted = useMemo(() => { const column = columns.find((item) => item.key === sortKey)!; return sortRows(rows, (row) => row[sortKey] as SortValue, direction, column.type); }, [direction, rows, sortKey]);
  const pagination = paginateRows(sorted, page, pageSize);
  function changeSort(key: SortKey) { setDirection(key === sortKey ? (direction === "asc" ? "desc" : "asc") : "asc"); setSortKey(key); setPage(1); }
  function updateRow(id: number, patch: Partial<Pick<DailyRow, "note" | "completed">>) { setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto"><table className={compact ? "w-full min-w-[1180px] text-left text-[11px] [&_td]:whitespace-nowrap [&_td]:px-1.5 [&_td]:py-2 [&_th]:px-1.5 [&_th]:py-2" : "w-full min-w-425 text-left text-sm"}>
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <SortableHeader key={column.key} label={column.label} active={sortKey === column.key} direction={direction} onSort={() => changeSort(column.key)} />)}</tr></thead>
      <tbody className="divide-y divide-slate-200">{pagination.rows.map((row) => <tr key={row.id}>
        <td className="px-4 py-3 font-medium text-slate-950">{row.date}</td><td className="px-4 py-3">{formatRupiah(row.spend)}</td><td className="px-4 py-3">{formatRupiah(row.costWithFee)}</td><td className="px-4 py-3">{commission(row.commission, row.commissionImported)}</td><td className="px-4 py-3">{formatRupiah(row.profit)}</td><td className="px-4 py-3">{percent(row.profitPercent)}</td><td className="px-4 py-3">{numeric(row.clickFp)}</td><td className="px-4 py-3">{numeric(row.shopeeClicks)}</td><td className="px-4 py-3">{percent(row.clickPercent)}</td><td className="px-4 py-3">{formatRupiah(row.cpcFp)}</td><td className="px-4 py-3">{formatRupiah(row.cpcShopee)}</td>
        <ManualCells shopeeAccountId={shopeeAccountId} campaignId={campaignId} row={row} compact={compact} onChange={(patch) => updateRow(row.id, patch)} />
      </tr>)}{pagination.total === 0 && <tr><td colSpan={13} className="px-6 py-10 text-center text-slate-500">Belum ada histori harian dari Meta.</td></tr>}</tbody>
    </table></div>
    <TablePagination page={pagination.page} pageCount={pagination.pageCount} total={pagination.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
  </div>;
}
