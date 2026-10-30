import { diagnosticText, type SavedDiagnostics } from "@/lib/adsterra-operations/diagnostics";

/** Saved evidence is distinct from the live snapshot shown by recovery. */
export function OperationDiagnostics({ origin }: { origin: SavedDiagnostics }) {
  return <div className="space-y-1 rounded border bg-slate-50 p-2 text-xs break-words">
    <p className="font-medium">Catatan operasi tersimpan (bukan hasil GET terbaru)</p>
    <p>Tahap: {origin.phase ?? "tidak tersedia"} · Request write terkirim: {origin.writes ?? "tidak tersedia"}</p>
    {origin.entries.length ? <ul className="list-disc space-y-1 pl-4">{origin.entries.map((entry, index) => <li key={index}>{diagnosticText(entry)}</li>)}</ul>
      : <p>Alasan kegagalan asal tidak tersedia pada catatan ini. Jangan mengulang write hanya untuk mencari error.</p>}
    {origin.previous && <div className="border-t pt-1"><p>Penolakan sebelumnya (tetap disimpan):</p>{origin.previous.entries.map((entry, index) => <p key={index}>{diagnosticText(entry)}</p>)}{!origin.previous.entries.length && <p>Alasan lama tidak tersedia; tahap {origin.previous.phase ?? "tidak tersedia"}, write {origin.previous.writes ?? "tidak tersedia"}.</p>}</div>}
  </div>;
}
