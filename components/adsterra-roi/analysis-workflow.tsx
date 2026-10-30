"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import { getAdsterraApplicationMethod } from "@/app/shopee/[id]/adsterra-roi/method-actions";
import type { MethodState } from "@/lib/adsterra-operations/types";
import { MethodBadge } from "./operation-dialog";

type Result = { dateFrom: string; dateTill: string; fxRate: string; config: AdsterraAnalysisConfig; analysis: AdsterraRoiAnalysis };

export function AdsterraAnalysisWorkflow({ shopeeAccountId, shopeeAccountName, configs, connected }: { shopeeAccountId: number; shopeeAccountName: string; configs: AdsterraAnalysisConfig[]; connected: boolean }) {
  const operation = useAdsterraOperation();
  const [busy, setBusy] = useState(false);
  const replacing = operation.busy;
  const [writingBid, setWritingBid] = useState(false);
  const [bidWritesBlocked, setBidWritesBlocked] = useState(false);
  const [bidReadBusy, setBidReadBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notificationTarget, setNotificationTarget] = useState<HTMLDivElement | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultKind, setResultKind] = useState<AdsterraAnalysisListKind | null>(null);
  const [customBids, setCustomBids] = useState<AdsterraCustomBidsResult | null>(null);
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [lastBlacklistReplacedAt, setLastBlacklistReplacedAt] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState("");
  const [method, setMethod] = useState<MethodState | null>(null);
  const [methodError, setMethodError] = useState("");
  const [methodBusy, setMethodBusy] = useState(false);
  const methodSequence = useRef(0);
  const methodIdentity = useRef("");
  const listKind = method?.placementMethod ?? null;
  const { revision, readRevision } = operation;
  const analysisInFlight = useRef(false);
  const replaceInFlight = useRef(false);
  const bidWriteInFlight = useRef(false);
  const bidReadSequence = useRef(0);
  const bidReadPending = useRef(false);
  const lastAnalysisForm = useRef<FormData | null>(null);
  useEffect(() => {
    let disposed = false;
    const request = ++methodSequence.current, startedRevision = readRevision();
    queueMicrotask(async () => {
      if (disposed) return;
      setMethodError("");
      if (!selectedConfig) { setMethod(null); setMethodBusy(false); return; }
      setMethodBusy(true);
      try {
        const response = await getAdsterraApplicationMethod(shopeeAccountId, Number(selectedConfig));
        if (disposed || request !== methodSequence.current || readRevision() !== startedRevision) return;
        if (response.success) {
          const identity = `${selectedConfig}:${response.campaignId}:${response.method.placementMethod}`;
          // Keep pending confirmation/result components mounted across protective
          // refreshes and version bumps. Server always revalidates version/scope.
          if (methodIdentity.current !== identity && !analysisInFlight.current && !replaceInFlight.current && !bidWriteInFlight.current && !operation.isBusy()) { bidReadSequence.current++; bidReadPending.current = false; setBidReadBusy(false); setResult(null); setCustomBids(null); lastAnalysisForm.current = null; }
          if (!operation.isBusy()) methodIdentity.current = identity;
          setMethod(response.method);
        } else { setMethod(null); setMethodError(response.message); }
      } catch { if (!disposed && request === methodSequence.current) { setMethod(null); setMethodError("Metode aplikasi gagal dimuat; bukan berarti belum ditetapkan."); } }
      finally { if (!disposed && request === methodSequence.current) setMethodBusy(false); }
    });
    return () => { disposed = true; };
    // The operation context object changes with busy. Reads are revision-driven,
    // not triggered by acquiring/releasing a confirmation lock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfig, shopeeAccountId, revision, readRevision]);

  async function analyze(data: FormData) {
    if (!listKind || methodBusy || analysisInFlight.current || replaceInFlight.current || bidWriteInFlight.current) return;
    if (!operation.begin("analysis")) return;
    analysisInFlight.current = true;
    bidReadSequence.current++; bidReadPending.current = false; setBidReadBusy(false);
    const startedRevision = operation.readRevision();
    setBusy(true); setError(""); setSuccess(""); setResult(null); setCustomBids(null); lastAnalysisForm.current = null;
    try {
      const response = await analyzeAdsterraRoiAction(shopeeAccountId, data);
      if (operation.readRevision() !== startedRevision) { setError("Keadaan campaign berubah. Jalankan analisis baru."); return; }
      if (response.success) {
        setBidWritesBlocked(false);
        lastAnalysisForm.current = cloneFormData(data); setResultKind(listKind); setResult(response.result); setLastBlacklistReplacedAt(response.result.config.lastBlacklistReplacedAt?.toISOString() ?? null); setAnalysisVersion((value) => value + 1);
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
    bidReadSequence.current++; bidReadPending.current = false; setBidReadBusy(false);
    setResult(null); setCustomBids(null); setError(""); setSuccess("");
    lastAnalysisForm.current = null;
  }

  const saveBid: NonNullable<CustomBidEditorProps["onSave"]> = async (placementId, bidPrice, expectedPrice) => {
    if (!result || !customBids?.success || bidWritesBlocked || analysisInFlight.current || replaceInFlight.current || bidWriteInFlight.current) {
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
    if (!result || !customBids?.success || bidWritesBlocked || analysisInFlight.current || replaceInFlight.current || bidWriteInFlight.current) {
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
    <div><h3 className="font-semibold">Analisa Placement</h3><p className="text-xs text-slate-500">Analisis → Copy ID → Terapkan dengan konfirmasi.</p></div>
    <div className="flex flex-wrap items-center gap-2 text-sm"><span>Metode aplikasi:</span>{methodBusy ? <span className="text-xs text-slate-500">Memuat…</span> : methodError ? <details className="text-xs text-red-700"><summary className="cursor-pointer">Gagal dibaca · Detail</summary><p className="mt-1 max-w-lg">{methodError}</p></details> : selectedConfig ? <MethodBadge method={listKind}/> : <span className="text-xs text-slate-500">Pilih campaign</span>}{selectedConfig && !methodBusy && !methodError && !listKind && <p className="text-xs text-amber-800">Atur metode di tab Campaign dahulu.</p>}</div>
    {!connected && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Koneksi Adsterra belum dikonfigurasi.</p>}
    <div className="space-y-2">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <div ref={setNotificationTarget}/>
    </div>
    <form onSubmit={submitAnalysis} onChange={invalidateAnalysis} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label className="min-w-0 text-sm font-medium">Campaign<select name="configId" value={selectedConfig} onChange={(e) => setSelectedConfig(e.target.value)} required disabled={busy || replacing || writingBid || !connected} className="mt-1 h-9 w-full min-w-0 rounded-lg border bg-white px-3"><option value="">Pilih campaign</option>{configs.map((config) => <option key={config.id} value={config.id}>{config.label || config.campaignId}</option>)}</select></label>
      <label className="min-w-0 text-sm font-medium">Tanggal Mulai<input type="date" name="dateFrom" required disabled={busy || replacing || writingBid} className="mt-1 h-9 w-full min-w-0 rounded-lg border px-3"/></label>
      <label className="min-w-0 text-sm font-medium">Tanggal Akhir<input type="date" name="dateTill" required disabled={busy || replacing || writingBid} className="mt-1 h-9 w-full min-w-0 rounded-lg border px-3"/></label>
      <label className="min-w-0 text-sm font-medium">Kurs USD → IDR<input name="fxRate" defaultValue="16500" inputMode="decimal" required disabled={busy || replacing || writingBid} className="mt-1 h-9 w-full min-w-0 rounded-lg border px-3"/></label>
      <label className="min-w-0 text-sm font-medium">CSV Komisi Shopee<input type="file" name="file" accept=".csv,text/csv,application/vnd.ms-excel" required disabled={busy || replacing || writingBid} className="mt-1 block w-full min-w-0 max-w-full text-sm"/></label>
      <Button disabled={busy || replacing || writingBid || methodBusy || !listKind || !connected || !configs.length}>{busy ? "Menganalisis..." : "Analisa"}</Button>
    </form>
    {result && resultKind && <>
      <details className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700">
        <summary className="cursor-pointer font-medium text-slate-900">Detail aturan {resultKind === "BLACKLIST" ? "Blacklist" : "Whitelist"}</summary>
        {resultKind === "BLACKLIST"
          ? <><p className="mt-1">Aman jika ROI ≥20% ATAU (ROI &gt;10% DAN CTR &gt;8%). Dengan Biaya Iklan ≥ Rp1.000, placement yang tidak memenuhi kedua jalur AMAN tersebut menjadi kandidat blacklist pada periode analisis. Biaya di bawah Rp1.000 tetap Belum Cukup Spend. CTR dihitung dari klik / impresi × 100; impresi nol membuat CTR tidak tersedia, tetapi jalur ROI ≥20% tetap dapat membuat placement AMAN.</p><p>Jika Replace Blacklist dikonfirmasi, placement lainnya akan dikeluarkan dari blacklist.</p></>
          : <p className="mt-1">Kandidat Whitelist wajib Biaya Iklan ≥ Rp1.000 DAN (ROI ≥20% ATAU (ROI &gt;10% DAN CTR &gt;8%)). Batas biaya wajib untuk kedua jalur. CTR dihitung dari klik / impresi × 100; impresi nol membuat CTR tidak tersedia, tetapi ROI ≥20% tetap dapat memenuhi syarat. Biaya belum cukup, ROI null, serta data invalid/unknown tidak otomatis menjadi kandidat.</p>}
        <p className="mt-1 font-medium">Status tabel adalah hasil analisis periode ini, bukan status placement yang sedang diterapkan di provider.</p>
      </details>
      <div className="flex flex-wrap items-center gap-2 text-xs"><Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={bidReadBusy || replacing || writingBid} onClick={async () => {
        if (bidReadPending.current || operation.isBusy()) return;
        const request = ++bidReadSequence.current, revision = operation.readRevision(); bidReadPending.current = true; setBidReadBusy(true);
        try { const read = await getAdsterraCustomBidsAction(shopeeAccountId, result.config.id); if (request === bidReadSequence.current && operation.readRevision() === revision) setCustomBids(read); }
        catch { if (request === bidReadSequence.current && operation.readRevision() === revision) setCustomBids({ success: false, message: "GET Custom Bid gagal; harga terbaru belum tersedia." }); }
        finally { if (request === bidReadSequence.current) { bidReadPending.current = false; setBidReadBusy(false); } }
      }}>{bidReadBusy ? "Membaca bid…" : "Refresh Custom Bid"}</Button>{bidWritesBlocked && <p>Harga tetap dapat dibaca. Analisa ulang sebelum mengubah bid setelah penerapan yang belum selesai.</p>}</div>
      <AnalysisResult key={analysisVersion} result={result} listKind={resultKind} shopeeName={shopeeAccountName} lastBlacklistReplacedAt={lastBlacklistReplacedAt} customBids={customBids} onSaveBid={saveBid} onDeleteBid={deleteBid} writingBid={writingBid || replacing} bidWritesBlocked={bidWritesBlocked}/>
      <PlacementApplication key={`${analysisVersion}:${resultKind}`} notificationTarget={notificationTarget} accountId={shopeeAccountId} configId={result.config.id} kind={resultKind} candidateCount={resultKind === "BLACKLIST" ? result.analysis.candidatePlacements.length : adsterraWhitelistCandidates(result.analysis.rows).length} getData={() => lastAnalysisForm.current ? cloneFormData(lastAnalysisForm.current) : null} onResult={(response) => {
        if (response.lastBlacklistReplacedAt) setLastBlacklistReplacedAt(response.lastBlacklistReplacedAt);
        // A list rejection is not a failed bid GET. Preserve the last successful
        // read (or the valid snapshot returned by the operation), without granting writes.
        if (response.actual) setCustomBids({ success: true, bids: response.actual.bids });
        setBidWritesBlocked(!["VERIFIED", "NO_CHANGE"].includes(response.status));
      }}/>
    </>}
  </section>;
}

function AnalysisResult({ result, listKind, shopeeName, lastBlacklistReplacedAt, customBids, onSaveBid, onDeleteBid, writingBid, bidWritesBlocked }: { result: Result; listKind: AdsterraAnalysisListKind; shopeeName: string; lastBlacklistReplacedAt: string | null; customBids: AdsterraCustomBidsResult | null; onSaveBid: NonNullable<CustomBidEditorProps["onSave"]>; onDeleteBid: NonNullable<CustomBidEditorProps["onDelete"]>; writingBid: boolean; bidWritesBlocked: boolean }) {
  const analysis = result.analysis;
  const candidateIds = useMemo(() => listKind === "BLACKLIST" ? analysis.candidatePlacements : adsterraWhitelistCandidates(analysis.rows), [analysis, listKind]);
  const clicks = analysis.rows.reduce((sum, row) => sum + row.clicks, 0);
  const stats = [["Biaya Iklan", formatIdr(analysis.totalCostIdr), formatUsd(analysis.totalSpentUsd)], ["Komisi Bersih Shopee", formatIdr(analysis.totalCommission), ""], ["Profit", formatIdr(analysis.totalProfit), ""], ["ROI", formatPercent(analysis.roi), ""], ["Klik Iklan", new Intl.NumberFormat("id-ID").format(clicks), ""], [listKind === "BLACKLIST" ? "Kandidat Blacklist" : "Kandidat Whitelist", String(candidateIds.length), ""]];
  return <div className="min-w-0 space-y-3">
    <div className="grid gap-1 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
      <p className="break-words">Shopee: <b>{shopeeName}</b></p><p className="break-words">Campaign: <b>{result.config.label || result.config.campaignId}</b></p><p className="break-all">Tag Link 1: <b>{result.config.sourceTag}</b></p><p>Periode: <b>{result.dateFrom} – {result.dateTill}</b></p><p>Kurs: <b>{formatIdr(result.fxRate)} / USD</b></p><p>Terakhir Replace Blacklist: <b>{formatBlacklistReplacementTime(lastBlacklistReplacedAt)}</b></p>
    </div>
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-6">{stats.map(([label, value, detail]) => <div key={label} className="min-w-0 rounded-lg border bg-slate-50 p-2"><p className="text-xs font-medium text-slate-500">{label}</p><p className="break-words font-semibold">{value}</p>{detail && <p className="text-xs text-slate-500">{detail}</p>}</div>)}</div>
    <TrafficRoiCandidateList key={listKind} ids={candidateIds} noun="Placement" copyLabel={listKind === "BLACKLIST" ? "Copy Placement" : "Copy Placement Whitelist"} listKind={listKind === "BLACKLIST" ? "blacklist" : "whitelist"}/>
    <details className="text-xs text-slate-500"><summary className="cursor-pointer">Detail Custom Bid</summary><p className="mt-1">Isi harga per Placement untuk Custom Bid Indonesia (ID), lalu klik Simpan. Nilai GLOBAL hanya ditampilkan dan tidak ikut diubah. Harga bid tidak dikonversi kurs.</p></details>
    {customBids && !customBids.success && <p role="status" className="text-sm text-amber-800">{customBids.message}</p>}
    <PlacementTable analysis={analysis} listKind={listKind} customBids={customBids} onSaveBid={onSaveBid} onDeleteBid={onDeleteBid} writeBusy={writingBid} bidWritesBlocked={bidWritesBlocked}/>
  </div>;
}

function cloneFormData(source: FormData) { const clone = new FormData(); for (const [key, value] of source.entries()) clone.append(key, value); return clone; }
