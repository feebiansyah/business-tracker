"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

/** Modeless by design: the existing protective controls remain reachable. */
export function OperationDialog({ title, busy, onClose, children }: {
  title: string; busy: boolean; onClose(): void; children: ReactNode;
}) {
  const titleId = useId(), dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { dialog.current?.focus(); }, [title]);
  return createPortal(<div className="pointer-events-none fixed inset-0 z-60 flex items-end justify-end p-2 sm:p-4">
    <div ref={dialog} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); if (!busy) onClose(); } }}
      className="pointer-events-auto flex max-h-[80dvh] w-full min-w-0 max-w-xl flex-col rounded-xl border border-slate-300 bg-white text-sm shadow-2xl focus-visible:outline-2 focus-visible:outline-blue-600">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <h3 id={titleId} className="min-w-0 break-words font-semibold text-slate-950">{title}</h3>
        <Button type="button" variant="ghost" className="h-7 shrink-0 px-2" disabled={busy} aria-label={`Tutup ${title}`} onClick={onClose}>Tutup</Button>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4">{children}</div>
      <p className="border-t px-4 py-2 text-xs text-slate-500">Pengaman Campaign tetap tersedia di halaman. {busy ? "Operasi berjalan; tunggu hasilnya." : "Esc untuk menutup."}</p>
    </div>
  </div>, document.body);
}

export function MethodBadge({ method }: { method: "BLACKLIST" | "WHITELIST" | null }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${method === "BLACKLIST" ? "bg-slate-100 text-slate-800" : method === "WHITELIST" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800"}`}>
    {method === "BLACKLIST" ? "Blacklist" : method === "WHITELIST" ? "Whitelist" : "Belum dipilih"}
  </span>;
}

export function OperationNotice({ message }: { message: string }) {
  if (!message) return null;
  const status = message.match(/^(VERIFIED|NO_CHANGE|RECONFIRM_REQUIRED|PARTIAL|UNVERIFIED):/)?.[1];
  const labels: Record<string, string> = { VERIFIED: "Terverifikasi", NO_CHANGE: "Tidak ada perubahan", RECONFIRM_REQUIRED: "Perlu konfirmasi ulang", PARTIAL: "Selesai sebagian", UNVERIFIED: "Hasil belum pasti" };
  return <div role="status" className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
    <p className="font-medium">{status ? labels[status] : "Periksa hasil operasi"}. Baca Detail sebelum melanjutkan.</p>
    <details className="mt-1"><summary className="cursor-pointer">Detail hasil</summary><p className="mt-1 whitespace-pre-wrap break-words">{message}</p></details>
  </div>;
}
