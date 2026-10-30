"use client";
import { useRef, useState } from "react";
import { cancelAdsterraMethod, executeAdsterraMethod, prepareAdsterraMethod } from "@/app/shopee/[id]/adsterra-roi/method-actions";
import type { MethodInfo, ListKind } from "@/lib/adsterra-operations/types";
import { useAdsterraOperation } from "./operation-context";
import { OperationNotice } from "./operation-dialog";
import { AdsterraOperationRecovery } from "./operation-recovery";

export function CampaignMethodControls({ accountId, configId, info, busy }: {
  accountId: number; configId: number; info?: MethodInfo; busy: boolean;
}) {
  const operation = useAdsterraOperation(), pending = useRef(false), key = `campaign-method-${configId}`;
  const [kind, setKind] = useState<ListKind | "">("");
  const [working, setWorking] = useState(false), [message, setMessage] = useState("");
  async function prepare(next: ListKind) {
    if (pending.current || !operation.begin(key)) return;
    setKind(next); pending.current = true; setWorking(true); setMessage("");
    let refresh = false, stage: "prepare" | "cancel" | "execute" = "prepare";
    try {
      const response = await prepareAdsterraMethod(accountId, configId, next);
      if (!response.success) { setMessage(response.message); return; }
      const p = response.preview;
      if (p.blockers.length || !p.token) {
        setMessage(p.blockers.join(" ") || "Konfirmasi belum tersedia.");
        if (p.token) { stage = "cancel"; const cancelled = await cancelAdsterraMethod(accountId, configId, p.token); if (!cancelled.success) setMessage(cancelled.message); }
        return;
      }
      const impact = p.same ? "Metode sama: daftar, status campaign, Auto dan Custom Bid tidak diubah."
        : p.reset ? "Campaign dan seluruh Auto terkait dinonaktifkan. Daftar placement direset; tidak diaktifkan kembali otomatis."
        : p.adopt ? "Daftar existing diadopsi tanpa reset; status campaign dan Auto tidak diubah."
        : "Metode disimpan tanpa mengisi daftar. Whitelist kosong belum dapat ON.";
      if (!window.confirm(`Campaign ${p.scope.label} (${p.scope.campaignId})\nMetode tujuan: ${p.kind === "BLACKLIST" ? "Blacklist" : "Whitelist"}.\n${impact}\nTarget final: ${p.reset ? 0 : Array.isArray(p.target) ? p.target.length : "belum dapat dibaca"} placement.\n${p.reset ? `Reset: ${Array.isArray(p.clearBlacklist) ? p.clearBlacklist.length : "dibaca ulang setelah Whitelist kosong"} Blacklist, ${p.clearWhitelist.length} Whitelist.\n` : ""}Custom Bid dipertahankan (${p.preservedBids.length} override).\nKonfirmasi perubahan?`)) {
        stage = "cancel";
        const cancelled = await cancelAdsterraMethod(accountId, configId, p.token);
        if (!cancelled.success) setMessage(cancelled.message);
        return;
      }
      stage = "execute"; refresh = true;
      const result = await executeAdsterraMethod(accountId, configId, p.token);
      setMessage(result.success ? `${result.result.status}: ${result.result.message}` : result.message);
      operation.setProtectionNeeded(key, !result.success || !["VERIFIED", "NO_CHANGE"].includes(result.result.status));
    } catch {
      setMessage(stage === "prepare" ? "Persiapan gagal; tidak ada perubahan provider dari persiapan."
        : stage === "cancel" ? "Pembatalan belum dapat dipastikan. Gunakan Periksa Status."
        : "Hasil belum dapat dipastikan. Gunakan Periksa Status; jangan ulangi write.");
      if (stage !== "prepare") operation.setProtectionNeeded(key, true);
    } finally { pending.current = false; setWorking(false); setKind(""); operation.end(key, refresh); }
  }
  return <div className="min-w-36 max-w-64 space-y-1 text-xs">
    <select aria-label={`Metode aplikasi campaign config ${configId}`} value={working ? kind : info?.method?.placementMethod ?? ""} disabled={operation.busy || busy || info?.status !== "SUCCESS"}
      className="h-8 max-w-full rounded border bg-white px-1 text-xs" onChange={(e) => { if (e.target.value) void prepare(e.target.value as ListKind); }}>
      <option value="">{busy && !info ? "Memuat metode…" : info?.status === "SUCCESS" ? "Pilih metode" : "Metode belum tersedia"}</option><option value="BLACKLIST">Blacklist</option><option value="WHITELIST">Whitelist</option>
    </select>
    {working && <p role="status">Memproses…</p>}
    <OperationNotice message={message}/>
    {!working && message && !/^(VERIFIED|NO_CHANGE):/.test(message) && <AdsterraOperationRecovery accountId={accountId} configId={configId}/>}
  </div>;
}
