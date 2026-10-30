"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelAdsterraPlacementApplication, executeAdsterraPlacementApplication, prepareAdsterraPlacementApplication } from "@/app/shopee/[id]/adsterra-roi/placement-application-actions";
import type { ApplicationResult, ListKind } from "@/lib/adsterra-operations/types";
import { useAdsterraOperation } from "./operation-context";
import { MethodBadge, OperationNotice } from "./operation-dialog";
import { AdsterraOperationRecovery } from "./operation-recovery";

const key = "placement-application";
export function PlacementApplication({ accountId, configId, kind, candidateCount, getData, onResult }: {
  accountId: number; configId: number; kind: ListKind; candidateCount: number;
  getData(): FormData | null; onResult(result: ApplicationResult): void;
}) {
  const operation = useAdsterraOperation(), pending = useRef(false);
  const protectionKey = `${key}-${configId}`;
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<ApplicationResult["whitelistRejection"]>();
  function input(exclusion: ApplicationResult["whitelistRejection"] | null = null) {
    const data = getData(); if (!data) throw new Error("STALE_ANALYSIS");
    // Never accept exclusion fields left in the CSV form or from another result.
    for (const field of ["whitelistExclusions", "whitelistRejectionToken", "whitelistRejectedIds", "whitelistPreviousExclusions"]) data.delete(field);
    if (exclusion) {
      data.set("whitelistExclusions", JSON.stringify([...new Set([...exclusion.previousExcluded, ...exclusion.ids])]));
      data.set("whitelistRejectionToken", exclusion.token);
      data.set("whitelistRejectedIds", JSON.stringify(exclusion.ids));
      data.set("whitelistPreviousExclusions", JSON.stringify(exclusion.previousExcluded));
    }
    return data;
  }
  async function prepare(exclusion?: ApplicationResult["whitelistRejection"]) {
    if (pending.current || !operation.begin(key)) return;
    pending.current = true; setBusy(true); setMessage("");
    let refresh = false, stage: "prepare" | "cancel" | "execute" = "prepare";
    try {
      const data = input(exclusion ?? null);
      const response = await prepareAdsterraPlacementApplication(accountId, data, kind);
      if (!response.success) { setMessage(response.message); return; }
      const p = response.preview;
      if (p.blockers.length || !p.token) {
        setMessage(p.blockers.join(" ") || "Konfirmasi belum tersedia.");
        if (p.token) { stage = "cancel"; const cancelled = await cancelAdsterraPlacementApplication(accountId, configId, p.token); if (!cancelled.success) setMessage(cancelled.message); }
        return;
      }
      const impact = p.resetBids.length
        ? `${p.resetBids.length} override Custom Bid seluruh GEO placement blacklist terkait dihapus setelah verifikasi; tidak dipulihkan saat ON kembali.`
        : "Custom Bid dipertahankan.";
      if (!window.confirm(`Campaign ${p.scope.label} (${p.scope.campaignId})\nTerapkan ${p.kind === "BLACKLIST" ? "Blacklist" : "Whitelist"}: ${p.target.length} placement final (+${p.added.length}, −${p.removed.length}).\n${p.excluded?.length ? `Dikecualikan: ${p.excluded.join(", ")}. Target lainnya tetap dapat ditolak.\n` : ""}${impact}\n${p.kind === "BLACKLIST" && !p.target.length ? "Blacklist kosong: tidak ada placement dikecualikan.\n" : ""}Konfirmasi penerapan?`)) {
        stage = "cancel";
        const cancelled = await cancelAdsterraPlacementApplication(accountId, configId, p.token);
        if (!cancelled.success) setMessage(cancelled.message);
        return;
      }
      stage = "execute"; refresh = true; setRejection(undefined);
      // Reuse the exact input prepared above, including confirmed exclusions.
      const executed = await executeAdsterraPlacementApplication(accountId, data, p.token);
      if (!executed.success) setMessage(executed.message);
      else { onResult(executed.result); setRejection(executed.result.whitelistRejection); setMessage(`${executed.result.status}: ${executed.result.message}`); }
      operation.setProtectionNeeded(protectionKey, !executed.success || !["VERIFIED", "NO_CHANGE"].includes(executed.result.status));
    } catch {
      setMessage(stage === "prepare" ? "Konfirmasi belum dapat disiapkan. Tidak ada perubahan provider."
        : stage === "cancel" ? "Pembatalan belum dapat dipastikan. Periksa Status sebelum melanjutkan."
        : "Hasil perubahan belum diterima. Gunakan Periksa Status; jangan ulangi write.");
      if (stage !== "prepare") operation.setProtectionNeeded(protectionKey, true);
    } finally { pending.current = false; setBusy(false); operation.end(key, refresh); }
  }
  return <section aria-label="Penerapan daftar placement" className="space-y-3 text-sm">
    <div className="flex flex-wrap items-center gap-2"><MethodBadge method={kind}/><span className="text-xs text-slate-600">{candidateCount} kandidat analisis</span></div>
    <Button type="button" disabled={operation.busy || busy || (kind === "WHITELIST" && !candidateCount)} onClick={() => void prepare()}>{busy ? "Memproses…" : `Terapkan ${kind === "BLACKLIST" ? "Blacklist" : "Whitelist"}`}</Button>
    {kind === "WHITELIST" && !candidateCount && <p>Whitelist belum memiliki kandidat. Tidak ada perubahan provider.</p>}
    <OperationNotice message={message}/>
    {kind === "WHITELIST" && rejection && <div className="space-y-2 text-xs">
      {rejection.groups.map((g) => <p key={g.reason} className="break-words">{g.reason}: {g.ids.join(", ")}</p>)}
      <p>{rejection.complete ? "ID di atas berasal dari respons penolakan terkait." : "Sebagian ID penolakan dapat belum tercantum; bukan daftar penolakan lengkap."} Target yang tersisa tetap dapat ditolak provider.</p>
      <Button type="button" disabled={busy || operation.busy} onClick={() => void prepare(rejection)}>Terapkan tanpa placement yang ditolak</Button>
    </div>}
    {message && !/^(VERIFIED|NO_CHANGE):/.test(message) && <AdsterraOperationRecovery accountId={accountId} configId={configId}/>}
  </section>;
}
