import { randomUUID } from "node:crypto";
import type { MetaSyncBatchResult } from "./meta-sync-batch";

type SchedulerDb = {
  shopeeAccount: { findMany(args: object): Promise<{ id: number; name: string }[]> };
  metaSyncRun: {
    findUnique(args: object): Promise<{ id: string } | null>;
    findFirst(args: object): Promise<{ id: string; status: string } | null>;
  };
};

type AccountStatus = "COMPLETE" | "PARTIAL" | "FAILED" | "SKIPPED_ALREADY_SYNCED" | "SKIPPED_BUSY" | "PAUSED_RATE_LIMIT" | "LIMIT_REACHED";
export type ScheduledMetaSyncResult = {
  targetDate: string;
  stoppedByRateLimit: boolean;
  accounts: { accountId: number; accountName: string; status: AccountStatus; batches: number; message: string | null }[];
};

const jakartaDate = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);

export async function runScheduledMetaSyncs({
  db,
  runBatch,
  now = new Date(),
  owner = () => randomUUID(),
  maxBatchesPerAccount = 10_000,
}: {
  db: SchedulerDb;
  runBatch: (input: { shopeeAccountId: number; owner: string; now: Date; startedAt: number }) => Promise<MetaSyncBatchResult>;
  now?: Date;
  owner?: (accountId: number, batch: number) => string;
  maxBatchesPerAccount?: number;
}): Promise<ScheduledMetaSyncResult> {
  const targetDate = jakartaDate(now);
  const accounts = (await db.shopeeAccount.findMany({ where: { status: "ACTIVE" }, orderBy: [{ id: "asc" }] })).sort((a, b) => a.id - b.id);
  const result: ScheduledMetaSyncResult = { targetDate, stoppedByRateLimit: false, accounts: [] };

  for (const account of accounts) {
    const active = await db.metaSyncRun.findUnique({ where: { activeShopeeAccountId: account.id } });
    if (!active) {
      const terminal = await db.metaSyncRun.findFirst({
        where: { shopeeAccountId: account.id, targetDate: new Date(`${targetDate}T00:00:00Z`), status: { in: ["COMPLETE", "PARTIAL", "FAILED"] } },
        orderBy: { createdAt: "desc" },
      });
      if (terminal) {
        result.accounts.push({ accountId: account.id, accountName: account.name, status: "SKIPPED_ALREADY_SYNCED", batches: 0, message: null });
        continue;
      }
    }

    let completed = false;
    for (let batch = 1; batch <= maxBatchesPerAccount; batch++) {
      try {
        const value = await runBatch({ shopeeAccountId: account.id, owner: owner(account.id, batch), now, startedAt: Date.now() });
        if (value.blocked) {
          result.accounts.push({ accountId: account.id, accountName: account.name, status: "SKIPPED_BUSY", batches: batch, message: value.progress.message });
          completed = true;
          break;
        }
        if (value.progress.status === "PAUSED_RATE_LIMIT") {
          result.accounts.push({ accountId: account.id, accountName: account.name, status: "PAUSED_RATE_LIMIT", batches: batch, message: value.progress.message });
          result.stoppedByRateLimit = true;
          return result;
        }
        if (["COMPLETE", "PARTIAL", "FAILED"].includes(value.progress.status)) {
          result.accounts.push({ accountId: account.id, accountName: account.name, status: value.progress.status as "COMPLETE" | "PARTIAL" | "FAILED", batches: batch, message: value.progress.message });
          completed = true;
          break;
        }
        // A deadline pause preserves the cursor with RUNNING status. A fresh batch
        // continues that same run; no provider request is retried blindly here.
      } catch {
        result.accounts.push({ accountId: account.id, accountName: account.name, status: "FAILED", batches: batch, message: "Scheduler gagal menjalankan unit Sync akun ini." });
        completed = true;
        break;
      }
    }
    if (!completed) result.accounts.push({ accountId: account.id, accountName: account.name, status: "LIMIT_REACHED", batches: maxBatchesPerAccount, message: "Batas unit scheduler tercapai." });
  }
  return result;
}

