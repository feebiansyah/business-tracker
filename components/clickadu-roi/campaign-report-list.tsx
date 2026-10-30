"use client";

import { useRef, useState, type FormEvent } from "react";

import { syncClickaduDailyAction } from "@/app/shopee/[id]/clickadu-roi/actions";
import { Button } from "@/components/ui/button";
import type { ClickaduAnalysisConfig } from "@/lib/clickadu-roi/analyze";
import { ClickaduCampaignHistoryModal } from "./campaign-history-modal";
import { useClickaduListMethod } from "./list-method-context";
import type { ClickaduListMethod } from "@/lib/clickadu-roi/list-method";

type Campaign = Pick<ClickaduAnalysisConfig, "id" | "campaignId" | "label" | "sourceTag">;

export function ClickaduCampaignReportList({ shopeeAccountId, campaigns, connected }: {
  shopeeAccountId: number;
  campaigns: Campaign[];
  connected: boolean;
}) {
  const lists = useClickaduListMethod();
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
      <div><h3 className="font-semibold text-slate-950">Laporan Harian Clickadu</h3><p className="mt-1 text-sm text-slate-500">Pilih campaign untuk melihat Spend, Komisi, dan Profit harian.</p></div>
      <form onSubmit={sync}>
        <Button disabled={lists.busy || busy || !connected || campaigns.length === 0}>{busy ? "Menyinkronkan..." : "Sync Clickadu"}</Button>
      </form>
    </div>
    {!connected && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Koneksi Clickadu belum dikonfigurasi.</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="overflow-x-auto"><table className="w-full min-w-150 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Campaign ID</th><th className="px-4 py-3">Tag_link1</th><th className="px-4 py-3">Metode Zone</th></tr></thead>
        <tbody className="divide-y divide-slate-200">{campaigns.map((campaign) => {
          const read = lists.reads[campaign.id], actual = read?.actual?.method;
          return <tr key={campaign.id}><td className="px-4 py-3 font-medium text-slate-950"><button type="button" className="text-left hover:underline" onClick={() => setSelected(campaign)}>{campaign.label || campaign.campaignId}</button></td><td className="px-4 py-3 text-slate-600">{campaign.campaignId}</td><td className="px-4 py-3 text-slate-600">{campaign.sourceTag}</td><td className="min-w-52 space-y-1 px-4 py-3">
            <p className="text-xs text-slate-600">Aktual: {read?.loading ? "Memuat…" : actual === "BLACKLIST" ? "Blacklist" : actual === "WHITELIST" ? "Whitelist" : "Belum tersedia"}</p>
            <select aria-label={`Rencana metode ${campaign.label || campaign.campaignId}`} disabled={lists.busy || busy || read?.loading || !actual} value={lists.plans[campaign.id] ?? actual ?? ""} onChange={(e) => lists.plan(campaign.id, e.target.value as ClickaduListMethod)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm"><option value="" disabled>Pilih metode</option><option value="BLACKLIST">Blacklist</option><option value="WHITELIST">Whitelist</option></select>
            <p className="max-w-60 text-xs text-slate-500">Rencana analisis; belum mengubah provider.</p>
            {read?.error && <p role="alert" className="max-w-60 text-xs text-red-700">{read.error}</p>}
            <button type="button" disabled={lists.busy || busy || read?.loading || !connected} onClick={() => void lists.refresh(campaign.id)} className="text-xs text-blue-700 hover:underline disabled:opacity-50">Refresh metode</button>
          </td></tr>;
        })}{campaigns.length === 0 && <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-500">Belum ada campaign Clickadu.</td></tr>}</tbody>
      </table></div>
    </div>
    {selected && <ClickaduCampaignHistoryModal shopeeAccountId={shopeeAccountId} configId={selected.id} campaignName={selected.label || selected.campaignId} onClose={() => setSelected(null)} />}
  </section>;
}
