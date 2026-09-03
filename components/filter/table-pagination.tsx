"use client";

export function TablePagination({ page, pageCount, total, pageSize, onPageChange, onPageSizeChange }: {
  page: number; pageCount: number; total: number; pageSize: number;
  onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void;
}) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 px-3 py-3 text-sm text-slate-600 sm:items-center sm:px-4">
    <span>{total} baris · Halaman {page} dari {pageCount}</span>
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <label className="flex items-center gap-2">Baris
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="rounded-md border border-slate-300 bg-white px-2 py-1">
          {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">Sebelumnya</button>
      <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">Berikutnya</button>
    </div>
  </div>;
}
