"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import type { ClickaduRoiAnalysis, ClickaduRoiRow } from "@/lib/clickadu-roi/types";
import { getClientPagination } from "@/components/traffic-roi/client-pagination";
import { TrafficRoiPagination } from "@/components/traffic-roi/pagination-controls";
import { DEFAULT_ANALYSIS_SORT, decimalSortValue, identifierSortValue, prepareSortRows, sortPreparedRows, type SortColumn, type SortCriterion } from "@/components/traffic-roi/analysis-sorting";
import { AnalysisSortingControls, SortHeader, headerSortDirection, type StatusSortLabels } from "@/components/traffic-roi/sorting-controls";
import { formatIdr, formatPercent, formatUsd, roiStatusLabel } from "./view-model";
import { clickaduListCandidates, type ClickaduListMethod } from "@/lib/clickadu-roi/list-method";
import { hasMinimumDecisionCost } from "@/lib/traffic-roi/decision";

const columns: readonly SortColumn<ClickaduRoiRow>[] = [
  { key: "zone", label: "Zone", value: (row) => identifierSortValue(row.zone) },
  { key: "impressions", label: "Impressions", value: (row) => decimalSortValue(row.impressions) },
  { key: "clicks", label: "Clicks", value: (row) => decimalSortValue(row.clicks) },
  { key: "spentUsd", label: "Spend USD", value: (row) => decimalSortValue(row.spentUsd) },
  { key: "costIdr", label: "Cost IDR", value: (row) => decimalSortValue(row.costIdr) },
  { key: "commission", label: "Komisi", value: (row) => decimalSortValue(row.commission) },
  { key: "profit", label: "Profit", value: (row) => decimalSortValue(row.profit) },
  { key: "roi", label: "ROI", value: (row) => decimalSortValue(row.roi) },
  { key: "status", label: "Status", value: (row) => new Decimal(row.isBlacklistCandidate ? 0 : roiStatusLabel(row) === "Belum Cukup Spend" ? 2 : 1) },
];

const whitelistSortLabels: StatusSortLabels = {
  "blacklist-first": { label: "Kandidat Whitelist di atas", description: "Kandidat Whitelist → Bukan Kandidat Whitelist → Belum Cukup Spend" },
  "safe-first": { label: "Bukan Kandidat Whitelist di atas", description: "Bukan Kandidat Whitelist → Kandidat Whitelist → Belum Cukup Spend" },
  "insufficient-first": { label: "Belum Cukup Spend di atas", description: "Belum Cukup Spend → Kandidat Whitelist → Bukan Kandidat Whitelist" },
};

export function ZoneTable({ analysis, method = "BLACKLIST" }: { analysis: ClickaduRoiAnalysis; method?: ClickaduListMethod }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [criteria, setCriteria] = useState<readonly SortCriterion[]>(DEFAULT_ANALYSIS_SORT);
  const whitelistStatuses = useMemo(() => {
    if (method === "BLACKLIST") return null;
    const candidates = new Set(clickaduListCandidates(analysis, method));
    return new Map(analysis.rows.map((row) => {
      const rank = !hasMinimumDecisionCost(row.costIdr) ? 2 : candidates.has(row.zone) ? 0 : 1;
      return [row.zone, { rank, label: rank === 0 ? "Kandidat Whitelist" : rank === 2 ? "Belum Cukup Spend" : "Bukan Kandidat Whitelist" }];
    }));
  }, [analysis, method]);
  const tableColumns = useMemo(() => whitelistStatuses ? columns.map((column) => column.key === "status"
    ? { ...column, value: (row: ClickaduRoiRow) => new Decimal(whitelistStatuses.get(row.zone)!.rank) } : column) : columns, [whitelistStatuses]);
  const statusLabels = method === "WHITELIST" ? whitelistSortLabels : undefined;
  const prepared = useMemo(() => prepareSortRows(analysis.rows, tableColumns), [analysis.rows, tableColumns]);
  const sortedRows = useMemo(() => sortPreparedRows(prepared, criteria), [prepared, criteria]);
  const pagination = getClientPagination(analysis.rows.length, page, pageSize);
  const rows = sortedRows.slice(pagination.startIndex, pagination.endIndex);

  function changeSort(next: readonly SortCriterion[]) {
    setCriteria(next);
    setPage(1);
  }

  return <div className="max-w-full overflow-hidden rounded-lg border border-slate-200">
    <AnalysisSortingControls columns={tableColumns} criteria={criteria} onChange={changeSort} statusLabels={statusLabels}/>
    <div className="overflow-x-auto"><table className="w-full min-w-250 text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{tableColumns.map((column) => <th key={column.key} scope="col" aria-sort={headerSortDirection(criteria, column.key)} className="whitespace-nowrap px-3 py-3"><SortHeader column={column} criteria={criteria} onChange={changeSort} statusLabels={statusLabels}/></th>)}</tr></thead>
      <tbody className="divide-y divide-slate-200">{rows.map((row) => {
        const whitelistStatus = whitelistStatuses?.get(row.zone);
        const status = whitelistStatus?.label ?? roiStatusLabel(row);
        const loss = row.profit.startsWith("-");
        const statusTone = whitelistStatus ? whitelistStatus.rank === 0 ? "text-emerald-700" : whitelistStatus.rank === 2 ? "text-slate-500" : "text-red-600"
          : row.isBlacklistCandidate ? "text-red-600" : status === "Belum Cukup Spend" ? "text-slate-500" : "text-emerald-700";
        return <tr key={row.zone}>
          <td className="px-3 py-3 font-medium">{row.zone}</td>
          <td className="px-3 py-3">{row.impressions}</td>
          <td className="px-3 py-3">{row.clicks}</td>
          <td className="px-3 py-3">{formatUsd(row.spentUsd)}</td>
          <td className="px-3 py-3">{formatIdr(row.costIdr)}</td>
          <td className="px-3 py-3">{formatIdr(row.commission)}</td>
          <td className={`px-3 py-3 font-medium ${loss ? "text-red-600" : "text-emerald-700"}`}>{formatIdr(row.profit)}</td>
          <td className="px-3 py-3">{formatPercent(row.roi)}</td>
          <td className={`whitespace-nowrap px-3 py-3 font-medium ${statusTone}`}>{status}</td>
        </tr>;
      })}</tbody>
    </table></div>
    <TrafficRoiPagination totalRows={analysis.rows.length} label="Zone" page={pagination.page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
  </div>;
}
