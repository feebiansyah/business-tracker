"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importShopeeClickAction, previewShopeeClickAction } from "@/app/shopee/[id]/import/actions";
import { Button } from "@/components/ui/button";
import type { ClickHistoryRow, ClickImportReceipt, ClickPreview } from "@/lib/shopee-click-import/types";
import type { HistoryPageInfo, ImportHistoryParams } from "@/lib/shopee-import/history-pagination";
import { ImportHistoryPagination } from "./history-pagination";
import { importReasonLabel } from "./view-model";

const range = (from: string, to: string) => from === to ? from : `${from} – ${to}`;

function ClickPreviewSummary({ preview }: { preview: ClickPreview }) {
  const items = [["File", preview.originalFilename], ["Periode", range(preview.dateFrom, preview.dateTo)], ["Logical rows", preview.csvRowCount], ["Rows diproses", preview.processedRowCount], ["Groups", preview.groupCount], ["Matched", preview.matchedCount], ["Unmatched", preview.unmatchedCount], ["Ignored", preview.ignoredRowCount], ["Matched clicks", preview.matchedClicks], ["Unmatched clicks", preview.unmatchedClicks]];
  return <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">{items.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-slate-200 p-3"><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="mt-1 break-words font-medium text-slate-900">{value}</p></div>)}</div>;
}

function ClickHistory({ rows }: { rows: ClickHistoryRow[] }) {
  if (!rows.length) return <p className="p-4 text-sm text-slate-500 sm:p-6">Belum ada riwayat import klik.</p>;
  return <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-190 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Waktu", "File", "Periode", "Rows", "META", "Ignored", "Matched", "Unmatched"].map((label) => <th key={label} className="px-3 py-3 sm:px-4">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.id}><td className="px-3 py-3 sm:px-4">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</td><td className="max-w-56 truncate px-3 py-3 font-medium sm:px-4" title={row.originalFilename}>{row.originalFilename}</td><td className="px-3 py-3 sm:px-4">{range(row.dateFrom, row.dateTo)}</td><td className="px-3 py-3 sm:px-4">{row.csvRowCount}</td><td className="px-3 py-3 sm:px-4">{row.processedRowCount}</td><td className="px-3 py-3 sm:px-4">{row.ignoredRowCount}</td><td className="px-3 py-3 sm:px-4">{row.matchedClicks}</td><td className="px-3 py-3 sm:px-4">{row.unmatchedClicks}</td></tr>)}</tbody></table></div>;
}

export function ClickImportWorkflow({ shopeeAccountId, history, historyPagination, historyState }: { shopeeAccountId: number; history: ClickHistoryRow[]; historyPagination: HistoryPageInfo; historyState: ImportHistoryParams }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ClickPreview | null>(null);
  const [receipt, setReceipt] = useState<ClickImportReceipt | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "preview" | "import">("idle");
  const busy = phase !== "idle";

  async function runPreview() {
    if (!file) return;
    setPhase("preview"); setError(""); setReceipt(null);
    const form = new FormData(); form.set("file", file);
    const result = await previewShopeeClickAction(shopeeAccountId, form);
    if (result.success) setPreview(result.preview); else { setPreview(null); setError(result.message); }
    setPhase("idle");
  }

  async function runImport() {
    if (!file || !preview) return;
    setPhase("import"); setError("");
    const form = new FormData(); form.set("file", file);
    const result = await importShopeeClickAction(shopeeAccountId, preview.confirmation, form);
    if (result.success) { setReceipt(result.receipt); setPreview(null); router.refresh(); }
    else setError(result.message.includes("Preview") || result.message.includes("File berubah") ? `${result.message} Silakan Preview ulang.` : result.message);
    setPhase("idle");
  }

  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div><h3 className="font-semibold text-slate-950">Import Klik Shopee</h3><p className="mt-1 text-sm text-slate-500">Impor klik harian berdasarkan Tag Link 2.</p></div>
    <div className="flex min-w-0 flex-wrap items-stretch gap-3 sm:items-center"><input aria-label="File CSV Klik Shopee" type="file" accept=".csv,text/csv,application/vnd.ms-excel" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setReceipt(null); setError(""); }} className="block w-full min-w-0 max-w-full text-sm sm:w-auto"/><Button className="w-full sm:w-auto" disabled={busy || !file} onClick={runPreview}>{phase === "preview" ? "Memproses…" : "Preview Klik"}</Button></div>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {preview && <div className="min-w-0 space-y-4"><ClickPreviewSummary preview={preview}/><div><h4 className="mb-2 font-medium">Unmatched</h4>{preview.unmatched.length ? <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-140 text-left text-sm"><thead><tr>{["Tanggal", "Tag Link 2", "Reason", "Click count"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{preview.unmatched.map((row) => <tr key={`${row.date}-${row.tagLink2}`}><td className="px-3 py-2">{row.date}</td><td className="px-3 py-2">{row.tagLink2}</td><td className="px-3 py-2">{importReasonLabel(row.reason)}</td><td className="px-3 py-2">{row.clickCount}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">Semua group berhasil dicocokkan.</p>}</div><Button className="w-full sm:w-auto" disabled={busy} onClick={runImport}>{phase === "import" ? "Mengimpor…" : "Import Klik Sekarang"}</Button></div>}
    {receipt && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Import berhasil: {receipt.matchedClicks} klik matched, {receipt.unmatchedClicks} klik unmatched.</div>}
    <div className="-mx-4 -mb-4 mt-6 min-w-0 border-t sm:-mx-6 sm:-mb-6"><h4 className="px-4 py-4 font-semibold sm:px-6">Riwayat Import Klik</h4><ClickHistory rows={history}/><ImportHistoryPagination kind="click" pagination={historyPagination} state={historyState}/></div>
  </section>;
}
