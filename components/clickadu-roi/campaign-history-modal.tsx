"use client";

import { useEffect, useState } from "react";

import { getClickaduDailyHistoryAction } from "@/app/shopee/[id]/clickadu-roi/actions";
import { SortableHeader } from "@/components/filter/sortable-header";
import { TablePagination } from "@/components/filter/table-pagination";
import type { ClickaduDailyHistory } from "@/lib/clickadu-history/queries";
import { withClickaduHistoryChange, type ClickaduHistoryParams, type ClickaduHistorySortKey } from "@/lib/clickadu-history/server-pagination";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });
const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const displaySpend = (value: string | null) => value === null ? "—" : usd.format(Number(value));
const displayCommission = (value: string | null) => value === null ? "—" : idr.format(Number(value));
const displayIdr = (value: string | null) => value === null ? "—" : idr.format(Number(value));

export function ClickaduCampaignHistoryModal({ shopeeAccountId, configId, campaignName, onClose }: {
  shopeeAccountId: number;
  configId: number;
  campaignName: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<ClickaduHistoryParams>({ sort: "date", page: 1, pageSize: 25, dir: "desc" });
  const [detail, setDetail] = useState<ClickaduDailyHistory | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getClickaduDailyHistoryAction(shopeeAccountId, configId, state).then((result) => {
      if (!active) return;
      if (result.success) setDetail(result.data); else setError(result.message);
    });
    return () => { active = false; };
  }, [configId, shopeeAccountId, state]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onClose]);
  function updateState(update: (value: ClickaduHistoryParams) => ClickaduHistoryParams) {
    setDetail(null);
    setError("");
    setState(update);
  }
  function navigate(change: Partial<ClickaduHistoryParams>) { updateState((current) => withClickaduHistoryChange(current, change)); }
  function changeSort(sort: ClickaduHistorySortKey) { navigate({ sort, dir: sort === state.sort && state.dir === "asc" ? "desc" : "asc" }); }
  const columns: { key: ClickaduHistorySortKey; label: string }[] = [
    { key: "date", label: "Tanggal" },
    { key: "spendUsd", label: "Spend USD" },
    { key: "spendIdr", label: "Spend IDR" },
    { key: "commission", label: "Komisi" },
    { key: "profit", label: "Profit" },
  ];

  return <div role="dialog" aria-modal="true" aria-label={`Histori Harian ${campaignName}`} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-0 sm:p-2 lg:p-4" onClick={onClose}>
    <div className="flex h-dvh max-h-dvh w-full min-w-0 flex-col overflow-hidden bg-slate-50 shadow-2xl sm:h-auto sm:max-h-[95vh] sm:w-[min(900px,98vw)] sm:rounded-xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3"><div className="min-w-0"><p className="text-xs font-medium text-slate-500">Histori Harian Clickadu</p><h2 className="truncate text-lg font-semibold text-slate-950">{campaignName}</h2></div><button type="button" aria-label="Tutup modal" className="flex size-8 items-center justify-center rounded-md text-xl text-slate-500 hover:bg-slate-100" onClick={onClose}>×</button></div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <p className="mb-3 text-sm text-slate-600">Kurs tetap: $1 = Rp19.000</p>
        {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : detail ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-150 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <SortableHeader key={column.key} label={column.label} active={state.sort === column.key} direction={state.dir} onSort={() => changeSort(column.key)} />)}</tr></thead><tbody className="divide-y divide-slate-200">{detail.rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-medium text-slate-950">{row.date}</td><td className="px-4 py-3">{displaySpend(row.spendUsd)}</td><td className="px-4 py-3">{displayIdr(row.spendIdr)}</td><td className="px-4 py-3">{displayCommission(row.commissionIdr)}</td><td className="px-4 py-3">{displayIdr(row.profitIdr)}</td></tr>)}{detail.rows.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">Belum ada histori harian Clickadu.</td></tr>}</tbody></table></div><TablePagination page={detail.pagination.page} pageCount={detail.pagination.pageCount} total={detail.pagination.total} pageSize={detail.pagination.pageSize} onPageChange={(page) => navigate({ page })} onPageSizeChange={(pageSize) => navigate({ pageSize: pageSize as 25 | 50 | 100 })} /></div> : <p className="p-6 text-center text-sm text-slate-500">Memuat histori…</p>}
      </div>
    </div>
  </div>;
}
