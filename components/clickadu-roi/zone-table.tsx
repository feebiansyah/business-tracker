"use client";

import { useState } from "react";
import type { ClickaduRoiAnalysis } from "@/lib/clickadu-roi/types";
import { getClientPagination } from "@/components/traffic-roi/client-pagination";
import { TrafficRoiPagination } from "@/components/traffic-roi/pagination-controls";
import { formatIdr, formatPercent, formatUsd, roiStatusLabel } from "./view-model";

export function ZoneTable({ analysis }: { analysis: ClickaduRoiAnalysis }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const pagination = getClientPagination(analysis.rows.length, page, pageSize);
  const rows = analysis.rows.slice(pagination.startIndex, pagination.endIndex);
  return <div className="max-w-full overflow-hidden rounded-lg border border-slate-200"><div className="overflow-x-auto"><table className="w-full min-w-250 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Zone", "Impressions", "Clicks", "Spend USD", "Cost IDR", "Komisi", "Profit", "ROI", "Status"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{rows.map((row) => { const status = roiStatusLabel(row); const loss = row.profit.startsWith("-"); const statusTone = row.isBlacklistCandidate ? "text-red-600" : status === "Tanpa Biaya" ? "text-slate-500" : "text-emerald-700"; return <tr key={row.zone}><td className="px-3 py-3 font-medium">{row.zone}</td><td className="px-3 py-3">{row.impressions}</td><td className="px-3 py-3">{row.clicks}</td><td className="px-3 py-3">{formatUsd(row.spentUsd)}</td><td className="px-3 py-3">{formatIdr(row.costIdr)}</td><td className="px-3 py-3">{formatIdr(row.commission)}</td><td className={`px-3 py-3 font-medium ${loss ? "text-red-600" : "text-emerald-700"}`}>{formatIdr(row.profit)}</td><td className="px-3 py-3">{formatPercent(row.roi)}</td><td className={`whitespace-nowrap px-3 py-3 font-medium ${statusTone}`}>{status}</td></tr>;})}</tbody></table></div><TrafficRoiPagination totalRows={analysis.rows.length} label="Zone" page={pagination.page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/></div>;
}
