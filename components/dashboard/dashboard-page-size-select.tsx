"use client";

import { useRouter } from "next/navigation";

export function DashboardPageSizeSelect({ value, hrefs }: { value: number; hrefs: Record<number, string> }) {
  const router = useRouter();
  return <select aria-label="Baris per halaman" value={value} onChange={(event) => router.push(hrefs[Number(event.target.value)])} className="rounded-md border border-slate-300 bg-white px-2 py-1">
    {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
  </select>;
}
