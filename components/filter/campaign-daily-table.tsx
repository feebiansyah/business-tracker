import type { FilterCampaignDetail } from "@/lib/filter/queries";

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
function money(value: number | null) { return value === null ? "—" : currency.format(value); }
function numeric(value: number | null) { return value === null ? "—" : number.format(value); }
function percent(value: number | null) { return value === null ? "—" : `${value.toFixed(2)}%`; }

export function CampaignDailyTable({ rows }: { rows: FilterCampaignDetail["dailyMetrics"] }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-350 text-left text-sm">
    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Tanggal", "Spend", "+5%", "Komisi", "Profit", "% Profit", "Klik FP", "Klik Shopee", "% Klik", "CPC FP", "CPC Shopee"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
    <tbody className="divide-y divide-slate-200">{rows.map((row) => <tr key={row.date}><td className="px-4 py-3 font-medium text-slate-950">{row.date}</td><td className="px-4 py-3">{money(row.spend)}</td><td className="px-4 py-3">{money(row.costWithFee)}</td><td className="px-4 py-3">{money(row.commission)}</td><td className="px-4 py-3">{money(row.profit)}</td><td className="px-4 py-3">{percent(row.profitPercent)}</td><td className="px-4 py-3">{numeric(row.clickFp)}</td><td className="px-4 py-3">{numeric(row.shopeeClicks)}</td><td className="px-4 py-3">{percent(row.clickPercent)}</td><td className="px-4 py-3">{money(row.cpcFp)}</td><td className="px-4 py-3">{money(row.cpcShopee)}</td></tr>)}{rows.length === 0 && <tr><td colSpan={11} className="px-6 py-10 text-center text-slate-500">Belum ada histori harian dari Meta.</td></tr>}</tbody>
  </table></div>;
}
