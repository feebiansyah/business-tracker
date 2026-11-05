import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { AdsterraCampaignControls } from "@/components/dashboard/adsterra-campaign-controls";
import { getOperationalDashboard } from "@/lib/dashboard/operational-query";
import { prisma } from "@/lib/prisma";
import { TrafficBalances } from "@/components/traffic-balances/traffic-balances";

export const dynamic = "force-dynamic";

const targetFormatter = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const targetLabel = (value: string) => targetFormatter.format(new Date(`${value}T00:00:00.000Z`));

function DataStatus({ complete, detail }: { complete: boolean; detail?: string }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${complete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{complete ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}{detail ?? (complete ? "Lengkap" : "Belum Lengkap")}</span>;
}

export default async function DashboardPage() {
  const data = await getOperationalDashboard(new Date(), prisma);
  const stats = [["Total Shopee", data.summary.totalShopee], ["Total WL", data.summary.totalWl], ["Campaign Aktif", data.summary.activeCampaigns], ["Perlu Dicek", data.summary.needsAttention]];
  return <section className="min-w-0 space-y-4">
    <header><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Dashboard</h2><p className="mt-1 text-sm text-slate-500">Target data: {targetLabel(data.targetDate)}</p></header>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-950">{value}</p></div>)}</div>
    <section aria-labelledby="dashboard-work-title" className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <h3 id="dashboard-work-title" className="px-3 py-2 text-sm font-semibold text-slate-950">Status pekerjaan per Shopee</h3>
      <div className="max-w-full overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-175 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Shopee", "Data D-1", "Pengingat", "Status"].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-200">
            {data.accounts.map((account) => {
              const reminders = [
                account.pendingNoteCount > 0 ? `${account.pendingNoteCount} catatan belum selesai` : null,
                account.emptyActiveWlCount > 0 ? `${account.emptyActiveWlCount} WL aktif tanpa campaign aktif` : null,
                !account.clickadu.complete ? `Clickadu: ${account.clickadu.coveredConfigCount}/${account.clickadu.totalConfigCount} campaign ter-cover D-1` : null,
                !account.adsterra.complete ? `Adsterra: ${account.adsterra.coveredConfigCount}/${account.adsterra.totalConfigCount} campaign ter-cover D-1` : null,
              ].filter((message) => message !== null);
              return <tr key={account.id}>
                <td className="max-w-64 break-words px-3 py-2 align-top font-medium"><Link href={`/shopee/${account.id}`} className="text-blue-700 hover:underline">{account.name}</Link></td>
                <td className="px-3 py-2 align-top"><div className="flex flex-wrap gap-x-3 gap-y-2">
                  <div><p className="mb-1 text-xs text-slate-500">Meta</p><DataStatus complete={account.meta.complete} detail={`${account.meta.coveredWlCount}/${account.meta.totalWlCount} WL`} /></div>
                  <div><p className="mb-1 text-xs text-slate-500">Komisi</p><DataStatus complete={account.commissionComplete} detail={account.commissionComplete ? "Lengkap" : "Belum"} /></div>
                  <div><p className="mb-1 text-xs text-slate-500">Klik Shopee</p><DataStatus complete={account.clickComplete} detail={account.clickComplete ? "Lengkap" : "Belum"} /></div>
                </div></td>
                <td className="px-3 py-2 align-top">{reminders.length === 0 ? <p className="text-emerald-700">Tidak ada pengingat</p> : <ul className="space-y-1 text-amber-800">{reminders.map((message) => <li key={message}>{message}</li>)}</ul>}</td>
                <td className="px-3 py-2 align-top"><DataStatus complete={account.complete} detail={account.complete ? "LENGKAP" : "PERLU DICEK"} /></td>
              </tr>;
            })}
            {data.accounts.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">Belum ada akun Shopee.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
    <TrafficBalances accounts={data.accounts.map(({ id, name }) => ({ id, name }))} variant="dashboard" />
    <AdsterraCampaignControls accounts={data.accounts.map((account) => ({ id: account.id, name: account.name, campaigns: account.adsterraCampaigns }))} />
  </section>;
}
