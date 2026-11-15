import "server-only";
import { randomUUID } from "node:crypto";
import { businessDate, slotValue } from "./model";
import type { PrefilterBatch, PrefilterSlot } from "./types";

type SchedulerDb = { shopeeAccount: { findMany(args: object): Promise<{ id: number; name: string }[]> } };
type BatchInput = { shopeeAccountId: number; slot: PrefilterSlot; runId?: string; owner: string; receivedAt: Date; startedAt: number; skipCompleted: boolean };
type AccountResult = { accountId: number; accountName: string; slot: PrefilterSlot; businessDate: string; runId?: string; status: string; batches: number; message: string | null };

export async function runScheduledPrefilter({
  db, runBatch, slot: requestedSlot, now = () => new Date(), log = () => {},
  maxBatchesPerAccount = 10_000, maxDurationMs = 60 * 60_000,
}: {
  db: SchedulerDb; runBatch: (input: BatchInput) => Promise<PrefilterBatch>; slot: PrefilterSlot;
  now?: () => Date; log?: (value: AccountResult) => void;
  maxBatchesPerAccount?: number; maxDurationMs?: number;
}) {
  const slot = slotValue(requestedSlot), date = businessDate(now()), deadline = Date.now() + maxDurationMs;
  const accounts = await db.shopeeAccount.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { id: "asc" } });
  const results: AccountResult[] = [];
  let stopped = false;
  for (const account of accounts) {
    let runId: string | undefined, batches = 0;
    const receivedAt = now();
    const finish = (status: string, message: string | null) => {
      const value = { accountId: account.id, accountName: account.name, slot, businessDate: date, runId, status, batches, message };
      results.push(value); log(value);
    };
    for (;;) {
      if (businessDate(now()) !== date) {
        finish("EXPIRED", "Tanggal WIB berganti. Progres lama tidak dilanjutkan ke tanggal baru."); stopped = true; break;
      }
      if (batches >= maxBatchesPerAccount || Date.now() >= deadline) {
        finish("LIMIT_REACHED", "Batas scheduler tercapai. Progres tersimpan untuk dilanjutkan.");
        if (Date.now() >= deadline) stopped = true;
        break;
      }
      try {
        const value = await runBatch({ shopeeAccountId: account.id, slot, runId, owner: randomUUID(), receivedAt, startedAt: Date.now(), skipCompleted: true });
        batches++;
        if (value.blocked) { finish("SKIPPED_BUSY", "Snapshot sedang diproses permintaan lain; tidak mengambil alih lease/slot."); break; }
        runId = value.progress.runId;
        if (value.progress.slot !== slot || value.progress.businessDate !== date) {
          finish("EXPIRED", "Tanggal atau slot progres tidak sesuai. Snapshot tidak dilanjutkan."); break;
        }
        if (value.progress.status === "PAUSED_RATE_LIMIT") {
          finish("PAUSED_RATE_LIMIT", value.progress.message); stopped = true; break;
        }
        if (value.progress.status !== "RUNNING") { finish(value.progress.status, value.progress.message); break; }
        // RUNNING may return shouldContinue=false on a unit deadline. Resume the
        // same persisted cursor/run, never create a replacement or retry a write.
      } catch {
        finish("FAILED", "Unit snapshot gagal. Periksa progres dan snapshot yang tersedia."); break;
      }
    }
    if (stopped) break;
  }
  return { slot, businessDate: date, success: !stopped && results.length === accounts.length && results.every(r => r.status === "COMPLETE"), accounts: results };
}
