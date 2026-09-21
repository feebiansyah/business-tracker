"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AlertDialog({ open, title, description, cancelLabel = "Batal", confirmLabel, destructive = false, busy = false, error = "", onCancel, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  cancelLabel?: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl" role="alertdialog" aria-modal="true" aria-labelledby="campaign-toggle-title" aria-describedby="campaign-toggle-description">
      <h3 id="campaign-toggle-title" className="text-lg font-semibold text-slate-950">{title}</h3>
      <p id="campaign-toggle-description" className="mt-2 text-sm text-slate-600">{description}</p>
      {error ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
        <Button type="button" variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? "Memproses..." : confirmLabel}
        </Button>
      </div>
    </div>
  </div>;
}
