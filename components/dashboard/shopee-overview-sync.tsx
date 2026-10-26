"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncFilterAction, type FilterSyncActionState } from "@/app/shopee/[id]/filter/actions";
import { syncClickaduDailyAction } from "@/app/shopee/[id]/clickadu-roi/actions";
import { syncAdsterraDailyAction } from "@/app/shopee/[id]/adsterra-roi/actions";
import { Button } from "@/components/ui/button";
import { shopeeOverviewTabs, type ShopeeOverviewTab } from "@/lib/dashboard/shopee-overview-params";

const labels = { meta: "Meta", clickadu: "Clickadu", adsterra: "Adsterra" };

export function ShopeeOverviewSync({ accountId, disabledReasons }: {
  accountId: number;
  disabledReasons: Record<ShopeeOverviewTab, string | null>;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [running, setRunning] = useState<ShopeeOverviewTab | null>(null);
  const [results, setResults] = useState<Partial<Record<ShopeeOverviewTab, FilterSyncActionState>>>({});
  const [refreshError, setRefreshError] = useState("");
  const [pending, startTransition] = useTransition();

  function sync(provider: ShopeeOverviewTab) {
    if (inFlight.current || pending || disabledReasons[provider]) return;
    inFlight.current = true;
    setRunning(provider);
    setRefreshError("");
    setResults((current) => ({ ...current, [provider]: undefined }));
    startTransition(async () => {
      try {
        const result = provider === "meta"
          ? await syncFilterAction(accountId, { success: false, message: "" })
          : provider === "clickadu" ? await syncClickaduDailyAction(accountId) : await syncAdsterraDailyAction(accountId);
        setResults((current) => ({ ...current, [provider]: result }));
      } catch {
        setResults((current) => ({ ...current, [provider]: {
          success: false,
          message: `Hasil Sync ${labels[provider]} tidak dapat dimuat. Sebagian data mungkin sudah tersimpan; periksa hasil sebelum mencoba kembali.`,
        } }));
      } finally {
        try { router.refresh(); }
        catch { setRefreshError("Tampilan belum berhasil diperbarui. Muat ulang halaman untuk melihat data terbaru."); }
        finally { inFlight.current = false; setRunning(null); }
      }
    });
  }

  return <section aria-label="Sinkronisasi data Overview" className="min-w-0 space-y-3">
    <div className="flex flex-wrap gap-2">
      {shopeeOverviewTabs.map((provider) => <Button key={provider} type="button"
        disabled={pending || running !== null || disabledReasons[provider] !== null}
        aria-describedby={disabledReasons[provider] ? `sync-disabled-${accountId}-${provider}` : undefined}
        aria-busy={running === provider} title={disabledReasons[provider] ?? undefined}
        onClick={() => sync(provider)}
      >{running === provider ? `Menyinkronkan ${labels[provider]}...` : `Sync ${labels[provider]}`}</Button>)}
    </div>
    {shopeeOverviewTabs.some((provider) => disabledReasons[provider]) && <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {shopeeOverviewTabs.map((provider) => disabledReasons[provider] && <li key={provider} id={`sync-disabled-${accountId}-${provider}`}>
        {labels[provider]}: {disabledReasons[provider]}
      </li>)}
    </ul>}
    {pending && running === null && <p role="status" className="text-xs text-slate-500">Memperbarui data Overview...</p>}
    {shopeeOverviewTabs.map((provider) => {
      const result = results[provider];
      if (!result) return null;
      const summary = result.summary;
      return <div key={provider} role={result.success ? "status" : "alert"}
        className={`min-w-0 break-words rounded-lg border p-3 text-sm ${result.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
      >
        <p className="font-medium">{labels[provider]}: {result.message}</p>
        {summary && <p className="mt-1">WL sukses {summary.wlSucceeded}/{summary.wlTotal} · WL dilewati {summary.wlSkipped} · WL gagal {summary.wlFailed} · Campaign {summary.campaignsProcessed} · Row histori {summary.insightRowsStored}</p>}
        {summary?.skippedWlNames.length ? <p className="mt-1">WL nonaktif/tidak tersedia: {summary.skippedWlNames.join(", ")}</p> : null}
        {summary?.failedWlNames.length ? <p className="mt-1">WL gagal: {summary.failedWlNames.join(", ")}</p> : null}
        {summary && summary.unresolvedBudgets > 0 && <p className="mt-1">Budget belum teridentifikasi: {summary.unresolvedBudgets}</p>}
        {summary && summary.missingStartDates > 0 && <p className="mt-1">Campaign tanpa tanggal mulai: {summary.missingStartDates}</p>}
      </div>;
    })}
    {refreshError && <p role="alert" className="text-sm text-amber-800">{refreshError}</p>}
  </section>;
}
