"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { setAdsterraAutoScheduleEnabledAction, setAdsterraCampaignActiveAction } from "@/app/shopee/[id]/adsterra-roi/actions";
import { useAdsterraOperation } from "./operation-context";

/** Deliberately outside the workspace lock: no activation or list writes here. */
export function AdsterraProtectiveControls({ accountId, campaigns }: { accountId: number; campaigns: { id: number; campaignId: string; label: string | null }[] }) {
  const operation = useAdsterraOperation();
  const [target, setTarget] = useState(String(campaigns[0]?.id ?? ""));
  const [offBusy, setOffBusy] = useState(false), [autoBusy, setAutoBusy] = useState(false);
  const [messages, setMessages] = useState({ off: "", auto: "" });
  const locks = useRef({ off: false, auto: false });
  async function protect(off: boolean) {
    const campaign = campaigns.find((item) => String(item.id) === target);
    const slot = off ? "off" : "auto";
    const show = (message: string) => setMessages((current) => ({ ...current, [slot]: message }));
    if (!campaign || locks.current[slot] || !window.confirm(`${off ? "OFF protektif" : "Nonaktifkan Auto ON/OFF"}: ${campaign.label || campaign.campaignId} (${campaign.campaignId})? Tidak mengaktifkan campaign atau memulihkan bid.`)) return;
    locks.current[slot] = true; (off ? setOffBusy : setAutoBusy)(true); show("");
    try {
      if (off) {
        const result = await setAdsterraCampaignActiveAction(accountId, campaign.id, false);
        show(result.success ? "Provider INACTIVE terverifikasi. Operasi daftar utama tidak dihapus/dibuka oleh OFF ini." : result.message);
      } else {
        const result = await setAdsterraAutoScheduleEnabledAction(accountId, campaign.id, false);
        show(result.success ? `Auto konfigurasi ini nonaktif. ${"warning" in result ? result.warning : ""}` : result.message);
      }
    } catch { show("Hasil belum diterima; periksa operasi. Tidak mengulang request otomatis."); }
    finally { locks.current[slot] = false; (off ? setOffBusy : setAutoBusy)(false); operation.refresh(); }
  }
  // Keep the same independent safety actions mounted outside the workspace
  // lock; show them only while needed, never as a normal setup procedure.
  if (!operation.changing && !operation.protectionNeeded && !offBusy && !autoBusy && !messages.off && !messages.auto) return null;
  return <section aria-label="Tindakan pengaman saat operasi" className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
    <p className="text-xs font-medium">OFF dan penonaktifan Auto tetap tersedia selama proses.</p>
    <div className="mt-2 flex flex-wrap items-end gap-2"><label className="min-w-0">Campaign<select aria-label="Target pengaman campaign" className="mt-1 block h-9 max-w-full rounded border px-2" value={target} disabled={offBusy || autoBusy} onChange={(event) => setTarget(event.target.value)}>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.label || c.campaignId} ({c.campaignId})</option>)}</select></label><Button type="button" variant="destructive" disabled={offBusy || !target} onClick={() => void protect(true)}>{offBusy ? "OFF pending..." : "OFF Protektif"}</Button><Button type="button" variant="ghost" disabled={autoBusy || !target} onClick={() => void protect(false)}>Nonaktifkan Auto</Button></div>
    {messages.off && <p role="status" className="mt-2 break-words">OFF: {messages.off}</p>}
    {messages.auto && <p role="status" className="mt-2 break-words">Auto: {messages.auto}</p>}
  </section>;
}
