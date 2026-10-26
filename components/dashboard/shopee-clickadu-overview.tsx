import Link from "next/link";
import Decimal from "decimal.js";
import { DashboardPageSizeSelect } from "./dashboard-page-size-select";
import { clickaduOverviewParamsToSearch, withClickaduOverviewChange, type ClickaduOverviewSortKey } from "@/lib/dashboard/clickadu-overview-params";
import type { ClickaduOverview } from "@/lib/dashboard/clickadu-overview";
import type { DashboardParams } from "@/lib/dashboard/params";

const columns: { key: ClickaduOverviewSortKey; label: string }[] = [
  { key: "date", label: "Tanggal" }, { key: "spendUsd", label: "Spend USD" },
  { key: "spendIdr", label: "Spend IDR" }, { key: "commission", label: "Komisi" },
  { key: "profit", label: "Profit" }, { key: "profitPercent", label: "% Profit" },
];
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });
const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const money = (value: string | null, formatter: Intl.NumberFormat) => value === null ? "—" : formatter.format(Number(value));
const percent = (value: string | null) => value === null ? "—" : `${new Decimal(value).toFixed(2)}%`;
const tone = (value: string | null) => value === null ? "text-slate-950" : new Decimal(value).isNegative() ? "text-red-600" : new Decimal(value).gt(0) ? "text-emerald-600" : "text-slate-950";

export function ShopeeClickaduOverview({ overview, dashboardState, preservedSearch = "" }: {
  overview: ClickaduOverview; dashboardState: DashboardParams; preservedSearch?: string;
}) {
  if (overview.summary === null) return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold tracking-tight text-slate-950">Overview Clickadu</h2>
      <p className="mt-1 text-sm text-slate-500">Kurs tetap: $1 = Rp19.000</p>
      <p className="py-10 text-center text-sm text-slate-500">Belum ada histori harian Clickadu dalam rentang tanggal ini.</p>
    </article>
  );
  const href = (change: Parameters<typeof withClickaduOverviewChange>[1]) =>
    `?${clickaduOverviewParamsToSearch(dashboardState, withClickaduOverviewChange(overview.state, change), preservedSearch)}`;
  const summary = overview.summary;
  const stats = [
    { label: "Total Spend USD", value: money(summary.spendUsd, usd) },
    { label: "Total Spend IDR", value: money(summary.spendIdr, idr) },
    { label: "Komisi", value: money(summary.commissionIdr, idr) },
    { label: "Profit", value: money(summary.profitIdr, idr), tone: tone(summary.profitIdr) },
    { label: "% Profit", value: percent(summary.profitPercent), tone: tone(summary.profitPercent) },
  ];
  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 p-4 sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">Overview Clickadu</h2>
        <p className="mt-1 text-sm text-slate-500">Kurs tetap: $1 = Rp19.000</p>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => <div key={stat.label} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{stat.label}</dt>
            <dd className={`mt-1 break-words text-base font-semibold ${stat.tone ?? "text-slate-950"}`}>{stat.value}</dd>
          </div>)}
        </dl>
        {overview.incompleteDays > 0 && <p className="mt-3 text-xs text-slate-500">— berarti data belum lengkap: setiap campaign terdaftar perlu memiliki spend dan komisi pada tanggal tersebut. Total terkait dan profit tidak ditampilkan sampai lengkap.</p>}
      </header>
      <div className="max-w-full overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-175 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
            {columns.map((column) => {
              const active = overview.state.sort === column.key;
              const dir = active && overview.state.dir === "asc" ? "desc" : "asc";
              return <th key={column.key} aria-sort={active ? overview.state.dir === "asc" ? "ascending" : "descending" : "none"} className="px-3 py-3 font-medium sm:px-4">
                <Link href={href({ sort: column.key, dir })} className="inline-flex items-center gap-1 whitespace-nowrap">
                  {column.label}<span aria-hidden="true">{active ? overview.state.dir === "asc" ? "↑" : "↓" : "↕"}</span>
                </Link>
              </th>;
            })}
          </tr></thead>
          <tbody className="divide-y divide-slate-200">{overview.days.map((row) => <tr key={row.date}>
            <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-950 sm:px-4">{dateFormatter.format(new Date(`${row.date}T00:00:00.000Z`))}</td>
            <td className="whitespace-nowrap px-3 py-3 sm:px-4">{money(row.spendUsd, usd)}</td>
            <td className="whitespace-nowrap px-3 py-3 sm:px-4">{money(row.spendIdr, idr)}</td>
            <td className="whitespace-nowrap px-3 py-3 sm:px-4">{money(row.commissionIdr, idr)}</td>
            <td className={`whitespace-nowrap px-3 py-3 sm:px-4 ${tone(row.profitIdr)}`}>{money(row.profitIdr, idr)}</td>
            <td className={`whitespace-nowrap px-3 py-3 sm:px-4 ${tone(row.profitPercent)}`}>{percent(row.profitPercent)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-3 text-sm text-slate-600 sm:px-4">
        <span>{overview.pagination.total} tanggal · Halaman {overview.pagination.page} dari {overview.pagination.pageCount}</span>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="flex items-center gap-2">Baris <DashboardPageSizeSelect value={overview.pagination.pageSize} hrefs={Object.fromEntries([25, 50, 100].map((size) => [size, href({ pageSize: size as 25 | 50 | 100 })]))} /></label>
          <Link aria-disabled={overview.pagination.page <= 1} href={overview.pagination.page <= 1 ? "#" : href({ page: overview.pagination.page - 1 })} className={`rounded-md border border-slate-300 px-3 py-1 ${overview.pagination.page <= 1 ? "pointer-events-none opacity-40" : ""}`}>Sebelumnya</Link>
          <Link aria-disabled={overview.pagination.page >= overview.pagination.pageCount} href={overview.pagination.page >= overview.pagination.pageCount ? "#" : href({ page: overview.pagination.page + 1 })} className={`rounded-md border border-slate-300 px-3 py-1 ${overview.pagination.page >= overview.pagination.pageCount ? "pointer-events-none opacity-40" : ""}`}>Berikutnya</Link>
        </div>
      </footer>
    </article>
  );
}
