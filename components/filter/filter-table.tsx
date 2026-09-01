import Link from "next/link";
import type { FilterCampaignRow } from "@/lib/filter/queries";

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
function money(value: number | null) { return value === null ? "—" : currency.format(value); }
function percent(value: number | null) { return value === null ? "—" : `${value.toFixed(2)}%`; }

export function FilterTable({ shopeeAccountId, campaigns }: { shopeeAccountId: number; campaigns: FilterCampaignRow[] }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-275 text-left text-sm">
    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Campaign", "WL", "Budget/Hari", "Hari", "Total Spend", "+5%", "Total Komisi", "Profit", "% Profit"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
    <tbody className="divide-y divide-slate-200">{campaigns.map((campaign) => <tr key={campaign.id}>
      <td className="px-4 py-3 font-medium text-slate-950"><Link href={`/shopee/${shopeeAccountId}/filter/${campaign.id}`} className="hover:underline">{campaign.name}</Link></td><td className="px-4 py-3 text-slate-600">{campaign.wlName}</td><td className="px-4 py-3 text-slate-600">{money(campaign.budget)}</td><td className="px-4 py-3 text-slate-600">{campaign.days}</td><td className="px-4 py-3 text-slate-600">{money(campaign.totalSpend)}</td><td className="px-4 py-3 text-slate-600">{money(campaign.costWithFee)}</td><td className="px-4 py-3 text-slate-600">{money(campaign.totalCommission)}</td><td className="px-4 py-3 text-slate-600">{money(campaign.profit)}</td><td className="px-4 py-3 text-slate-600">{percent(campaign.profitPercent)}</td>
    </tr>)}{campaigns.length === 0 && <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-500">Belum ada campaign yang memenuhi Filter.</td></tr>}</tbody>
  </table></div>;
}
