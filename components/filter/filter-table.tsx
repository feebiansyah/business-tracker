"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SortableHeader } from "@/components/filter/sortable-header";
import { TablePagination } from "@/components/filter/table-pagination";
import type { FilterCampaignRow } from "@/lib/filter/queries";
import { formatRupiah, paginateRows, sortRows, type SortDirection, type SortType, type SortValue } from "@/lib/filter/table-utils";

type SortKey = keyof Pick<FilterCampaignRow, "name" | "wlName" | "budget" | "days" | "totalSpend" | "costWithFee" | "totalCommission" | "profit" | "profitPercent">;
const columns: { key: SortKey; label: string; type: SortType }[] = [
  { key: "name", label: "Campaign", type: "text" }, { key: "wlName", label: "WL", type: "text" },
  { key: "budget", label: "Budget/Hari", type: "number" }, { key: "days", label: "Hari", type: "number" },
  { key: "totalSpend", label: "Total Spend", type: "number" }, { key: "costWithFee", label: "+5%", type: "number" },
  { key: "totalCommission", label: "Total Komisi", type: "number" }, { key: "profit", label: "Profit", type: "number" },
  { key: "profitPercent", label: "% Profit", type: "number" },
];

function percent(value: number | null) { return value === null ? "—" : `${value.toFixed(2)}%`; }

export function FilterTable({ shopeeAccountId, campaigns }: { shopeeAccountId: number; campaigns: FilterCampaignRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("totalSpend");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const sorted = useMemo(() => {
    const column = columns.find((item) => item.key === sortKey)!;
    return sortRows(campaigns, (row) => row[sortKey] as SortValue, direction, column.type);
  }, [campaigns, direction, sortKey]);
  const pagination = paginateRows(sorted, page, pageSize);
  function changeSort(key: SortKey) {
    setDirection(key === sortKey ? (direction === "asc" ? "desc" : "asc") : "asc");
    setSortKey(key);
    setPage(1);
  }
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto"><table className="w-full min-w-275 text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <SortableHeader key={column.key} label={column.label} active={sortKey === column.key} direction={direction} onSort={() => changeSort(column.key)} />)}</tr></thead>
      <tbody className="divide-y divide-slate-200">{pagination.rows.map((campaign) => <tr key={campaign.id}>
        <td className="px-4 py-3 font-medium text-slate-950"><Link href={`/shopee/${shopeeAccountId}/filter/${campaign.id}`} className="hover:underline">{campaign.name}</Link></td>
        <td className="px-4 py-3 text-slate-600">{campaign.wlName}</td><td className="px-4 py-3 text-slate-600">{formatRupiah(campaign.budget)}</td>
        <td className="px-4 py-3 text-slate-600">{campaign.days}</td><td className="px-4 py-3 text-slate-600">{formatRupiah(campaign.totalSpend)}</td>
        <td className="px-4 py-3 text-slate-600">{formatRupiah(campaign.costWithFee)}</td><td className="px-4 py-3 text-slate-600">{formatRupiah(campaign.totalCommission)}</td>
        <td className="px-4 py-3 text-slate-600">{formatRupiah(campaign.profit)}</td><td className="px-4 py-3 text-slate-600">{percent(campaign.profitPercent)}</td>
      </tr>)}{pagination.total === 0 && <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-500">Belum ada campaign yang memenuhi Filter.</td></tr>}</tbody>
    </table></div>
    <TablePagination page={pagination.page} pageCount={pagination.pageCount} total={pagination.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
  </div>;
}
