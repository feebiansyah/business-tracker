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
  async function prepare(next: ListKind) {
    if (pending.current || !operation.begin(key)) return;
    setKind(next); setOpen(true); setPreview(null);
    pending.current = true; setWorking(true); setMessage(""); let hold = false;
    try {
      const response = await prepareAdsterraMethod(accountId, configId, next);
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
        setMessage(response.success ? `${response.result.status}: ${response.result.message}` : response.message);
      } else if (preview.token) {
        const response = await cancelAdsterraMethod(accountId, configId, preview.token);
        if (!response.success) setMessage(response.message);
      }
    } catch { setMessage("Hasil belum dapat dipastikan. Gunakan Periksa Status; jangan ulangi write."); }
    finally { pending.current = false; setWorking(false); setPreview(null); setOpen(false); setKind(""); operation.end(key, true); }
  }
  function close() { if (pending.current) return; if (preview) void finish(false); else { setOpen(false); setKind(""); } }
  return <div className="min-w-36 max-w-64 space-y-1 text-xs">
    {info?.status === "SUCCESS" ? <MethodBadge method={info.method?.placementMethod ?? null}/> : <span className="font-medium text-amber-800">{busy && !info ? "Memuat metode…" : "Belum tersedia"}</span>}
    <p className={info?.readiness === "READY" ? "text-emerald-700" : "text-slate-600"}>{info?.method?.placementMethod === "WHITELIST" && info.readiness === "NOT_APPLIED" ? "Whitelist belum diisi" : info ? labels[info.readiness] : "Perlu diperiksa"}</p>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={`Metode aplikasi campaign config ${configId}`} value={open ? kind : info?.method?.placementMethod ?? ""} disabled={operation.busy || busy || info?.status !== "SUCCESS"}
        className="h-8 max-w-full rounded border bg-white px-1 text-xs" onChange={(e) => { if (e.target.value) void prepare(e.target.value as ListKind); }}>
        <option value="">Pilih metode</option><option value="BLACKLIST">Blacklist</option><option value="WHITELIST">Whitelist</option>
      </select>
      <details><summary className="cursor-pointer text-slate-500">Detail kesiapan</summary><p className="mt-1 break-words">{busy && !info ? "Menunggu pembacaan metadata dan daftar API dalam batch." : info?.message ?? "Metadata metode belum dimuat."}</p>{info?.readAt && <p className="mt-1">Dibaca: {new Date(info.readAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>}</details>
    </div>
    {open && <OperationDialog title="Konfirmasi metode aplikasi" busy={working} onClose={close}>
      {!preview ? <>
        <p>{working ? "Memeriksa campaign, daftar placement dan Custom Bid…" : "Rencana belum tersedia. Tutup lalu pilih metode untuk mencoba pembacaan baru."}</p>
        <OperationNotice message={message}/>
      </> : <>
      <p className="font-semibold">{preview.scope.label} · Campaign {preview.scope.campaignId}</p>
      <p>{preview.previousMethod ?? "Belum dipilih"} → {preview.kind}. Status campaign: {preview.providerStatus}.</p>
      <p>{preview.same ? "Metode sama: daftar, Auto, status campaign dan Custom Bid tidak diubah."
        : preview.reset ? "Campaign akan dinonaktifkan dan Auto seluruh konfigurasi terkait dimatikan. Kedua daftar placement dikosongkan. Custom Bid dipertahankan. Campaign dan Auto tidak diaktifkan kembali otomatis."
        : preview.adopt ? "Daftar existing diadopsi tanpa OFF, perubahan Auto, write provider, atau penghapusan Custom Bid."
        : "Whitelist belum diisi. Metode disimpan; penerapan Whitelist dilakukan melalui analisis Placement sebelum ON."}</p>
      <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="font-medium">Blacklist API: {preview.blacklist.length} · Whitelist API: {preview.whitelist.length} placement.</p>
        <p className="font-medium">Dikosongkan: {preview.clearBlacklist.length} Blacklist + {preview.clearWhitelist.length} Whitelist. Tidak ada placement baru ditambahkan.</p>
        {preview.kind === "BLACKLIST" && !preview.same && (preview.reset || !preview.target.length) && <p>Blacklist kosong: tidak ada placement yang dikecualikan.</p>}
        <p>Custom Bid dipertahankan: {preview.preservedBids.length} override. Tidak ada penghapusan atau pemulihan bid.</p>
      </div>
      <details><summary>Daftar tujuan existing: {preview.target.length}</summary><p className="break-all">{preview.target.join(", ") || "Kosong"}</p></details>
      <details><summary>ID yang dikosongkan</summary><p className="break-all">{[...preview.clearBlacklist, ...preview.clearWhitelist].join(", ") || "Tidak ada"}</p></details>
      <details><summary>Custom Bid dipertahankan: {preview.preservedBids.length} override</summary><p className="break-all">{preview.preservedBids.map((b) => `${b.placementId}/${b.countryCode}/${b.price}`).join("; ") || "Tidak ada override"}</p></details>
      <p className="text-xs text-slate-500">Pilihan aplikasi, bukan deteksi mode editor Adsterra. Berlaku sampai {new Date(preview.expiresAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.</p>
      {preview.blockers.map((reason) => <p key={reason} role="alert" className="text-red-700">{reason}</p>)}
      <div className="flex flex-wrap gap-1"><Button type="button" variant="ghost" disabled={working} onClick={() => void finish(false)}>Batal / Tutup</Button><Button type="button" disabled={working || !preview.token} onClick={() => void finish(true)}>{working ? "Memproses..." : "Konfirmasi Metode"}</Button></div>
      </>}
    </OperationDialog>}
    {!open && <OperationNotice message={message}/>}
  </div>;
}
