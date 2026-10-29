"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cancelAdsterraMethod, executeAdsterraMethod, prepareAdsterraMethod } from "@/app/shopee/[id]/adsterra-roi/method-actions";
import type { MethodInfo, ListKind } from "@/lib/adsterra-operations/types";
import type { MethodPreview } from "@/lib/adsterra-operations/method-plan";
import { useAdsterraOperation } from "./operation-context";

const labels = { READY: "Siap", NOT_APPLIED: "Belum diterapkan", LIST_CHANGED: "Daftar berubah", CONFLICT: "Konflik", UNVERIFIABLE: "Belum dapat diverifikasi" };
export function CampaignMethodControls({ accountId, configId, info, busy }: {
  accountId: number; configId: number; info?: MethodInfo; busy: boolean;
}) {
  const operation = useAdsterraOperation(), pending = useRef(false), key = `campaign-method-${configId}`;
  const [kind, setKind] = useState<ListKind | "">("");
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
    finally { pending.current = false; setWorking(false); setPreview(null); operation.end(key, true); }
  }
  return <div className="min-w-56 max-w-lg space-y-2 text-xs">
    <p className="font-medium">Metode aplikasi: {busy && !info ? "Belum dibaca" : info?.status === "SUCCESS" ? info.method?.placementMethod ?? "Belum ditetapkan" : "Belum tersedia"}</p>
    <p>Kesiapan: {info ? labels[info.readiness] : "Belum dapat diverifikasi"}</p>
    <p className="text-slate-500">{busy && !info ? "Menunggu pembacaan metadata dan daftar API dalam batch." : info?.message ?? "Metadata metode belum dimuat."}</p>
    {info?.readAt && <p className="text-slate-500">Dibaca: {new Date(info.readAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>}
    <div className="flex flex-wrap gap-1"><select aria-label={`Metode aplikasi campaign config ${configId}`} value={kind} disabled={operation.busy || busy} className="h-8 max-w-full rounded border bg-white px-2" onChange={(e) => setKind(e.target.value as ListKind | "")}>
      <option value="">Pilih metode</option><option value="BLACKLIST">Blacklist</option><option value="WHITELIST">Whitelist</option>
    </select><Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={operation.busy || busy || !kind || info?.status !== "SUCCESS"} onClick={() => void prepare()}>{info?.method?.placementMethod ? "Ubah Metode" : "Tetapkan Metode"}</Button></div>
    {preview && createPortal(<div role="region" aria-label="Konfirmasi metode aplikasi" className="fixed bottom-3 right-3 z-50 max-h-[80vh] w-[calc(100%-1.5rem)] max-w-lg space-y-2 overflow-y-auto rounded border border-amber-300 bg-amber-50 p-3 text-sm shadow-xl">
      <p className="font-semibold">{preview.scope.label} · Campaign {preview.scope.campaignId}</p>
      <p>{preview.previousMethod ?? "Belum ditetapkan"} → {preview.kind}; versi {preview.methodVersion}. Provider {preview.providerStatus}; alias Auto aktif: {preview.autoEnabledAliases.join(", ") || "tidak ada"}.</p>
      <p>{preview.adopt ? "Adopsi daftar existing: nol write provider/reset bid; dapat menjadi siap setelah verifikasi." : "Hasil: Belum diterapkan. Provider wajib INACTIVE dan seluruh Auto nonaktif. Isi daftar tujuan melalui Placement setelah ini."}</p>
      <details><summary>Daftar tujuan existing: {preview.target.length}</summary><p className="break-all">{preview.target.join(", ") || "Kosong"}</p></details>
      <details><summary>Daftar berlawanan yang dikosongkan: {preview.opposite.length}</summary><p className="break-all">{preview.opposite.join(", ") || "Kosong terverifikasi"}</p></details>
      <details><summary>Custom Bid dipertahankan: {preview.preservedBids.length} override</summary><p className="break-all">{preview.preservedBids.map((b) => `${b.placementId}/${b.countryCode}/${b.price}`).join("; ") || "Tidak ada override"}</p></details>
      <p>Bukan deteksi mode editor. Tidak ada ON/OFF otomatis. Berlaku sampai {new Date(preview.expiresAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.</p>
      {preview.blockers.map((reason) => <p key={reason} role="alert" className="text-red-700">{reason}</p>)}
      <div className="flex flex-wrap gap-1"><Button type="button" variant="ghost" disabled={working} onClick={() => void finish(false)}>Batal / Tutup</Button><Button type="button" disabled={working || !preview.token} onClick={() => void finish(true)}>{working ? "Memproses..." : "Konfirmasi Metode"}</Button></div>
    </div>, document.body)}
    {message && <p role="status" className="break-words">{message}</p>}
  </div>;
}
