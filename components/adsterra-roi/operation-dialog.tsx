"use client";

import type { ReactNode } from "react";

export function MethodBadge({ method }: { method: "BLACKLIST" | "WHITELIST" | null }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${method === "BLACKLIST" ? "bg-slate-100 text-slate-800" : method === "WHITELIST" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800"}`}>
    {method === "BLACKLIST" ? "Blacklist" : method === "WHITELIST" ? "Whitelist" : "Belum dipilih"}
  </span>;
}

export function OperationNotice({ message, children, detail, headline }: { message: string; children?: ReactNode; detail?: ReactNode; headline?: string }) {
  if (!message) return <>{children}</>;
  const status = message.match(/^(VERIFIED|NO_CHANGE|RECONFIRM_REQUIRED|PARTIAL|UNVERIFIED):/)?.[1];
  const labels: Record<string, string> = { VERIFIED: "Berhasil", NO_CHANGE: "Sudah sesuai", RECONFIRM_REQUIRED: "Perlu konfirmasi baru", PARTIAL: "Selesai sebagian", UNVERIFIED: "Hasil belum pasti" };
  const success = status === "VERIFIED" || status === "NO_CHANGE";
  const warning = status === "PARTIAL" || status === "UNVERIFIED" || status === "RECONFIRM_REQUIRED";
  const hint = status === "RECONFIRM_REQUIRED" ? "Siapkan kembali dengan data terbaru."
    : status === "UNVERIFIED" ? "Periksa Status sebelum mencoba lagi."
    : status === "PARTIAL" ? "Periksa bagian yang belum selesai pada Detail."
    : !status ? "Lihat alasan dan langkah berikutnya pada Detail." : "";
  return <div role={success ? "status" : "alert"} className={`min-w-0 rounded-lg p-3 text-sm ${success ? "bg-emerald-50 text-emerald-700" : warning ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
    <p className="font-medium">{headline ?? (status ? labels[status] : "Belum berhasil")}{!headline && hint && <span className="font-normal">. {hint}</span>}</p>
    {children}
    <details className="mt-1 text-xs"><summary className="cursor-pointer">Detail</summary><p className="mt-1 whitespace-pre-wrap break-words">{status ? message.slice(status.length + 1).trim() : message}</p>{detail}</details>
  </div>;
}
