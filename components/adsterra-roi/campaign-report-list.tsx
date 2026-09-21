"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Power } from "lucide-react";
import { getAdsterraCampaignStatusesAction, setAdsterraCampaignActiveAction, syncAdsterraDailyAction } from "@/app/shopee/[id]/adsterra-roi/actions";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AdsterraCampaignStatusResult } from "@/lib/adsterra-roi/client";
import { AdsterraCampaignHistoryModal } from "./campaign-history-modal";

type Campaign = { id: number; campaignId: string; label: string | null; sourceTag: string };
type StatusState = { campaignStatus: AdsterraCampaignStatusResult | null; error: string | null };
type PendingToggle = { campaign: Campaign; desiredActive: boolean };
const statusLabels = { ACTIVE: "Active", INACTIVE: "Inactive", LIMITED: "Limit", NOT_IN_USE: "Not in use" } as const;

export function AdsterraCampaignReportList({ shopeeAccountId, campaigns, connected }: { shopeeAccountId: number; campaigns: Campaign[]; connected: boolean }) {
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusesBusy, setStatusesBusy] = useState(false);
  const [statusByConfig, setStatusByConfig] = useState<Record<number, StatusState>>({});
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const statusLock = useRef(false);
  const toggleLocks = useRef(new Set<number>());

  const refreshStatuses = useCallback(async () => {
    if (!connected || campaigns.length === 0 || statusLock.current) return;
    statusLock.current = true; setStatusesBusy(true); setError("");
    try {
      const result = await getAdsterraCampaignStatusesAction(shopeeAccountId);
      if (!result.success) { setError(result.message); return; }
      setStatusByConfig(Object.fromEntries(result.statuses.map((item) => [item.configId, { campaignStatus: item.campaignStatus, error: item.error }])));
    } finally { statusLock.current = false; setStatusesBusy(false); }
  }, [campaigns.length, connected, shopeeAccountId]);

  useEffect(() => { void refreshStatuses(); }, [refreshStatuses]);

  async function sync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(""); setError("");
    try { const result = await syncAdsterraDailyAction(shopeeAccountId); if (result.success) setMessage(result.message); else setError(result.message); }
    finally { lock.current = false; setBusy(false); }
  }

  async function toggleCampaign(campaign: Campaign, desiredActive: boolean) {
    if (toggleLocks.current.has(campaign.id)) return false;
    toggleLocks.current.add(campaign.id); setTogglingIds((current) => new Set(current).add(campaign.id)); setMessage(""); setError(""); setConfirmationError("");
    try {
      const result = await setAdsterraCampaignActiveAction(shopeeAccountId, campaign.id, desiredActive);
      if (result.campaignStatus) setStatusByConfig((current) => ({ ...current, [campaign.id]: { campaignStatus: result.campaignStatus, error: result.success ? null : result.message } }));
      if (result.success) { setMessage(`Status ${campaign.label || campaign.campaignId} berhasil diverifikasi: ${statusLabels[result.campaignStatus.status]}.`); return true; }
      setError(result.message); setConfirmationError(result.message); return false;
    } finally {
      toggleLocks.current.delete(campaign.id);
      setTogglingIds((current) => { const next = new Set(current); next.delete(campaign.id); return next; });
    }
  }

  async function confirmToggle() {
    if (!pendingToggle) return;
    const success = await toggleCampaign(pendingToggle.campaign, pendingToggle.desiredActive);
    if (success) setPendingToggle(null);
  }

  const confirmationBusy = pendingToggle ? togglingIds.has(pendingToggle.campaign.id) : false;

  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold text-slate-950">Laporan Harian Adsterra</h3><p className="mt-1 text-sm text-slate-500">Pilih campaign untuk melihat Spend, Komisi, dan Profit harian.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" disabled={statusesBusy || !connected || campaigns.length === 0} onClick={() => void refreshStatuses()}>{statusesBusy ? "Memuat Status..." : "Refresh Status"}</Button><form onSubmit={sync}><Button disabled={busy || !connected || campaigns.length === 0}>{busy ? "Menyinkronkan..." : "Sync Adsterra"}</Button></form></div></div>
    {!connected && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Koneksi Adsterra belum dikonfigurasi.</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="overflow-hidden rounded-lg border border-slate-200"><div className="overflow-x-auto"><table className="w-full min-w-200 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Campaign ID</th><th className="px-4 py-3">Tag_link1</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200">{campaigns.map((campaign) => {
      const state = statusByConfig[campaign.id]; const status = state?.campaignStatus?.status; const toggling = togglingIds.has(campaign.id);
      return <tr key={campaign.id}><td className="px-4 py-3 font-medium text-slate-950"><button type="button" className="text-left hover:underline" onClick={() => setSelected(campaign)}>{campaign.label || campaign.campaignId}</button></td><td className="px-4 py-3 text-slate-600">{campaign.campaignId}</td><td className="px-4 py-3 text-slate-600">{campaign.sourceTag}</td><td className="px-4 py-3"><span className={status === "ACTIVE" ? "text-emerald-700" : status === "INACTIVE" ? "text-slate-700" : status ? "text-amber-700" : "text-slate-500"}>{status ? statusLabels[status] : state?.error ? "Tidak diketahui" : statusesBusy ? "Memuat..." : "Belum dimuat"}</span>{state?.error && <p className="mt-1 max-w-60 text-xs text-red-600">{state.error}</p>}</td><td className="px-4 py-3">{(status === "ACTIVE" || status === "INACTIVE") ? <Button type="button" size="icon" variant={status === "ACTIVE" ? "destructive" : "default"} disabled={toggling || statusesBusy} aria-label={status === "ACTIVE" ? `Matikan ${campaign.label || campaign.campaignId}` : `Aktifkan ${campaign.label || campaign.campaignId}`} title={status === "ACTIVE" ? "Matikan campaign" : "Aktifkan campaign"} onClick={() => { setConfirmationError(""); setPendingToggle({ campaign, desiredActive: status === "INACTIVE" }); }}><Power className="size-4" /></Button> : <span className="text-xs text-slate-500">{status ? "Tidak ada aksi manual" : "—"}</span>}</td></tr>;
    })}{campaigns.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">Belum ada campaign Adsterra.</td></tr>}</tbody></table></div></div>
    {selected && <AdsterraCampaignHistoryModal shopeeAccountId={shopeeAccountId} configId={selected.id} campaignName={selected.label || selected.campaignId} onClose={() => setSelected(null)} />}
    <AlertDialog open={pendingToggle !== null} title={pendingToggle?.desiredActive ? "Aktifkan campaign?" : "Matikan campaign?"} description={pendingToggle ? `Campaign ${pendingToggle.campaign.label || pendingToggle.campaign.campaignId} akan ${pendingToggle.desiredActive ? "diaktifkan" : "dinonaktifkan"} di Adsterra.` : ""} confirmLabel={pendingToggle?.desiredActive ? "Aktifkan" : "Matikan"} destructive={pendingToggle?.desiredActive === false} busy={confirmationBusy} error={confirmationError} onCancel={() => setPendingToggle(null)} onConfirm={confirmToggle} />
  </section>;
}
