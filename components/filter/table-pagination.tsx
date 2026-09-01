"use client";

export function TablePagination({ page, pageCount, total, pageSize, onPageChange, onPageSizeChange }: {
  page: number; pageCount: number; total: number; pageSize: number;
  onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
    <span>{total} baris · Halaman {page} dari {pageCount}</span>
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2">Baris
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="rounded-md border border-slate-300 bg-white px-2 py-1">
          {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-md border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40">Sebelumnya</button>
      <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="rounded-md border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40">Berikutnya</button>
    </div>
  </div>;
}
