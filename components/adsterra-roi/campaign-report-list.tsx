"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getAdsterraCampaignStatusesAction, setAdsterraAutoScheduleEnabledAction, setAdsterraCampaignActiveAction, syncAdsterraDailyAction } from "@/app/shopee/[id]/adsterra-roi/actions";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AdsterraCampaignStatusResult } from "@/lib/adsterra-roi/client";
import { AdsterraCampaignHistoryModal } from "./campaign-history-modal";
import { PlacementListReadout, useAdsterraPlacementLists } from "./campaign-placement-lists";
import { useAdsterraOperation } from "./operation-context";
import { CampaignMethodControls } from "./campaign-method-controls";
import { AdsterraOperationRecovery } from "./operation-recovery";
import { isLegacyUnconfiguredMethod } from "@/lib/adsterra-operations/method-activation";

type Campaign = { id: number; campaignId: string; label: string | null; sourceTag: string; autoScheduleEnabled: boolean };
type StatusState = { campaignStatus: AdsterraCampaignStatusResult | null; error: string | null };
type PendingToggle = { campaign: Campaign; desiredActive: boolean };
const statusLabels = { ACTIVE: "Active", INACTIVE: "Inactive", LIMITED: "Limit", NOT_IN_USE: "Not in use" } as const;

export function AdsterraCampaignReportList({ shopeeAccountId, campaigns, connected }: { shopeeAccountId: number; campaigns: Campaign[]; connected: boolean }) {
  const operation = useAdsterraOperation();
  const { revision, readRevision } = operation;
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusesBusy, setStatusesBusy] = useState(false);
  const [statusByConfig, setStatusByConfig] = useState<Record<number, StatusState>>({});
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const [offTogglingIds, setOffTogglingIds] = useState<Set<number>>(new Set());
  const [autoScheduleByConfig, setAutoScheduleByConfig] = useState<Record<number, boolean>>(() => Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign.autoScheduleEnabled])));
  const [autoScheduleBusyIds, setAutoScheduleBusyIds] = useState<Set<number>>(new Set());
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const statusSequence = useRef(0);
  const toggleLocks = useRef(new Set<string>());
  const autoScheduleLocks = useRef(new Set<number>());
  const placementLists = useAdsterraPlacementLists(shopeeAccountId, campaigns.length > 0);

  const refreshStatuses = useCallback(async () => {
    if (campaigns.length === 0) return;
    const request = ++statusSequence.current, startedRevision = readRevision();
    setStatusesBusy(true); setError("");
    try {
      const result = await getAdsterraCampaignStatusesAction(shopeeAccountId);
      if (statusSequence.current !== request || readRevision() !== startedRevision) return;
      if (!result.success) { setError(result.message); return; }
      setStatusByConfig(Object.fromEntries(result.statuses.map((item) => [item.configId, { campaignStatus: item.campaignStatus, error: item.error }])));
      setAutoScheduleByConfig(Object.fromEntries(result.statuses.map((item) => [item.configId, item.autoScheduleEnabled])));
    } catch {
      if (statusSequence.current === request && readRevision() === startedRevision) setError("Status/Auto terbaru gagal dimuat; data sebelumnya belum diperbarui.");
    } finally { if (statusSequence.current === request && readRevision() === startedRevision) setStatusesBusy(false); }
  }, [campaigns.length, shopeeAccountId, readRevision]);

  useEffect(() => {
    let disposed = false;
    const sequence = statusSequence;
    queueMicrotask(() => { if (!disposed) void refreshStatuses(); });
    return () => { disposed = true; sequence.current++; };
  }, [refreshStatuses, revision, connected]);

  async function sync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    if (!operation.begin("daily-sync")) return;
    lock.current = true; setBusy(true); setMessage(""); setError("");
    try { const result = await syncAdsterraDailyAction(shopeeAccountId); if (result.success) setMessage(result.message); else setError(result.message); }
    finally { lock.current = false; setBusy(false); operation.end("daily-sync"); }
  }

  async function toggleCampaign(campaign: Campaign, desiredActive: boolean) {
    const toggleKey = `${campaign.id}:${desiredActive}`;
    if (toggleLocks.current.has(toggleKey)) return false;
    if (desiredActive && !operation.begin("campaign-toggle")) return false;
    const startedRevision = readRevision();
    toggleLocks.current.add(toggleKey); (desiredActive ? setTogglingIds : setOffTogglingIds)((current) => new Set(current).add(campaign.id)); setMessage(""); setError(""); setConfirmationError("");
    try {
      const result = await setAdsterraCampaignActiveAction(shopeeAccountId, campaign.id, desiredActive);
      if (readRevision() !== startedRevision) return result.success;
      if (readRevision() === startedRevision && result.campaignStatus) setStatusByConfig((current) => ({ ...current, [campaign.id]: { campaignStatus: result.campaignStatus, error: result.success ? null : result.message } }));
      if (result.success) { setMessage(`Status ${campaign.label || campaign.campaignId} berhasil diverifikasi: ${statusLabels[result.campaignStatus.status]}.`); return true; }
      setError(result.message); setConfirmationError(result.message); return false;
    } finally {
      if (desiredActive) operation.end("campaign-toggle", true); else operation.refresh();
      toggleLocks.current.delete(toggleKey);
      (desiredActive ? setTogglingIds : setOffTogglingIds)((current) => { const next = new Set(current); next.delete(campaign.id); return next; });
    }
  }

  async function confirmToggle() {
    if (!pendingToggle) return;
    const success = await toggleCampaign(pendingToggle.campaign, pendingToggle.desiredActive);
    if (success) setPendingToggle(null);
  }

  async function toggleAutoSchedule(campaign: Campaign, enabled: boolean) {
    if (autoScheduleLocks.current.has(campaign.id)) return;
    if (enabled && !operation.begin("auto-flag")) return;
    const startedRevision = readRevision();
    autoScheduleLocks.current.add(campaign.id);
    setAutoScheduleBusyIds((current) => new Set(current).add(campaign.id));
    setMessage(""); setError("");
    try {
      const result = await setAdsterraAutoScheduleEnabledAction(shopeeAccountId, campaign.id, enabled);
      if (readRevision() !== startedRevision) return;
      if (!result.success) { setError(result.message); return; }
      if (readRevision() === startedRevision) setAutoScheduleByConfig((current) => ({ ...current, [campaign.id]: result.autoScheduleEnabled }));
      setMessage(`Auto ON/OFF ${campaign.label || campaign.campaignId} ${result.autoScheduleEnabled ? "diaktifkan" : "dinonaktifkan"}. ${"warning" in result ? result.warning : ""}`);
    } finally {
      if (enabled) operation.end("auto-flag", true); else operation.refresh();
      autoScheduleLocks.current.delete(campaign.id);
      setAutoScheduleBusyIds((current) => { const next = new Set(current); next.delete(campaign.id); return next; });
    }
  }

  const confirmationBusy = pendingToggle ? (pendingToggle.desiredActive ? togglingIds : offTogglingIds).has(pendingToggle.campaign.id) : false;

  return <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-950">Campaign Adsterra</h3><p className="text-xs text-slate-500">Klik nama untuk laporan harian.</p></div><div className="flex flex-wrap gap-1"><Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={operation.busy || statusesBusy || !connected || campaigns.length === 0} onClick={() => void refreshStatuses()}>{statusesBusy ? "Memuat Status..." : "Refresh Status"}</Button><form onSubmit={sync}><Button className="h-8 px-2 text-xs" disabled={operation.busy || busy || !connected || campaigns.length === 0}>{busy ? "Menyinkronkan..." : "Sync Adsterra"}</Button></form></div></div>
    {!connected && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Koneksi Adsterra belum dikonfigurasi.</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-xs text-slate-500">{placementLists.progress ? `${placementLists.busy ? "Memuat" : "Dibaca"} ${placementLists.progress.completed}/${placementLists.progress.total} campaign` : placementLists.busy ? "Memuat campaign…" : "Daftar API, bukan mode editor."}</p><Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={operation.busy || placementLists.busy || !connected || campaigns.length === 0} onClick={() => void placementLists.refresh()}>{placementLists.busy ? "Memuat…" : "Refresh Semua Daftar API"}</Button></div>
    {placementLists.error && <details role="alert" className="text-xs text-red-700"><summary className="cursor-pointer">Pembacaan belum lengkap. Periksa Detail lalu Refresh.</summary><p className="mt-1">{placementLists.error} Hasil batch sebelumnya tetap ditampilkan; campaign yang belum dibaca tidak dianggap kosong/siap.</p></details>}
    <div className="overflow-hidden rounded-lg border border-slate-200"><div className="overflow-x-auto"><table className="w-full min-w-210 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Campaign</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Metode aplikasi</th><th className="px-3 py-2">Daftar API</th><th className="px-3 py-2">Auto</th><th className="px-3 py-2">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200">{campaigns.map((campaign) => {
      const state = statusByConfig[campaign.id]; const status = state?.campaignStatus?.status; const toggling = togglingIds.has(campaign.id); const autoScheduleBusy = autoScheduleBusyIds.has(campaign.id);
      const lists = placementLists.lists.find((item) => item.configId === campaign.id && item.campaignId === campaign.campaignId);
      const autoEnabled = autoScheduleByConfig[campaign.id] ?? campaign.autoScheduleEnabled;
      const activationBlocked = !!lists && (!lists.application.method
        || (!isLegacyUnconfiguredMethod(lists.application.method) && lists.application.readiness !== "READY"));
      return <tr key={campaign.id} className="align-top"><td className="max-w-64 px-3 py-3"><button type="button" className="break-words text-left font-medium text-slate-950 hover:underline" onClick={() => setSelected(campaign)}>{campaign.label || campaign.campaignId}</button><p className="mt-1 text-xs text-slate-500">ID {campaign.campaignId}</p><p className="break-all text-xs text-slate-500">Tag_link1: {campaign.sourceTag}</p></td><td className="px-3 py-3"><span className={status === "ACTIVE" ? "text-emerald-700" : status === "INACTIVE" ? "text-slate-700" : status ? "text-amber-700" : "text-slate-500"}>{status ? statusLabels[status] : state?.error ? "Tidak diketahui" : statusesBusy ? "Memuat..." : "Belum dimuat"}</span>{state?.error && <details className="mt-1 max-w-48 text-xs text-red-700"><summary className="cursor-pointer">Detail error</summary><p className="mt-1 break-words">{state.error}</p></details>}</td>
        <td className="px-3 py-3"><CampaignMethodControls accountId={shopeeAccountId} configId={campaign.id} info={lists?.application} busy={placementLists.busy}/></td>
        <td className="space-y-2 px-3 py-3"><PlacementListReadout label="Blacklist API" value={lists?.blacklist} busy={placementLists.busy} connected={connected} error={placementLists.error}/><PlacementListReadout label="Whitelist API" value={lists?.whitelist} busy={placementLists.busy} connected={connected} error={placementLists.error}/></td>
        <td className="px-3 py-3"><label className="inline-flex max-w-36 items-start gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={autoEnabled} disabled={autoScheduleBusy || ((operation.busy || activationBlocked) && !autoEnabled)} title={activationBlocked ? lists?.application.message : undefined} onChange={(event) => void toggleAutoSchedule(campaign, event.target.checked)} className="size-4 shrink-0 accent-blue-600" aria-label={`Auto ON/OFF ${campaign.label || campaign.campaignId}`}/>{autoScheduleBusy ? "Menyimpan..." : autoEnabled ? activationBlocked ? "Auto aktif · ON tertahan" : "Aktif" : "Nonaktif"}</label>{activationBlocked && <details className="mt-1 max-w-48 text-xs text-amber-800"><summary className="cursor-pointer">Alasan ON tertahan</summary><p className="mt-1 break-words">{lists?.application.message}</p></details>}</td>
        <td className="px-3 py-3"><div className="flex gap-1">
          {status !== "ACTIVE" && <Button type="button" className="h-8 px-2 text-xs" disabled={operation.busy || toggling || offTogglingIds.has(campaign.id) || statusesBusy || !status || activationBlocked} title={activationBlocked ? lists?.application.message : "Aktifkan campaign"} onClick={() => { setConfirmationError(""); setPendingToggle({ campaign, desiredActive: true }); }}>ON</Button>}
          <Button type="button" variant="destructive" className="h-8 px-2 text-xs" disabled={offTogglingIds.has(campaign.id) || !connected} aria-label={`Matikan ${campaign.label || campaign.campaignId}`} onClick={() => { setConfirmationError(""); setPendingToggle({ campaign, desiredActive: false }); }}>{offTogglingIds.has(campaign.id) ? "OFF…" : "OFF"}</Button>
        </div></td></tr>;
    })}{campaigns.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Belum ada campaign Adsterra.</td></tr>}</tbody></table></div></div>
    </div><AdsterraOperationRecovery accountId={shopeeAccountId} campaigns={campaigns}/>{selected && <AdsterraCampaignHistoryModal shopeeAccountId={shopeeAccountId} configId={selected.id} campaignName={selected.label || selected.campaignId} onClose={() => setSelected(null)} />}
    <div className="relative z-70"><AlertDialog open={pendingToggle !== null} title={pendingToggle?.desiredActive ? "Aktifkan campaign?" : "Matikan campaign?"} description={pendingToggle ? `Campaign ${pendingToggle.campaign.label || pendingToggle.campaign.campaignId} akan ${pendingToggle.desiredActive ? "diaktifkan" : "dinonaktifkan"} di Adsterra.` : ""} confirmLabel={pendingToggle?.desiredActive ? "Aktifkan" : "Matikan"} destructive={pendingToggle?.desiredActive === false} busy={confirmationBusy} error={confirmationError} onCancel={() => setPendingToggle(null)} onConfirm={confirmToggle} /></div>
  </section>;
}
