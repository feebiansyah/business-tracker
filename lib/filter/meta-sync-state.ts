import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { FilterSyncSummary } from "@/lib/filter/sync";

export type MetaSyncRunStatus = "RUNNING" | "PAUSED_RATE_LIMIT" | "PARTIAL" | "COMPLETE" | "FAILED";
export type MetaSyncWlStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "SKIPPED" | "FAILED";
export type MetaSyncPhase = "STATUS" | "METADATA" | "ACCOUNT_SPEND" | "CAMPAIGN_INSIGHTS" | "DONE";
export type SyncStateDb = Pick<PrismaClient, "metaSyncRun" | "metaSyncWlProgress" | "shopeeAccount" | "$transaction">;
export const META_SYNC_LEASE_MS = 120_000;
export const META_SYNC_UNIT_MS = 45_000;
export const META_SYNC_HTTP_MS = 30_000;
export const emptySyncSummary = (wlTotal = 0): FilterSyncSummary => ({ wlTotal, wlSucceeded: 0, wlFailed: 0, wlSkipped: 0, campaignsProcessed: 0, insightRowsStored: 0, unresolvedBudgets: 0, missingStartDates: 0, failedWlNames: [], skippedWlNames: [] });

export type MetaSyncProgress = {
  runId: string; status: MetaSyncRunStatus; targetDate: string; total: number; current: number;
  wlName: string | null; phase: MetaSyncPhase | null; summary: FilterSyncSummary; message: string | null;
};

export async function startOrResumeMetaSyncRun(db: SyncStateDb, shopeeAccountId: number, targetDate: string, now: Date) {
  const active = await db.metaSyncRun.findUnique({ where: { activeShopeeAccountId: shopeeAccountId } });
  if (active) return active;
  try {
    return await db.$transaction(async tx => {
      const account = await tx.shopeeAccount.findUnique({ where: { id: shopeeAccountId }, select: { id: true, metaAccounts: { select: { id: true, name: true, accountId: true }, orderBy: [{ name: "asc" }, { id: "asc" }] } } });
      if (!account) throw new Error("Akun Shopee tidak ditemukan.");
      const run = await tx.metaSyncRun.create({ data: { shopeeAccountId, activeShopeeAccountId: shopeeAccountId, targetDate: new Date(targetDate + "T00:00:00Z"), summary: emptySyncSummary(account.metaAccounts.length), createdAt: now } });
      const ordered = [...account.metaAccounts].sort((a,b) => a.name.localeCompare(b.name) || a.id-b.id);
      await tx.metaSyncWlProgress.createMany({ data: ordered.map((wl, position) => ({ runId: run.id, metaAccountId: wl.id, name: wl.name, accountId: wl.accountId, position, cursor: {} })) });
      return run;
    }, { maxWait: 5_000, timeout: 10_000 });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const existing = await db.metaSyncRun.findUnique({ where: { activeShopeeAccountId: shopeeAccountId } });
    if (!existing) throw error;
    return existing;
  }
}

export async function claimMetaSyncLease(db: SyncStateDb, runId: string, owner: string, now: Date) {
  const claimed = await db.metaSyncRun.updateMany({
    where: { id: runId, status: { in: ["RUNNING", "PAUSED_RATE_LIMIT"] }, OR: [{ leaseOwner: null }, { leaseExpiresAt: { lte: now } }] },
    data: { leaseOwner: owner, leaseExpiresAt: new Date(+now + META_SYNC_LEASE_MS), generation: { increment: 1 } },
  });
  return claimed.count === 1 ? db.metaSyncRun.findFirst({ where: { id: runId, leaseOwner: owner } }) : null;
}

export async function releaseMetaSyncLease(db: SyncStateDb, runId: string, owner: string, generation: number) {
  await db.metaSyncRun.updateMany({ where: { id: runId, leaseOwner: owner, generation }, data: { leaseOwner: null, leaseExpiresAt: null } });
}

export async function completeMetaSyncRunIfTerminal(db: Pick<Prisma.TransactionClient, "metaSyncRun" | "metaSyncWlProgress" | "shopeeAccount">, runId: string, now: Date) {
  const rows = await db.metaSyncWlProgress.findMany({ where: { runId }, orderBy: { position: "asc" } });
  if (rows.some(row => row.phase !== "DONE")) return false;
  const run = await db.metaSyncRun.findUnique({ where: { id: runId } });
  if (!run || run.activeShopeeAccountId === null) return false;
  const result = await db.metaSyncRun.updateMany({ where: { id: runId, generation: run.generation, leaseOwner: run.leaseOwner }, data: { status: rows.some(row => row.status === "FAILED") ? "PARTIAL" : "COMPLETE", activeShopeeAccountId: null } });
  if (result.count !== 1) return false;
  await db.shopeeAccount.update({ where: { id: run.shopeeAccountId }, data: { lastMetaSyncAt: now } });
  return true;
}

export async function getMetaSyncProgress(db: Pick<Prisma.TransactionClient, "metaSyncRun" | "metaSyncWlProgress">, shopeeAccountId: number): Promise<MetaSyncProgress | null> {
  const run = await db.metaSyncRun.findFirst({ where: { shopeeAccountId }, orderBy: { createdAt: "desc" } });
  if (!run) return null;
  const rows = await db.metaSyncWlProgress.findMany({ where: { runId: run.id }, orderBy: { position: "asc" }, select: { position: true, name: true, phase: true } });
  const current = rows.find(row => row.phase !== "DONE");
  return { runId: run.id, status: run.status as MetaSyncRunStatus, targetDate: run.targetDate.toISOString().slice(0,10), total: rows.length, current: current ? current.position+1 : rows.length, wlName: current?.name ?? null, phase: current?.phase as MetaSyncPhase ?? null, summary: run.summary as unknown as FilterSyncSummary, message: run.error };
}
