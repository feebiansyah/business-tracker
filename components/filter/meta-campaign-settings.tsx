"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMetaCampaignSettingsAction } from "@/app/shopee/[id]/filter/meta-settings-actions";
import type { CampaignMode } from "@/lib/filter/campaign-modes";
import type { MetaAdSetSettings, MetaCampaignSettingsActionResult } from "@/lib/meta-campaign-settings/types";
import { createMetaSettingsRequestGate } from "./meta-campaign-settings-state";
import { resolvePostType, type ManualPostType } from "@/lib/campaign-post-type/model";

const fields: Array<[keyof Pick<MetaAdSetSettings, "contentType" | "placements" | "age" | "locations" | "gender">, string]> = [
  ["contentType", "Jenis konten"], ["placements", "Penempatan"], ["age", "Umur"], ["locations", "Lokasi"], ["gender", "Gender"],
];

const isContentTypeWarning = (warning: string) => warning.startsWith("Jenis konten");

function SettingsCard({ value, reference = false, manualType }: { value: MetaAdSetSettings; reference?: boolean; manualType: ManualPostType | null }) {
  return <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
    <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-950">{value.name}</p><p className="break-all text-xs text-slate-500">ID: {value.id}</p></div>
      {reference ? <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">Acuan set iklan tertua</span> : null}
    </div>
    <dl className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {fields.map(([key, label]) => <div key={key} className="min-w-0 rounded-md bg-slate-50 p-2"><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-800">{key === "contentType" ? resolvePostType(manualType, value[key]) : value[key]}</dd></div>)}
    </dl>
  </section>;
}

export function MetaCampaignSettings({ mode, shopeeAccountId, campaignId }: { mode: CampaignMode; shopeeAccountId: number; campaignId: number }) {
  const [result, setResult] = useState<MetaCampaignSettingsActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const gateRef = useRef(createMetaSettingsRequestGate());
  const load = useCallback(async () => {
    const gate = gateRef.current;
    const request = gate.begin();
    if (request === null) return;
    setBusy(true);
    let next: MetaCampaignSettingsActionResult;
    try { next = await getMetaCampaignSettingsAction({ mode, shopeeAccountId, campaignId }); }
    catch { next = { success: false, message: "Pengaturan Meta belum dapat dibaca. Tidak ada data yang diubah." }; }
    if (!gate.isCurrent(request)) return;
    gate.finish(request);
    setResult(next);
    setBusy(false);
  }, [campaignId, mode, shopeeAccountId]);
  useEffect(() => { const gate = gateRef.current; void load(); return () => { gate.invalidate(); }; }, [load]);

  const warnings = result?.success ? result.data.warnings : [];
  const visibleWarnings = warnings.filter((warning) => !isContentTypeWarning(warning));
  const showPartialNotice = Boolean(result?.success && result.data.partial && (visibleWarnings.length > 0 || warnings.length === 0));

  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-500">Pengaturan otomatis dibaca dari Meta. Jenis manual hanya untuk tampilan aplikasi; tidak mengubah iklan.</p>
      <button type="button" disabled={busy} onClick={() => void load()} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Membaca…" : "Baca ulang"}</button>
    </div>
    {busy && !result ? <p className="rounded-lg bg-slate-100 p-4 text-center text-sm text-slate-500">Membaca pengaturan Meta…</p> : null}
    {result && !result.success ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{result.message}</p> : null}
    {result?.success ? <>
      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <span>Shopee: <strong className="text-slate-800">{result.target.shopeeName}</strong></span><span>WL: <strong className="text-slate-800">{result.target.wlName}</strong></span><span>Set iklan: <strong className="text-slate-800">{result.data.adSetCount}</strong></span>
      </div>
      {showPartialNotice ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><strong>Data sebagian.</strong> Kesamaan seluruh set iklan belum dapat dipastikan.{visibleWarnings.map((warning) => <p key={warning} className="mt-1 break-words text-xs">{warning}</p>)}</div> : null}
      {!result.data.reference ? <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">Set iklan belum tersedia atau belum dapat dibaca.</p> : <SettingsCard value={result.data.reference} reference manualType={result.manualPostType} />}
      {result.data.sameAcrossAll ? <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700">Sama pada {result.data.matchingAdSetCount} Set Iklan.</p> : null}
      {result.data.differences.length ? <div className="space-y-2"><p className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">Ada {result.data.differences.length} Set Iklan dengan pengaturan berbeda dari acuan.</p>{result.data.differences.map((difference) => <SettingsCard key={difference.id} value={difference} manualType={result.manualPostType} />)}</div> : null}
    </> : null}
  </div>;
}
