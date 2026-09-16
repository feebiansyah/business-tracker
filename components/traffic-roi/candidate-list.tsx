"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TrafficRoiCandidateList({ ids, noun, copyLabel }: { ids: string[]; noun: string; copyLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div className="min-w-0"><p className="font-medium">{ids.length} {noun} kandidat blacklist</p>{expanded && <p className="mt-1 break-words text-sm text-slate-600">{ids.join(", ") || "Tidak ada kandidat."}</p>}</div><div className="flex flex-wrap gap-2">{!!ids.length && <Button type="button" variant="ghost" onClick={() => setExpanded((value) => !value)}>{expanded ? "Sembunyikan daftar" : "Lihat daftar"}</Button>}<Button type="button" variant="ghost" disabled={!ids.length} onClick={() => navigator.clipboard.writeText(ids.join(", "))}><Copy className="size-4"/>{copyLabel}</Button></div></div>;
}
