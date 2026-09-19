"use client";

import { useEffect, useState } from "react";

import { getClickaduDailyHistoryAction } from "@/app/shopee/[id]/clickadu-roi/actions";
import type { ClickaduDailyHistory, ClickaduHistoryParams } from "@/lib/clickadu-history/queries";

const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });
const displayBudget = (value: string | null) => value === null ? "—" : decimal.format(Number(value));
const displaySpend = (value: string | null) => value === null ? "—" : usd.format(Number(value));

export function ClickaduCampaignHistoryModal({ shopeeAccountId, configId, campaignName, onClose }: {
  shopeeAccountId: number;
  configId: number;
  campaignName: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<ClickaduHistoryParams>({ page: 1, pageSize: 25, dir: "desc" });
  const [detail, setDetail] = useState<ClickaduDailyHistory | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setDetail(null); setError("");
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

  return <div role="dialog" aria-modal="true" aria-label={`Histori Harian ${campaignName}`} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-0 sm:p-2 lg:p-4" onClick={onClose}>
    <div className="flex h-dvh max-h-dvh w-full min-w-0 flex-col overflow-hidden bg-slate-50 shadow-2xl sm:h-auto sm:max-h-[95vh] sm:w-[min(900px,98vw)] sm:rounded-xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3"><div className="min-w-0"><p className="text-xs font-medium text-slate-500">Histori Harian Clickadu</p><h2 className="truncate text-lg font-semibold text-slate-950">{campaignName}</h2></div><button type="button" aria-label="Tutup modal" className="flex size-8 items-center justify-center rounded-md text-xl text-slate-500 hover:bg-slate-100" onClick={onClose}>×</button></div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : detail ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-125 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3"><button type="button" onClick={() => setState((value) => ({ ...value, page: 1, dir: value.dir === "desc" ? "asc" : "desc" }))}>Tanggal {state.dir === "desc" ? "↓" : "↑"}</button></th><th className="px-4 py-3">Budget</th><th className="px-4 py-3">Spend</th></tr></thead><tbody className="divide-y divide-slate-200">{detail.rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-medium text-slate-950">{row.date}</td><td className="px-4 py-3">{displayBudget(row.dailyBudget)}</td><td className="px-4 py-3">{displaySpend(row.spendUsd)}</td></tr>)}{detail.rows.length === 0 && <tr><td colSpan={3} className="px-6 py-10 text-center text-slate-500">Belum ada histori harian Clickadu.</td></tr>}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600"><span>{detail.pagination.total} baris · Halaman {detail.pagination.page} dari {detail.pagination.pageCount}</span><div className="flex items-center gap-2"><select aria-label="Baris per halaman" value={state.pageSize} onChange={(event) => setState((value) => ({ ...value, page: 1, pageSize: Number(event.target.value) as 25 | 50 | 100 }))} className="rounded-md border border-slate-300 bg-white px-2 py-1">{[25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select><button type="button" disabled={detail.pagination.page <= 1} onClick={() => setState((value) => ({ ...value, page: value.page - 1 }))} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40">Sebelumnya</button><button type="button" disabled={detail.pagination.page >= detail.pagination.pageCount} onClick={() => setState((value) => ({ ...value, page: value.page + 1 }))} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40">Berikutnya</button></div></div></div> : <p className="p-6 text-center text-sm text-slate-500">Memuat histori…</p>}
      </div>
    </div>
  </div>;
}
