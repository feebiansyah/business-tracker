"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getAdsterraCampaignStatusesAction, setAdsterraAutoScheduleEnabledAction, setAdsterraCampaignActiveAction, syncAdsterraDailyAction } from "@/app/shopee/[id]/adsterra-roi/actions";
import { Button } from "@/components/ui/button";
import type { AdsterraCampaignStatusResult } from "@/lib/adsterra-roi/client";
import { AdsterraCampaignHistoryModal } from "./campaign-history-modal";
import { useAdsterraPlacementLists } from "./campaign-placement-lists";
import { useAdsterraOperation } from "./operation-context";
import { CampaignMethodControls } from "./campaign-method-controls";
import { isLegacyUnconfiguredMethod } from "@/lib/adsterra-operations/method-activation";
import { OperationNotice } from "./operation-dialog";

type Campaign = { id: number; campaignId: string; label: string | null; sourceTag: string; autoScheduleEnabled: boolean };
type StatusState = { campaignStatus: AdsterraCampaignStatusResult | null; error: string | null };
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
  // Presentation only: a failed/ambiguous ON must not hide OFF behind a stale
  // INACTIVE status. Only a successful verified toggle clears this affordance.
  const [safetyOffIds, setSafetyOffIds] = useState<Set<number>>(new Set());
  const [autoScheduleByConfig, setAutoScheduleByConfig] = useState<Record<number, boolean>>(() => Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign.autoScheduleEnabled])));
  const [autoScheduleBusyIds, setAutoScheduleBusyIds] = useState<Set<number>>(new Set());
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
    if (desiredActive) setSafetyOffIds((current) => new Set(current).add(campaign.id));
    toggleLocks.current.add(toggleKey); (desiredActive ? setTogglingIds : setOffTogglingIds)((current) => new Set(current).add(campaign.id)); setMessage(""); setError("");
    try {
      const result = await setAdsterraCampaignActiveAction(shopeeAccountId, campaign.id, desiredActive);
      if (readRevision() !== startedRevision) return result.success;
      if (readRevision() === startedRevision && result.campaignStatus) setStatusByConfig((current) => ({ ...current, [campaign.id]: { campaignStatus: result.campaignStatus, error: result.success ? null : result.message } }));
      if (result.success) { operation.setProtectionNeeded(`campaign-toggle-${campaign.id}`, false); setSafetyOffIds((current) => { const next = new Set(current); next.delete(campaign.id); return next; }); setMessage(`Status ${campaign.label || campaign.campaignId} berhasil diverifikasi: ${statusLabels[result.campaignStatus.status]}.`); return true; }
      setError(result.message); operation.setProtectionNeeded(`campaign-toggle-${campaign.id}`, true); return false;
    } catch { setError("Hasil ON/OFF belum dapat dipastikan. Periksa status; jangan ulangi otomatis."); operation.setProtectionNeeded(`campaign-toggle-${campaign.id}`, true); return false; }
    finally {
      if (desiredActive) operation.end("campaign-toggle", true); else operation.refresh();
      toggleLocks.current.delete(toggleKey);
      (desiredActive ? setTogglingIds : setOffTogglingIds)((current) => { const next = new Set(current); next.delete(campaign.id); return next; });
    }
  }

  async function confirmToggle(campaign: Campaign, desiredActive: boolean) {
    if (toggleLocks.current.has(`${campaign.id}:${desiredActive}`)) return;
    if (!window.confirm(`Campaign ${campaign.label || campaign.campaignId} (${campaign.campaignId})\n${desiredActive ? "Aktifkan (ON)" : "Matikan (OFF)"} campaign di Adsterra?`)) return;
    await toggleCampaign(campaign, desiredActive);
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


  return <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-950">Campaign Adsterra</h3><p className="text-xs text-slate-500">Klik nama untuk laporan harian.</p></div><div className="flex flex-wrap gap-1"><Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={operation.busy || statusesBusy || placementLists.busy || !connected || campaigns.length === 0} onClick={() => { void refreshStatuses(); void placementLists.refresh(); }}>{statusesBusy || placementLists.busy ? "Memuat..." : "Refresh Status"}</Button><form onSubmit={sync}><Button className="h-8 px-2 text-xs" disabled={operation.busy || busy || !connected || campaigns.length === 0}>{busy ? "Menyinkronkan..." : "Sync Adsterra"}</Button></form></div></div>
    {!connected && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Koneksi Adsterra belum dikonfigurasi.</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<OperationNotice message={error}/>
    {placementLists.error && <p role="alert" className="text-xs text-amber-800">Pembacaan metode belum lengkap. Gunakan Refresh Status.</p>}
    <div className="overflow-hidden rounded-lg border border-slate-200"><div className="overflow-x-auto"><table className="w-full min-w-170 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Campaign</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Metode</th><th className="px-3 py-2">Auto</th><th className="px-3 py-2">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200">{campaigns.map((campaign) => {
      const state = statusByConfig[campaign.id]; const status = state?.campaignStatus?.status; const toggling = togglingIds.has(campaign.id); const autoScheduleBusy = autoScheduleBusyIds.has(campaign.id);
      const lists = placementLists.lists.find((item) => item.configId === campaign.id && item.campaignId === campaign.campaignId);
      const autoEnabled = autoScheduleByConfig[campaign.id] ?? campaign.autoScheduleEnabled;
      const activationBlocked = !!lists && (!lists.application.method
        || (!isLegacyUnconfiguredMethod(lists.application.method) && lists.application.readiness !== "READY"));
      const offerOff = status === "ACTIVE" || status === "LIMITED" || operation.changing || safetyOffIds.has(campaign.id) || (!status && !!(state?.error || error));
      const reason = activationBlocked ? lists?.application.method?.placementMethod === "WHITELIST" && lists.application.readiness === "NOT_APPLIED"
        ? "Whitelist belum diisi. Terapkan hasil analisis sebelum ON." : lists?.application.message : null;
      return <tr key={campaign.id} className="align-top"><td className="max-w-64 px-3 py-3"><button type="button" className="break-words text-left font-medium text-slate-950 hover:underline" onClick={() => setSelected(campaign)}>{campaign.label || campaign.campaignId}</button><p className="mt-1 text-xs text-slate-500">ID {campaign.campaignId}</p><p className="break-all text-xs text-slate-500">Tag_link1: {campaign.sourceTag}</p></td><td className="px-3 py-3"><span className={status === "ACTIVE" ? "text-emerald-700" : status === "INACTIVE" ? "text-slate-700" : status ? "text-amber-700" : "text-slate-500"}>{status ? statusLabels[status] : state?.error ? "Tidak diketahui" : statusesBusy ? "Memuat..." : "Belum dimuat"}</span>{state?.error && <details className="mt-1 max-w-48 text-xs text-red-700"><summary className="cursor-pointer">Detail error</summary><p className="mt-1 break-words">{state.error}</p></details>}</td>
        <td className="px-3 py-3"><CampaignMethodControls accountId={shopeeAccountId} configId={campaign.id} info={lists?.application} busy={placementLists.busy}/>{reason && <p className="mt-1 max-w-64 text-xs text-amber-800">{reason}</p>}</td>
        <td className="px-3 py-3"><input type="checkbox" checked={autoEnabled} disabled={autoScheduleBusy || ((operation.busy || activationBlocked) && !autoEnabled)} title={autoScheduleBusy ? "Menyimpan Auto…" : reason ?? "Auto ON/OFF"} onChange={(event) => void toggleAutoSchedule(campaign, event.target.checked)} className="size-4 accent-blue-600" aria-label={`Auto ON/OFF ${campaign.label || campaign.campaignId}`}/></td>
        <td className="px-3 py-3">{offerOff ? <Button type="button" variant="destructive" className="h-8 px-2 text-xs" disabled={offTogglingIds.has(campaign.id) || !connected} aria-label={`Matikan ${campaign.label || campaign.campaignId}`} onClick={() => void confirmToggle(campaign, false)}>{offTogglingIds.has(campaign.id) ? "OFF…" : "OFF"}</Button>
          : status === "INACTIVE" ? <Button type="button" className="h-8 px-2 text-xs" disabled={operation.busy || toggling || offTogglingIds.has(campaign.id) || statusesBusy || activationBlocked} title={reason ?? "Aktifkan campaign"} onClick={() => void confirmToggle(campaign, true)}>ON</Button> : <span className="text-xs text-slate-500">—</span>}</td></tr>;
    })}{campaigns.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Belum ada campaign Adsterra.</td></tr>}</tbody></table></div></div>
    </div>{selected && <AdsterraCampaignHistoryModal shopeeAccountId={shopeeAccountId} configId={selected.id} campaignName={selected.label || selected.campaignId} onClose={() => setSelected(null)} />}
  </section>;
}
