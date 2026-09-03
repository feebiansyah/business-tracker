"use client";

import { useRouter } from "next/navigation";
import {
  importHistoryParamsToSearch,
  updateImportHistoryParams,
  type HistoryPageInfo,
  type HistoryPageSize,
  type ImportHistoryParams,
} from "@/lib/shopee-import/history-pagination";

type HistoryKind = "commission" | "click";

function visiblePages(page: number, pageCount: number) {
  const first = Math.max(1, Math.min(page - 2, pageCount - 4));
  const last = Math.min(pageCount, first + 4);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function ImportHistoryPagination({ kind, pagination, state }: { kind: HistoryKind; pagination: HistoryPageInfo; state: ImportHistoryParams }) {
  const router = useRouter();
  const navigate = (change: { page?: number; pageSize?: HistoryPageSize }) => {
    router.push(`?${importHistoryParamsToSearch(updateImportHistoryParams(state, kind, change))}`);
  };

  return <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-t px-3 py-3 text-sm sm:items-center sm:px-4">
    <span className="text-slate-500">{pagination.from}–{pagination.to} dari {pagination.total}</span>
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
      <label className="flex items-center gap-2 text-slate-600">Baris
        <select aria-label={`Baris per halaman ${kind}`} value={pagination.pageSize} onChange={(event) => navigate({ pageSize: Number(event.target.value) as HistoryPageSize })} className="rounded-md border border-slate-300 bg-white px-2 py-1">
          {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" disabled={pagination.page <= 1} onClick={() => navigate({ page: pagination.page - 1 })} className="rounded-md border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
      {visiblePages(pagination.page, pagination.pageCount).map((page) => <button key={page} type="button" aria-current={page === pagination.page ? "page" : undefined} onClick={() => navigate({ page })} className={`min-w-8 rounded-md border px-2 py-1 ${page === pagination.page ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>{page}</button>)}
      <button type="button" disabled={pagination.page >= pagination.pageCount} onClick={() => navigate({ page: pagination.page + 1 })} className="rounded-md border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
    </div>
  </div>;
}
