"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncFilterAction, type FilterSyncActionState } from "@/app/shopee/[id]/filter/actions";
import { Button } from "@/components/ui/button";
import type { MetaSyncProgress } from "@/lib/filter/meta-sync-state";

const shopeeOverviewTabs = ["meta"] as const;
type ShopeeOverviewTab = typeof shopeeOverviewTabs[number];
const labels = { meta: "Meta" };
const phaseLabels = { STATUS: "Status WL", METADATA: "Campaign dan budget", ACCOUNT_SPEND: "Spend WL", CAMPAIGN_INSIGHTS: "Histori campaign", DONE: "Selesai" };

export function ShopeeOverviewSync({ accountId, disabledReasons, initialMetaProgress }: {
  accountId: number;
  disabledReasons: Record<ShopeeOverviewTab, string | null>;
  initialMetaProgress?: MetaSyncProgress | null;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const generation = useRef(0);
  const [metaProgress, setMetaProgress] = useState(initialMetaProgress ?? null);
  useEffect(() => () => { generation.current++; }, [accountId]);
  const [running, setRunning] = useState<ShopeeOverviewTab | null>(null);
  const [results, setResults] = useState<Partial<Record<ShopeeOverviewTab, FilterSyncActionState>>>({});
  const [refreshError, setRefreshError] = useState("");
  const [pending, startTransition] = useTransition();

  function sync(provider: ShopeeOverviewTab) {
    if (inFlight.current || pending || disabledReasons[provider]) return;
    inFlight.current = true;
    const scope = generation.current;
    setRunning(provider);
    setRefreshError("");
    setResults((current) => ({ ...current, [provider]: undefined }));
    startTransition(async () => {
      try {
          let result: FilterSyncActionState;
          do {
            result = await syncFilterAction(accountId, { success: false, message: "" });
            if (scope !== generation.current) return;
            if (result.metaBatch) setMetaProgress(result.metaBatch.progress);
            setResults((current) => ({ ...current, meta: result }));
          } while (result.metaBatch?.shouldContinue);
      } catch {
        if (scope !== generation.current) return;
        setResults((current) => ({ ...current, [provider]: {
          success: false,
          message: `Hasil Sync ${labels[provider]} tidak dapat dimuat. Sebagian data mungkin sudah tersimpan; periksa hasil sebelum mencoba kembali.`,
        } }));
      } finally {
        if (scope === generation.current) {
          try { router.refresh(); }
          catch { setRefreshError("Tampilan belum berhasil diperbarui. Muat ulang halaman untuk melihat data terbaru."); }
          finally { inFlight.current = false; setRunning(null); }
        }
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
      const result = results[provider] ?? (provider === "meta" && metaProgress ? {
        success: metaProgress.status === "COMPLETE",
        message: metaProgress.status === "RUNNING" ? "Progres Sync tersimpan. Klik Sync Meta untuk melanjutkan." : metaProgress.status === "PAUSED_RATE_LIMIT" ? "Sync dijeda karena batas request Meta. Lanjutkan setelah beberapa saat." : metaProgress.status === "COMPLETE" ? "Sync Meta selesai." : "Sync selesai sebagian. Klik Sync Meta untuk mencoba WL yang gagal.",
        summary: metaProgress.summary,
      } : undefined);
      if (!result) return null;
      const summary = result.summary;
      return <div key={provider} role={result.success ? "status" : "alert"}
        className={`min-w-0 break-words rounded-lg border p-3 text-sm ${result.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
      >
        <p className="font-medium">{labels[provider]}: {result.message}</p>
        {provider === "meta" && metaProgress && <p className="mt-1">{metaProgress.status} · WL {metaProgress.current} dari {metaProgress.total}{metaProgress.wlName ? ` · ${metaProgress.wlName}` : ""}{metaProgress.phase ? ` · ${phaseLabels[metaProgress.phase]}` : ""}</p>}
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
