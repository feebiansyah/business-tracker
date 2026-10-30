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
  // Stable toolbar outside the workspace lock, including from Placement.
  return <div aria-label="Tindakan pengaman saat operasi" className="min-w-0 max-w-full space-y-1 text-xs">
    <div className="flex flex-wrap items-center gap-1"><select aria-label="Target pengaman campaign" className="h-8 w-44 max-w-full rounded border bg-white px-2 text-xs" value={target} disabled={offBusy || autoBusy} onChange={(event) => setTarget(event.target.value)}>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.label || c.campaignId} ({c.campaignId})</option>)}</select><Button type="button" variant="destructive" className="h-8 px-2 text-xs" disabled={offBusy || !target} onClick={() => void protect(true)}>{offBusy ? "OFF…" : "OFF"}</Button><Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={autoBusy || !target} onClick={() => void protect(false)}>Nonaktifkan Auto</Button></div>
    {messages.off && <p role="status" className="mt-2 break-words">OFF: {messages.off}</p>}
    {messages.auto && <p role="status" className="mt-2 break-words">Auto: {messages.auto}</p>}
  </div>;
}
