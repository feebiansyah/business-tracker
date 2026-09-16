"use client";

import { Button } from "@/components/ui/button";
import { TRAFFIC_ROI_PAGE_SIZES, getClientPagination } from "./client-pagination";

export function TrafficRoiPagination({ totalRows, label, page, pageSize, onPageChange, onPageSizeChange }: { totalRows: number; label: string; page: number; pageSize: number; onPageChange(page: number): void; onPageSizeChange(pageSize: number): void }) {
  const pagination = getClientPagination(totalRows, page, pageSize);
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-3 text-sm text-slate-600"><p>Menampilkan {pagination.from}–{pagination.to} dari {totalRows} {label}</p><div className="flex flex-wrap items-center gap-2"><label>Baris <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="ml-1 h-8 rounded-md border border-slate-200 bg-white px-2">{TRAFFIC_ROI_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><Button type="button" variant="ghost" disabled={pagination.page === 1} onClick={() => onPageChange(pagination.page - 1)}>Sebelumnya</Button><span>Halaman {pagination.page} dari {pagination.pageCount}</span><Button type="button" variant="ghost" disabled={pagination.page === pagination.pageCount} onClick={() => onPageChange(pagination.page + 1)}>Berikutnya</Button></div></div>;
}
