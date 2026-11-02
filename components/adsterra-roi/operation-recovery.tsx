"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { inspectAdsterraOperation } from "@/app/shopee/[id]/adsterra-roi/placement-application-actions";
import { useAdsterraOperation } from "./operation-context";
import { OperationDiagnostics } from "./operation-diagnostics";
import { OperationNotice } from "./operation-dialog";

type Readout = Extract<Awaited<ReturnType<typeof inspectAdsterraOperation>>, { success: true }>["result"];
/** One notice for the action and its read-only inspection. No recovery write. */
export function AdsterraOperationRecovery(props: {
  accountId: number; configId: number; message: string; children?: ReactNode;
}) {
  const { revision } = useAdsterraOperation();
  return <OperationFeedback key={`${props.accountId}:${props.configId}:${props.message}:${revision}`} {...props}/>;
}
function OperationFeedback({ accountId, configId, message, children }: {
  accountId: number; configId: number; message: string; children?: ReactNode;
}) {
  const operation = useAdsterraOperation(), pending = useRef(false), sequence = useRef(0);
  const identity = `${accountId}:${configId}:${message}:${operation.revision}`;
  const currentIdentity = useRef(identity);
  useEffect(() => { currentIdentity.current = identity; }, [identity]);
  const [read, setRead] = useState<{ identity: string; result: Readout | null; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { sequence.current++; }, []);
  async function inspect() {
    if (pending.current || !configId) return;
    pending.current = true; setBusy(true);
    const request = ++sequence.current, revision = operation.readRevision(), startedIdentity = identity;
    try {
      const response = await inspectAdsterraOperation(accountId, configId);
      if (request !== sequence.current || operation.readRevision() !== revision || currentIdentity.current !== startedIdentity) return;
      setRead(response.success ? { identity, result: response.result } : { identity, result: null, error: response.message });
    } catch {
      if (request === sequence.current && operation.readRevision() === revision && currentIdentity.current === startedIdentity)
        setRead({ identity, result: null, error: "Status belum dapat dibaca. Tidak ada write yang diulang." });
    } finally { pending.current = false; if (request === sequence.current) setBusy(false); }
  }
  const latest = read?.identity === identity ? read : null, result = latest?.result;
  const canInspect = !!message && !/^(VERIFIED|NO_CHANGE):/.test(message);
  return <OperationNotice message={message} headline={latest?.error ?? result?.message} detail={result && <div className="mt-2 space-y-2">
    {result.slots.map((slot) => <div key={slot.slot} className="space-y-1">
      <p className="font-medium">{slot.slot === "MAIN" ? "Perubahan utama" : "OFF pengaman"}: {slot.action} · {slot.status}{slot.blocked ? " · masih menahan perubahan" : ""}</p>
      <p>Hasil request belum pasti: {slot.uncertain ? "ya" : "tidak"}</p>
      <p>Mulai: {slot.at ? new Date(slot.at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB" : "tidak tersedia"}</p>
      <OperationDiagnostics origin={slot.origin}/>
    </div>)}
    {result.pending && <p>Request yang belum pasti tidak diulang otomatis. Gunakan keadaan terbaru untuk menyiapkan tindakan berikutnya yang tersedia.</p>}
  </div>}>
    {result && <p className="mt-1 text-xs break-words">{result.actual ? `Status ${result.actual.active === 1 ? "Inactive" : result.actual.active === 3 ? "Active" : "Limit / Not in use"} · Blacklist ${result.actual.blacklist === null ? "tidak dapat dibaca karena Whitelist" : result.actual.blacklist} · Whitelist ${result.actual.whitelist} · Custom Bid ${result.actual.bids} override` : "Pembacaan provider belum lengkap; jumlah aktual belum tersedia."}</p>}
    {canInspect && <Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={busy || !configId} onClick={() => void inspect()}>{busy ? "Memeriksa…" : "Periksa Status"}</Button>}
    {children}
  </OperationNotice>;
}
