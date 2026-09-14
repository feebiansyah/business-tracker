"use client";

import { useState } from "react";
import { analyzeClickaduRoiAction } from "@/app/shopee/[id]/clickadu-roi/actions";
import { Button } from "@/components/ui/button";
import type { ClickaduAnalysisConfig, ClickaduAnalysisResult } from "@/lib/clickadu-roi/analyze";
import { AnalysisSummary } from "./analysis-summary";
import { CopyCandidatesButton } from "./copy-candidates-button";
import { ZoneTable } from "./zone-table";

export function ClickaduAnalysisWorkflow({ shopeeAccountId, configs }: { shopeeAccountId: number; configs: ClickaduAnalysisConfig[] }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<ClickaduAnalysisResult | null>(null);
  async function run(formData: FormData) { setBusy(true); setError(""); setResult(null); const response = await analyzeClickaduRoiAction(shopeeAccountId, formData); setBusy(false); if (response.success) setResult(response.analysis); else setError(response.message); }
  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div><h3 className="font-semibold text-slate-950">Analisa Clickadu ROI</h3><p className="mt-1 text-sm text-slate-500">Analisis read-only berdasarkan statistik Clickadu dan CSV Shopee.</p></div>
    <form action={run} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><select name="configId" required disabled={busy || !configs.length} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Pilih campaign</option>{configs.map((config) => <option key={config.id} value={config.id}>{config.label || config.campaignId}</option>)}</select><input aria-label="Date From" type="date" name="dateFrom" required className="h-9 rounded-lg border border-slate-200 px-3 text-sm"/><input aria-label="Date Till" type="date" name="dateTill" required className="h-9 rounded-lg border border-slate-200 px-3 text-sm"/><input aria-label="Kurs USD ke IDR" name="fxRate" inputMode="decimal" defaultValue="16500" required className="h-9 rounded-lg border border-slate-200 px-3 text-sm"/><input aria-label="CSV Shopee" type="file" name="file" accept=".csv,text/csv,application/vnd.ms-excel" required className="block min-w-0 text-sm"/><Button className="sm:col-span-2 xl:col-span-1" disabled={busy || !configs.length}>{busy ? "Menganalisa…" : "Analisa"}</Button></form>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {result && <div className="space-y-4"><div className="text-sm text-slate-500">{result.config.label || result.config.campaignId} · {result.dateFrom} – {result.dateTill}</div><AnalysisSummary analysis={result.analysis}/><ZoneTable analysis={result.analysis}/><div className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">Zone Candidate Blacklist</p><p className="mt-1 break-words text-sm text-slate-600">{result.analysis.candidateZones.join(", ") || "Tidak ada kandidat."}</p></div><CopyCandidatesButton zones={result.analysis.candidateZones}/></div></div></div>}
  </section>;
}
