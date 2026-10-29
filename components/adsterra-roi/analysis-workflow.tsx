"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { analyzeAdsterraRoiAction, deleteAdsterraCustomBidAction, getAdsterraCustomBidsAction, saveAdsterraCustomBidAction } from "@/app/shopee/[id]/adsterra-roi/actions";
import { TrafficRoiCandidateList } from "@/components/traffic-roi/candidate-list";
import { PlacementTable } from "@/components/adsterra-roi/placement-table";
import type { CustomBidEditorProps } from "@/components/adsterra-roi/custom-bid-editor";
import type { AdsterraAnalysisConfig } from "@/lib/adsterra-roi/analyze";
import type { AdsterraCustomBidsResult, AdsterraRoiAnalysis } from "@/lib/adsterra-roi/types";
import { formatIdr, formatPercent, formatUsd } from "@/components/clickadu-roi/view-model";
import { formatBlacklistReplacementTime } from "../../lib/traffic-roi/replacement-timestamp";
import { adsterraWhitelistCandidates, type AdsterraAnalysisListKind } from "@/lib/adsterra-roi/whitelist-analysis";
import { PlacementApplication } from "./placement-application";
import { useAdsterraOperation } from "./operation-context";

type Result = { dateFrom: string; dateTill: string; fxRate: string; config: AdsterraAnalysisConfig; analysis: AdsterraRoiAnalysis };

export function AdsterraAnalysisWorkflow({ shopeeAccountId, shopeeAccountName, configs, connected }: { shopeeAccountId: number; shopeeAccountName: string; configs: AdsterraAnalysisConfig[]; connected: boolean }) {
  const operation = useAdsterraOperation();
  const [busy, setBusy] = useState(false);
  const replacing = operation.busy;
  const [writingBid, setWritingBid] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [customBids, setCustomBids] = useState<AdsterraCustomBidsResult | null>(null);
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [lastBlacklistReplacedAt, setLastBlacklistReplacedAt] = useState<string | null>(null);
  const [listKind, setListKind] = useState<AdsterraAnalysisListKind>("BLACKLIST");
  const listKindRef = useRef<AdsterraAnalysisListKind>("BLACKLIST");
  const analysisInFlight = useRef(false);
  const replaceInFlight = useRef(false);
  const bidWriteInFlight = useRef(false);
  const lastAnalysisForm = useRef<FormData | null>(null);

  async function analyze(data: FormData) {
    if (analysisInFlight.current || replaceInFlight.current || bidWriteInFlight.current) return;
    if (!operation.begin("analysis")) return;
    analysisInFlight.current = true;
    setBusy(true); setError(""); setSuccess(""); setResult(null); setCustomBids(null); lastAnalysisForm.current = null;
    try {
      const response = await analyzeAdsterraRoiAction(shopeeAccountId, data);
      if (response.success) {
        lastAnalysisForm.current = cloneFormData(data); setResult(response.result); setLastBlacklistReplacedAt(response.result.config.lastBlacklistReplacedAt?.toISOString() ?? null); setAnalysisVersion((value) => value + 1);
        try { setCustomBids(await getAdsterraCustomBidsAction(shopeeAccountId, response.result.config.id)); }
        catch { setCustomBids({ success: false, message: "Custom Bid Adsterra gagal dimuat." }); }
      }
      else setError(response.message);
    } finally { analysisInFlight.current = false; setBusy(false); operation.end("analysis"); }
  }

  function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analysisInFlight.current || replaceInFlight.current || bidWriteInFlight.current) return;
    void analyze(new FormData(event.currentTarget));
  }

  function invalidateAnalysis() {
    if (operation.isBusy() || analysisInFlight.current || replaceInFlight.current || bidWriteInFlight.current) return;
    setResult(null); setCustomBids(null); setError(""); setSuccess("");
    lastAnalysisForm.current = null;
  }

  const saveBid: NonNullable<CustomBidEditorProps["onSave"]> = async (placementId, bidPrice, expectedPrice) => {
    if (!result || !customBids?.success || analysisInFlight.current || replaceInFlight.current || bidWriteInFlight.current) {
      return { success: false, message: "Custom Bid belum siap diperbarui. Coba lagi setelah analisis selesai." };
    }
    if (!operation.begin("bid-write")) return { success: false, message: "Operasi lain sedang berjalan atau menunggu konfirmasi." };
    bidWriteInFlight.current = true; setWritingBid(true); setError("");
    try {
      const response = await saveAdsterraCustomBidAction(shopeeAccountId, result.config.id, placementId, bidPrice, expectedPrice);
      if (response.success) {
        setCustomBids({ success: true, bids: response.bids });
        setSuccess(`Custom Bid Placement ${placementId} berhasil disimpan dan diverifikasi.`);
      }
      return response;
    } finally { bidWriteInFlight.current = false; setWritingBid(false); operation.end("bid-write", true); }
  };

  const deleteBid: NonNullable<CustomBidEditorProps["onDelete"]> = async (placementId, expectedPrice) => {
    if (!result || !customBids?.success || analysisInFlight.current || replaceInFlight.current || bidWriteInFlight.current) {
      return { success: false, message: "Custom Bid belum siap dihapus. Coba lagi setelah analisis selesai." };
    }
    if (!operation.begin("bid-write")) return { success: false, message: "Operasi lain sedang berjalan atau menunggu konfirmasi." };
    bidWriteInFlight.current = true; setWritingBid(true); setError("");
    try {
      const response = await deleteAdsterraCustomBidAction(shopeeAccountId, result.config.id, placementId, expectedPrice);
      if (response.success) {
        setCustomBids({ success: true, bids: response.bids });
        setSuccess(`Custom Bid ID Placement ${placementId} berhasil dihapus dan diverifikasi.`);
      }
      return response;
    } finally { bidWriteInFlight.current = false; setWritingBid(false); operation.end("bid-write", true); }
  };

  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div><h3 className="font-semibold">Analisa Adsterra ROI</h3><p className="text-sm text-slate-500">Statistik Placement Adsterra dipadankan dengan Tag_link3 Shopee. Blacklist hanya berubah setelah konfirmasi eksplisit.</p></div>
    <div className="space-y-1"><label className="inline-flex flex-wrap items-center gap-2 text-sm font-medium">Jenis daftar analisis<select aria-label="Jenis daftar analisis" value={listKind} disabled={busy || replacing || writingBid} className="h-9 rounded-lg border bg-white px-3" onChange={(event) => {
      const next = event.target.value;
      if ((next !== "BLACKLIST" && next !== "WHITELIST") || operation.isBusy() || analysisInFlight.current || replaceInFlight.current || bidWriteInFlight.current) return;
      listKindRef.current = next; setListKind(next); setError(""); setSuccess("");
    }}><option value="BLACKLIST">Blacklist</option><option value="WHITELIST">Whitelist</option></select></label><p className="text-xs text-slate-500">Pilihan ini hanya menentukan kandidat analisis di aplikasi, bukan mode aktual editor atau daftar yang sedang diterapkan di Adsterra.</p></div>
    {!connected && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Koneksi Adsterra belum dikonfigurasi.</p>}
    <form onSubmit={submitAnalysis} onChange={invalidateAnalysis} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label className="text-sm font-medium">Campaign<select name="configId" required disabled={busy || replacing || writingBid || !connected} className="mt-1 h-9 w-full rounded-lg border bg-white px-3"><option value="">Pilih campaign</option>{configs.map((config) => <option key={config.id} value={config.id}>{config.label || config.campaignId}</option>)}</select></label>
      <label className="text-sm font-medium">Tanggal Mulai<input type="date" name="dateFrom" required disabled={busy || replacing || writingBid} className="mt-1 h-9 w-full rounded-lg border px-3"/></label>
      <label className="text-sm font-medium">Tanggal Akhir<input type="date" name="dateTill" required disabled={busy || replacing || writingBid} className="mt-1 h-9 w-full rounded-lg border px-3"/></label>
      <label className="text-sm font-medium">Kurs USD → IDR<input name="fxRate" defaultValue="16500" inputMode="decimal" required disabled={busy || replacing || writingBid} className="mt-1 h-9 w-full rounded-lg border px-3"/></label>
      <label className="text-sm font-medium">CSV Komisi Shopee<input type="file" name="file" accept=".csv,text/csv,application/vnd.ms-excel" required disabled={busy || replacing || writingBid} className="mt-1 block max-w-full text-sm"/></label>
      <Button disabled={busy || replacing || writingBid || !connected || !configs.length}>{busy ? "Menganalisis..." : "Analisa"}</Button>
    </form>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
    {result && <>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Aturan Kandidat {listKind === "BLACKLIST" ? "Blacklist" : "Whitelist"}</p>
        {listKind === "BLACKLIST"
          ? <><p className="mt-1">Aman jika ROI ≥20% ATAU (ROI &gt;10% DAN CTR &gt;8%). Dengan Biaya Iklan ≥ Rp1.000, placement yang tidak memenuhi kedua jalur AMAN tersebut menjadi kandidat blacklist pada periode analisis. Biaya di bawah Rp1.000 tetap Belum Cukup Spend. CTR dihitung dari klik / impresi × 100; impresi nol membuat CTR tidak tersedia, tetapi jalur ROI ≥20% tetap dapat membuat placement AMAN.</p><p>Jika Replace Blacklist dikonfirmasi, placement lainnya akan dikeluarkan dari blacklist.</p></>
          : <p className="mt-1">Kandidat Whitelist wajib Biaya Iklan ≥ Rp1.000 DAN (ROI ≥20% ATAU (ROI &gt;10% DAN CTR &gt;8%)). Batas biaya wajib untuk kedua jalur. CTR dihitung dari klik / impresi × 100; impresi nol membuat CTR tidak tersedia, tetapi ROI ≥20% tetap dapat memenuhi syarat. Biaya belum cukup, ROI null, serta data invalid/unknown tidak otomatis menjadi kandidat.</p>}
        <p className="mt-1 font-medium">Status tabel adalah hasil analisis periode ini, bukan status placement yang sedang diterapkan di provider.</p>
      </div>
      <AnalysisResult key={analysisVersion} result={result} listKind={listKind} shopeeName={shopeeAccountName} lastBlacklistReplacedAt={lastBlacklistReplacedAt} customBids={customBids} onSaveBid={saveBid} onDeleteBid={deleteBid} writingBid={writingBid || replacing}/>
      <PlacementApplication key={`${analysisVersion}:${listKind}`} accountId={shopeeAccountId} configId={result.config.id} kind={listKind} candidateCount={listKind === "BLACKLIST" ? result.analysis.candidatePlacements.length : adsterraWhitelistCandidates(result.analysis.rows).length} getData={() => lastAnalysisForm.current ? cloneFormData(lastAnalysisForm.current) : null} onResult={(response) => {
        if (response.lastBlacklistReplacedAt) setLastBlacklistReplacedAt(response.lastBlacklistReplacedAt);
        setCustomBids(response.actual && ["VERIFIED", "NO_CHANGE"].includes(response.status) ? { success: true, bids: response.actual.bids } : { success: false, message: "Hasil operasi belum pasti/lengkap; periksa pemulihan sebelum write Custom Bid." });
      }}/>
    </>}
  </section>;
}

function AnalysisResult({ result, listKind, shopeeName, lastBlacklistReplacedAt, customBids, onSaveBid, onDeleteBid, writingBid }: { result: Result; listKind: AdsterraAnalysisListKind; shopeeName: string; lastBlacklistReplacedAt: string | null; customBids: AdsterraCustomBidsResult | null; onSaveBid: NonNullable<CustomBidEditorProps["onSave"]>; onDeleteBid: NonNullable<CustomBidEditorProps["onDelete"]>; writingBid: boolean }) {
  const analysis = result.analysis;
  const candidateIds = useMemo(() => listKind === "BLACKLIST" ? analysis.candidatePlacements : adsterraWhitelistCandidates(analysis.rows), [analysis, listKind]);
  const clicks = analysis.rows.reduce((sum, row) => sum + row.clicks, 0);
  const stats = [["Biaya Iklan", formatIdr(analysis.totalCostIdr), formatUsd(analysis.totalSpentUsd)], ["Komisi Bersih Shopee", formatIdr(analysis.totalCommission), ""], ["Profit", formatIdr(analysis.totalProfit), ""], ["ROI", formatPercent(analysis.roi), ""], ["Klik Iklan", new Intl.NumberFormat("id-ID").format(clicks), ""], [listKind === "BLACKLIST" ? "Kandidat Blacklist" : "Kandidat Whitelist", String(candidateIds.length), listKind === "BLACKLIST" ? "Biaya ≥ Rp1.000; tidak memenuhi kedua jalur AMAN. Aman jika ROI ≥20% ATAU (ROI >10% DAN CTR >8%)." : "Biaya ≥ Rp1.000 DAN (ROI ≥20% ATAU (ROI >10% DAN CTR >8%)); data valid wajib."]];
  return <div className="space-y-4"><div className="grid gap-1 rounded-lg border bg-slate-50 p-3 text-sm sm:grid-cols-2"><p>Shopee Account: <b>{shopeeName}</b></p><p>Campaign: <b>{result.config.label || result.config.campaignId}</b></p><p>Tag Link 1: <b>{result.config.sourceTag}</b></p><p>Periode: <b>{result.dateFrom} – {result.dateTill}</b></p><p>Kurs: <b>{formatIdr(result.fxRate)} / USD</b></p><p>Terakhir Replace Blacklist: <b>{formatBlacklistReplacementTime(lastBlacklistReplacedAt)}</b></p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{stats.map(([label, value, detail]) => <div key={label} className="rounded-lg border bg-slate-50 p-3"><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="font-semibold">{value}</p>{detail && <p className="text-xs text-slate-500">{detail}</p>}</div>)}</div><p className="text-xs text-slate-500">Isi harga per Placement untuk Custom Bid Indonesia (ID), lalu klik Simpan. Nilai GLOBAL hanya ditampilkan dan tidak ikut diubah. Harga bid tidak dikonversi kurs.</p>{customBids && !customBids.success && <p role="status" className="text-sm text-amber-800">{customBids.message}</p>}<PlacementTable analysis={analysis} listKind={listKind} customBids={customBids} onSaveBid={onSaveBid} onDeleteBid={onDeleteBid} writeBusy={writingBid}/><TrafficRoiCandidateList key={listKind} ids={candidateIds} noun="Placement" copyLabel={listKind === "BLACKLIST" ? "Copy Placement" : "Copy Placement Whitelist"} listKind={listKind === "BLACKLIST" ? "blacklist" : "whitelist"}/></div>;
}

function cloneFormData(source: FormData) { const clone = new FormData(); for (const [key, value] of source.entries()) clone.append(key, value); return clone; }
