"use client";

import type { SortDirection } from "@/lib/filter/table-utils";

export function SortableHeader({ label, active, direction, onSort }: { label: string; active: boolean; direction: SortDirection; onSort: () => void }) {
  const indicator = active ? (direction === "asc" ? "↑" : "↓") : "↕";
  return <th className="px-4 py-3 font-medium" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
    <button type="button" onClick={onSort} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-950">
      {label}<span aria-hidden="true" className={active ? "text-slate-950" : "text-slate-400"}>{indicator}</span>
    </button>
  </th>;
}
