"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelAdsterraPlacementApplication, executeAdsterraPlacementApplication, prepareAdsterraPlacementApplication } from "@/app/shopee/[id]/adsterra-roi/placement-application-actions";
import type { ApplicationResult, ListKind, Preview } from "@/lib/adsterra-operations/types";
import { useAdsterraOperation } from "./operation-context";
import { MethodBadge, OperationDialog, OperationNotice } from "./operation-dialog";
import { AdsterraOperationRecovery } from "./operation-recovery";

const key = "placement-application";
export function PlacementApplication({ accountId, configId, kind, candidateCount, getData, onResult }: {
  accountId: number; configId: number; kind: ListKind; candidateCount: number;
  getData(): FormData | null; onResult(result: ApplicationResult): void;
}) {
  const operation = useAdsterraOperation(), pending = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function prepare() {
    if (pending.current || !operation.begin(key)) return;
    pending.current = true; setBusy(true); setMessage("");
    let hold = false;
    try {
      const data = getData(); if (!data) throw new Error("STALE_ANALYSIS");
      const response = await prepareAdsterraPlacementApplication(accountId, data, kind);
      if (!response.success) setMessage(response.message);
      else { setPreview(response.preview); hold = !!response.preview.token; }
    } catch { setMessage("Konfirmasi belum dapat disiapkan. Tidak ada perubahan provider."); }
    finally { pending.current = false; setBusy(false); if (!hold) operation.end(key); }
  }
  async function cancel() {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      if (preview?.token) {
        const response = await cancelAdsterraPlacementApplication(accountId, configId, preview.token);
        if (!response.success) setMessage(response.message);
      }
    } catch { setMessage("Pembatalan belum dapat dipastikan. Periksa Status sebelum melanjutkan."); }
    finally { setPreview(null); pending.current = false; setBusy(false); operation.end(key); }
  }
  async function execute() {
    if (pending.current || !preview?.token) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const data = getData(); if (!data) throw new Error("STALE_ANALYSIS");
      const response = await executeAdsterraPlacementApplication(accountId, data, preview.token);
      if (!response.success) setMessage(response.message);
      else { onResult(response.result); setMessage(`${response.result.status}: ${response.result.message}`); }
    } catch { setMessage("Hasil perubahan belum diterima. Gunakan Periksa Status; jangan ulangi write."); }
    finally { setPreview(null); pending.current = false; setBusy(false); operation.end(key, true); }
  }
  return <section aria-label="Penerapan daftar placement" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
    <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">Penerapan</h4><MethodBadge method={kind}/><span className="text-xs text-slate-600">{candidateCount} kandidat analisis, bukan jumlah yang diterima provider.</span></div>
    <Button type="button" disabled={operation.busy || busy || (kind === "WHITELIST" && !candidateCount)} onClick={() => void prepare()}>{busy ? "Memproses…" : `Terapkan ${kind === "BLACKLIST" ? "Blacklist" : "Whitelist"}`}</Button>
    {kind === "WHITELIST" && !candidateCount && <p>Whitelist belum memiliki kandidat. Tidak ada perubahan provider.</p>}
    {preview && <OperationDialog title="Konfirmasi penerapan" busy={busy} onClose={() => void cancel()}>
      <p className="font-semibold">{preview.scope.label} · Campaign {preview.scope.campaignId} · {preview.kind}</p>
      <p>{preview.dateFrom}–{preview.dateTill} · Kurs {preview.fxRate}</p>
      <div className="grid grid-cols-3 gap-2 rounded bg-slate-50 p-3 text-xs"><p>Target <b className="block text-base">{preview.target.length}</b></p><p>Ditambahkan <b className="block text-base">{preview.added.length}</b></p><p>Dikeluarkan <b className="block text-base">{preview.removed.length}</b></p></div>
      <p>Daftar berlawanan: {preview.opposite.length} placement; tidak dikosongkan atau diubah melalui Placement.</p>
      <p className="rounded border border-amber-200 bg-amber-50 p-2 font-medium">{preview.resetBids.length
        ? `${preview.resetBids.length} override Custom Bid seluruh GEO milik placement blacklist terkait akan dihapus setelah blacklist terverifikasi. Bid tidak dipulihkan saat placement ON kembali.`
        : "Custom Bid dipertahankan. Whitelist tidak menghapus override bid."}</p>
      {preview.kind === "BLACKLIST" && !preview.target.length && <p className="font-medium">Blacklist kosong: tidak ada placement yang dikecualikan.</p>}
      <Ids label="ID target" ids={preview.target}/><Ids label="Penambahan" ids={preview.added}/><Ids label="Penghapusan" ids={preview.removed}/>
      {preview.resetBids.length > 0 && <details><summary className="cursor-pointer">Detail override bid yang dihapus</summary><p className="break-words text-xs">{preview.resetBids.map((b) => `${b.placementId}/${b.countryCode}/${b.price}`).join("; ")}</p></details>}
      {preview.blockers.map((reason) => <p key={reason} role="alert" className="text-red-700">{reason}</p>)}
      <div className="flex gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => void cancel()}>Batal</Button><Button type="button" disabled={busy || !preview.token} onClick={() => void execute()}>{busy ? "Memproses…" : "Konfirmasi Terapkan"}</Button></div>
    </OperationDialog>}
    <OperationNotice message={message}/>
    <AdsterraOperationRecovery accountId={accountId} campaigns={[{ id: configId, campaignId: "", label: "Campaign yang dianalisis" }]}/>
  </section>;
}
function Ids({ label, ids }: { label: string; ids: string[] }) { return <details><summary className="cursor-pointer text-xs">{label}: {ids.length} placement</summary><p className="break-words text-xs">{ids.join(", ") || "Kosong"}</p></details>; }
