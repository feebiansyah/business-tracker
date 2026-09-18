"use client";

import { useRef, useState, type FormEvent } from "react";
import { analyzeClickaduRoiAction, replaceClickaduBlacklistAction } from "@/app/shopee/[id]/clickadu-roi/actions";
import { Button } from "@/components/ui/button";
import { TrafficRoiCandidateList } from "@/components/traffic-roi/candidate-list";
import type { ClickaduAnalysisConfig, ClickaduAnalysisResult } from "@/lib/clickadu-roi/analyze";
import { AnalysisSummary } from "./analysis-summary";
import { ZoneTable } from "./zone-table";
import { formatAnalysisDate } from "./view-model";
import { formatBlacklistReplacementTime } from "../../lib/traffic-roi/replacement-timestamp";

type Props = { shopeeAccountId: number; shopeeAccountName: string; configs: ClickaduAnalysisConfig[]; connected: boolean };

export function ClickaduAnalysisWorkflow({ shopeeAccountId, shopeeAccountName, configs, connected }: Props) {
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState<ClickaduAnalysisResult | null>(null);
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [lastBlacklistReplacedAt, setLastBlacklistReplacedAt] = useState<string | null>(null);
  const lastAnalysisForm = useRef<FormData | null>(null);
  const analysisInFlight = useRef(false);
  const replaceInFlight = useRef(false);

  async function run(formData: FormData) {
    if (analysisInFlight.current) return;
    if (replaceInFlight.current) return;
    analysisInFlight.current = true;
    setBusy(true); setError(""); setSuccess(""); setResult(null); lastAnalysisForm.current = null;
    try {
      const response = await analyzeClickaduRoiAction(shopeeAccountId, formData);
      if (response.success) { lastAnalysisForm.current = cloneFormData(formData); setResult(response.analysis); setLastBlacklistReplacedAt(response.analysis.config.lastBlacklistReplacedAt?.toISOString() ?? null); setAnalysisVersion((value) => value + 1); }
      else setError(response.message);
    } finally { analysisInFlight.current = false; setBusy(false); }
  }

  function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analysisInFlight.current || replaceInFlight.current) return;
    void run(new FormData(event.currentTarget));
  }

  async function replaceBlacklist() {
    if (analysisInFlight.current || replaceInFlight.current || !result || !lastAnalysisForm.current) return;
    if (!window.confirm(`Blacklist Clickadu campaign ini akan DIGANTI dengan ${result.analysis.candidateZones.length} zone kandidat berbiaya minimal Rp1.000 dan ROI < 30% dari hasil analisis terbaru. Blacklist lama yang tidak termasuk kandidat akan dihapus.`)) return;
    replaceInFlight.current = true; setReplacing(true); setError(""); setSuccess("");
    try {
      const response = await replaceClickaduBlacklistAction(shopeeAccountId, cloneFormData(lastAnalysisForm.current));
      if (response.success) {
        if (response.lastBlacklistReplacedAt) setLastBlacklistReplacedAt(response.lastBlacklistReplacedAt);
        setSuccess(response.status === "NO_CHANGE" ? `Blacklist Clickadu sudah sesuai. Tidak ada write API dilakukan (${response.blockedZoneCount} zone).` : `Blacklist Clickadu berhasil diganti dan diverifikasi: ${response.blockedZoneCount} zone.`);
      }
      else setError(response.message);
    } finally { replaceInFlight.current = false; setReplacing(false); }
  }

  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div><h3 className="font-semibold text-slate-950">Analisa Clickadu ROI</h3><p className="mt-1 text-sm text-slate-500">Analisis berdasarkan statistik Clickadu dan CSV Shopee.</p></div>
    {!connected && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Koneksi Clickadu belum dikonfigurasi.</div>}
    <form onSubmit={submitAnalysis} className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-5"><label className="text-sm font-medium text-slate-700">Campaign Clickadu<select name="configId" required disabled={busy || replacing || !configs.length || !connected} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal"><option value="">Pilih campaign</option>{configs.map((config) => <option key={config.id} value={config.id}>{config.label || config.campaignId}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Tanggal Mulai<input type="date" name="dateFrom" required disabled={busy || replacing} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label><label className="text-sm font-medium text-slate-700">Tanggal Akhir<input type="date" name="dateTill" required disabled={busy || replacing} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label><label className="text-sm font-medium text-slate-700">Kurs USD → IDR<input name="fxRate" inputMode="decimal" defaultValue="16500" required disabled={busy || replacing} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label><label className="min-w-0 text-sm font-medium text-slate-700">CSV Komisi Shopee<input type="file" name="file" accept=".csv,text/csv,application/vnd.ms-excel" required disabled={busy || replacing} className="mt-1 block min-w-0 max-w-full text-sm font-normal"/><span className="mt-1 block text-xs font-normal text-slate-500">Gunakan CSV Shopee dengan periode yang sama.</span></label><Button className="sm:col-span-2 xl:col-span-1" disabled={busy || replacing || !configs.length || !connected}>{busy ? "Menganalisis..." : "Analisa"}</Button></form>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}{success && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}
    {result && <div className="space-y-4"><div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 sm:grid-cols-2"><p>Campaign Clickadu: <span className="font-medium text-slate-900">{result.config.label || result.config.campaignId}</span></p><p>Shopee: <span className="font-medium text-slate-900">{shopeeAccountName}</span></p><p>Tag_link1: <span className="font-medium text-slate-900">{result.config.sourceTag}</span></p><p>Periode: <span className="font-medium text-slate-900">{formatAnalysisDate(result.dateFrom)} – {formatAnalysisDate(result.dateTill)}</span></p><p className="sm:col-span-2">Terakhir Replace Blacklist: <span className="font-medium text-slate-900">{formatBlacklistReplacementTime(lastBlacklistReplacedAt)}</span></p></div><div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-slate-700"><p className="font-medium text-slate-900">Aturan Kandidat Blacklist</p><p className="mt-1">Zone menjadi Kandidat Blacklist jika Biaya Iklan ≥ Rp1.000 dan ROI &lt; 30%.</p><p>Zone dengan biaya di bawah Rp1.000 belum cukup spend untuk keputusan.</p><p className="mt-1 text-slate-600">Blacklist hanya berubah setelah konfirmasi eksplisit. Operasi akan mengganti daftar lama secara penuh.</p></div><AnalysisSummary analysis={result.analysis}/><ZoneTable key={analysisVersion} analysis={result.analysis}/><TrafficRoiCandidateList ids={result.analysis.candidateZones} noun="Zone" copyLabel="Copy Zone"/><Button type="button" variant="destructive" disabled={replacing || busy} onClick={replaceBlacklist}>{replacing ? "Mengganti…" : "Replace Blacklist Clickadu"}</Button></div>}
  </section>;
}

function cloneFormData(source: FormData) { const clone = new FormData(); for (const [key, value] of source.entries()) clone.append(key, value); return clone; }
