"use client";

import { useEffect, useRef, useState } from "react";
import { Power } from "lucide-react";
import {
  getAdsterraCampaignStatusesAction,
  setAdsterraCampaignActiveAction,
} from "@/app/shopee/[id]/adsterra-roi/actions";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AdsterraCampaignStatusResult } from "@/lib/adsterra-roi/client";

type Campaign = { id: number; campaignId: string; label: string | null };
type Account = { id: number; name: string; campaigns: Campaign[] };
type CampaignState = { campaignStatus: AdsterraCampaignStatusResult | null; error: string | null };
type AccountState = { loading: boolean; error: string; statuses: Record<number, CampaignState> };
type PendingToggle = { accountId: number; campaign: Campaign; desiredActive: boolean };

const statusLabels = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  LIMITED: "Limit",
  NOT_IN_USE: "Not in use",
} as const;

export function AdsterraCampaignControls({ accounts }: { accounts: Account[] }) {
  const [stateByAccount, setStateByAccount] = useState<Record<number, AccountState>>(() =>
    Object.fromEntries(
      accounts
        .filter((account) => account.campaigns.length > 0)
        .map((account) => [account.id, { loading: true, error: "", statuses: {} }]),
    ),
  );
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const toggleLocks = useRef(new Set<number>());

  useEffect(() => {
    let active = true;
    for (const account of accounts) {
      if (account.campaigns.length === 0) continue;
      void getAdsterraCampaignStatusesAction(account.id).then((result) => {
        if (!active) return;
        setStateByAccount((current) => ({
          ...current,
          [account.id]: result.success
            ? {
                loading: false,
                error: "",
                statuses: Object.fromEntries(result.statuses.map((item) => [item.configId, { campaignStatus: item.campaignStatus, error: item.error }])),
              }
            : { loading: false, error: result.message, statuses: {} },
        }));
      });
    }
    return () => { active = false; };
  }, [accounts]);

  async function confirmToggle() {
    if (!pendingToggle || toggleLocks.current.has(pendingToggle.campaign.id)) return;
    const { accountId, campaign, desiredActive } = pendingToggle;
    toggleLocks.current.add(campaign.id);
    setTogglingIds((current) => new Set(current).add(campaign.id));
    setConfirmationError("");
    try {
      const result = await setAdsterraCampaignActiveAction(accountId, campaign.id, desiredActive);
      if (result.campaignStatus) {
        setStateByAccount((current) => ({
          ...current,
          [accountId]: {
            ...(current[accountId] ?? { loading: false, error: "", statuses: {} }),
            statuses: {
              ...(current[accountId]?.statuses ?? {}),
              [campaign.id]: { campaignStatus: result.campaignStatus, error: result.success ? null : result.message },
            },
          },
        }));
      }
      if (result.success) setPendingToggle(null);
      else setConfirmationError(result.message);
    } finally {
      toggleLocks.current.delete(campaign.id);
      setTogglingIds((current) => { const next = new Set(current); next.delete(campaign.id); return next; });
    }
  }

  const confirmationBusy = pendingToggle ? togglingIds.has(pendingToggle.campaign.id) : false;

  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div><h3 className="font-semibold text-slate-950">Kontrol Adsterra</h3><p className="mt-1 text-sm text-slate-500">Status aktual dan kontrol manual campaign Terra per akun Shopee.</p></div>
    <div className="grid gap-4 lg:grid-cols-2">{accounts.map((account) => {
      const accountState = stateByAccount[account.id];
      return <article key={account.id} className="min-w-0 rounded-lg border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-3 sm:px-4"><h4 className="font-medium text-slate-950">{account.name}</h4>{accountState?.error && <p role="alert" className="mt-1 text-xs text-red-600">{accountState.error}</p>}</div>
        {account.campaigns.length === 0 ? <p className="px-3 py-6 text-sm text-slate-500 sm:px-4">Belum ada campaign Adsterra.</p> : <div className="divide-y divide-slate-200">{account.campaigns.map((campaign) => {
          const item = accountState?.statuses[campaign.id];
          const status = item?.campaignStatus?.status;
          const toggling = togglingIds.has(campaign.id);
          const supportsAction = status === "ACTIVE" || status === "INACTIVE" || status === "LIMITED";
          return <div key={campaign.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
            <div className="min-w-0"><p className="truncate font-medium text-slate-900">{campaign.label || campaign.campaignId}</p><p className="mt-0.5 text-xs text-slate-500">Campaign ID: {campaign.campaignId}</p>{item?.error && <p className="mt-1 text-xs text-red-600">{item.error}</p>}</div>
            <div className="flex items-center gap-3"><span className={`text-sm font-medium ${status === "ACTIVE" ? "text-emerald-700" : status === "INACTIVE" ? "text-slate-700" : status ? "text-amber-700" : "text-slate-500"}`}>{status ? statusLabels[status] : item?.error ? "Tidak diketahui" : accountState?.loading ? "Memuat..." : "Tidak diketahui"}</span>{supportsAction ? <Button type="button" size="icon" variant={status === "INACTIVE" ? "default" : "destructive"} disabled={toggling || accountState?.loading} aria-label={status === "INACTIVE" ? `Aktifkan ${campaign.label || campaign.campaignId}` : `Matikan ${campaign.label || campaign.campaignId}`} onClick={() => { setConfirmationError(""); setPendingToggle({ accountId: account.id, campaign, desiredActive: status === "INACTIVE" }); }}><Power className="size-4" /></Button> : null}</div>
          </div>;
        })}</div>}
      </article>;
    })}</div>
    <AlertDialog open={pendingToggle !== null} title={pendingToggle?.desiredActive ? "Aktifkan campaign?" : "Matikan campaign?"} description={pendingToggle ? `Campaign ${pendingToggle.campaign.label || pendingToggle.campaign.campaignId} akan ${pendingToggle.desiredActive ? "diaktifkan" : "dinonaktifkan"} di Adsterra.` : ""} confirmLabel={pendingToggle?.desiredActive ? "Aktifkan" : "Matikan"} destructive={pendingToggle?.desiredActive === false} busy={confirmationBusy} error={confirmationError} onCancel={() => setPendingToggle(null)} onConfirm={confirmToggle} />
  </section>;
}
