"use client";

import { useEffect, useId, useRef, useState } from "react";
import { executeMetaBudgetAction, getMetaBudgetSnapshotAction, prepareMetaBudgetAction } from "@/app/shopee/[id]/filter/meta-budget-actions";
import { formatIdrBudget, parseIdrInput, showBudgetValue } from "@/lib/meta-campaign-controls/budget-money";
import { adSetDailyTotal, budgetEligibility } from "@/lib/meta-campaign-controls/budget-state";
import type { BudgetConfirmation, BudgetExecution, BudgetObject, BudgetSnapshot } from "@/lib/meta-campaign-controls/budget-types";
import type { PreviewInput } from "@/lib/meta-campaign-controls/types";
import type { MetaActionLock } from "./action-lock";

const time = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(value));
const labels = { campaign: "Campaign", adset: "Set iklan" };
type Stored = { key: string; snapshot?: BudgetSnapshot; confirmation?: BudgetConfirmation; result?: BudgetExecution; error?: string };

export function useMetaBudgetControls(scope: PreviewInput, lock: MetaActionLock) {
  const key = JSON.stringify(scope), current = useRef(key), epoch = useRef(0);
  const [stored, setStored] = useState<Stored | null>(null);
  const [stage, setStage] = useState<"read" | "prepare" | "execute" | null>(null);
  useEffect(() => { current.current = key; epoch.current++; return () => { current.current = ""; }; }, [key]);
  const state = stored?.key === key ? stored : null;
  async function run(kind: "read" | "prepare" | "execute", object?: BudgetObject, amount?: string) {
    if (!lock.begin("budget")) return;
    const ticket = ++epoch.current;
    setStage(kind);
    let keepConfirmation = false;
    const valid = () => ticket === epoch.current && current.current === key;
    try {
      if (kind === "read") {
        setStored(null);
        const response = await getMetaBudgetSnapshotAction(scope);
        if (valid()) setStored(response.success ? { key, snapshot: response.snapshot } : { key, error: response.message });
      } else if (kind === "prepare" && object && amount !== undefined) {
        const normalized = parseIdrInput(amount);
        const response = await prepareMetaBudgetAction({ scope, kind: object.kind, objectId: object.id, amount: normalized });
        if (valid()) {
          keepConfirmation = response.success;
          setStored({ key, snapshot: state?.snapshot, ...(response.success ? { confirmation: response.confirmation } : { error: response.message }) });
        }
      } else if (kind === "execute" && state?.confirmation) {
        const result = await executeMetaBudgetAction(state.confirmation.token);
        if (valid()) setStored({ key, result, snapshot: result.snapshot });
      }
    } catch {
      if (valid()) setStored({ key, ...(kind !== "execute" ? { snapshot: state?.snapshot } : {}), error: kind === "execute" ? "Hasil penyimpanan terputus/tidak diketahui. POST mungkin sudah diterapkan. Tidak diulang; baca ulang anggaran sebelum tindakan berikutnya." : "Pembacaan/input anggaran gagal. Gunakan rupiah bulat, misalnya Rp500.000; tidak ada POST dijalankan." });
    } finally {
      if (valid()) setStage(null);
      lock.finish("budget", keepConfirmation);
    }
  }
  const cancel = () => { if (!lock.isLocked()) { epoch.current++; setStored(state?.snapshot ? { key, snapshot: state.snapshot } : null); lock.clear("budget"); } };
  const clear = () => { if (!lock.isLocked()) { epoch.current++; setStored(null); lock.clear("budget"); } };
  return { ...state, stage, read: () => run("read"), prepare: (object: BudgetObject, amount: string) => run("prepare", object, amount), execute: () => run("execute"), cancel, clear };
}

function BudgetEditor({ object, snapshot, disabled, prepare }: { object: BudgetObject; snapshot: BudgetSnapshot; disabled: boolean; prepare(object: BudgetObject, amount: string): Promise<void> }) {
  const id = useId(), [value, setValue] = useState(""), [error, setError] = useState<string | null>(null);
  const eligible = budgetEligibility(snapshot, object.kind, object.id);
  return <div className="min-w-0 space-y-2 border-t border-slate-100 pt-2 text-sm">
    {eligible.editable ? <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-1"><p className="min-w-0 break-words"><span className="text-xs text-slate-500">{labels[object.kind]} · </span>{object.name ?? "Nama tidak tersedia"}</p><strong className="whitespace-nowrap">{showBudgetValue(object.daily, snapshot.currency)}/hari</strong></div>
      : <p className="break-words text-xs text-slate-600">{eligible.mode === "ADSET" && object.kind === "campaign" ? "Anggaran dikelola per set iklan" : eligible.reason}</p>}
    {eligible.editable && <form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); try { parseIdrInput(value); setError(null); void prepare(object, value); } catch { setError("Rupiah bulat positif: 500000 atau Rp500.000. Tanpa pecahan, koma atau eksponen; maksimal 9.007.199.254.740.991."); } }}>
      <div className="min-w-0 flex-1 basis-40"><label htmlFor={id} className="mb-1 block text-xs font-medium">Nominal baru (IDR)</label><input id={id} type="text" inputMode="text" value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)} placeholder="Rp500.000" autoComplete="off" aria-describedby={`${id}-help`} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 disabled:opacity-50"/></div>
      <button type="submit" disabled={disabled} className="h-9 rounded-md bg-blue-700 px-3 text-sm font-medium text-white disabled:opacity-50">Ubah Anggaran</button>
      {error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}
    </form>}
    <div className="text-xs text-slate-500"><p className="w-fit rounded py-1 focus-visible:outline-2 focus-visible:outline-blue-600">Detail anggaran {labels[object.kind]}</p><div className="mt-1 space-y-1 break-words"><p className="break-all">{object.name ?? "Nama tidak tersedia"} · ID: {object.id}</p><p>Harian: {showBudgetValue(object.daily, snapshot.currency)} · Lifetime: {showBudgetValue(object.lifetime, snapshot.currency)}</p><p>Jadwal anggaran: {object.schedule === "TRUE" ? "Aktif" : object.schedule === "FALSE" ? "Nonaktif" : "Tidak tersedia / belum terbukti"}. {eligible.reason}</p><p id={`${id}-help`}>Rupiah utuh; titik hanya untuk ribuan. Tidak ada pembulatan/kenaikan otomatis.</p></div></div>
  </div>;
}

export function MetaBudgetControls({ controls, lock, disabled }: { controls: ReturnType<typeof useMetaBudgetControls>; lock: MetaActionLock; disabled: boolean }) {
  const { snapshot, confirmation, result, stage, error } = controls;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (confirmation) heading.current?.focus(); }, [confirmation]);
  const total = snapshot ? adSetDailyTotal(snapshot) : null;
  return <section aria-label="Anggaran harian Meta" className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Anggaran Harian</h3><button type="button" disabled={disabled || lock.busy || lock.owner !== null} onClick={() => void controls.read()} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-blue-800 disabled:opacity-50">{stage === "read" ? "Membaca…" : snapshot ? "Baca ulang" : "Baca anggaran"}</button></div>
    <div className="text-xs text-slate-500"><p className="w-fit rounded py-1 focus-visible:outline-2 focus-visible:outline-blue-600">Informasi anggaran</p><div className="mt-1 space-y-1 break-words"><p>IDR harian saja. Pembacaan on-demand; tidak mengubah status, jadwal, bid, sharing atau tingkat anggaran. Batas minimum mengikuti Meta tanpa penyesuaian otomatis.</p>{snapshot && <><p>GET: {time(snapshot.readAt)} WIB · Mata uang WL: {snapshot.currency ?? "Tidak tersedia"} · {snapshot.complete ? "Daftar set lengkap" : "Pembacaan parsial"}</p><p>Berbagi anggaran set iklan: {snapshot.sharing === "TRUE" ? "Aktif (tetap mengikuti Meta)" : snapshot.sharing === "FALSE" ? "Nonaktif" : "Tidak tersedia; tidak diasumsikan nonaktif"}.</p>{snapshot.adSets.length > 0 && <p>Ringkasan daily budget set: {total === null ? "Tidak tersedia / belum lengkap" : snapshot.currency === "IDR" ? formatIdrBudget(total) : `${total} unit API`}. Bukan nominal untuk ditulis ke masing-masing set.</p>}</>}</div></div>
    {stage && stage !== "read" && <p role="status" className="text-sm text-amber-900">{stage === "prepare" ? "Membaca sumber/nilai terbaru dan menyiapkan konfirmasi…" : "Menyimpan satu daily_budget dan memverifikasi GET… jangan tutup modal."}</p>}
    {error && <p role="alert" className="break-words text-sm text-red-800">{error}</p>}
    {result && <div role={result.status === "VERIFIED" || result.status === "ALREADY_MATCH" ? "status" : "alert"} className="rounded-md bg-slate-100 p-2 text-sm"><p className="font-semibold">Hasil anggaran: {result.status}</p><p className="break-words">{result.message}</p><div className="mt-1 text-xs text-slate-600"><p className="w-fit">Informasi hasil</p><p>{result.requests}/100 request Meta. Daftar Filter/Fix tetap mengikuti Sync existing, bukan snapshot ini.</p></div></div>}
    {confirmation && <div className="min-w-0 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
      <h4 ref={heading} tabIndex={-1} className="font-semibold outline-none">Konfirmasi Edit Anggaran</h4>
      <p className="break-words">Shopee: {confirmation.target.shopee.name} · WL: {confirmation.target.wl.name} <span className="break-all">({confirmation.target.wl.id})</span></p>
      <p className="break-words">Campaign: {confirmation.target.campaign.name} <span className="break-all">({confirmation.target.campaign.id})</span></p>
      <p className="break-words">{labels[confirmation.object.kind]}: {confirmation.object.name ?? "Nama tidak tersedia"} <span className="break-all">({confirmation.object.id})</span></p>
      <p>1 objek · Tingkat: {confirmation.mode === "CAMPAIGN" ? "Campaign" : "Satu set iklan"} · Mata uang: IDR</p>
      <p><strong>{formatIdrBudget(confirmation.oldAmount)} → {formatIdrBudget(confirmation.newAmount)}</strong> per hari.</p>
      <p>Ini mengubah anggaran Meta sungguhan hanya pada target tersebut. Tidak mengubah status, parent, saudara, jadwal atau sharing.</p>
      <p className="text-xs">Konfirmasi berlaku sampai {time(confirmation.expiresAt)} WIB. Perubahan sumber/nilai/relasi memerlukan konfirmasi ulang.</p>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={lock.busy} onClick={() => void controls.execute()} className="rounded-md bg-blue-700 px-3 py-2 font-medium text-white disabled:opacity-50">{stage === "execute" ? "Menyimpan…" : "Simpan anggaran sesuai konfirmasi"}</button><button type="button" disabled={lock.busy} onClick={controls.cancel} className="rounded-md border border-slate-300 bg-white px-3 py-2 disabled:opacity-50">Batal</button></div>
    </div>}
    {snapshot && <div className="min-w-0 space-y-3">
      {snapshot.warnings.map((warning, index) => <p role="alert" key={index} className="text-xs text-amber-900">{warning}</p>)}
      <BudgetEditor key={`campaign:${snapshot.campaign.id}`} object={snapshot.campaign} snapshot={snapshot} disabled={lock.busy || lock.owner !== null} prepare={controls.prepare}/>
      {snapshot.adSets.map((object) => <BudgetEditor key={`adset:${object.id}`} object={object} snapshot={snapshot} disabled={lock.busy || lock.owner !== null} prepare={controls.prepare}/>)}
      {!snapshot.adSets.length && <p className="text-xs text-slate-500">{snapshot.complete ? "Tidak ada set iklan pada respons Meta." : "Belum ada set iklan terverifikasi; bukan bukti daftar kosong."}</p>}
    </div>}
  </section>;
}
