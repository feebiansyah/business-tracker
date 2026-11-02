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
  const reason = (status ? message.slice(status.length + 1) : message).trim();
  const primary = headline?.trim() || reason;
  const additionalReason = headline?.trim() && headline.trim() !== reason ? reason : "";
  const hasDetail = !!additionalReason || !!detail;
  return <div role={success ? "status" : "alert"} className={`min-w-0 rounded-lg p-3 text-sm ${success ? "bg-emerald-50 text-emerald-700" : warning ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
    <p><span className="font-medium">{status ? `${labels[status]}: ` : ""}</span>{primary}</p>
    {children}
    {hasDetail && <details className="mt-1 text-xs"><summary className="cursor-pointer">Detail</summary>{additionalReason && <p className="mt-1 whitespace-pre-wrap break-words">{additionalReason}</p>}{detail}</details>}
  </div>;
}
