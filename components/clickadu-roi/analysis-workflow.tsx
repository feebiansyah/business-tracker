"use client";

import { useRef, useState, type FormEvent } from "react";
import { analyzeClickaduRoiAction } from "@/app/shopee/[id]/clickadu-roi/actions";
import { prepareClickaduListAction, applyClickaduListAction } from "@/app/shopee/[id]/clickadu-roi/list-actions";
import { Button } from "@/components/ui/button";
import { TrafficRoiCandidateList } from "@/components/traffic-roi/candidate-list";
import type { ClickaduAnalysisConfig, ClickaduAnalysisResult } from "@/lib/clickadu-roi/analyze";
import { AnalysisSummary } from "./analysis-summary";
import { ZoneTable } from "./zone-table";
import { formatAnalysisDate } from "./view-model";
import { formatBlacklistReplacementTime } from "../../lib/traffic-roi/replacement-timestamp";
import { useClickaduListMethod } from "./list-method-context";
import { clickaduListCandidates, type ClickaduListMethod } from "@/lib/clickadu-roi/list-method";

type Props = { shopeeAccountId: number; shopeeAccountName: string; configs: ClickaduAnalysisConfig[]; connected: boolean };

export function ClickaduAnalysisWorkflow({ shopeeAccountId, shopeeAccountName, configs, connected }: Props) {
  const lists = useClickaduListMethod();
  const [busy, setBusy] = useState(false);
  const [localReplacing, setReplacing] = useState(false);
  const replacing = localReplacing || lists.busy;
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState<ClickaduAnalysisResult | null>(null);
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [analysisMethod, setAnalysisMethod] = useState<ClickaduListMethod | null>(null);
  const [lastBlacklistReplacedAt, setLastBlacklistReplacedAt] = useState<string | null>(null);
  const lastAnalysisForm = useRef<FormData | null>(null);
  const analysisInFlight = useRef(false);
  const replaceInFlight = useRef(false);

  async function run(formData: FormData) {
    if (analysisInFlight.current) return;
    if (replaceInFlight.current) return;
    const configId = Number(formData.get("configId"));
    const method = lists.plans[configId] ?? lists.reads[configId]?.actual?.method;
    if (!method || lists.reads[configId]?.error || lists.reads[configId]?.loading) { setError("Metode aktual belum terbaca. Refresh metode pada Campaign."); return; }
    if (!lists.begin()) return;
    analysisInFlight.current = true;
    setAnalysisMethod(method);
    setBusy(true); setError(""); setSuccess(""); setResult(null); lastAnalysisForm.current = null;
    try {
      const response = await analyzeClickaduRoiAction(shopeeAccountId, formData);
      if (response.success) { lastAnalysisForm.current = cloneFormData(formData); setResult(response.analysis); setLastBlacklistReplacedAt(response.analysis.config.lastBlacklistReplacedAt?.toISOString() ?? null); setAnalysisVersion((value) => value + 1); }
      else setError(response.message);
    } catch { setError("Analisis gagal dimuat. Coba kembali setelah memeriksa koneksi."); }
    finally { analysisInFlight.current = false; setBusy(false); lists.end(); }
  }

  function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analysisInFlight.current || replaceInFlight.current) return;
    void run(new FormData(event.currentTarget));
  }

  async function replaceBlacklist() {
    if (analysisInFlight.current || replaceInFlight.current || !result || !lastAnalysisForm.current || !analysisMethod || !lists.begin()) return;
    replaceInFlight.current = true; setReplacing(true); setError(""); setSuccess("");
    try {
      const data = cloneFormData(lastAnalysisForm.current);
      const prepared = await prepareClickaduListAction(shopeeAccountId, data, analysisMethod);
      if (!prepared.success) { setError(prepared.message); return; }
      const p = prepared.preview;
      const label = (value: ClickaduListMethod) => value === "BLACKLIST" ? "Blacklist" : "Whitelist";
      if (!window.confirm(`Campaign ${p.label} (${p.campaignId})\n${label(p.previousMethod)} → ${label(p.method)}\nTarget final: ${p.target.length} Zone.\nDaftar lama (${p.previousCount} Zone) diganti penuh, bukan ditambahkan. Tidak ada clear terpisah.\n${p.method === "BLACKLIST" && !p.target.length ? "Blacklist kosong: tidak ada Zone yang dikecualikan.\n" : ""}Konfirmasi penerapan?`)) return;
      const response = await applyClickaduListAction(shopeeAccountId, data, analysisMethod, p.precondition);
      if (response.success) {
        if (response.lastBlacklistReplacedAt) setLastBlacklistReplacedAt(response.lastBlacklistReplacedAt);
        lists.verified(result.config.id, response.actual);
        setSuccess(response.status === "NO_CHANGE" ? `${label(analysisMethod)} sudah sesuai (${response.actual.zoneIds.length} Zone).` : `${label(analysisMethod)}: ${response.message} (${response.actual.zoneIds.length} Zone).`);
      }
      else { setError(response.message); await lists.refresh(result.config.id); }
    } catch { setError("Hasil penerapan belum diterima. Refresh metode untuk memeriksa kondisi aktual; tidak ada retry otomatis."); }
    finally { replaceInFlight.current = false; setReplacing(false); lists.end(); }
  }

  const candidates = result && analysisMethod ? clickaduListCandidates(result.analysis, analysisMethod) : [];
  const plannedMethod = selectedConfigId ? lists.plans[selectedConfigId] ?? lists.reads[selectedConfigId]?.actual?.method : null;

  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div><h3 className="font-semibold text-slate-950">Analisa Clickadu ROI</h3><p className="mt-1 text-sm text-slate-500">Analisis berdasarkan statistik Clickadu dan CSV Shopee.</p></div>
    {!connected && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Koneksi Clickadu belum dikonfigurasi.</div>}
    {selectedConfigId && <p className="text-sm text-slate-600">Rencana dari Campaign: <strong>{plannedMethod === "BLACKLIST" ? "Blacklist" : plannedMethod === "WHITELIST" ? "Whitelist" : "Belum tersedia"}</strong>. Metode provider berubah hanya setelah penerapan terverifikasi.</p>}
    <form onSubmit={submitAnalysis} className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-5"><label className="text-sm font-medium text-slate-700">Campaign Clickadu<select name="configId" required disabled={busy || replacing || !configs.length || !connected} onChange={(e) => { setSelectedConfigId(Number(e.target.value) || null); setResult(null); lastAnalysisForm.current = null; setError(""); setSuccess(""); }} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal"><option value="">Pilih campaign</option>{configs.map((config) => <option key={config.id} value={config.id}>{config.label || config.campaignId}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Tanggal Mulai<input type="date" name="dateFrom" required disabled={busy || replacing} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label><label className="text-sm font-medium text-slate-700">Tanggal Akhir<input type="date" name="dateTill" required disabled={busy || replacing} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label><label className="text-sm font-medium text-slate-700">Kurs USD → IDR<input name="fxRate" inputMode="decimal" defaultValue="16500" required disabled={busy || replacing} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label><label className="min-w-0 text-sm font-medium text-slate-700">CSV Komisi Shopee<input type="file" name="file" accept=".csv,text/csv,application/vnd.ms-excel" required disabled={busy || replacing} className="mt-1 block min-w-0 max-w-full text-sm font-normal"/><span className="mt-1 block text-xs font-normal text-slate-500">Gunakan CSV Shopee dengan periode yang sama.</span></label><Button className="sm:col-span-2 xl:col-span-1" disabled={busy || replacing || !configs.length || !connected}>{busy ? "Menganalisis..." : "Analisa"}</Button></form>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}{success && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}
    {result && <div className="space-y-4">
      <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 sm:grid-cols-2"><p>Campaign Clickadu: <span className="font-medium text-slate-900">{result.config.label || result.config.campaignId}</span></p><p>Shopee: <span className="font-medium text-slate-900">{shopeeAccountName}</span></p><p>Tag_link1: <span className="font-medium text-slate-900">{result.config.sourceTag}</span></p><p>Periode: <span className="font-medium text-slate-900">{formatAnalysisDate(result.dateFrom)} – {formatAnalysisDate(result.dateTill)}</span></p><p className="sm:col-span-2">Terakhir Replace Blacklist: <span className="font-medium text-slate-900">{formatBlacklistReplacementTime(lastBlacklistReplacedAt)}</span></p></div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-slate-700"><p className="font-medium text-slate-900">Aturan Kandidat {analysisMethod === "WHITELIST" ? "Whitelist" : "Blacklist"}</p><p className="mt-1">Biaya Iklan ≥ Rp1.000 dan ROI {analysisMethod === "WHITELIST" ? "≥" : "<"} 30%.</p><p>Zone dengan biaya di bawah Rp1.000 belum cukup spend untuk keputusan.</p><p className="mt-1 text-slate-600">Metode dan daftar hanya berubah setelah konfirmasi eksplisit. Daftar lama diganti penuh.</p></div>
      <AnalysisSummary analysis={result.analysis} method={analysisMethod ?? "BLACKLIST"}/>
      <ZoneTable key={analysisVersion} analysis={result.analysis} method={analysisMethod ?? "BLACKLIST"}/>
      <TrafficRoiCandidateList ids={candidates} noun="Zone" listKind={analysisMethod === "WHITELIST" ? "whitelist" : "blacklist"} copyLabel={analysisMethod === "WHITELIST" ? "Copy Zone Whitelist" : "Copy Zone"}/>
      <Button type="button" variant="destructive" disabled={replacing || busy || (analysisMethod === "WHITELIST" && !candidates.length)} onClick={replaceBlacklist}>{localReplacing ? "Memproses…" : `Terapkan ${analysisMethod === "WHITELIST" ? "Whitelist" : "Blacklist"}`}</Button>
    </div>}
  </section>;
}

function cloneFormData(source: FormData) { const clone = new FormData(); for (const [key, value] of source.entries()) clone.append(key, value); return clone; }
