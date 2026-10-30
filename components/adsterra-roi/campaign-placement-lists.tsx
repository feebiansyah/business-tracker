"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAdsterraPlacementListsAction } from "@/app/shopee/[id]/adsterra-roi/placement-list-actions";
import type { CampaignPlacementLists, PlacementListCursor, PlacementListRead, PlacementListsResult } from "@/lib/adsterra-roi/placement-list-types";
import { useAdsterraOperation } from "./operation-context";

type Snapshot = { accountId: number; revision: number; request: number; lists: CampaignPlacementLists[];
  progress: { completed: number; total: number } | null; busy: boolean; error: string | null };
// Only fixed reader messages or the server's sanitized failure DTO may render.
// A rejected action/transport exception is not such a DTO (especially in dev).
class PlacementListReadError extends Error {}

export function useAdsterraPlacementLists(shopeeAccountId: number, enabled: boolean) {
  const { revision, readRevision } = useAdsterraOperation();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const sequence = useRef(0);
  const scan = useRef<{ accountId: number; revision: number; request: number; promise: Promise<void> } | null>(null);
  const batches = useRef(new Map<string, Promise<PlacementListsResult>>());
  const refresh = useCallback((): Promise<void> => {
    if (!enabled) return Promise.resolve();
    if (scan.current?.accountId === shopeeAccountId && scan.current.revision === revision && scan.current.request === sequence.current) return scan.current.promise;
    const request = ++sequence.current;
    const current = () => sequence.current === request && readRevision() === revision;
    const promise = Promise.resolve().then(async () => {
      if (!current()) return;
      setSnapshot({ accountId: shopeeAccountId, revision, request, lists: [], progress: null, busy: true, error: null });
      let continuation: PlacementListCursor | null = null, completed = -1, total: number | null = null;
      const seen = new Set<string>();
      try {
        do {
          if (!current()) return;
          const key = JSON.stringify([shopeeAccountId, revision, continuation]);
          let pending = batches.current.get(key);
          if (!pending) {
            const reads = batches.current;
            pending = getAdsterraPlacementListsAction(shopeeAccountId, continuation).finally(() => { if (reads.get(key) === pending) reads.delete(key); });
            reads.set(key, pending);
          }
          const result: PlacementListsResult = await pending;
          if (!current()) return;
          if (!result.success) throw new PlacementListReadError(result.message);
          const progress = result.progress;
          if (!Number.isSafeInteger(progress.completed) || !Number.isSafeInteger(progress.total) || progress.total < 0
            || progress.completed <= completed || progress.completed > progress.total || (total !== null && total !== progress.total)) throw new PlacementListReadError("Progres batch tidak valid. Silakan Refresh Semua kembali.");
          continuation = result.continuation;
          if (continuation) {
            if (progress.completed >= progress.total || seen.has(continuation.after)) throw new PlacementListReadError("Kelanjutan batch berulang/tidak valid. Pembacaan dihentikan.");
            seen.add(continuation.after);
          } else if (progress.completed !== progress.total) throw new PlacementListReadError("Pembacaan berhenti sebelum seluruh campaign diperiksa.");
          completed = progress.completed; total = progress.total;
          setSnapshot((previous) => {
            if (!current() || previous?.request !== request) return previous;
            const merged = new Map(previous.lists.map((item) => [item.configId, item]));
            for (const item of result.lists) merged.set(item.configId, item);
            return { ...previous, lists: [...merged.values()], progress, error: null };
          });
        } while (continuation);
      } catch (error) {
        if (current()) setSnapshot((previous) => previous?.request === request ? { ...previous,
          error: error instanceof PlacementListReadError ? error.message : "Pembacaan batch gagal. Hasil batch sebelumnya dipertahankan; silakan Refresh Semua kembali." } : previous);
      } finally {
        if (current()) setSnapshot((previous) => previous?.request === request ? { ...previous, busy: false } : previous);
        if (scan.current?.request === request) scan.current = null;
      }
    });
    scan.current = { accountId: shopeeAccountId, revision, request, promise };
    return promise;
  }, [enabled, shopeeAccountId, revision, readRevision]);
  useEffect(() => {
    let disposed = false;
    const requests = sequence;
    queueMicrotask(() => { if (!disposed) void refresh(); });
    return () => { disposed = true; requests.current++; };
  }, [refresh]);
  const current = snapshot?.accountId === shopeeAccountId && snapshot.revision === revision ? snapshot : null;
  return { busy: enabled && (current?.busy ?? true), refresh, lists: current?.lists ?? [], error: current?.error ?? null, progress: current?.progress ?? null };
}

const readTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Jakarta",
});

export function PlacementListReadout({ label, value, busy, connected, error }: {
  label: string; value?: PlacementListRead; busy: boolean; connected: boolean; error: string | null;
}) {
  const timestamp = value && (value.status === "SUCCESS" ? value.readAt : value.attemptedAt);
  const status = !connected ? "Belum terhubung" : value?.status === "SUCCESS"
    ? `${value.count.toLocaleString("id-ID")}${value.count === 0 ? " (kosong)" : ""}`
    : value?.status === "UNREADABLE_WHITELIST" ? "Tidak dapat dibaca (Whitelist)" : value?.status === "ERROR" ? "Gagal" : value ? "Belum tersedia" : busy ? "Memuat…" : "Belum dibaca";
  return <div className="flex min-w-40 max-w-64 flex-wrap items-baseline gap-x-2 text-xs">
    <span className="font-medium text-slate-700">{label}:</span><span className={value?.status === "ERROR" ? "text-red-700" : "text-slate-700"}>{status}</span>
    <details className="text-slate-500"><summary className="cursor-pointer" aria-label={`Detail ${label}`}>Detail</summary>
      {timestamp && <p className="mt-1">{value?.status === "SUCCESS" ? "Dibaca" : "Dicoba"}: <time dateTime={timestamp}>{readTime.format(new Date(timestamp))} WIB</time></p>}
      <p className="mt-1 break-words">{!connected ? "Koneksi Adsterra belum dikonfigurasi." : value?.status === "SUCCESS" ? `${value.count} placement dari API; bukan mode editor Adsterra.`
        : value ? value.message : error ?? (busy ? "Menunggu batch pembacaan." : "Silakan Refresh Semua Daftar API.")}</p>
    </details>
  </div>;
}
