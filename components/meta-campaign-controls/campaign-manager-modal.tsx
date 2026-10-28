"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { getMetaCampaignPreviewAction } from "@/app/shopee/[id]/filter/meta-control-actions";
import type { MetaObjectView, PreviewInput } from "@/lib/meta-campaign-controls/types";
import { createPreviewStore } from "./preview-state";

const readTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Jakarta" });

export const createCampaignPreviewStore = () => createPreviewStore(getMetaCampaignPreviewAction);

function ObjectStatus({ object }: { object: MetaObjectView }) {
  return <div className="min-w-0 space-y-1 text-sm">
    <p className="break-words font-medium text-slate-950">{object.name ?? "Nama tidak tersedia"}</p>
    <p className="break-all text-xs text-slate-500">ID: {object.id}</p>
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <div><dt className="inline text-slate-500">Konfigurasi: </dt><dd className="inline break-all font-medium">{object.configuredStatus ?? "Tidak tersedia"}</dd></div>
      <div><dt className="inline text-slate-500">Penayangan (effective): </dt><dd className="inline break-all font-medium">{object.effectiveStatus ?? "Tidak tersedia"}</dd></div>
    </dl>
    {!object.diagnostics.available ? <p className="text-xs text-slate-500">Informasi masalah tidak tersedia dari Meta pada pembacaan ini.</p>
      : object.diagnostics.messages.length === 0 ? <p className="text-xs text-slate-500">Meta mengembalikan daftar masalah kosong pada pembacaan ini.</p>
        : <ul className="space-y-1 text-xs text-amber-800">{object.diagnostics.messages.map((message, index) => <li key={index} className="break-words">{message}</li>)}</ul>}
  </div>;
}

export function CampaignManagerModal({ shopeeAccountId, campaignId, mode, campaignName, onClose, store }: PreviewInput & { campaignName: string; onClose(): void; store: ReturnType<typeof createCampaignPreviewStore> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.select({ shopeeAccountId, campaignId, mode });
    return () => store.cancel();
  }, [shopeeAccountId, campaignId, mode, store]);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  const result = state.result;
  const data = result?.success ? result.data : null;
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose(); }}
    className="m-auto max-h-[95dvh] w-[calc(100%-1rem)] max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60">
    <div className="flex max-h-[95dvh] min-w-0 flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-3 sm:p-4">
        <div className="min-w-0"><h2 id={titleId} className="text-base font-semibold sm:text-lg">Kelola Iklan Meta · Mode Baca</h2><p className="mt-1 break-words text-sm text-slate-600">{campaignName}</p></div>
        <button type="button" onClick={onClose} aria-label="Tutup Kelola Iklan" autoFocus className="size-9 shrink-0 rounded-md text-xl hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600">×</button>
      </header>
      <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto p-3 sm:p-4" aria-busy={state.loading}>
        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Tahap 1 hanya membaca data Meta. Tidak ada aksi OFF/ON/DELETE. Konfigurasi ACTIVE tidak otomatis berarti sedang tayang; lihat status penayangan dan pengaruh parent.</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-sm font-medium">{state.loading ? "Sedang membaca hierarchy…" : !result?.success ? "Pembacaan gagal" : data?.readState === "COMPLETE" ? "Pembacaan lengkap" : data?.readState === "INTEGRITY_ERROR" ? "Gagal validasi integritas — hierarchy tidak lengkap" : "Pembacaan parsial — hierarchy belum lengkap"}</p>
          <button type="button" disabled={state.loading} onClick={() => store.refresh()} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">{state.loading ? "Memuat…" : "Refresh"}</button>
        </div>
        {!state.loading && result && !result.success && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{result.message}</p>}
        {data && <>
          <dl className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:grid-cols-2">
            <div className="break-words"><dt className="text-xs text-slate-500">Akun Shopee</dt><dd>{data.target.shopee.name}</dd></div>
            <div className="break-words"><dt className="text-xs text-slate-500">WL</dt><dd>{data.target.wl.name} · <span className="break-all">{data.target.wl.id}</span></dd></div>
            <div><dt className="text-xs text-slate-500">Berhasil dimuat</dt><dd>{data.adSets.length} set iklan · {data.loadedAdCount} iklan</dd></div>
            <div><dt className="text-xs text-slate-500">Pembacaan terbaru (WIB)</dt><dd>{readTime.format(new Date(data.readAt))} WIB</dd></div>
          </dl>
          {data.warnings.length > 0 && <ul role="alert" className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{data.warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul>}
          <section aria-label="Campaign" className="rounded-lg border border-slate-200 bg-white p-3"><h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Campaign</h3><ObjectStatus object={data.campaign}/></section>
          {data.adSets.length === 0 && <p className="p-3 text-sm text-slate-500">{data.adSetsComplete ? "Meta mengembalikan daftar set iklan kosong untuk campaign ini." : "Belum ada set iklan yang berhasil diverifikasi; jangan dianggap campaign kosong."}</p>}
          {data.adSets.map((adSet) => <section key={adSet.id} aria-label={`Set iklan ${adSet.id}`} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-100 p-3"><h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Set Iklan · {adSet.ads.length} iklan berhasil dimuat</h3><ObjectStatus object={adSet}/></div>
            <div className="divide-y divide-slate-100">{adSet.ads.map((ad) => <div key={ad.id} className="min-w-0 p-3 sm:pl-6"><p className="mb-1 text-xs font-semibold text-slate-500">Iklan</p><ObjectStatus object={ad}/></div>)}</div>
            {adSet.ads.length === 0 && <p className="p-3 text-sm text-slate-500">{data.adsComplete ? "Tidak ada iklan pada set ini dalam respons Meta." : "Belum ada iklan terverifikasi pada set ini; pembacaan iklan belum lengkap."}</p>}
          </section>)}
          <p className="text-xs text-slate-500">Snapshot live sementara, bukan histori atau bukti akses write. Status dapat berubah selama pembacaan; daftar Filter/Fix tetap mengikuti Sync existing.</p>
        </>}
      </div>
    </div>
  </dialog>;
}
