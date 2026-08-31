"use client";

import { useActionState } from "react";
import {
  syncMetaBusinessMappingsAction,
  type MetaBusinessMappingActionState,
} from "@/app/wl/actions";
import { Button } from "@/components/ui/button";

const initialState: MetaBusinessMappingActionState = { success: false, message: "" };

export function MetaBusinessMappingButton() {
  const [state, action, pending] = useActionState(syncMetaBusinessMappingsAction, initialState);
  return (
    <div className="space-y-3">
      <form action={action}>
        <Button type="submit" disabled={pending}>{pending ? "Sedang sinkronisasi BM..." : "Sync BM"}</Button>
      </form>
      {state.message && (
        <div role="status" className={`rounded-xl border p-4 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          <p className="font-medium">{state.message}</p>
          {state.summary && (
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryItem label="BM diproses" value={state.summary.businessesProcessed} />
              <SummaryItem label="WL ditemukan" value={state.summary.metaAccountsFound} />
              <SummaryItem label="WL berhasil dipetakan" value={state.summary.metaAccountsMapped} />
              <SummaryItem label="WL multiple BM" value={state.summary.metaAccountsWithMultipleBusinesses} />
              <SummaryItem label="Sisa BM" value={state.summary.businessesRemaining} />
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>;
}
