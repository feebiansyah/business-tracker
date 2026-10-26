import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/shopee/status-badge";
import { ShopeeOverviewSync } from "@/components/dashboard/shopee-overview-sync";
import { ShopeeOverviewTabs } from "@/components/dashboard/shopee-overview-tabs";
import { ShopeePerformanceCard } from "@/components/dashboard/shopee-performance-card";
import { Button } from "@/components/ui/button";
import { getShopeeDashboardData } from "@/lib/dashboard/queries";
import { prisma } from "@/lib/prisma";
import { formatShopeeActivityTime } from "@/lib/shopee/activity-time";
import { ShopeeAccountManagement } from "@/components/shopee/account-management";
import { ShopeeAdsterraOverview } from "@/components/dashboard/shopee-adsterra-overview";
import { getShopeeAdsterraOverview } from "@/lib/dashboard/adsterra-overview";
import { adsterraOverviewParamsToSearch, parseAdsterraOverviewParams } from "@/lib/dashboard/adsterra-overview-params";
import { ShopeeClickaduOverview } from "@/components/dashboard/shopee-clickadu-overview";
import { getShopeeClickaduOverview } from "@/lib/dashboard/clickadu-overview";
import { clickaduOverviewParamsToSearch, parseClickaduOverviewParams } from "@/lib/dashboard/clickadu-overview-params";
import { TrafficBalances } from "@/components/traffic-balances/traffic-balances";
import { getMetaConfig } from "@/lib/meta/config";
import { parseShopeeOverviewTab, shopeeOverviewTabs, withShopeeOverviewTab } from "@/lib/dashboard/shopee-overview-params";

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
      trafficCredentials: { select: { provider: true } },
      _count: { select: { clickaduCampaignConfigs: true, adsterraCampaignConfigs: true } },
    },
  });
  if (!account) notFound();
  const rawSearchParams = await searchParams;
  const dashboard = await getShopeeDashboardData(shopeeAccountId, rawSearchParams, prisma);
  if (!dashboard) notFound();
  const performance = dashboard.accounts[0];
  const adsterraOverview = await getShopeeAdsterraOverview(prisma, shopeeAccountId, dashboard.state.from, dashboard.state.to, parseAdsterraOverviewParams(rawSearchParams));
  const clickaduOverview = await getShopeeClickaduOverview(prisma, shopeeAccountId, dashboard.state.from, dashboard.state.to, parseClickaduOverviewParams(rawSearchParams));
  const overviewTab = parseShopeeOverviewTab(rawSearchParams.overviewTab);
  const preservedSearch = withShopeeOverviewTab(clickaduOverviewParamsToSearch(dashboard.state, clickaduOverview.state, adsterraOverviewParamsToSearch(dashboard.state, adsterraOverview.state).toString()).toString(), overviewTab).toString();
  const tabHrefs = Object.fromEntries(shopeeOverviewTabs.map((tab) => [tab, `?${withShopeeOverviewTab(preservedSearch, tab)}`])) as Record<typeof overviewTab, string>;
  const resetSearch = new URLSearchParams(preservedSearch);
  resetSearch.delete("from"); resetSearch.delete("to");
  resetSearch.set(`page_${account.id}`, "1"); resetSearch.set("clickaduPage", "1"); resetSearch.set("adsterraPage", "1");
  let metaConfigured = false;
  try { getMetaConfig(); metaConfigured = true; } catch { metaConfigured = false; }
  const connected = new Set(account.trafficCredentials.map((credential) => credential.provider));
  const disabledReasons = {
    meta: account.metaAccounts.length === 0 ? "Belum ada WL terhubung." : !metaConfigured ? "Koneksi Meta belum dikonfigurasi." : null,
    clickadu: !connected.has("CLICKADU") ? "Koneksi belum dikonfigurasi." : account._count.clickaduCampaignConfigs === 0 ? "Belum ada campaign." : null,
    adsterra: !connected.has("ADSTERRA") ? "Koneksi belum dikonfigurasi." : account._count.adsterraCampaignConfigs === 0 ? "Belum ada campaign." : null,
  };

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/shopee" className="text-sm text-slate-500 hover:text-slate-900">← Akun Shopee</Link><div className="mt-3 flex items-center gap-3"><h2 className="text-2xl font-semibold tracking-tight text-slate-950">{account.name}</h2><StatusBadge status={account.status} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{account.lastMetaSyncAt ? `Terakhir Sync Meta: ${formatShopeeActivityTime(account.lastMetaSyncAt)}` : "Belum pernah Sync Meta"}</span><span>{account.commissionImports[0] ? `Terakhir Import Komisi: ${formatShopeeActivityTime(account.commissionImports[0].createdAt)}` : "Belum pernah Import Komisi"}</span><span>{account.clickImports[0] ? `Terakhir Import Klik: ${formatShopeeActivityTime(account.clickImports[0].createdAt)}` : "Belum pernah Import Klik"}</span></div></div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button variant="ghost" asChild><Link href={`/shopee/${account.id}/import`}>Import Shopee</Link></Button><Button asChild><Link href={`/meta/new?shopeeAccountId=${account.id}`}>Tambah WL</Link></Button></div>
      </div>
      <ShopeeAccountManagement accountId={account.id} accountName={account.name} />
      <TrafficBalances key={account.id} accounts={[{ id: account.id, name: account.name }]} variant="overview" />
      <ShopeeOverviewSync key={`sync-${account.id}`} accountId={account.id} disabledReasons={disabledReasons} />
      <div className="space-y-4">
        <form method="get" className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:flex-wrap sm:items-end">
          <input type="hidden" name="overviewTab" value={overviewTab} />
          <label className="grid gap-1 text-xs font-medium text-slate-600">Tanggal Mulai<input type="date" name="from" defaultValue={dashboard.state.from} className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">Tanggal Akhir<input type="date" name="to" defaultValue={dashboard.state.to} className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
          <input type="hidden" name={`sort_${account.id}`} value={performance.state.sort} />
          <input type="hidden" name={`dir_${account.id}`} value={performance.state.dir} />
          <input type="hidden" name={`pageSize_${account.id}`} value={performance.state.pageSize} />
          <input type="hidden" name="adsterraSort" value={adsterraOverview.state.sort} />
          <input type="hidden" name="adsterraDir" value={adsterraOverview.state.dir} />
          <input type="hidden" name="adsterraPageSize" value={adsterraOverview.state.pageSize} />
          <input type="hidden" name="clickaduSort" value={clickaduOverview.state.sort} />
          <input type="hidden" name="clickaduDir" value={clickaduOverview.state.dir} />
          <input type="hidden" name="clickaduPageSize" value={clickaduOverview.state.pageSize} />
          <button className="h-10 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">Terapkan</button>
          <Link href={`/shopee/${account.id}?${resetSearch}`} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Reset</Link>
        </form>
        <ShopeeOverviewTabs accountId={account.id} activeTab={overviewTab} hrefs={tabHrefs} panels={{
          meta: <ShopeePerformanceCard account={performance} dashboardState={dashboard.state} preservedSearch={preservedSearch} />,
          clickadu: <ShopeeClickaduOverview overview={clickaduOverview} dashboardState={dashboard.state} preservedSearch={preservedSearch} />,
          adsterra: <ShopeeAdsterraOverview overview={adsterraOverview} dashboardState={dashboard.state} preservedSearch={preservedSearch} />,
        }} />
      </div>
      <details className="group min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-slate-950 focus-visible:outline-2 focus-visible:outline-blue-500">WL terhubung ({account.metaAccounts.length})</summary>
        <p className="px-4 pb-3 text-sm text-slate-500">Ad account Meta yang terhubung ke akun Shopee ini.</p>
      <div className="max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="min-w-175 w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3 font-medium sm:px-6">Nama WL</th><th className="px-3 py-3 font-medium sm:px-6">Account ID</th><th className="px-3 py-3 font-medium sm:px-6">Business Manager</th><th className="px-3 py-3 font-medium sm:px-6">Status</th></tr></thead><tbody className="divide-y divide-slate-200">{account.metaAccounts.map((metaAccount) => <tr key={metaAccount.id}><td className="max-w-64 truncate px-3 py-4 font-medium text-slate-900 sm:px-6" title={metaAccount.name}>{metaAccount.name}</td><td className="whitespace-nowrap px-3 py-4 text-slate-600 sm:px-6">{metaAccount.accountId}</td><td className="max-w-64 truncate px-3 py-4 text-slate-600 sm:px-6" title={metaAccount.businessManager?.name ?? "Tanpa BM"}>{metaAccount.businessManager?.name ?? "Tanpa BM"}</td><td className="px-3 py-4 sm:px-6"><StatusBadge status={metaAccount.status} /></td></tr>)}{account.metaAccounts.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500 sm:px-6">Belum ada WL pada akun ini.</td></tr>}</tbody></table></div>
      </div>
      </details>
    </section>
  );
}
