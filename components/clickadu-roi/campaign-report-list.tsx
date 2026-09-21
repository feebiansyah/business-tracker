"use client";

import { useRef, useState, type FormEvent } from "react";

import { syncClickaduDailyAction } from "@/app/shopee/[id]/clickadu-roi/actions";
import { Button } from "@/components/ui/button";
import type { ClickaduAnalysisConfig } from "@/lib/clickadu-roi/analyze";
import { ClickaduCampaignHistoryModal } from "./campaign-history-modal";

type Campaign = Pick<ClickaduAnalysisConfig, "id" | "campaignId" | "label" | "sourceTag">;

export function ClickaduCampaignReportList({ shopeeAccountId, campaigns, connected }: {
  shopeeAccountId: number;
  campaigns: Campaign[];
  connected: boolean;
}) {
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const syncInFlight = useRef(false);

  async function sync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setBusy(true); setMessage(""); setError("");
    try {
      const result = await syncClickaduDailyAction(shopeeAccountId);
      if (result.success) setMessage(result.message); else setError(result.message);
    } finally {
      syncInFlight.current = false;
      setBusy(false);
    }
  }

  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h3 className="font-semibold text-slate-950">Laporan Harian Clickadu</h3><p className="mt-1 text-sm text-slate-500">Pilih campaign untuk melihat Budget, Spend, Komisi, dan Profit harian.</p></div>
      <form onSubmit={sync}>
        <Button disabled={busy || !connected || campaigns.length === 0}>{busy ? "Menyinkronkan..." : "Sync Clickadu"}</Button>
      </form>
    </div>
    {!connected && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Koneksi Clickadu belum dikonfigurasi.</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="overflow-x-auto"><table className="w-full min-w-150 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Campaign ID</th><th className="px-4 py-3">Tag_link1</th></tr></thead>
        <tbody className="divide-y divide-slate-200">{campaigns.map((campaign) => <tr key={campaign.id}><td className="px-4 py-3 font-medium text-slate-950"><button type="button" className="text-left hover:underline" onClick={() => setSelected(campaign)}>{campaign.label || campaign.campaignId}</button></td><td className="px-4 py-3 text-slate-600">{campaign.campaignId}</td><td className="px-4 py-3 text-slate-600">{campaign.sourceTag}</td></tr>)}{campaigns.length === 0 && <tr><td colSpan={3} className="px-6 py-10 text-center text-slate-500">Belum ada campaign Clickadu.</td></tr>}</tbody>
      </table></div>
    </div>
    {selected && <ClickaduCampaignHistoryModal shopeeAccountId={shopeeAccountId} configId={selected.id} campaignName={selected.label || selected.campaignId} onClose={() => setSelected(null)} />}
  </section>;
}
