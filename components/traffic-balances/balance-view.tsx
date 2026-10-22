import { RefreshCw, Wallet } from "lucide-react";
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

function BalanceValue({ state, large = false }: { state?: BalanceState; large?: boolean }) {
  const loading = !state || state.status === "LOADING";
  const hasBalance = state?.balance !== null && state?.balance !== undefined;
  return <div className="min-h-24 space-y-1" aria-live="polite" aria-busy={loading}>
    {hasBalance ? <p className={`${large ? "text-2xl" : "text-base"} font-semibold tabular-nums tracking-tight text-slate-950`} title={`${state.balance} USD`}>{formatBalanceUsd(state.balance!)}</p>
      : <p className={`${large ? "text-lg" : "text-sm"} font-medium ${loading ? "animate-pulse text-slate-400" : "text-slate-500"}`}>{loading ? "Sedang memuat…" : state.status === "NOT_CONNECTED" ? "Belum terhubung" : "Gagal memuat saldo"}</p>}
    {state?.updatedAt && <p className="text-xs text-slate-500">Diperbarui {formatBalanceTime(state.updatedAt)}</p>}
    {hasBalance && loading && <p className="text-xs text-slate-500">Memperbarui saldo…</p>}
    {state?.status === "ERROR" && <p role="alert" className="max-w-sm text-xs text-red-600">{hasBalance ? "Pembaruan gagal. Saldo terakhir tetap ditampilkan." : state.message}</p>}
    {state?.status === "NOT_CONNECTED" && <p className="text-xs text-slate-500">Credential provider belum dikonfigurasi.</p>}
  </div>;
}

export function BalanceOverviewView({ accounts, state, onRefresh }: BalanceViewProps) {
  const account = accounts[0];
  if (!account) return null;
  return <div className="grid min-w-0 gap-4 sm:grid-cols-2">{providers.map((provider) => {
    const key = { shopeeAccountId: account.id, provider };
    const item = state[balanceKey(key)];
    const loading = !item || item.status === "LOADING";
    return <section key={provider} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={`Saldo ${labels[provider]}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-slate-700"><Wallet className="size-4 text-slate-400" />Saldo {labels[provider]}</h3>
        <Button type="button" variant="ghost" disabled={loading} onClick={() => onRefresh(key)} aria-label={`Refresh Saldo ${labels[provider]}`} className="h-8 px-2 text-xs"><RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />Refresh Saldo</Button>
      </div>
      <BalanceValue state={item} large />
      <p className="mt-1 text-xs text-slate-400">Saldo akun provider · USD · tidak mengikuti filter tanggal</p>
    </section>;
  })}</div>;
}

export function BalanceDashboardView({ accounts, state, onRefreshAll }: BalanceViewProps) {
  const loading = accounts.some((account) => providers.some((provider) => !state[balanceKey({ shopeeAccountId: account.id, provider })] || state[balanceKey({ shopeeAccountId: account.id, provider })].status === "LOADING"));
  return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Saldo Traffic">
    <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5"><div><h3 className="font-semibold text-slate-950">Saldo Traffic</h3><p className="mt-1 text-sm text-slate-500">Saldo akun provider per Shopee dalam USD. Akun provider yang sama dapat tampil pada beberapa Shopee.</p></div>
      <Button type="button" variant="ghost" onClick={onRefreshAll} disabled={loading || accounts.length === 0}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh Semua Saldo</Button>
    </div>
    <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-145 text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-medium">Akun Shopee</th><th className="px-4 py-3 font-medium">Saldo Clickadu</th><th className="px-4 py-3 font-medium">Saldo Adsterra</th></tr></thead>
      <tbody className="divide-y divide-slate-200">{accounts.map((account) => <tr key={account.id}>
        <td className="px-4 py-4 align-top font-medium text-slate-900">{account.name}</td>
        {providers.map((provider) => <td key={provider} className="px-4 py-4 align-top"><BalanceValue state={state[balanceKey({ shopeeAccountId: account.id, provider })]} /></td>)}
      </tr>)}{accounts.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">Belum ada akun Shopee.</td></tr>}</tbody>
    </table></div>
  </section>;
}
