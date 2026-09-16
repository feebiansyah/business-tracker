"use client";

import { useRef, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analyzeAdsterraRoiAction, replaceAdsterraBlacklistAction } from "@/app/shopee/[id]/adsterra-roi/actions";
import type { AdsterraAnalysisConfig } from "@/lib/adsterra-roi/analyze";
import type { AdsterraRoiAnalysis } from "@/lib/adsterra-roi/types";
import { formatIdr, formatPercent, formatUsd } from "@/components/clickadu-roi/view-model";

type Result = { dateFrom: string; dateTill: string; fxRate: string; config: AdsterraAnalysisConfig; analysis: AdsterraRoiAnalysis };

export function AdsterraAnalysisWorkflow({ shopeeAccountId, shopeeAccountName, configs, connected }: { shopeeAccountId: number; shopeeAccountName: string; configs: AdsterraAnalysisConfig[]; connected: boolean }) {
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const analysisInFlight = useRef(false);
  const replaceInFlight = useRef(false);
  const lastAnalysisForm = useRef<FormData | null>(null);

  async function analyze(data: FormData) {
    if (analysisInFlight.current || replaceInFlight.current) return;
    analysisInFlight.current = true;
    setBusy(true); setError(""); setSuccess(""); setResult(null); lastAnalysisForm.current = null;
    try {
      const response = await analyzeAdsterraRoiAction(shopeeAccountId, data);
      if (response.success) { lastAnalysisForm.current = cloneFormData(data); setResult(response.result); }
      else setError(response.message);
    } finally { analysisInFlight.current = false; setBusy(false); }
  }

  async function replaceBlacklist() {
    if (analysisInFlight.current || replaceInFlight.current || !result || !lastAnalysisForm.current) return;
    if (!window.confirm(`Blacklist campaign Adsterra akan diperbarui berdasarkan hasil analisis terbaru. ${result.analysis.candidatePlacements.length} kandidat ROI < 30% akan dibuat OFF; Placement profitable dengan biaya akan dibuat ON; blacklist tanpa data periode ini tetap dipertahankan. Lanjutkan?`)) return;
    replaceInFlight.current = true;
    setReplacing(true); setError(""); setSuccess("");
    try {
      const response = await replaceAdsterraBlacklistAction(shopeeAccountId, cloneFormData(lastAnalysisForm.current));
      if (!response.success) setError(response.message);
      else if (response.status === "NO_CHANGE") setSuccess(`Blacklist sudah sesuai. Tidak ada write API dilakukan (${response.finalCount} Placement).`);
      else setSuccess(`Blacklist berhasil diperbarui dan diverifikasi: ${response.finalCount} Placement; ${response.addedCount} ditambahkan, ${response.removedCount} dikeluarkan, ${response.preservedWithoutDataCount} tanpa data dipertahankan.`);
    } finally { replaceInFlight.current = false; setReplacing(false); }
  }

  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div><h3 className="font-semibold">Analisa Adsterra ROI</h3><p className="text-sm text-slate-500">Statistik Placement Adsterra dipadankan dengan Tag_link3 Shopee. Blacklist hanya berubah setelah konfirmasi eksplisit.</p></div>
    {!connected && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Koneksi Adsterra belum dikonfigurasi.</p>}
    <form action={analyze} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label className="text-sm font-medium">Campaign<select name="configId" required disabled={busy || replacing || !connected} className="mt-1 h-9 w-full rounded-lg border bg-white px-3"><option value="">Pilih campaign</option>{configs.map((config) => <option key={config.id} value={config.id}>{config.label || config.campaignId}</option>)}</select></label>
      <label className="text-sm font-medium">Tanggal Mulai<input type="date" name="dateFrom" required disabled={busy || replacing} className="mt-1 h-9 w-full rounded-lg border px-3"/></label>
      <label className="text-sm font-medium">Tanggal Akhir<input type="date" name="dateTill" required disabled={busy || replacing} className="mt-1 h-9 w-full rounded-lg border px-3"/></label>
      <label className="text-sm font-medium">Kurs USD → IDR<input name="fxRate" defaultValue="16500" inputMode="decimal" required disabled={busy || replacing} className="mt-1 h-9 w-full rounded-lg border px-3"/></label>
      <label className="text-sm font-medium">CSV Komisi Shopee<input type="file" name="file" accept=".csv,text/csv,application/vnd.ms-excel" required disabled={busy || replacing} className="mt-1 block max-w-full text-sm"/></label>
      <Button disabled={busy || replacing || !connected || !configs.length}>{busy ? "Menganalisis..." : "Analisa"}</Button>
    </form>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
    {result && <><AnalysisResult result={result} shopeeName={shopeeAccountName}/><div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm text-slate-700">Replace menghitung ulang analisis di server, mempertahankan blacklist tanpa data relevan, dan memverifikasi daftar final secara exact.</p><Button type="button" variant="destructive" className="mt-3" disabled={busy || replacing} onClick={replaceBlacklist}>{replacing ? "Memperbarui blacklist..." : "Replace Blacklist Adsterra"}</Button></div></>}
  </section>;
}

function AnalysisResult({ result, shopeeName }: { result: Result; shopeeName: string }) {
  const analysis = result.analysis;
  const clicks = analysis.rows.reduce((sum, row) => sum + row.clicks, 0);
  const stats = [["Biaya Iklan", formatIdr(analysis.totalCostIdr), formatUsd(analysis.totalSpentUsd)], ["Komisi Bersih Shopee", formatIdr(analysis.totalCommission), ""], ["Profit", formatIdr(analysis.totalProfit), ""], ["ROI", formatPercent(analysis.roi), ""], ["Klik Iklan", new Intl.NumberFormat("id-ID").format(clicks), ""], ["Kandidat Blacklist", String(analysis.candidatePlacements.length), "ROI < 30%"]];
  return <div className="space-y-4"><div className="grid gap-1 rounded-lg border bg-slate-50 p-3 text-sm sm:grid-cols-2"><p>Shopee Account: <b>{shopeeName}</b></p><p>Campaign: <b>{result.config.label || result.config.campaignId}</b></p><p>Tag Link 1: <b>{result.config.sourceTag}</b></p><p>Periode: <b>{result.dateFrom} – {result.dateTill}</b></p><p>Kurs: <b>{formatIdr(result.fxRate)} / USD</b></p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{stats.map(([label, value, detail]) => <div key={label} className="rounded-lg border bg-slate-50 p-3"><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="font-semibold">{value}</p>{detail && <p className="text-xs text-slate-500">{detail}</p>}</div>)}</div><div className="max-w-full overflow-x-auto rounded-lg border"><table className="w-full min-w-200 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Placement", "Spend USD", "Spend IDR", "Komisi", "Profit", "ROI", "Status"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{analysis.rows.map((row) => <tr key={row.placement}><td className="px-3 py-3 font-medium">{row.placement}</td><td className="px-3 py-3">{formatUsd(row.spentUsd)}</td><td className="px-3 py-3">{formatIdr(row.costIdr)}</td><td className="px-3 py-3">{formatIdr(row.commission)}</td><td className={`px-3 py-3 ${row.profit.startsWith("-") ? "text-red-600" : "text-emerald-700"}`}>{formatIdr(row.profit)}</td><td className="px-3 py-3">{formatPercent(row.roi)}</td><td className={`whitespace-nowrap px-3 py-3 ${row.isBlacklistCandidate ? "text-red-600" : row.roi === null ? "text-slate-500" : "text-emerald-700"}`}>{row.isBlacklistCandidate ? "Kandidat Blacklist" : row.roi === null ? "Tanpa Biaya" : "Aman"}</td></tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><p className="break-words text-sm">{analysis.candidatePlacements.join(", ") || "Tidak ada kandidat Placement."}</p><Button type="button" variant="ghost" disabled={!analysis.candidatePlacements.length} onClick={() => navigator.clipboard.writeText(analysis.candidatePlacements.join(", "))}><Copy className="size-4"/>Copy Placement</Button></div></div>;
}

function cloneFormData(source: FormData) { const clone = new FormData(); for (const [key, value] of source.entries()) clone.append(key, value); return clone; }
