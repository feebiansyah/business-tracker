"use client";

import { useActionState } from "react";
import { syncMetaAction, type MetaSyncActionState } from "@/app/wl/actions";
import { Button } from "@/components/ui/button";

const initialState: MetaSyncActionState = { success: false, message: "" };

export function MetaSyncButton() {
  const [state, action, pending] = useActionState(syncMetaAction, initialState);
  return (
    <div className="space-y-3">
      <form action={action}>
        <Button type="submit" disabled={pending}>{pending ? "Sedang sinkronisasi Meta..." : "Sync Meta"}</Button>
      </form>
      {state.message && (
        <div role="status" className={`rounded-xl border p-4 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          <p className="font-medium">{state.message}</p>
          {state.summary && (
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryItem label="BM ditemukan" value={state.summary.businessManagersFound} />
              <SummaryItem label="WL API" value={state.summary.metaAccountsFromApi} />
              <SummaryItem label="WL unik" value={state.summary.uniqueMetaAccounts} />
              <SummaryItem label="WL baru" value={state.summary.metaAccountsCreated} />
              <SummaryItem label="WL diperbarui" value={state.summary.metaAccountsUpdated} />
              <SummaryItem label="WL sudah ada" value={state.summary.metaAccountsExisting} />
              <SummaryItem label="WL tanpa BM" value={state.summary.metaAccountsWithoutBusiness} />
              <SummaryItem label="WL multiple BM" value={state.summary.metaAccountsWithMultipleBusinesses} />
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
