"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { inspectAdsterraOperation } from "@/app/shopee/[id]/adsterra-roi/placement-application-actions";
import { useAdsterraOperation } from "./operation-context";
import { OperationDiagnostics } from "./operation-diagnostics";

type Readout = Extract<Awaited<ReturnType<typeof inspectAdsterraOperation>>, { success: true }>["result"];
/** Historical export name retained; the operator no longer performs recovery. */
export function AdsterraOperationRecovery({ accountId, campaigns }: {
  accountId: number; campaigns: { id: number; campaignId: string; label: string | null }[];
}) {
  const operation = useAdsterraOperation(), pending = useRef(false), sequence = useRef(0);
  const [config, setConfig] = useState(String(campaigns[0]?.id ?? "")), [result, setResult] = useState<Readout | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function inspect() {
    if (pending.current || !config) return;
    pending.current = true; setBusy(true); setMessage("");
    const request = ++sequence.current, revision = operation.readRevision();
    try {
      const response = await inspectAdsterraOperation(accountId, Number(config));
      if (request !== sequence.current || operation.readRevision() !== revision) return;
      if (response.success) setResult(response.result); else setMessage(response.message);
    } catch { if (request === sequence.current) setMessage("Status belum dapat dibaca. Tidak ada write yang diulang."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="space-y-2 text-xs">
    <div className="flex flex-wrap items-center gap-2"><select aria-label="Campaign untuk periksa status" value={config} disabled={busy} className="h-8 max-w-full rounded border px-2" onChange={(e) => { sequence.current++; setConfig(e.target.value); setResult(null); setMessage(""); }}>
      {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label || c.campaignId}</option>)}
    </select><Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={busy || !config} onClick={() => void inspect()}>{busy ? "Memeriksa…" : "Periksa Status"}</Button></div>
    {message && <p role="alert" className="text-amber-800">{message}</p>}
    {result && <div role="status" className="space-y-1 rounded border p-2"><p className={result.pending ? "text-amber-800" : "text-slate-700"}>{result.message}</p>
      <p>{result.actual ? `Status ${result.actual.active === 1 ? "Inactive" : result.actual.active === 3 ? "Active" : "Limit / Not in use"} · Blacklist ${result.actual.blacklist} · Whitelist ${result.actual.whitelist} · Custom Bid ${result.actual.bids} override` : "Pembacaan provider belum lengkap; jumlah aktual belum tersedia."}</p>
      <details><summary className="cursor-pointer">Detail diagnostik</summary><OperationDiagnostics origin={result.origin}/></details>
    </div>}
  </div>;
}
