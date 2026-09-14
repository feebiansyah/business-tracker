import type { ClickaduRoiAnalysis } from "@/lib/clickadu-roi/types";
import { formatIdr, formatPercent, formatUsd } from "./view-model";

export function AnalysisSummary({ analysis }: { analysis: ClickaduRoiAnalysis }) {
  const clicks = analysis.rows.reduce((sum, row) => sum + row.clicks, 0);
  const items = [["Biaya Iklan", formatIdr(analysis.totalCostIdr), formatUsd(analysis.totalSpentUsd)], ["Komisi Bersih Shopee", formatIdr(analysis.totalCommission)], ["Profit", formatIdr(analysis.totalProfit)], ["ROI", formatPercent(analysis.roi)], ["Klik Iklan", new Intl.NumberFormat("id-ID").format(clicks)], ["Kandidat Blacklist", String(analysis.candidateZones.length), "ROI < 30%"]];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{items.map(([label, value, detail]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-950">{value}</p>{detail && <p className="text-xs text-slate-500">{detail}</p>}</div>)}</div>;
}
