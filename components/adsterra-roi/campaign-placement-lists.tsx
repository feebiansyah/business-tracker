"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAdsterraPlacementListsAction } from "@/app/shopee/[id]/adsterra-roi/placement-list-actions";
import type { CampaignPlacementLists, PlacementListRead, PlacementListsResult } from "@/lib/adsterra-roi/placement-list-types";
import { useAdsterraOperation } from "./operation-context";

export function useAdsterraPlacementLists(shopeeAccountId: number, enabled: boolean) {
  const { revision } = useAdsterraOperation();
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<{ accountId: number; lists: CampaignPlacementLists[]; error: string | null } | null>(null);
  const sequence = useRef(0);
  const inFlight = useRef<{ accountId: number; revision: number; promise: Promise<PlacementListsResult> } | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const request = ++sequence.current;
    setBusy(true);
    // Share the pending read across repeated clicks/Strict Mode effect replay.
    const promise = inFlight.current?.accountId === shopeeAccountId && inFlight.current.revision === revision ? inFlight.current.promise
      : getAdsterraPlacementListsAction(shopeeAccountId);
    inFlight.current = { accountId: shopeeAccountId, revision, promise };
    try {
      const result = await promise;
      if (sequence.current !== request) return;
      setSnapshot({ accountId: shopeeAccountId, lists: result.success ? result.lists : [], error: result.success ? null : result.message });
    } catch {
      if (sequence.current === request) setSnapshot({ accountId: shopeeAccountId, lists: [], error: "Daftar API gagal dimuat. Silakan refresh." });
    } finally {
      if (inFlight.current?.promise === promise) inFlight.current = null;
      if (sequence.current === request) setBusy(false);
    }
  }, [enabled, shopeeAccountId, revision]);
  useEffect(() => {
    let disposed = false;
    const requests = sequence;
    queueMicrotask(() => { if (!disposed) void refresh(); });
    return () => { disposed = true; requests.current++; };
  }, [refresh]);
  const current = snapshot?.accountId === shopeeAccountId ? snapshot : null;
  return { busy, refresh, lists: current?.lists ?? [], error: current?.error ?? null };
}

const readTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Jakarta",
});

export function PlacementListReadout({ value, busy, connected, error }: {
  value?: PlacementListRead; busy: boolean; connected: boolean; error: string | null;
}) {
  if (!connected) return <span className="text-xs text-slate-500">Belum tersedia: belum terhubung.</span>;
  if (busy) return <span role="status" className="text-xs text-slate-500">Memuat daftar...</span>;
  if (error) return <span className="text-xs text-red-600">{error}</span>;
  if (!value) return <span className="text-xs text-slate-500">Belum tersedia. Silakan refresh.</span>;
  const timestamp = value.status === "SUCCESS" ? value.readAt : value.attemptedAt;
  return <div className="min-w-40 max-w-64 space-y-1">
    {value.status === "SUCCESS"
      ? <p className="font-medium text-slate-900">{value.count.toLocaleString("id-ID")} placement{value.count === 0 ? " (kosong)" : ""}</p>
      : <><p className={value.status === "ERROR" ? "text-red-600" : "text-amber-700"}>{value.status === "ERROR" ? "Gagal dimuat" : "Belum tersedia"}</p><p className="text-xs text-slate-500">{value.message}</p></>}
    <p className="text-xs text-slate-500">{value.status === "SUCCESS" ? "Dibaca" : "Dicoba"}: <time dateTime={timestamp}>{readTime.format(new Date(timestamp))} WIB</time></p>
  </div>;
}
