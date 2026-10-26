"use client";

import { useId, useRef, useState } from "react";
import { DEFAULT_ANALYSIS_SORT, STATUS_SORT_OPTIONS, nextHeaderSort, statusSortOption, type SortCriterion } from "./analysis-sorting";

type ColumnOption = { key: string; label: string };
type SortingProps = {
  criteria: readonly SortCriterion[];
  onChange(criteria: readonly SortCriterion[]): void;
  disabled?: boolean;
};

const controlClass = "h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40";

function StatusSortHeader({ criteria, onChange, disabled = false }: SortingProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const priority = criteria.findIndex((item) => item.key === "status");
  const active = criteria[priority];
  const selected = statusSortOption(active?.statusOrder);
  return <details ref={menu} className="min-w-52 normal-case">
    <summary
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={(event) => { if (disabled) event.preventDefault(); }}
      className={`list-none rounded py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:text-blue-700"}`}
    >
      <span className="font-semibold uppercase">Status{active && <sup className="ml-1 text-blue-700">{priority + 1}</sup>} <span aria-hidden="true">▾</span></span>
      <span className={`mt-0.5 block text-xs ${active ? "font-medium text-blue-700" : "font-normal text-slate-500"}`}>{active ? selected.label : "Pilih status teratas"}</span>
    </summary>
    <div role="group" aria-label="Pilih status teratas" className="mt-1 space-y-1 rounded-md border border-slate-200 bg-white p-1 text-xs shadow-sm">
      {STATUS_SORT_OPTIONS.map((option) => <button
        key={option.value} type="button" disabled={disabled}
        aria-pressed={!!active && selected.value === option.value}
        title={option.description}
        className={`block w-full rounded px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40 ${active && selected.value === option.value ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}
        onClick={() => {
          if (disabled) return;
          onChange([{ key: "status", direction: "asc", statusOrder: option.value }]);
          if (menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); }
        }}
      >{option.label}</button>)}
    </div>
  </details>;
}

export function SortHeader({ column, criteria, onChange, disabled = false }: SortingProps & { column: ColumnOption }) {
  if (column.key === "status") return <StatusSortHeader criteria={criteria} onChange={onChange} disabled={disabled}/>;
  const priority = criteria.findIndex((item) => item.key === column.key);
  const active = criteria[priority];
  return <button
    type="button"
    disabled={disabled}
    onClick={(event) => onChange(nextHeaderSort(criteria, column.key, event.shiftKey))}
    aria-label={`Urutkan ${column.label}${active ? `, prioritas ${priority + 1}, ${active.direction.toUpperCase()}` : ""}`}
    title="Klik: urutkan satu kolom. Shift + klik: tambah prioritas / balik arah."
    className="inline-flex items-center gap-1 rounded py-1 text-left font-semibold uppercase hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
  >{column.label}{active && <span aria-hidden="true" className="text-blue-700">{active.direction === "asc" ? "↑" : "↓"}<sup className="ml-0.5">{priority + 1}</sup></span>}</button>;
}

/** aria-sort is unambiguous for single sort; the ordered panel describes multi-sort. */
export function headerSortDirection(criteria: readonly SortCriterion[], key: string) {
  if (criteria.length !== 1 || criteria[0].key !== key) return undefined;
  if (key === "status") return "other" as const;
  return criteria[0].direction === "asc" ? "ascending" as const : "descending" as const;
}

export function AnalysisSortingControls({ columns, criteria, onChange, disabled = false }: SortingProps & { columns: readonly ColumnOption[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const unused = columns.filter((column) => !criteria.some((item) => item.key === column.key));

  function move(index: number, offset: number) {
    const next = [...criteria];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }

  return <div className="space-y-2 border-b border-slate-200 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={controlClass} disabled={disabled} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>Atur Urutan</button>
      <button type="button" className={controlClass} disabled={disabled} onClick={() => onChange(DEFAULT_ANALYSIS_SORT)}>Reset Urutan</button>
      <span className="text-xs text-slate-500">Klik header; Shift + klik untuk multi-sort.</span>
    </div>
    {open && <fieldset id={panelId} disabled={disabled} className="min-w-0 space-y-2 rounded-md bg-slate-50 p-2">
      <legend className="px-1 text-xs font-medium text-slate-700">Prioritas pengurutan (atas terlebih dahulu)</legend>
      <ol className="space-y-2">{criteria.map((criterion, index) => <li key={index} className="flex flex-wrap items-center gap-1.5">
        <span className="w-4 text-xs text-slate-500">{index + 1}.</span>
        <select aria-label={`Kolom prioritas ${index + 1}`} className={`${controlClass} max-w-full`} value={criterion.key} onChange={(event) => onChange(criteria.map((item, position) => position === index ? { key: event.target.value, direction: event.target.value === "status" ? "asc" : item.direction, ...(event.target.value === "status" ? { statusOrder: statusSortOption(item.statusOrder).value } : {}) } : item))}>
          {columns.filter((column) => column.key === criterion.key || !criteria.some((item) => item.key === column.key)).map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
        </select>
        {criterion.key === "status"
          ? <select aria-label={`Urutan Status prioritas ${index + 1}`} className={`${controlClass} max-w-full`} value={statusSortOption(criterion.statusOrder).value} onChange={(event) => onChange(criteria.map((item, position) => position === index ? { ...item, direction: "asc", statusOrder: statusSortOption(event.target.value).value } : item))}>
            {STATUS_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          : <select aria-label={`Arah prioritas ${index + 1}`} className={controlClass} value={criterion.direction} onChange={(event) => onChange(criteria.map((item, position) => position === index ? { ...item, direction: event.target.value === "asc" ? "asc" : "desc" } : item))}>
            <option value="asc">ASC ↑</option><option value="desc">DESC ↓</option>
          </select>}
        <button type="button" className={controlClass} disabled={disabled || index === 0} aria-label={`Naikkan prioritas ${index + 1}`} onClick={() => move(index, -1)}>↑</button>
        <button type="button" className={controlClass} disabled={disabled || index === criteria.length - 1} aria-label={`Turunkan prioritas ${index + 1}`} onClick={() => move(index, 1)}>↓</button>
        <button type="button" className={controlClass} aria-label={`Hapus prioritas ${index + 1}`} onClick={() => onChange(criteria.filter((_, position) => position !== index))}>Hapus</button>
      </li>)}</ol>
      {criteria.length === 0 && <p className="text-xs text-slate-500">Tanpa kriteria: urutan hasil analisis awal.</p>}
      <button type="button" className={controlClass} disabled={disabled || unused.length === 0} onClick={() => { if (unused[0]) onChange([...criteria, { key: unused[0].key, direction: "asc" }]); }}>Tambah kriteria</button>
    </fieldset>}
  </div>;
}
