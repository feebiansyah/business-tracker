import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getOperationalDashboard } from "@/lib/dashboard/operational-query";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const targetFormatter = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const targetLabel = (value: string) => targetFormatter.format(new Date(`${value}T00:00:00.000Z`));

function DataStatus({ complete, detail }: { complete: boolean; detail?: string }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${complete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{complete ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}{detail ?? (complete ? "Lengkap" : "Belum Lengkap")}</span>;
}

export default async function DashboardPage() {
  const data = await getOperationalDashboard(new Date(), prisma);
  const stats = [["Total Shopee", data.summary.totalShopee], ["Total WL", data.summary.totalWl], ["Campaign Aktif", data.summary.activeCampaigns], ["Perlu Dicek", data.summary.needsAttention]];
  return <section className="min-w-0 space-y-6">
    <header><p className="text-sm font-medium text-blue-600">Operational Dashboard</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Status Data Harian</h2><p className="mt-1 text-sm text-slate-500">Target data: {targetLabel(data.targetDate)}</p></header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p></div>)}</div>
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-175 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Shopee", "Meta", "Komisi", "Klik Shopee", "Status"].map((label) => <th key={label} className="px-3 py-3 font-medium sm:px-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{data.accounts.map((account) => <tr key={account.id}><td className="px-3 py-3 font-medium sm:px-4"><Link href={`/shopee/${account.id}`} className="text-blue-700 hover:underline">{account.name}</Link></td><td className="px-3 py-3 sm:px-4"><DataStatus complete={account.meta.complete} detail={`${account.meta.coveredWlCount}/${account.meta.totalWlCount} WL lengkap`} /></td><td className="px-3 py-3 sm:px-4"><DataStatus complete={account.commissionComplete} /></td><td className="px-3 py-3 sm:px-4"><DataStatus complete={account.clickComplete} /></td><td className="px-3 py-3 sm:px-4"><DataStatus complete={account.complete} detail={account.complete ? "LENGKAP" : "BELUM LENGKAP"} /></td></tr>)}{data.accounts.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Belum ada akun Shopee.</td></tr>}</tbody></table></div></div>
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h3 className="font-semibold text-slate-950">Perlu Perhatian</h3>{data.summary.needsAttention === 0 ? <p className="mt-3 text-sm text-emerald-700">Semua akun Shopee sudah lengkap untuk {targetLabel(data.targetDate)}.</p> : <div className="mt-3 divide-y divide-slate-200">{data.accounts.filter((account) => !account.complete).map((account) => <div key={account.id} className="py-3 first:pt-0 last:pb-0"><Link href={`/shopee/${account.id}`} className="font-medium text-blue-700 hover:underline">{account.name}</Link><ul className="mt-1 space-y-1 text-sm text-slate-600">{!account.meta.complete && <li>• Meta: {account.meta.totalWlCount === 0 ? "belum ada WL terhubung" : `${account.meta.totalWlCount - account.meta.coveredWlCount} WL belum ter-cover sampai D-1`}</li>}{!account.commissionComplete && <li>• Komisi: data D-1 belum diimport</li>}{!account.clickComplete && <li>• Klik Shopee: data D-1 belum diimport</li>}</ul></div>)}</div>}</section>
  </section>;
}
