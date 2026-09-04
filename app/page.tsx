import Link from "next/link";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { ShopeePerformanceCard } from "@/components/dashboard/shopee-performance-card";
import { getDashboardData } from "@/lib/dashboard/queries";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await getDashboardData(await searchParams, prisma);
  if (data.accounts.length === 0) return <DashboardEmptyState />;
  return <section className="min-w-0 space-y-6"><div><p className="text-sm font-medium text-slate-500">Ringkasan performa</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Dashboard Shopee</h2></div><form method="get" className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:flex-wrap sm:items-end"><label className="grid gap-1 text-xs font-medium text-slate-600">Tanggal Mulai<input type="date" name="from" defaultValue={data.state.from} className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-medium text-slate-600">Tanggal Akhir<input type="date" name="to" defaultValue={data.state.to} className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal" /></label>{Object.entries(data.state.accounts).flatMap(([id, state]) => [<input key={`sort-${id}`} type="hidden" name={`sort_${id}`} value={state.sort}/>, <input key={`dir-${id}`} type="hidden" name={`dir_${id}`} value={state.dir}/>, <input key={`size-${id}`} type="hidden" name={`pageSize_${id}`} value={state.pageSize}/>])}<button className="h-10 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">Terapkan</button><Link href="/" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Reset</Link></form><div className="space-y-6">{data.accounts.map((account) => <ShopeePerformanceCard key={account.id} account={account} dashboardState={data.state}/>)}</div></section>;
}
