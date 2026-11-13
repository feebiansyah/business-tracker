import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/shopee/status-badge";
import { ShopeeOverviewSync } from "@/components/dashboard/shopee-overview-sync";
import { ShopeePerformanceCard } from "@/components/dashboard/shopee-performance-card";
import { Button } from "@/components/ui/button";
import { getShopeeDashboardData } from "@/lib/dashboard/queries";
import { prisma } from "@/lib/prisma";
import { formatShopeeActivityTime } from "@/lib/shopee/activity-time";
import { ShopeeAccountManagement } from "@/components/shopee/account-management";
import { TrafficBalances } from "@/components/traffic-balances/traffic-balances";
import { getMetaConfig } from "@/lib/meta/config";
import { dashboardParamsToSearch } from "@/lib/dashboard/params";
import { getMetaSyncProgress } from "@/lib/filter/meta-sync-state";

export const dynamic = "force-dynamic";

export default async function ShopeeAccountDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const shopeeAccountId = Number(id);
  if (!Number.isInteger(shopeeAccountId)) notFound();
  const account = await prisma.shopeeAccount.findUnique({
    where: { id: shopeeAccountId },
    include: {
      metaAccounts: { include: { businessManager: true, _count: { select: { campaigns: { where: { metaStatus: "ACTIVE" } } } } }, orderBy: { name: "asc" } },
      commissionImports: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      clickImports: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      clickaduCampaignConfigs: { select: { label: true, campaignId: true, lastBlacklistReplacedAt: true } },
      adsterraCampaignConfigs: { select: { label: true, campaignId: true, lastBlacklistReplacedAt: true } },
    },
  });
  if (!account) notFound();
  const metaSyncProgress = await getMetaSyncProgress(prisma,shopeeAccountId);
  const emptyWls = account.metaAccounts.filter((wl) => wl._count.campaigns === 0);
  const [noteSummary] = await prisma.$queryRaw<{ count: bigint | number }[]>`
    SELECT COUNT(*) AS count FROM CampaignDailyMetric dm
    INNER JOIN Campaign c ON c.id = dm.campaignId
    INNER JOIN MetaAccount ma ON ma.id = c.metaAccountId
    WHERE ma.shopeeAccountId = ${shopeeAccountId}
      AND dm.completed = false AND dm.note IS NOT NULL AND TRIM(dm.note) <> ''
  `;
  const pendingNotes = Number(noteSummary.count);
  const rawSearchParams = await searchParams;
  const dashboard = await getShopeeDashboardData(shopeeAccountId, rawSearchParams, prisma);
  if (!dashboard) notFound();
  const performance = dashboard.accounts[0];
  const preservedSearch = dashboardParamsToSearch(dashboard.state).toString();
  const resetSearch = new URLSearchParams(preservedSearch);
  resetSearch.delete("from"); resetSearch.delete("to");
  resetSearch.set(`page_${account.id}`, "1");
  let metaConfigured = false;
  try { getMetaConfig(); metaConfigured = true; } catch { metaConfigured = false; }
  const disabledReasons = {
    meta: account.metaAccounts.length === 0 ? "Belum ada WL terhubung." : !metaConfigured ? "Koneksi Meta belum dikonfigurasi." : null,
  };

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/shopee" className="text-sm text-slate-500 hover:text-slate-900">← Akun Shopee</Link><div className="mt-3 flex items-center gap-3"><h2 className="text-2xl font-semibold tracking-tight text-slate-950">{account.name}</h2><StatusBadge status={account.status} /></div></div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button variant="ghost" asChild><Link href={`/shopee/${account.id}/import`}>Import Shopee</Link></Button><Button asChild><Link href={`/meta/new?shopeeAccountId=${account.id}`}>Tambah WL</Link></Button></div>
      </div>
      <ShopeeAccountManagement accountId={account.id} accountName={account.name} />
      <TrafficBalances key={account.id} accounts={[{ id: account.id, name: account.name }]} variant="overview" />
      <section aria-label="Pengingat pekerjaan" className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-sm">
        <h3 className="font-semibold text-slate-950">Pengingat pekerjaan</h3>
        <div className="mt-3"><ShopeeOverviewSync key={`sync-${account.id}`} accountId={account.id} disabledReasons={disabledReasons} initialMetaProgress={metaSyncProgress} /></div>
        <div className="mt-3 grid min-w-0 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          <section aria-label="Shopee & Meta" className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
            <h4 className="text-sm font-semibold text-slate-950">Shopee &amp; Meta</h4>
            <dl className="mt-2 divide-y divide-slate-100 text-slate-700">
              <div className="py-2 first:pt-0"><dt className="text-xs text-slate-500">Sync Meta</dt><dd className="mt-0.5 break-words">{account.lastMetaSyncAt ? formatShopeeActivityTime(account.lastMetaSyncAt) : "Belum pernah"}</dd></div>
              <div className="py-2"><dt className="text-xs text-slate-500">Import Komisi</dt><dd className="mt-0.5 break-words">{account.commissionImports[0] ? formatShopeeActivityTime(account.commissionImports[0].createdAt) : "Belum pernah"}</dd></div>
              <div className="py-2 last:pb-0"><dt className="text-xs text-slate-500">Import Klik</dt><dd className="mt-0.5 break-words">{account.clickImports[0] ? formatShopeeActivityTime(account.clickImports[0].createdAt) : "Belum pernah"}</dd></div>
            </dl>
          </section>
          {[{ name: "Clickadu", configs: account.clickaduCampaignConfigs }, { name: "Adsterra", configs: account.adsterraCampaignConfigs }].map(({ name, configs }) => {
            const missing = configs.filter((config) => config.lastBlacklistReplacedAt === null);
            const latest = configs.reduce<Date | null>((value, config) => config.lastBlacklistReplacedAt && (!value || config.lastBlacklistReplacedAt > value) ? config.lastBlacklistReplacedAt : value, null);
            return <section key={name} aria-label={name} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
              <h4 className="text-sm font-semibold text-slate-950">{name}</h4>
              <dl className="mt-2 divide-y divide-slate-100">
                <div className="pt-2"><dt className="text-xs text-slate-500">Riwayat Replace Blacklist</dt><dd className="mt-0.5 space-y-1 break-words text-slate-700">
              <p>{configs.length === 0 ? "Belum ada campaign" : missing.length === configs.length ? "Belum ada riwayat Replace Blacklist" : missing.length > 0 ? `${missing.length} campaign belum memiliki riwayat Replace Blacklist` : `Riwayat Replace Blacklist terakhir ${formatShopeeActivityTime(latest!)}`}</p>
              {missing.length > 0 && <ul className="space-y-0.5 text-xs">{missing.map((config, index) => <li key={`${config.campaignId}:${index}`} className="break-words [overflow-wrap:anywhere]">{config.label?.trim() || config.campaignId}</li>)}</ul>}
              {missing.length > 0 && latest && <p className="text-xs">Riwayat Replace Blacklist terakhir {formatShopeeActivityTime(latest)}</p>}
                </dd></div>
              </dl>
            </section>;
          })}
        </div>
        <h4 className="mt-3 text-xs font-semibold text-slate-600">Perlu diperiksa</h4>
        <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2">
          <div className={`min-w-0 rounded-lg p-2 ${pendingNotes > 0 ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`}><p>Catatan: {pendingNotes > 0 ? `${pendingNotes} belum selesai` : "Tidak ada catatan belum selesai"}</p></div>
          <div className={`min-w-0 rounded-lg p-2 ${account.metaAccounts.length === 0 ? "bg-slate-50 text-slate-700" : emptyWls.length > 0 ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`}>
            <p>WL: {account.metaAccounts.length === 0 ? "Belum ada WL terhubung" : emptyWls.length === 0 ? "Semua memiliki campaign aktif" : `${emptyWls.length} tanpa campaign aktif`}</p>
            {emptyWls.length > 0 && <ul className="mt-1 space-y-1">{emptyWls.map((wl) => <li key={wl.id} className="flex min-w-0 items-center gap-2"><span className="min-w-0 break-words [overflow-wrap:anywhere]">{wl.name}</span><span className="shrink-0"><StatusBadge status={wl.status} /></span></li>)}</ul>}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Berdasarkan data tersimpan terakhir.</p>
      </section>
      <div className="space-y-4">
        <form method="get" className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:flex-wrap sm:items-end">
          <label className="grid gap-1 text-xs font-medium text-slate-600">Tanggal Mulai<input type="date" name="from" defaultValue={dashboard.state.from} className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">Tanggal Akhir<input type="date" name="to" defaultValue={dashboard.state.to} className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
          <input type="hidden" name={`sort_${account.id}`} value={performance.state.sort} />
          <input type="hidden" name={`dir_${account.id}`} value={performance.state.dir} />
          <input type="hidden" name={`pageSize_${account.id}`} value={performance.state.pageSize} />
          <button className="h-10 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">Terapkan</button>
          <Link href={`/shopee/${account.id}?${resetSearch}`} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Reset</Link>
        </form>
        <ShopeePerformanceCard account={performance} dashboardState={dashboard.state} preservedSearch={preservedSearch} />
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
