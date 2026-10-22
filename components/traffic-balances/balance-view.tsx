import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBalanceTime, formatBalanceUsd, type BalanceState } from "@/lib/traffic-balances/refresh-state";
import { balanceKey, type BalanceKey, type BalanceProvider } from "@/lib/traffic-balances/types";

export type BalanceAccount = { id: number; name: string };
export type BalanceViewProps = {
  accounts: BalanceAccount[];
  state: Record<string, BalanceState>;
  onRefresh(key: BalanceKey): void;
  onRefreshAll(): void;
};
const providers: BalanceProvider[] = ["CLICKADU", "ADSTERRA"];
const labels = { CLICKADU: "Clickadu", ADSTERRA: "Adsterra" };

function BalanceValue({ state }: { state?: BalanceState }) {
  const loading = !state || state.status === "LOADING";
  const hasBalance = state?.balance !== null && state?.balance !== undefined;
  const title = [hasBalance ? `${state.balance} USD` : "", state?.updatedAt ? `Diperbarui ${formatBalanceTime(state.updatedAt)}` : ""].filter(Boolean).join(" · ");
  return <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm leading-5" title={title || undefined} aria-live="polite" aria-busy={loading}>
    {hasBalance ? <span className="whitespace-nowrap font-semibold tabular-nums text-slate-950">{formatBalanceUsd(state.balance!)}</span>
      : <span className={loading ? "animate-pulse whitespace-nowrap text-slate-400" : "whitespace-nowrap text-slate-500"} title={state?.status === "NOT_CONNECTED" ? "Credential provider belum dikonfigurasi." : undefined}>{loading ? "Memuat…" : state.status === "NOT_CONNECTED" ? "Belum terhubung" : "Gagal memuat"}</span>}
    {hasBalance && loading && <span className="text-xs text-slate-500">Memuat…</span>}
    {state?.status === "ERROR" && <span role="alert" className="whitespace-nowrap text-xs text-red-600" title={hasBalance ? `${state.message} Saldo terakhir tetap ditampilkan.` : state.message}>{hasBalance ? "Gagal diperbarui" : "Coba refresh"}</span>}
  </span>;
}

export function BalanceOverviewView({ accounts, state, onRefresh }: BalanceViewProps) {
  const account = accounts[0];
  if (!account) return null;
  return <section className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2" aria-label="Saldo Traffic">{providers.map((provider) => {
    const key = { shopeeAccountId: account.id, provider };
    const item = state[balanceKey(key)];
    const loading = !item || item.status === "LOADING";
    return <div key={provider} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5" aria-label={`Saldo ${labels[provider]}`}>
      <span className="text-sm text-slate-600">{labels[provider]}</span>
      <BalanceValue state={item} />
      <Button type="button" variant="ghost" size="icon" disabled={loading} onClick={() => onRefresh(key)} aria-label={`Refresh Saldo ${labels[provider]}`} title={`Refresh Saldo ${labels[provider]}`} className="size-7"><RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
    </div>;
  })}</section>;
}

export function BalanceDashboardView({ accounts, state, onRefreshAll }: BalanceViewProps) {
  const loading = accounts.some((account) => providers.some((provider) => !state[balanceKey({ shopeeAccountId: account.id, provider })] || state[balanceKey({ shopeeAccountId: account.id, provider })].status === "LOADING"));
  return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Saldo Traffic">
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"><h3 className="text-sm font-semibold text-slate-950">Saldo Traffic</h3>
      <Button type="button" variant="ghost" onClick={onRefreshAll} disabled={loading || accounts.length === 0} className="h-7 px-2 text-xs"><RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />Refresh Semua Saldo</Button>
    </div>
    <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-110 text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2 font-medium">Akun Shopee</th><th className="px-3 py-2 font-medium">Clickadu</th><th className="px-3 py-2 font-medium">Adsterra</th></tr></thead>
      <tbody className="divide-y divide-slate-200">{accounts.map((account) => <tr key={account.id}>
        <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-slate-900">{account.name}</td>
        {providers.map((provider) => <td key={provider} className="px-3 py-2 align-top"><BalanceValue state={state[balanceKey({ shopeeAccountId: account.id, provider })]} /></td>)}
      </tr>)}{accounts.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">Belum ada akun Shopee.</td></tr>}</tbody>
    </table></div>
  </section>;
}
