"use client";

import { useState, type FormEvent } from "react";
import { placementCustomBids } from "@/lib/adsterra-roi/custom-bids";
import type { AdsterraCustomBid, AdsterraCustomBidsResult } from "@/lib/adsterra-roi/types";

export type CustomBidMutationResult =
  | { success: true; status: "UPDATED" | "NO_CHANGE"; bids: AdsterraCustomBid[] }
  | { success: false; message: string };

export type CustomBidEditorProps = {
  placement: string;
  result: AdsterraCustomBidsResult | null;
  writeBusy?: boolean;
  onSave?: (placement: string, price: string, expectedPrice: string | null) => Promise<CustomBidMutationResult>;
  onDelete?: (placement: string, expectedPrice: string) => Promise<CustomBidMutationResult>;
};

export function CustomBidEditor({ placement, result, writeBusy = false, onSave, onDelete }: CustomBidEditorProps) {
  const bids = result?.success ? placementCustomBids(result.bids, placement) : null;
  const currentIdPrice = bids?.indonesia ?? null;
  const [draft, setDraft] = useState(currentIdPrice ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  if (result === null) return <span className="text-slate-500">Memuat...</span>;
  if (!result.success) return <span className="text-amber-800" title={result.message}>Gagal dimuat</span>;

  const disabled = submitting || writeBusy || !onSave || !onDelete;
  const dirty = draft.trim() !== (currentIdPrice ?? "");
  const canSave = !disabled && dirty && draft.trim() !== "";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !onSave) return;
    if (!window.confirm(`Ini mengubah data Adsterra sungguhan. ${currentIdPrice === null ? "Create baru: POST satu item saja." : "Edit override existing."} Simpan Custom Bid GEO Indonesia (ID) Placement ${placement}, harga ${draft.trim()}? Gunakan campaign uji tanpa bid penting.`)) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await onSave(placement, draft.trim(), currentIdPrice);
      if (!response.success) setMessage(response.message);
      else setMessage(response.status === "UPDATED" ? "Harga disimpan dan diverifikasi." : "Harga sudah sesuai.");
    } catch {
      setMessage("Custom Bid gagal disimpan. Periksa kembali data di Adsterra.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (disabled || currentIdPrice === null || !onDelete) return;
    if (!window.confirm(`Ini mengubah data Adsterra sungguhan. Hapus Custom Bid Indonesia (ID) Placement ${placement}? Override GLOBAL/GEO lain tidak ikut dihapus.`)) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await onDelete(placement, currentIdPrice);
      if (!response.success) setMessage(response.message);
      else setMessage(response.status === "UPDATED" ? "Override ID dihapus dan diverifikasi." : "Tidak ada perubahan.");
    } catch {
      setMessage("Custom Bid gagal dihapus. Periksa kembali data di Adsterra.");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="min-w-64 space-y-2 text-left">
    <div className="space-y-0.5 text-xs tabular-nums">
      {currentIdPrice !== null && <div>ID: {currentIdPrice}</div>}
      {bids?.global !== null && <div>GLOBAL: {bids?.global}</div>}
      {currentIdPrice === null && bids?.global === null && <div className="text-slate-500">Tanpa override ID/GLOBAL</div>}
    </div>
    <form onSubmit={save} className="flex items-center gap-1.5">
      <input
        aria-label={`Harga Custom Bid ID Placement ${placement}`}
        type="number"
        min="0"
        max="200"
        step="any"
        placeholder="Contoh: 0.015"
        value={draft}
        disabled={disabled}
        onChange={(event) => { setDraft(event.target.value); setMessage(""); }}
        className="h-8 w-32 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 disabled:opacity-50"
      />
      <button type="submit" disabled={!canSave} className="h-8 rounded-md bg-blue-600 px-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
        {submitting ? "Proses..." : "Simpan"}
      </button>
      {currentIdPrice !== null && <button type="button" disabled={disabled} onClick={() => void remove()} className="h-8 rounded-md border border-red-300 px-2 text-xs font-medium text-red-700 disabled:opacity-40">Hapus</button>}
    </form>
    {currentIdPrice === null && <p className="max-w-72 whitespace-normal text-xs text-slate-500">Create mengirim satu Placement ID saja. Ketersediaan create diatur oleh server.</p>}
    {message && <p role="status" className="max-w-72 whitespace-normal text-xs text-slate-600">{message}</p>}
  </div>;
}
