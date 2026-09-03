"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CampaignHistoryModal } from "@/components/filter/campaign-history-modal";
import { SortableHeader } from "@/components/filter/sortable-header";
import { TablePagination } from "@/components/filter/table-pagination";
import type { FilterCampaignRow, PageInfo } from "@/lib/filter/queries";
import { filterParamsToSearch, withFilterChange, type FilterParams, type FilterSortKey } from "@/lib/filter/server-pagination";
import { formatRupiah } from "@/lib/filter/table-utils";
import { campaignModeConfig, type CampaignMode } from "@/lib/filter/campaign-modes";

const columns: { key: FilterSortKey; label: string }[] = [
  { key: "name", label: "Campaign" }, { key: "wlName", label: "WL" }, { key: "budget", label: "Budget/Hari" },
  { key: "days", label: "Hari" }, { key: "totalSpend", label: "Total Spend" }, { key: "costWithFee", label: "+5%" },
  { key: "totalCommission", label: "Total Komisi" }, { key: "profit", label: "Profit" }, { key: "profitPercent", label: "% Profit" },
];
function percent(value: number | null) { return value === null ? "—" : `${value.toFixed(2)}%`; }

export function FilterTable({ mode, shopeeAccountId, campaigns, pagination, state }: { mode: CampaignMode; shopeeAccountId: number; campaigns: FilterCampaignRow[]; pagination: PageInfo; state: FilterParams }) {
  const router = useRouter();
  const [selectedCampaign, setSelectedCampaign] = useState<Pick<FilterCampaignRow, "id" | "name"> | null>(null);
  function navigate(change: Partial<FilterParams>) { router.push(`?${filterParamsToSearch(withFilterChange(state, change))}`); }
  function changeSort(sort: FilterSortKey) { navigate({ sort, dir: sort === state.sort && state.dir === "asc" ? "desc" : "asc" }); }

  return <><div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-275 text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <SortableHeader key={column.key} label={column.label} active={state.sort === column.key} direction={state.dir} onSort={() => changeSort(column.key)} />)}</tr></thead>
      <tbody className="divide-y divide-slate-200">{campaigns.map((campaign) => <tr key={campaign.id}>
        <td className="px-4 py-3 font-medium text-slate-950"><button type="button" className="text-left hover:underline" onClick={() => setSelectedCampaign({ id: campaign.id, name: campaign.name })}>{campaign.name}</button></td>
        <td className="px-4 py-3 text-slate-600">{campaign.wlName}</td><td className="px-4 py-3 text-slate-600">{formatRupiah(campaign.budget)}</td>
        <td className="px-4 py-3 text-slate-600">{campaign.days}</td><td className="px-4 py-3 text-slate-600">{formatRupiah(campaign.totalSpend)}</td>
        <td className="px-4 py-3 text-slate-600">{formatRupiah(campaign.costWithFee)}</td><td className="px-4 py-3 text-slate-600">{formatRupiah(campaign.totalCommission)}</td>
        <td className="px-4 py-3 text-slate-600">{formatRupiah(campaign.profit)}</td><td className="px-4 py-3 text-slate-600">{percent(campaign.profitPercent)}</td>
      </tr>)}{pagination.total === 0 && <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-500">Belum ada campaign yang memenuhi {campaignModeConfig[mode].title}.</td></tr>}</tbody>
    </table></div>
    <TablePagination page={pagination.page} pageCount={pagination.pageCount} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => navigate({ page })} onPageSizeChange={(pageSize) => navigate({ pageSize: pageSize as 25 | 50 | 100 })} />
  </div>{selectedCampaign && <CampaignHistoryModal mode={mode} shopeeAccountId={shopeeAccountId} campaignId={selectedCampaign.id} campaignName={selectedCampaign.name} onClose={() => setSelectedCampaign(null)} />}</>;
}
