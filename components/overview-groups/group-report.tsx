import Link from "next/link";
import { StatusBadge } from "@/components/shopee/status-badge";
import { TrafficBalances } from "@/components/traffic-balances/traffic-balances";
import { ShopeePerformanceCard } from "@/components/dashboard/shopee-performance-card";
import { formatShopeeActivityTime } from "@/lib/shopee/activity-time";
import { dashboardParamsToSearch } from "@/lib/dashboard/params";
import type { OverviewGroupData,getGroupPerformance,getGroupReminders } from "@/lib/overview-groups/report";

export type GroupReportProps = {
  group: OverviewGroupData;
  report: Awaited<ReturnType<typeof getGroupPerformance>>;
  reminders: Awaited<ReturnType<typeof getGroupReminders>>;
  search?: string;
};
const activity = (date: Date | null | undefined) => date ? formatShopeeActivityTime(date) : "Belum pernah";
export function OverviewGroupReport({ group,report,reminders,search = "" }: GroupReportProps) {
  const accounts = group.members.map((m) => m.shopeeAccount);
  const names = new Map(accounts.map((a) => [a.id,a.name]));
  const preservedSearch = dashboardParamsToSearch(report.state,search).toString();
  return <section className="min-w-0 space-y-4">
    <header><h2 className="break-words text-2xl font-semibold text-slate-950">{group.name}</h2>
      <p className="mt-1 text-sm text-slate-600">Overview Gabungan · Laporan saja. Sync dan import tetap dilakukan pada masing-masing akun.</p>
      <div className="mt-2 flex flex-wrap gap-2">{accounts.map((a) => <Link key={a.id} href={`/shopee/${a.id}`} className="max-w-full break-words rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-blue-700 [overflow-wrap:anywhere]">{a.name}</Link>)}</div>
    </header>
    <section aria-label="Pengingat pekerjaan" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="font-semibold">Pengingat pekerjaan</h3>
      <h4 className="text-sm font-medium">Aktivitas per akun</h4>
      <div className="grid min-w-0 gap-2 md:grid-cols-2">{accounts.map((a) => <div key={a.id} className="min-w-0 rounded-md border border-slate-200 p-2 text-sm">
        <p className="break-words font-medium">{a.name} <StatusBadge status={a.status} /></p>
        <dl className="mt-1 space-y-1 text-xs text-slate-600">
          <div><dt className="inline">Sync Meta: </dt><dd className="inline">{activity(a.lastMetaSyncAt)}</dd></div>
          <div><dt className="inline">Import Komisi: </dt><dd className="inline">{activity(a.commissionImports[0]?.createdAt)}</dd></div>
          <div><dt className="inline">Import Klik: </dt><dd className="inline">{activity(a.clickImports[0]?.createdAt)}</dd></div>
        </dl>
      </div>)}</div>
      <h4 className="text-sm font-medium">Perlu diperiksa</h4>
      <p className={`rounded-md p-2 text-sm ${reminders.pendingNotes ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`}>Catatan: {reminders.pendingNotes ? `${reminders.pendingNotes} belum selesai` : "Tidak ada catatan belum selesai"}</p>
      <div className="rounded-md bg-slate-50 p-2 text-sm"><p>WL: {accounts.every((a) => a.metaAccounts.length === 0) ? "Belum ada WL terhubung" : reminders.wls.length === 0 ? "Semua memiliki campaign aktif pada data tersimpan" : `${reminders.wls.length} perlu diperiksa pada data tersimpan`}</p>
        {reminders.wls.length > 0 && <ul className="mt-1 space-y-2">{reminders.wls.map((w) => <li key={w.id} className="break-words [overflow-wrap:anywhere]"><span className="font-medium">{names.get(w.shopeeAccountId)} · {w.name}</span> <StatusBadge status={w.status} /><p className="mt-0.5 text-xs">{w.message}</p></li>)}</ul>}
      </div>
      <div className="grid min-w-0 gap-2 md:grid-cols-2">{(["Clickadu","Adsterra"] as const).map((provider) => {
        const configs = accounts.flatMap((a) => (provider === "Clickadu" ? a.clickaduCampaignConfigs : a.adsterraCampaignConfigs).map((c) => ({ ...c,accountName: a.name,accountId: a.id })));
        const occurrences = new Map<string,number>();
        for (const c of configs) occurrences.set(c.campaignId,(occurrences.get(c.campaignId) ?? 0)+1);
        return <section key={provider} className="min-w-0 rounded-md border border-slate-200 p-2 text-xs text-slate-700"><h4 className="font-medium">{provider} · Riwayat Replace Blacklist</h4>
          {configs.length === 0 ? <p className="mt-1">Belum ada campaign</p> : <ul className="mt-1 space-y-1">{configs.map((c) => <li key={`${c.accountId}:${c.campaignId}`} className="break-words [overflow-wrap:anywhere]">{c.accountName} · {c.label?.trim() || c.campaignId} ({c.campaignId}): {c.lastBlacklistReplacedAt ? activity(c.lastBlacklistReplacedAt) : "Belum ada riwayat Replace Blacklist"}{occurrences.get(c.campaignId)! > 1 && <span className="block text-amber-800">Campaign ID juga dikonfigurasi pada anggota lain; laporan tidak dideduplikasi.</span>}</li>)}</ul>}
        </section>;
      })}</div>
      <p className="text-xs text-slate-500">Berdasarkan data tersimpan terakhir.</p>
    </section>
    <p className="text-xs text-slate-500">Saldo dan estimasi sisa hari tetap per akun/provider; tidak dijumlahkan karena wallet dapat sama.</p>
    <TrafficBalances accounts={accounts.map((a) => ({ id: a.id,name: a.name }))} variant="dashboard" />
    <form method="get" className="flex min-w-0 flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <label className="grid min-w-0 gap-1">Tanggal Mulai<input type="date" name="from" defaultValue={report.state.from} className="min-w-0 rounded-md border border-slate-300 px-2 py-2" /></label>
      <label className="grid min-w-0 gap-1">Tanggal Akhir<input type="date" name="to" defaultValue={report.state.to} className="min-w-0 rounded-md border border-slate-300 px-2 py-2" /></label>
      <input type="hidden" name={`sort_${group.id}`} value={report.performance.state.sort} />
      <input type="hidden" name={`dir_${group.id}`} value={report.performance.state.dir} />
      <input type="hidden" name={`pageSize_${group.id}`} value={report.performance.state.pageSize} />
      <button className="rounded-md bg-blue-600 px-3 py-2 text-white">Terapkan</button>
      <Link href={`/overview-gabungan/${group.id}`} className="rounded-md border border-slate-300 px-3 py-2">Reset</Link>
    </form>
    <p className="text-xs text-slate-600">Ringkasan Meta mengikuti rumus existing dan hanya menjumlahkan tanggal dengan spend serta komisi seluruh anggota tersedia. {report.incompleteDays > 0 ? `${report.incompleteDays} tanggal belum lengkap; nilai yang belum tersedia ditampilkan —, bukan nol.` : "Tidak ada tanggal belum lengkap pada data laporan."}</p>
    <ShopeePerformanceCard account={report.performance} dashboardState={report.state} preservedSearch={preservedSearch} />
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><h3 className="font-semibold">WL terhubung ({report.performance.wlCount})</h3>
      <ul className="mt-2 grid min-w-0 gap-2 text-sm md:grid-cols-2">{accounts.flatMap((a) => a.metaAccounts.map((w) => <li key={w.id} className="min-w-0 break-words rounded-md border border-slate-100 p-2 [overflow-wrap:anywhere]"><span className="font-medium">{a.name} · {w.name}</span> <StatusBadge status={w.status} /><p className="text-xs text-slate-500">{w.accountId} · {w.businessManager?.name ?? "Tanpa BM"}</p></li>))}</ul>
    </section>
  </section>;
}
