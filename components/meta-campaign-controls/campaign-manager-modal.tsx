"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { getMetaCampaignPreviewAction } from "@/app/shopee/[id]/filter/meta-control-actions";
import type { MetaObjectView, PreviewInput } from "@/lib/meta-campaign-controls/types";
import { createPreviewStore } from "./preview-state";
import { MetaOffFeedback, useMetaOffControls } from "./off-controls";
import { useMetaActionLock } from "./action-lock";
import { MetaBudgetControls, useMetaBudgetControls } from "./budget-controls";

const readTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Jakarta" });

export const createCampaignPreviewStore = () => createPreviewStore(getMetaCampaignPreviewAction);

function StatusBadge({ object }: { object: MetaObjectView }) {
  const status = object.effectiveStatus ?? object.configuredStatus;
  const label = status === "ACTIVE" ? object.effectiveStatus ? "Aktif" : "ACTIVE (konfigurasi)" : status === "PAUSED" ? "OFF" : status ?? "Status belum tersedia";
  return <span className={`inline-flex max-w-full break-all rounded-full px-2 py-0.5 text-xs font-medium ${status === "ACTIVE" && object.effectiveStatus ? "bg-emerald-50 text-emerald-800" : status === "PAUSED" ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-900"}`}>{label}</span>;
}

function ObjectStatus({ object, action }: { object: MetaObjectView; action: ReactNode }) {
  return <div className="min-w-0 space-y-1 text-sm">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1"><p className="break-words font-medium text-slate-950">{object.name ?? "Nama tidak tersedia"}</p><StatusBadge object={object}/></div>
      {action}
    </div>
    <div className="text-xs"><div className="space-y-1 pb-1">
    <p className="break-all text-xs text-slate-500">ID: {object.id}</p>
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <div><dt className="inline text-slate-500">Konfigurasi: </dt><dd className="inline break-all font-medium">{object.configuredStatus ?? "Tidak tersedia"}</dd></div>
      <div><dt className="inline text-slate-500">Penayangan (effective): </dt><dd className="inline break-all font-medium">{object.effectiveStatus ?? "Tidak tersedia"}</dd></div>
    </dl>
    {!object.diagnostics.available ? <p className="text-xs text-slate-500">Informasi masalah tidak tersedia dari Meta pada pembacaan ini.</p>
      : object.diagnostics.messages.length === 0 ? <p className="text-xs text-slate-500">Meta mengembalikan daftar masalah kosong pada pembacaan ini.</p>
        : <ul className="space-y-1 text-xs text-amber-800">{object.diagnostics.messages.map((message, index) => <li key={index} className="break-words">{message}</li>)}</ul>}
    </div></div>
  </div>;
}

export function CampaignManagerModal({ shopeeAccountId, campaignId, mode, campaignName, onClose, store, onBusyChange }: PreviewInput & { campaignName: string; onClose(): void; store: ReturnType<typeof createCampaignPreviewStore>; onBusyChange(busy: boolean): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const scope = { shopeeAccountId, campaignId, mode };
  const actionLock = useMetaActionLock(JSON.stringify(scope), onBusyChange);
  const controls = useMetaOffControls(scope, actionLock);
  const budgetControls = useMetaBudgetControls(scope, actionLock);
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
  const data = controls.result?.hierarchy ?? (result?.success ? result.data : null);
  const verified = new Map(controls.result?.verifiedObjects.map((object) => [object.id, object]));
  const display = (object: MetaObjectView) => verified.get(object.id) ?? object;
  const actionDisabled = state.loading || actionLock.busy || actionLock.owner !== null;
  return <dialog ref={dialog} aria-labelledby={titleId} closedby={actionLock.busy ? "none" : "closerequest"}
    onKeyDown={(event) => { if (event.key === "Escape" && actionLock.isLocked()) event.preventDefault(); }}
    onCancel={(event) => { event.preventDefault(); if (!actionLock.isLocked()) onClose(); }}
    onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (!actionLock.isLocked() && event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose(); }}
    className="m-auto max-h-[95dvh] w-[calc(100%-1rem)] max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60">
    <div className="flex max-h-[95dvh] min-w-0 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white p-3 sm:p-4">
        <div className="min-w-0 space-y-1"><h2 id={titleId} className="text-base font-semibold sm:text-lg">Kelola Iklan Meta</h2><div className="flex min-w-0 flex-wrap items-center gap-2"><p className="break-words text-sm font-medium">{campaignName}</p>{data && <StatusBadge object={display(data.campaign)}/>}</div>{data && <><p className="break-words text-xs text-slate-600">{data.target.shopee.name} · {data.target.wl.name}</p><p className="text-xs text-slate-500">{data.adSets.length} Ad Set · {data.loadedAdCount} Iklan berhasil dimuat</p></>}</div>
        <button type="button" disabled={actionLock.busy} onClick={() => { if (!actionLock.isLocked()) onClose(); }} aria-label="Tutup Kelola Iklan" autoFocus className="size-9 shrink-0 rounded-md text-xl hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50">×</button>
      </header>
      <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto p-3 sm:p-4" aria-busy={state.loading}>
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600"><p className="font-medium">Informasi dan status Meta</p><div className="mt-1 space-y-2 break-words">
          {data && <><p className="break-all">Campaign ID: {data.target.campaign.id} · WL ID: {data.target.wl.id} · Shopee ID: {data.target.shopee.id}</p><p>Pembacaan terbaru: {readTime.format(new Date(data.readAt))} WIB</p></>}
          <p>Pembacaan tidak mengubah data. OFF hanya berjalan setelah konfirmasi rencana server. Konfigurasi ACTIVE tidak otomatis berarti sedang tayang; effective status dapat dipengaruhi campaign atau set iklan induk. Error atau status tidak tersedia bukan berarti OFF.</p>
          <p>Snapshot live sementara, bukan histori atau bukti akses write. Status dapat berubah selama pembacaan; daftar Filter/Fix tetap mengikuti Sync existing. Sync database tidak otomatis dilakukan.</p>
          {controls.attempted && <p>Utamakan hasil GET terverifikasi. Objek lain yang belum dibaca ulang masih memakai snapshot awal; Refresh manual untuk hierarchy terbaru.</p>}
        </div></div>
        <MetaOffFeedback controls={controls}/>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-sm font-medium">{state.loading ? "Sedang membaca hierarchy…" : !result?.success ? "Pembacaan gagal" : data?.readState === "COMPLETE" ? "Pembacaan lengkap" : data?.readState === "INTEGRITY_ERROR" ? "Gagal validasi integritas — hierarchy tidak lengkap" : "Pembacaan parsial — hierarchy belum lengkap"}</p>
          <button type="button" disabled={state.loading || actionLock.busy} onClick={() => { if (!actionLock.isLocked()) { controls.clear(); budgetControls.clear(); store.refresh(); } }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">{state.loading ? "Memuat…" : "Refresh"}</button>
        </div>
        {!state.loading && result && !result.success && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{result.message}</p>}
        {data && <>
          <MetaBudgetControls controls={budgetControls} lock={actionLock} disabled={state.loading}/>
          {data.warnings.length > 0 && <ul role="alert" className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{data.warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul>}
          <section aria-label="Campaign" className="rounded-lg border border-slate-200 bg-white p-3"><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Campaign</h3><ObjectStatus object={display(data.campaign)} action={<button type="button" disabled={actionDisabled || data.readState !== "COMPLETE"} onClick={() => void controls.begin("ALL", data.campaign.id)} className="shrink-0 rounded-md bg-red-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">OFF Semua</button>}/>{data.readState !== "COMPLETE" && <p className="mt-1 text-xs text-amber-800">OFF Semua memerlukan hierarchy lengkap.</p>}</section>
          {data.adSets.length === 0 && <p className="p-3 text-sm text-slate-500">{data.adSetsComplete ? "Meta mengembalikan daftar set iklan kosong untuk campaign ini." : "Belum ada set iklan yang berhasil diverifikasi; jangan dianggap campaign kosong."}</p>}
          {data.adSets.map((adSet) => <section key={adSet.id} aria-label={`Set iklan ${adSet.id}`} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="p-3"><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Ad Set · {adSet.ads.length} Iklan berhasil dimuat</h3><ObjectStatus object={display(adSet)} action={<button type="button" disabled={actionDisabled} onClick={() => void controls.begin("ADSET", adSet.id)} className="shrink-0 rounded-md border border-red-300 px-3 py-2 text-xs font-medium text-red-800 disabled:opacity-50">OFF Set Iklan</button>}/></div>
            <div className="border-t border-slate-100"><p className="px-3 py-2 text-sm font-medium text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600">Iklan ({adSet.ads.length})</p><div className="divide-y divide-slate-100">{adSet.ads.map((ad) => <div key={ad.id} className="min-w-0 p-3 sm:pl-6"><ObjectStatus object={display(ad)} action={<button type="button" disabled={actionDisabled} onClick={() => void controls.begin("AD", ad.id)} aria-label={`OFF Iklan ${ad.name ?? ad.id}`} className="shrink-0 rounded-md border border-red-300 px-3 py-2 text-xs font-medium text-red-800 disabled:opacity-50">OFF</button>}/></div>)}</div>
            {adSet.ads.length === 0 && <p className="p-3 text-sm text-slate-500">{data.adsComplete ? "Tidak ada iklan pada set ini dalam respons Meta." : "Belum ada iklan terverifikasi pada set ini; pembacaan iklan belum lengkap."}</p>}</div>
          </section>)}
        </>}
      </div>
    </div>
  </dialog>;
}
