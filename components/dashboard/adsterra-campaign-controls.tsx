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

  return <section aria-labelledby="dashboard-adsterra-title" className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <h3 id="dashboard-adsterra-title" className="px-3 py-2 text-sm font-semibold text-slate-950">Kontrol Adsterra</h3>
    <div className="max-w-full overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-180 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
          <th className="px-3 py-2 font-medium">Akun Shopee</th>
          <th className="px-3 py-2 font-medium">Campaign</th>
          <th className="px-3 py-2 font-medium">Campaign ID</th>
          <th className="px-3 py-2 font-medium">Status</th>
          <th className="px-3 py-2 text-right font-medium">ON/OFF</th>
        </tr></thead>
        {accounts.map((account) => {
      const accountState = stateByAccount[account.id];
      return <tbody key={account.id} className="divide-y divide-slate-100 border-t border-slate-200">
        {account.campaigns.length === 0 ? <tr><th scope="row" className="max-w-48 break-words px-3 py-2 text-left align-top font-medium text-slate-950">{account.name}</th><td colSpan={4} className="px-3 py-2 text-slate-500">Belum ada campaign Adsterra.</td></tr> : account.campaigns.map((campaign, index) => {
          const item = accountState?.statuses[campaign.id];
          const status = item?.campaignStatus?.status;
          const toggling = togglingIds.has(campaign.id);
          const supportsAction = status === "ACTIVE" || status === "INACTIVE" || status === "LIMITED";
          return <tr key={campaign.id}>
            {index === 0 && <th scope="rowgroup" rowSpan={account.campaigns.length} className="max-w-48 break-words px-3 py-2 text-left align-top font-medium text-slate-950">{account.name}<span className="mt-0.5 block text-xs font-normal text-slate-500">{account.campaigns.length} campaign</span>{accountState?.error && <span role="alert" className="mt-1 block text-xs font-normal text-red-600">{accountState.error}</span>}</th>}
            <td className="max-w-64 break-words px-3 py-2 align-top text-slate-900">{campaign.label || campaign.campaignId}{item?.error && <p className="mt-1 text-xs text-red-600">{item.error}</p>}</td>
            <td className="px-3 py-2 align-top tabular-nums text-slate-500">{campaign.campaignId}</td>
            <td className="px-3 py-2 align-top"><span className={`whitespace-nowrap text-sm font-medium ${status === "ACTIVE" ? "text-emerald-700" : status === "INACTIVE" ? "text-slate-700" : status ? "text-amber-700" : "text-slate-500"}`}>{status ? statusLabels[status] : item?.error ? "Tidak diketahui" : accountState?.loading ? "Memuat..." : "Tidak diketahui"}</span></td>
            <td className="px-3 py-2 text-right align-top">{supportsAction ? <Button type="button" size="icon" variant={status === "INACTIVE" ? "default" : "destructive"} disabled={toggling || accountState?.loading} aria-label={status === "INACTIVE" ? `Aktifkan ${campaign.label || campaign.campaignId}` : `Matikan ${campaign.label || campaign.campaignId}`} onClick={() => { setConfirmationError(""); setPendingToggle({ accountId: account.id, campaign, desiredActive: status === "INACTIVE" }); }}><Power className="size-4" /></Button> : null}</td>
          </tr>;
        })}
      </tbody>;
    })}
        {accounts.length === 0 && <tbody><tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">Belum ada akun Shopee.</td></tr></tbody>}
      </table>
    </div>
    <AlertDialog open={pendingToggle !== null} title={pendingToggle?.desiredActive ? "Aktifkan campaign?" : "Matikan campaign?"} description={pendingToggle ? `Campaign ${pendingToggle.campaign.label || pendingToggle.campaign.campaignId} akan ${pendingToggle.desiredActive ? "diaktifkan" : "dinonaktifkan"} di Adsterra.` : ""} confirmLabel={pendingToggle?.desiredActive ? "Aktifkan" : "Matikan"} destructive={pendingToggle?.desiredActive === false} busy={confirmationBusy} error={confirmationError} onCancel={() => setPendingToggle(null)} onConfirm={confirmToggle} />
  </section>;
}
