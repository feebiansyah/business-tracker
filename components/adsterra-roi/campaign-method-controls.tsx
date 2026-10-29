"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelAdsterraMethod, executeAdsterraMethod, prepareAdsterraMethod } from "@/app/shopee/[id]/adsterra-roi/method-actions";
import type { MethodInfo, ListKind } from "@/lib/adsterra-operations/types";
import type { MethodPreview } from "@/lib/adsterra-operations/method-plan";
import { useAdsterraOperation } from "./operation-context";
import { MethodBadge, OperationDialog, OperationNotice } from "./operation-dialog";

const labels = { READY: "Siap", NOT_APPLIED: "Perlu diterapkan", LIST_CHANGED: "Daftar berubah", CONFLICT: "Konflik", UNVERIFIABLE: "Perlu diperiksa" };
export function CampaignMethodControls({ accountId, configId, info, busy }: {
  accountId: number; configId: number; info?: MethodInfo; busy: boolean;
}) {
  const operation = useAdsterraOperation(), pending = useRef(false), key = `campaign-method-${configId}`;
  const [kind, setKind] = useState<ListKind | "">("");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<MethodPreview | null>(null), [working, setWorking] = useState(false), [message, setMessage] = useState("");
  async function prepare() {
    if (!kind || pending.current || !operation.begin(key)) return;
    pending.current = true; setWorking(true); setMessage(""); let hold = false;
    try {
      const response = await prepareAdsterraMethod(accountId, configId, kind);
      if (!response.success) setMessage(response.message);
      else { setPreview(response.preview); hold = !!response.preview.token; }
    } catch { setMessage("Persiapan gagal; tidak ada perubahan provider dari persiapan."); }
    finally { pending.current = false; setWorking(false); if (!hold) operation.end(key); }
  }
  async function finish(confirm: boolean) {
    if (!preview || pending.current) return;
    pending.current = true; setWorking(true);
    try {
      if (confirm) {
        const response = await executeAdsterraMethod(accountId, configId, preview.token);
        setMessage(response.success ? `${response.result.status}: ${response.result.message} ${response.result.writeWarnings.join(" ")}` : response.message);
      } else if (preview.token) {
        const response = await cancelAdsterraMethod(accountId, configId, preview.token);
        if (!response.success) setMessage(response.message);
      }
    } catch { setMessage("Hasil belum dapat dipastikan. Jangan mengulang write; periksa/pulihkan operasi."); }
    finally { pending.current = false; setWorking(false); setPreview(null); setOpen(false); operation.end(key, true); }
  }
  function close() { if (pending.current) return; if (preview) void finish(false); else setOpen(false); }
  return <div className="min-w-36 max-w-64 space-y-1 text-xs">
    {info?.status === "SUCCESS" ? <MethodBadge method={info.method?.placementMethod ?? null}/> : <span className="font-medium text-amber-800">{busy && !info ? "Memuat metode…" : "Belum tersedia"}</span>}
    <p className={info?.readiness === "READY" ? "text-emerald-700" : "text-slate-600"}>{info ? labels[info.readiness] : "Perlu diperiksa"}</p>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="ghost" className="h-7 px-1 text-xs text-blue-700" disabled={operation.busy || busy || info?.status !== "SUCCESS"} onClick={() => setOpen(true)} aria-label={`Atur metode campaign config ${configId}`}>{info?.method?.placementMethod ? "Ubah" : "Atur"}</Button>
      <details><summary className="cursor-pointer text-slate-500">Detail kesiapan</summary><p className="mt-1 break-words">{busy && !info ? "Menunggu pembacaan metadata dan daftar API dalam batch." : info?.message ?? "Metadata metode belum dimuat."}</p>{info?.readAt && <p className="mt-1">Dibaca: {new Date(info.readAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>}</details>
    </div>
    {open && <OperationDialog title={preview ? "Konfirmasi metode aplikasi" : "Atur metode aplikasi"} busy={working} onClose={close}>
      {!preview ? <>
        <p>Metode ini dipakai analisis aplikasi, bukan mode editor Adsterra.</p>
        <label className="block font-medium">Metode tujuan<select aria-label={`Metode aplikasi campaign config ${configId}`} value={kind} disabled={working || operation.busy || busy} className="mt-1 block h-9 w-full rounded border bg-white px-2" onChange={(e) => setKind(e.target.value as ListKind | "")}>
          <option value="">Pilih metode</option><option value="BLACKLIST">Blacklist</option><option value="WHITELIST">Whitelist</option>
        </select></label>
        <p className="text-xs text-slate-500">Siapkan rencana untuk melihat campaign, daftar, dan dampaknya sebelum konfirmasi.</p>
        <OperationNotice message={message}/>
        <Button type="button" disabled={working || operation.busy || busy || !kind || info?.status !== "SUCCESS"} onClick={() => void prepare()}>{working ? "Menyiapkan…" : "Siapkan Metode"}</Button>
      </> : <>
      <p className="font-semibold">{preview.scope.label} · Campaign {preview.scope.campaignId}</p>
      <p>{preview.previousMethod ?? "Belum ditetapkan"} → {preview.kind}; versi {preview.methodVersion}. Provider {preview.providerStatus}; alias Auto aktif: {preview.autoEnabledAliases.join(", ") || "tidak ada"}.</p>
      <p>{preview.adopt ? "Adopsi daftar existing: nol write provider/reset bid; dapat menjadi siap setelah verifikasi." : "Hasil: Belum diterapkan. Provider wajib INACTIVE dan seluruh Auto nonaktif. Isi daftar tujuan melalui Placement setelah ini."}</p>
      <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="font-medium">Daftar tujuan existing: {preview.target.length} placement.</p>
        <p>Daftar tujuan dipertahankan: 0 penambahan / 0 penghapusan.</p>
        <p className="font-medium">Daftar berlawanan yang akan dikosongkan: {preview.opposite.length} placement.</p>
        <p>Custom Bid dipertahankan: {preview.preservedBids.length} override. Tidak ada penghapusan atau pemulihan bid.</p>
      </div>
      <details><summary>Daftar tujuan existing: {preview.target.length}</summary><p className="break-all">{preview.target.join(", ") || "Kosong"}</p></details>
      <details><summary>Daftar berlawanan yang dikosongkan: {preview.opposite.length}</summary><p className="break-all">{preview.opposite.join(", ") || "Kosong terverifikasi"}</p></details>
      <details><summary>Custom Bid dipertahankan: {preview.preservedBids.length} override</summary><p className="break-all">{preview.preservedBids.map((b) => `${b.placementId}/${b.countryCode}/${b.price}`).join("; ") || "Tidak ada override"}</p></details>
      <p>Bukan deteksi mode editor. Tidak ada ON/OFF otomatis. Berlaku sampai {new Date(preview.expiresAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.</p>
      {preview.blockers.map((reason) => <p key={reason} role="alert" className="text-red-700">{reason}</p>)}
      <div className="flex flex-wrap gap-1"><Button type="button" variant="ghost" disabled={working} onClick={() => void finish(false)}>Batal / Tutup</Button><Button type="button" disabled={working || !preview.token} onClick={() => void finish(true)}>{working ? "Memproses..." : "Konfirmasi Metode"}</Button></div>
      </>}
    </OperationDialog>}
    {!open && <OperationNotice message={message}/>}
  </div>;
}
