"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelAdsterraMethod, executeAdsterraMethod, prepareAdsterraMethod } from "@/app/shopee/[id]/adsterra-roi/method-actions";
import type { MethodInfo, ListKind } from "@/lib/adsterra-operations/types";
import type { MethodPreview } from "@/lib/adsterra-operations/method-plan";
import { useAdsterraOperation } from "./operation-context";
import { OperationDialog, OperationNotice } from "./operation-dialog";
import { AdsterraOperationRecovery } from "./operation-recovery";
import { blacklistDescription } from "@/lib/adsterra-operations/list-evidence";

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
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={`Metode aplikasi campaign config ${configId}`} value={open ? kind : info?.method?.placementMethod ?? ""} disabled={operation.busy || busy || info?.status !== "SUCCESS"}
        className="h-8 max-w-full rounded border bg-white px-1 text-xs" onChange={(e) => { if (e.target.value) void prepare(e.target.value as ListKind); }}>
        <option value="">{busy && !info ? "Memuat metode…" : info?.status === "SUCCESS" ? "Pilih metode" : "Metode belum tersedia"}</option><option value="BLACKLIST">Blacklist</option><option value="WHITELIST">Whitelist</option>
      </select>
    </div>
    {open && <OperationDialog title="Ubah metode?" busy={working} onClose={close}>
      {!preview ? <>
        <p>{working ? "Memeriksa campaign, daftar placement dan Custom Bid…" : "Rencana belum tersedia. Tutup lalu pilih metode untuk mencoba pembacaan baru."}</p>
        <OperationNotice message={message}/>
      </> : <>
      <p className="font-semibold">{preview.scope.label} · Campaign {preview.scope.campaignId}</p>
      <p>Metode tujuan: <strong>{preview.kind === "BLACKLIST" ? "Blacklist" : "Whitelist"}</strong></p>
      <p>{preview.same ? "Metode sama: daftar, Auto, status campaign dan Custom Bid tidak diubah."
        : preview.reset ? "Campaign dan Auto terkait dinonaktifkan, daftar placement direset. Custom Bid dipertahankan. Campaign dan Auto tidak diaktifkan kembali otomatis."
        : preview.adopt ? "Daftar yang ada dipertahankan. Status campaign, Auto, dan Custom Bid tidak diubah."
        : "Whitelist belum diisi. Metode disimpan; penerapan Whitelist dilakukan melalui analisis Placement sebelum ON."}</p>
      <div className="space-y-1 text-sm text-slate-700">
        {!preview.reset && <p>Daftar dipertahankan: {blacklistDescription(preview.target)}.</p>}
        {preview.reset && <p>Dikosongkan: {Array.isArray(preview.clearBlacklist) ? `${preview.clearBlacklist.length} Blacklist` : "Blacklist dibaca ulang dan direset setelah Whitelist kosong"} + {preview.clearWhitelist.length} Whitelist.</p>}
        {preview.kind === "BLACKLIST" && !preview.same && (preview.reset || (Array.isArray(preview.target) && !preview.target.length)) && <p>Setelah reset terverifikasi, Blacklist kosong: tidak ada placement yang dikecualikan.</p>}
        <p>Custom Bid dipertahankan ({preview.preservedBids.length} override).</p>
      </div>
      <details className="text-xs text-slate-600"><summary className="cursor-pointer">Detail</summary><div className="mt-2 space-y-2 break-words">
        <p>Status campaign: {preview.providerStatus}. Metode sebelumnya: {preview.previousMethod ?? "Belum dipilih"}.</p>
        <p>Blacklist API: {blacklistDescription(preview.blacklist)} · Whitelist API: {preview.whitelist.length} placement.</p>
        <p>Daftar tujuan: {Array.isArray(preview.target) ? preview.target.join(", ") || "Kosong" : "Blacklist belum terbaca; pembacaan wajib setelah clear Whitelist."}</p>
        <p>ID dikosongkan: {Array.isArray(preview.clearBlacklist) ? [...preview.clearBlacklist, ...preview.clearWhitelist].join(", ") || "Tidak ada" : `Whitelist: ${preview.clearWhitelist.join(", ")}. Blacklist dibaca ulang sebelum reset.`}</p>
        <p>Bid dipertahankan: {preview.preservedBids.map((b) => `${b.placementId}/${b.countryCode}/${b.price}`).join("; ") || "Tidak ada override"}</p>
        <p>Metode aplikasi, bukan mode editor Adsterra. Konfirmasi berlaku sampai {new Date(preview.expiresAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.</p>
      </div></details>
      {preview.blockers.map((reason) => <p key={reason} role="alert" className="text-red-700">{reason}</p>)}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={working} onClick={() => void finish(false)}>Batal</Button><Button type="button" disabled={working || !preview.token} onClick={() => void finish(true)}>{working ? "Memproses..." : "Konfirmasi"}</Button></div>
      </>}
    </OperationDialog>}
    {!open && <OperationNotice message={message}/>}
    {!open && message && !/^(VERIFIED|NO_CHANGE):/.test(message) && <AdsterraOperationRecovery accountId={accountId} configId={configId}/>}
  </div>;
}
