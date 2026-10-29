"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelAdsterraPlacementApplication, confirmAdsterraOperationRecovery, executeAdsterraPlacementApplication, prepareAdsterraOperationRecovery, prepareAdsterraPlacementApplication } from "@/app/shopee/[id]/adsterra-roi/placement-application-actions";
import type { ApplicationResult, ListKind, Preview } from "@/lib/adsterra-operations/types";
import { useAdsterraOperation } from "./operation-context";

type Recovery = Extract<Awaited<ReturnType<typeof prepareAdsterraOperationRecovery>>, { success: true }>["preview"];
const key = "placement-application";
export function PlacementApplication({ accountId, configId, kind, candidateCount, getData, onResult }: {
  accountId: number; configId: number; kind: ListKind; candidateCount: number;
  getData(): FormData | null; onResult(result: ApplicationResult): void;
}) {
  const operation = useAdsterraOperation(), pending = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null), [recovery, setRecovery] = useState<Recovery | null>(null);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function prepare(recover = false) {
    if (pending.current || !operation.begin(key)) return;
    pending.current = true; setBusy(true); setMessage(""); setPreview(null); setRecovery(null);
    let hold = false;
    try {
      if (recover) {
        const response = await prepareAdsterraOperationRecovery(accountId, configId);
        if (!response.success) setMessage(response.message);
        else { setRecovery(response.preview); hold = !!response.preview.token; }
      } else {
        const data = getData(); if (!data) throw new Error("Analisis perlu dimuat ulang.");
        const response = await prepareAdsterraPlacementApplication(accountId, data, kind);
        if (!response.success) setMessage(response.message);
        else { setPreview(response.preview); hold = !!response.preview.token; }
      }
    } catch { setMessage("Persiapan gagal. Tidak ada write provider dari tombol persiapan."); }
    finally { pending.current = false; setBusy(false); if (!hold) operation.end(key); }
  }
  async function cancel() {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      if (preview?.token) {
        const response = await cancelAdsterraPlacementApplication(accountId, configId, preview.token);
        if (!response.success) { setMessage(response.message); return; }
      }
      setPreview(null); setRecovery(null);
    } catch { setMessage("Pembatalan guard belum dapat dipastikan. Konfirmasi tidak menjalankan write provider; tunggu kedaluwarsa atau periksa operasi."); }
    finally { setPreview(null); setRecovery(null); pending.current = false; setBusy(false); operation.end(key); }
  }
  async function execute() {
    if (pending.current || (!preview?.token && !recovery?.token)) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      if (recovery?.token) {
        const response = await confirmAdsterraOperationRecovery(accountId, configId, recovery.token);
        setMessage(response.success ? response.result.message : response.message);
      } else if (preview?.token) {
        const data = getData(); if (!data) throw new Error("STALE");
        const response = await executeAdsterraPlacementApplication(accountId, data, preview.token);
        if (!response.success) setMessage(response.message);
        else { onResult(response.result); setMessage(`${response.result.status}: ${response.result.message} ${response.result.writeWarnings.join(" ")}`); }
      }
    } catch { setMessage("Hasil eksekusi belum diterima. Jangan mengulang write; periksa operasi/pemulihan dan keadaan provider."); }
    finally { setPreview(null); setRecovery(null); pending.current = false; setBusy(false); operation.end(key, true); }
  }
  return <section aria-label="Penerapan daftar placement" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
    <p>Jenis pilihan adalah daftar tujuan, bukan mode editor. Penerapan menghitung ulang analisis server. Clear daftar berlawanan hanya setelah konfirmasi, provider INACTIVE, dan seluruh Auto terkait nonaktif. PUT harian tanpa clear tidak memerlukan OFF.</p>
    <div className="flex flex-wrap gap-2"><Button type="button" disabled={operation.busy || busy || (kind === "WHITELIST" && !candidateCount)} onClick={() => void prepare()}>Siapkan Penerapan {kind === "BLACKLIST" ? "Blacklist" : "Whitelist"}</Button><Button type="button" variant="ghost" disabled={operation.busy || busy} onClick={() => void prepare(true)}>Periksa / Pulihkan Operasi</Button></div>
    {kind === "WHITELIST" && !candidateCount && <p>Whitelist kosong ditolak; tidak ada daftar provider yang akan dikosongkan.</p>}
    {preview && <div className="space-y-2 rounded-lg border bg-white p-3" role="region" aria-label="Konfirmasi penerapan">
      <h4 className="font-semibold">Konfirmasi satu alur: {preview.kind}</h4>
      <p>{preview.scope.label} · Campaign {preview.scope.campaignId} · {preview.dateFrom}–{preview.dateTill} · Kurs {preview.fxRate}</p>
      <p>Status provider: {preview.providerStatus}. Alias Auto aktif: {preview.autoEnabledAliases.join(", ") || "tidak ada"}. Konfirmasi berlaku sampai {new Date(preview.expiresAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.</p>
      <Ids label="Target" ids={preview.target}/><Ids label="Penambahan" ids={preview.added}/><Ids label="Penghapusan dari daftar tujuan" ids={preview.removed}/>
      <Ids label={`Daftar berlawanan yang akan dikosongkan (${preview.kind === "BLACKLIST" ? "Whitelist" : "Blacklist"})`} ids={preview.opposite}/>
      <Ids label="Blacklist API sebelum" ids={preview.currentBlacklist}/><Ids label="Whitelist API sebelum" ids={preview.currentWhitelist}/>
      <p className="font-medium">Dampak Custom Bid: {preview.resetBids.length ? `${preview.resetBids.length} override seluruh GEO berikut akan dihapus setelah blacklist terverifikasi. Bid tidak dipulihkan saat placement ON kembali.` : "Tidak ada penghapusan bid yang direncanakan. Whitelist/clear sendiri tidak menghapus bid."}</p>
      {!!preview.resetBids.length && <p className="break-words text-xs">{preview.resetBids.map((b) => `${b.placementId} / ${b.countryCode} / ${b.price}`).join("; ")}</p>}
      {preview.blockers.map((reason) => <p key={reason} role="alert" className="text-red-700">{reason}</p>)}
    </div>}
    {recovery && <div className="space-y-2 rounded-lg border bg-white p-3" role="region" aria-label="Konfirmasi pemulihan">
      <p className="font-semibold">Campaign {recovery.campaignId}: {recovery.status} / {recovery.phase}; protective OFF: {recovery.protectiveOffStatus}</p>
      <p>{recovery.message}</p><Ids label="Blacklist API aktual" ids={recovery.blacklist}/><Ids label="Whitelist API aktual" ids={recovery.whitelist}/><p>{recovery.bidCount} override Custom Bid aktual.</p>
      {recovery.blockers.map((reason) => <p key={reason} role="alert" className="text-red-700">{reason}</p>)}
    </div>}
    {(preview || recovery) && <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => void cancel()}>Batal / Tutup</Button><Button type="button" variant="destructive" disabled={busy || !(preview?.token || recovery?.token)} onClick={() => void execute()}>{busy ? "Memproses..." : recovery ? "Konfirmasi Pengakuan Snapshot" : "Konfirmasi Terapkan ke Adsterra"}</Button></div>}
    {message && <p role="status" className="break-words text-slate-800">{message}</p>}
  </section>;
}
function Ids({ label, ids }: { label: string; ids: string[] }) { return <details><summary className="cursor-pointer font-medium">{label}: {ids.length} placement</summary><p className="mt-1 break-words text-xs">{ids.join(", ") || "Kosong (terverifikasi melalui GET)."}</p></details>; }
