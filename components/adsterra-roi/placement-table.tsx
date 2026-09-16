"use client";

import { useState } from "react";
import type { AdsterraRoiAnalysis } from "@/lib/adsterra-roi/types";
import { getClientPagination } from "@/components/traffic-roi/client-pagination";
import { TrafficRoiPagination } from "@/components/traffic-roi/pagination-controls";
import { formatIdr, formatPercent, formatUsd } from "@/components/clickadu-roi/view-model";

export function PlacementTable({ analysis }: { analysis: AdsterraRoiAnalysis }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const pagination = getClientPagination(analysis.rows.length, page, pageSize);
  const rows = analysis.rows.slice(pagination.startIndex, pagination.endIndex);
  return <div className="max-w-full overflow-hidden rounded-lg border"><div className="overflow-x-auto"><table className="w-full min-w-200 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Placement", "Spend USD", "Spend IDR", "Komisi", "Profit", "ROI", "Status"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.placement}><td className="px-3 py-3 font-medium">{row.placement}</td><td className="px-3 py-3">{formatUsd(row.spentUsd)}</td><td className="px-3 py-3">{formatIdr(row.costIdr)}</td><td className="px-3 py-3">{formatIdr(row.commission)}</td><td className={`px-3 py-3 ${row.profit.startsWith("-") ? "text-red-600" : "text-emerald-700"}`}>{formatIdr(row.profit)}</td><td className="px-3 py-3">{formatPercent(row.roi)}</td><td className={`whitespace-nowrap px-3 py-3 ${row.isBlacklistCandidate ? "text-red-600" : row.roi === null ? "text-slate-500" : "text-emerald-700"}`}>{row.isBlacklistCandidate ? "Kandidat Blacklist" : row.roi === null ? "Tanpa Biaya" : "Aman"}</td></tr>)}</tbody></table></div><TrafficRoiPagination totalRows={analysis.rows.length} label="Placement" page={pagination.page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/></div>;
}
