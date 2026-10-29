"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { prepareAdsterraOperationRecovery, confirmAdsterraOperationRecovery } from "@/app/shopee/[id]/adsterra-roi/placement-application-actions";
import { useAdsterraOperation } from "./operation-context";
import { OperationDialog, OperationNotice } from "./operation-dialog";
type Preview = Extract<Awaited<ReturnType<typeof prepareAdsterraOperationRecovery>>, { success: true }>["preview"];

/** Recovery is available even with an unset method, failed first setup, or no CSV. */
export function AdsterraOperationRecovery({ accountId, campaigns }: {
  accountId: number; campaigns: { id: number; campaignId: string; label: string | null }[];
}) {
  const operation = useAdsterraOperation(), pending = useRef(false), key = "campaign-operation-recovery";
  const [config, setConfig] = useState(String(campaigns[0]?.id ?? "")), [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function prepare() {
    if (pending.current || !config || !operation.begin(key)) return;
    pending.current = true; setBusy(true); setMessage(""); let hold = false;
    try {
      const response = await prepareAdsterraOperationRecovery(accountId, Number(config));
      if (!response.success) setMessage(response.message);
      else { setPreview(response.preview); hold = !!response.preview.token; }
    } catch { setMessage("Keadaan operasi belum dapat dibaca. Tidak ada retry write."); }
    finally { pending.current = false; setBusy(false); if (!hold) operation.end(key); }
  }
  async function confirm() {
    if (!preview?.token || pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const response = await confirmAdsterraOperationRecovery(accountId, Number(config), preview.token);
      setMessage(response.success ? response.result.message : response.message);
    } catch { setMessage("Pencatatan recovery belum pasti. Tidak mengulang otomatis."); }
    finally { pending.current = false; setBusy(false); setPreview(null); operation.end(key, true); }
  }
  return <><details className="rounded-lg border bg-white p-3 text-sm"><summary className="cursor-pointer font-medium">Periksa / Pulihkan Operasi (tanpa CSV)</summary>
    <div className="mt-2 flex flex-wrap gap-2"><select aria-label="Campaign untuk recovery" value={config} disabled={operation.busy || busy} className="h-9 max-w-full rounded border px-2" onChange={(e) => { setConfig(e.target.value); setPreview(null); }}>
      {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label || c.campaignId} ({c.campaignId})</option>)}
    </select><Button type="button" variant="ghost" disabled={operation.busy || busy || !config} onClick={() => void prepare()}>Periksa Operasi</Button></div>
    <OperationNotice message={message}/>
  </details>{preview && <OperationDialog title="Konfirmasi pemulihan operasi" busy={busy} onClose={() => { setPreview(null); operation.end(key); }}>
      <p className="font-medium">Campaign {preview.campaignId}: {preview.status} / {preview.phase}; protective OFF: {preview.protectiveOffStatus}.</p><p>{preview.message}</p>
      <p>Blacklist API: {preview.blacklist.length} · Whitelist API: {preview.whitelist.length} · Custom Bid: {preview.bidCount} override.</p>
      {preview.blockers.map((reason) => <p key={reason} role="alert" className="text-red-700">{reason}</p>)}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => { setPreview(null); operation.end(key); }}>Tutup</Button><Button type="button" disabled={busy || !preview.token} onClick={() => void confirm()}>Konfirmasi Pengakuan Snapshot</Button></div>
    </OperationDialog>}</>;
}
