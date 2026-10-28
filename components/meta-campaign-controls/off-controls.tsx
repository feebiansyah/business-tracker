"use client";

import { useEffect, useRef, useState } from "react";
import { executeMetaOffAction, prepareMetaOffAction } from "@/app/shopee/[id]/filter/meta-off-actions";
import type { OffConfirmation, OffExecution, OffKind } from "@/lib/meta-campaign-controls/off-types";
import type { PreviewInput } from "@/lib/meta-campaign-controls/types";
import type { MetaActionLock } from "./action-lock";

const labels = { ALL: "OFF Semua", ADSET: "OFF Set Iklan", AD: "OFF Iklan" };
const kinds = { campaign: "Campaign", adset: "Set iklan", ad: "Iklan" };
const time = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(value));

export function useMetaOffControls(scope: PreviewInput, actionLock: MetaActionLock) {
  const key = JSON.stringify(scope);
  const current = useRef(key), epoch = useRef(0), pending = useRef(false);
  const [busy, setBusy] = useState<"prepare" | "execute" | null>(null);
  const [stored, setStored] = useState<{ key: string; confirmation?: OffConfirmation; result?: OffExecution; error?: string; attempted?: boolean } | null>(null);
  useEffect(() => { current.current = key; epoch.current++; return () => { current.current = ""; }; }, [key]);
  const state = stored?.key === key ? stored : null;
  const lock = (stage: "prepare" | "execute") => { pending.current = true; setBusy(stage); };
  const unlock = (keepConfirmation = false) => { pending.current = false; setBusy(null); actionLock.finish("off", keepConfirmation); };
  async function begin(kind: OffKind, objectId: string) {
    if (pending.current || !actionLock.begin("off")) return;
    const ticket = ++epoch.current; lock("prepare"); setStored(null);
    let confirmed = false;
    try {
      const response = await prepareMetaOffAction({ scope, kind, objectId });
      if (ticket !== epoch.current || current.current !== key) return;
      confirmed = response.success;
      setStored(response.success ? { key, confirmation: response.confirmation } : { key, error: response.message });
    } catch { if (ticket === epoch.current && current.current === key) setStored({ key, error: "Rencana tidak dapat dibaca. Tidak ada eksekusi OFF diminta." }); }
    finally { unlock(confirmed); }
  }
  async function execute() {
    if (pending.current || !state?.confirmation || !actionLock.begin("off")) return;
    const ticket = ++epoch.current; lock("execute");
    const confirmation = state.confirmation;
    setStored({ key, confirmation, attempted: true });
    try {
      const response = await executeMetaOffAction(confirmation.token);
      if (ticket !== epoch.current || current.current !== key) return;
      setStored(response.success ? { key, result: response.result, attempted: true } : { key, error: response.message });
    } catch {
      if (ticket === epoch.current && current.current === key) setStored({ key, attempted: true, error: "Hasil eksekusi terputus/tidak diketahui. POST mungkin sudah diterapkan. Tidak diulang otomatis; baca ulang status sebelum tindakan berikutnya." });
    } finally { unlock(); }
  }
  const clear = () => { if (!pending.current) { epoch.current++; setStored(null); actionLock.clear("off"); } };
  return { busy, confirmation: state?.confirmation, result: state?.result, error: state?.error, attempted: !!state?.attempted, begin, execute, clear, isLocked: () => pending.current };
}

export function MetaOffFeedback({ controls }: { controls: ReturnType<typeof useMetaOffControls> }) {
  const { confirmation, result, busy, error } = controls;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (confirmation) heading.current?.focus(); }, [confirmation]);
  return <div className="min-w-0 space-y-3" aria-live="polite">
    {busy && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{busy === "prepare" ? "Membaca rencana terbaru dari Meta…" : "Menjalankan OFF dan verifikasi… jangan tutup atau pindah target."}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {confirmation && <section aria-label="Konfirmasi OFF" className="min-w-0 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
      <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">Konfirmasi {labels[confirmation.kind]}</h3>
      <p className="break-words">Shopee: {confirmation.target.shopee.name} · WL: {confirmation.target.wl.name} <span className="break-all">({confirmation.target.wl.id})</span></p>
      <p className="break-words">Campaign: {confirmation.target.campaign.name} <span className="break-all">({confirmation.target.campaign.id})</span></p>
      <p className="break-words font-medium">Target {kinds[confirmation.objects[0].kind]}: {confirmation.objects[0].name ?? "Nama tidak tersedia"} <span className="break-all">({confirmation.objects[0].id})</span></p>
      <p>{confirmation.counts.campaign} campaign · {confirmation.counts.adset} set iklan · {confirmation.counts.ad} iklan. {confirmation.counts.needPause} objek belum PAUSED pada pembacaan rencana.</p>
      <p>Operasi ini mengubah data Meta sungguhan menjadi PAUSED, bukan Hapus. Tidak ada ON atau pemulihan otomatis.</p>
      <details><summary className="cursor-pointer font-medium">Daftar nama/ID objek yang dikonfirmasi ({confirmation.objects.length})</summary><ul className="mt-2 space-y-1">{confirmation.objects.map((object) => <li key={object.id} className="break-words">{kinds[object.kind]}: {object.name ?? "Nama tidak tersedia"} <span className="break-all">· {object.id}</span> · {object.configuredStatus ?? "Tidak tersedia"}</li>)}</ul></details>
      <p className="text-xs text-slate-600">Berlaku sampai {time(confirmation.expiresAt)} WIB. Target/daftar dibaca ulang sebelum eksekusi; perubahan memerlukan konfirmasi baru.</p>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={!!busy} onClick={() => void controls.execute()} className="rounded-md bg-red-700 px-3 py-2 font-medium text-white disabled:opacity-50">{busy === "execute" ? "Mematikan…" : "Matikan sesuai rencana"}</button><button type="button" disabled={!!busy} onClick={controls.clear} className="rounded-md border border-slate-300 bg-white px-3 py-2 disabled:opacity-50">Batal</button></div>
    </section>}
    {result && <section aria-label="Hasil OFF" className="min-w-0 space-y-2 rounded-lg border border-slate-300 bg-white p-3 text-sm">
      <h3 className="font-semibold">Hasil OFF: {result.status === "COMPLETE" ? "Terverifikasi lengkap" : "Parsial / belum lengkap"}</h3>
      <p role={result.status === "PARTIAL" ? "alert" : "status"}>{result.message}</p>
      <p className="text-xs text-slate-500">{time(result.finishedAt)} WIB · {result.requests}/100 request Meta · pembacaan akhir: {result.finalRead}</p>
      <div className="max-w-full overflow-x-auto"><table className="w-full min-w-150 text-left text-xs"><thead><tr><th className="p-2">Objek / ID</th><th className="p-2">Hasil</th><th className="p-2">Keterangan</th></tr></thead><tbody>{result.objects.map((row) => <tr key={row.object.id} className="border-t border-slate-200"><td className="p-2">{kinds[row.object.kind]} · {row.object.name ?? "Nama tidak tersedia"}<br/>{row.object.id}</td><td className="p-2 font-medium">{row.state}</td><td className="p-2">{row.message}{row.readAt && <span className="block text-slate-500">GET: {time(row.readAt)} WIB</span>}</td></tr>)}</tbody></table></div>
      {result.newObjects.length > 0 && <p className="text-amber-900">{result.newObjects.length} objek baru ditemukan setelah tindakan; tidak termasuk rencana dan tidak diubah.</p>}
    </section>}
  </div>;
}
