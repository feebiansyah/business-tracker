"use client";

import { useActionState } from "react";
import { syncFilterAction, type FilterSyncActionState } from "@/app/shopee/[id]/filter/actions";
import { Button } from "@/components/ui/button";

const initialState: FilterSyncActionState = { success: false, message: "" };

export function SyncMetaButton({ shopeeAccountId }: { shopeeAccountId: number }) {
  const [state, action, pending] = useActionState(syncFilterAction.bind(null, shopeeAccountId), initialState);
  return (
    <div className="space-y-2">
      <form action={action}><Button type="submit" disabled={pending}>{pending ? "Sinkronisasi Meta..." : "Sync Meta"}</Button></form>
      {state.message && <div role="status" className={`max-w-xl rounded-lg border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        <p className="font-medium">{state.message}</p>
        {state.summary && <p className="mt-1">WL sukses {state.summary.wlSucceeded}/{state.summary.wlTotal} · Campaign {state.summary.campaignsProcessed} · Row histori {state.summary.insightRowsStored}</p>}
        {state.summary?.failedWlNames.length ? <p className="mt-1">WL gagal: {state.summary.failedWlNames.join(", ")}</p> : null}
      </div>}
    </div>
  );
}
