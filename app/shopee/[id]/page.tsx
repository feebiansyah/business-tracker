import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/shopee/status-badge";
import { SyncMetaButton } from "@/components/filter/sync-meta-button";
import { ShopeePerformanceCard } from "@/components/dashboard/shopee-performance-card";
import { Button } from "@/components/ui/button";
import { getShopeeDashboardData } from "@/lib/dashboard/queries";
import { prisma } from "@/lib/prisma";
import { formatShopeeActivityTime } from "@/lib/shopee/activity-time";

export const dynamic = "force-dynamic";

export default async function ShopeeAccountDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const shopeeAccountId = Number(id);
  if (!Number.isInteger(shopeeAccountId)) notFound();
  const account = await prisma.shopeeAccount.findUnique({
    where: { id: shopeeAccountId },
    include: {
      metaAccounts: { include: { businessManager: true }, orderBy: { name: "asc" } },
      commissionImports: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      clickImports: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!account) notFound();
  const dashboard = await getShopeeDashboardData(shopeeAccountId, await searchParams, prisma);
  if (!dashboard) notFound();
  const performance = dashboard.accounts[0];

  return (
    <section className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/shopee" className="text-sm text-slate-500 hover:text-slate-900">← Akun Shopee</Link><div className="mt-3 flex items-center gap-3"><h2 className="text-2xl font-semibold tracking-tight text-slate-950">{account.name}</h2><StatusBadge status={account.status} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{account.lastMetaSyncAt ? `Terakhir Sync Meta: ${formatShopeeActivityTime(account.lastMetaSyncAt)}` : "Belum pernah Sync Meta"}</span><span>{account.commissionImports[0] ? `Terakhir Import Komisi: ${formatShopeeActivityTime(account.commissionImports[0].createdAt)}` : "Belum pernah Import Komisi"}</span><span>{account.clickImports[0] ? `Terakhir Import Klik: ${formatShopeeActivityTime(account.clickImports[0].createdAt)}` : "Belum pernah Import Klik"}</span></div></div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto"><SyncMetaButton shopeeAccountId={account.id} /><Button variant="ghost" asChild><Link href={`/shopee/${account.id}/import`}>Import Shopee</Link></Button><Button asChild><Link href={`/meta/new?shopeeAccountId=${account.id}`}>Tambah WL</Link></Button></div>
      </div>
      <div className="space-y-4">
        <form method="get" className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:flex-wrap sm:items-end">
          <label className="grid gap-1 text-xs font-medium text-slate-600">Tanggal Mulai<input type="date" name="from" defaultValue={dashboard.state.from} className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">Tanggal Akhir<input type="date" name="to" defaultValue={dashboard.state.to} className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
          <input type="hidden" name={`sort_${account.id}`} value={performance.state.sort} />
          <input type="hidden" name={`dir_${account.id}`} value={performance.state.dir} />
          <input type="hidden" name={`pageSize_${account.id}`} value={performance.state.pageSize} />
          <button className="h-10 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">Terapkan</button>
          <Link href={`/shopee/${account.id}`} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Reset</Link>
        </form>
        <ShopeePerformanceCard account={performance} dashboardState={dashboard.state} />
      </div>
      <div><h3 className="text-lg font-semibold text-slate-950">WL terhubung</h3><p className="mt-1 text-sm text-slate-500">Ad account Meta yang terhubung ke akun Shopee ini.</p></div>
      <div className="max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="min-w-175 w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3 font-medium sm:px-6">Nama WL</th><th className="px-3 py-3 font-medium sm:px-6">Account ID</th><th className="px-3 py-3 font-medium sm:px-6">Business Manager</th><th className="px-3 py-3 font-medium sm:px-6">Status</th></tr></thead><tbody className="divide-y divide-slate-200">{account.metaAccounts.map((metaAccount) => <tr key={metaAccount.id}><td className="max-w-64 truncate px-3 py-4 font-medium text-slate-900 sm:px-6" title={metaAccount.name}>{metaAccount.name}</td><td className="whitespace-nowrap px-3 py-4 text-slate-600 sm:px-6">{metaAccount.accountId}</td><td className="max-w-64 truncate px-3 py-4 text-slate-600 sm:px-6" title={metaAccount.businessManager?.name ?? "Tanpa BM"}>{metaAccount.businessManager?.name ?? "Tanpa BM"}</td><td className="px-3 py-4 sm:px-6"><StatusBadge status={metaAccount.status} /></td></tr>)}{account.metaAccounts.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500 sm:px-6">Belum ada WL pada akun ini.</td></tr>}</tbody></table></div>
      </div>
    </section>
  );
}
