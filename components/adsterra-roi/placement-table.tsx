"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import type { AdsterraCustomBidsResult, AdsterraRoiAnalysis, AdsterraRoiRow } from "@/lib/adsterra-roi/types";
import { CustomBidEditor, type CustomBidEditorProps } from "./custom-bid-editor";
import { getClientPagination } from "@/components/traffic-roi/client-pagination";
import { TrafficRoiPagination } from "@/components/traffic-roi/pagination-controls";
import { DEFAULT_ANALYSIS_SORT, decimalSortValue, identifierSortValue, prepareSortRows, ratioSortValue, sortPreparedRows, type SortColumn, type SortCriterion } from "@/components/traffic-roi/analysis-sorting";
import { AnalysisSortingControls, SortHeader, headerSortDirection, type StatusSortLabels } from "@/components/traffic-roi/sorting-controls";
import { formatIdr, formatPercent, formatUsd } from "@/components/clickadu-roi/view-model";
import { hasMinimumDecisionCost } from "../../lib/traffic-roi/decision.ts";
import { formatPlacementCtr, formatPlacementCpm } from "./placement-ctr.ts";
import { classifyAdsterraWhitelist, type AdsterraAnalysisListKind } from "@/lib/adsterra-roi/whitelist-analysis";

const whitelistSortLabels: StatusSortLabels = {
  "safe-first": { label: "Kandidat Whitelist di atas", description: "Kandidat Whitelist → Bukan Kandidat Whitelist → Belum Cukup Spend; data unknown terakhir" },
  "blacklist-first": { label: "Bukan Kandidat Whitelist di atas", description: "Bukan Kandidat Whitelist → Kandidat Whitelist → Belum Cukup Spend; data unknown terakhir" },
  "insufficient-first": { label: "Belum Cukup Spend di atas", description: "Belum Cukup Spend → Bukan Kandidat Whitelist → Kandidat Whitelist; data unknown terakhir" },
};
const whitelistLabels = { CANDIDATE: "Kandidat Whitelist", NOT_CANDIDATE: "Bukan Kandidat Whitelist", INSUFFICIENT_SPEND: "Belum Cukup Spend", UNKNOWN: "Data belum tersedia" } as const;

const columns: readonly SortColumn<AdsterraRoiRow>[] = [
  { key: "placement", label: "Placement", value: (row) => identifierSortValue(row.placement) },
  { key: "spentUsd", label: "Spend USD", value: (row) => decimalSortValue(row.spentUsd) },
  { key: "costIdr", label: "Spend IDR", value: (row) => decimalSortValue(row.costIdr) },
  { key: "commission", label: "Komisi", value: (row) => decimalSortValue(row.commission) },
  { key: "profit", label: "Profit", value: (row) => decimalSortValue(row.profit) },
  { key: "roi", label: "ROI", value: (row) => decimalSortValue(row.roi) },
  { key: "ctr", label: "CTR", value: (row) => ratioSortValue(row.clicks, row.impressions, 100) },
  { key: "bidId", label: "Custom Bid ID", value: () => null },
  { key: "bidGlobal", label: "Custom Bid GLOBAL", value: () => null },
  { key: "cpm", label: "CPM USD", value: (row) => ratioSortValue(row.spentUsd, row.impressions, 1000) },
  { key: "status", label: "Status", value: (row) => new Decimal(row.isBlacklistCandidate ? 0 : hasMinimumDecisionCost(row.costIdr) ? 1 : 2) },
];

function bidPlacementId(placement: string) {
  // Match the existing editor's placementCustomBids identity normalization.
  return /^\d+$/.test(placement) && Number.isSafeInteger(Number(placement)) ? String(Number(placement)) : placement;
}

export function PlacementTable({ analysis, customBids, onSaveBid, onDeleteBid, writeBusy = false, listKind = "BLACKLIST" }: {
  analysis: AdsterraRoiAnalysis;
  listKind?: AdsterraAnalysisListKind;
  customBids: AdsterraCustomBidsResult | null;
  onSaveBid?: CustomBidEditorProps["onSave"];
  onDeleteBid?: CustomBidEditorProps["onDelete"];
  writeBusy?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [criteria, setCriteria] = useState<readonly SortCriterion[]>(DEFAULT_ANALYSIS_SORT);
  const whitelistStatuses = useMemo(() => listKind === "WHITELIST"
    ? new Map(analysis.rows.map((row) => [row.placement, classifyAdsterraWhitelist(row)])) : null, [analysis.rows, listKind]);
  const bidSnapshot = useMemo(() => {
    const snapshot = new Map<string, { id: string | null; global: string | null }>();
    if (customBids?.success) for (const bid of customBids.bids) {
      const current = snapshot.get(bid.placementId) ?? { id: null, global: null };
      if (bid.countryCode === "ID" && current.id === null) current.id = bid.price;
      if (bid.countryCode === "GLOBAL" && current.global === null) current.global = bid.price;
      snapshot.set(bid.placementId, current);
    }
    return snapshot;
  }, [customBids]);
  const prepared = useMemo(() => prepareSortRows(analysis.rows, columns.map((column) => {
    if (column.key === "status" && whitelistStatuses) return { ...column, value: (row: AdsterraRoiRow) => {
      const status = whitelistStatuses.get(row.placement);
      return status === "CANDIDATE" ? new Decimal(1) : status === "NOT_CANDIDATE" ? new Decimal(0)
        : status === "INSUFFICIENT_SPEND" ? new Decimal(2) : null;
    } };
    if (column.key !== "bidId" && column.key !== "bidGlobal") return column;
    return { ...column, value: (row: AdsterraRoiRow) => decimalSortValue(bidSnapshot.get(bidPlacementId(row.placement))?.[column.key === "bidId" ? "id" : "global"]) };
  })), [analysis.rows, bidSnapshot, whitelistStatuses]);
  const sortedRows = useMemo(() => sortPreparedRows(prepared, criteria), [prepared, criteria]);
  const pagination = getClientPagination(analysis.rows.length, page, pageSize);
  const rows = sortedRows.slice(pagination.startIndex, pagination.endIndex);

  function changeSort(next: readonly SortCriterion[]) {
    if (writeBusy) return;
    setCriteria(next);
    setPage(1);
  }

  return <div className="max-w-full overflow-hidden rounded-lg border">
    <AnalysisSortingControls columns={columns} criteria={criteria} onChange={changeSort} disabled={writeBusy} statusLabels={listKind === "WHITELIST" ? whitelistSortLabels : undefined}/>
    <div className="overflow-x-auto"><table className="w-full min-w-200 text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{columns.filter((column) => column.key !== "bidGlobal").map((column) => <th key={column.key} scope="col" aria-sort={headerSortDirection(criteria, column.key)} className="whitespace-nowrap px-3 py-3">
        {column.key === "bidId" ? <div className="space-y-1"><span>Custom Bid</span><div className="flex gap-2">{columns.filter((item) => item.key === "bidId" || item.key === "bidGlobal").map((item) => <SortHeader key={item.key} column={{ key: item.key, label: item.key === "bidId" ? "ID" : "GLOBAL" }} criteria={criteria} onChange={changeSort} disabled={writeBusy}/>)}</div></div>
          : <SortHeader column={column.key === "cpm" ? { ...column, label: "CPM (USD)" } : column} criteria={criteria} onChange={changeSort} disabled={writeBusy} statusLabels={listKind === "WHITELIST" ? whitelistSortLabels : undefined}/>}
      </th>)}</tr></thead>
      <tbody className="divide-y">{rows.map((row) => {
        const enoughSpend = hasMinimumDecisionCost(row.costIdr);
        const whitelistStatus = whitelistStatuses?.get(row.placement) ?? "UNKNOWN";
        return <tr key={row.placement}>
          <td className="px-3 py-3 font-medium">{row.placement}</td>
          <td className="px-3 py-3">{formatUsd(row.spentUsd)}</td>
          <td className="px-3 py-3">{formatIdr(row.costIdr)}</td>
          <td className="px-3 py-3">{formatIdr(row.commission)}</td>
          <td className={`px-3 py-3 ${row.profit.startsWith("-") ? "text-red-600" : "text-emerald-700"}`}>{formatIdr(row.profit)}</td>
          <td className="px-3 py-3">{formatPercent(row.roi)}</td>
          <td className="px-3 py-3">{formatPlacementCtr(row.clicks, row.impressions)}</td>
          <td className="px-3 py-3"><CustomBidEditor key={`${row.placement}:${customBids?.success ? (bidSnapshot.get(bidPlacementId(row.placement))?.id ?? "none") : "not-loaded"}`} result={customBids} placement={row.placement} onSave={onSaveBid} onDelete={onDeleteBid} writeBusy={writeBusy}/></td>
          <td className="whitespace-nowrap px-3 py-3 tabular-nums" title="CPM aktual: Spend USD ÷ Impressions × 1.000">{formatPlacementCpm(row.spentUsd, row.impressions)}</td>
          <td className={`whitespace-nowrap px-3 py-3 ${listKind === "WHITELIST" ? whitelistStatus === "CANDIDATE" ? "text-emerald-700" : whitelistStatus === "UNKNOWN" ? "text-amber-700" : "text-slate-500" : row.isBlacklistCandidate ? "text-red-600" : enoughSpend ? "text-emerald-700" : "text-slate-500"}`}>{listKind === "WHITELIST" ? whitelistLabels[whitelistStatus] : row.isBlacklistCandidate ? "Kandidat Blacklist" : enoughSpend ? "Aman" : "Belum Cukup Spend"}</td>
        </tr>;
      })}</tbody>
    </table></div>
    <TrafficRoiPagination totalRows={analysis.rows.length} label="Placement" page={pagination.page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
  </div>;
}

