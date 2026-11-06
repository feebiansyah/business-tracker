import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { MetaApiError, MetaGraphClient, MetaSyncPauseError } from "@/lib/meta/client";
import type { MetaCampaign, MetaAdSet, MetaCampaignInsight, MetaAccountDailySpend } from "@/lib/meta/types";
import type { FilterSyncSummary } from "./sync";
import { claimMetaSyncLease, completeMetaSyncRunIfTerminal, getMetaSyncProgress, META_SYNC_HTTP_MS, META_SYNC_UNIT_MS, releaseMetaSyncLease, startOrResumeMetaSyncRun, type MetaSyncProgress } from "./meta-sync-state";
import { buildMetaSyncCoverage, campaignSyncMetadata, planNextMetaSyncUnit, syncDate, type SyncCampaignCoverage, type SyncCursor } from "./meta-sync-work";
import { persistInsightChunk, retryMetaSyncTransaction, upsertCampaignMetadata } from "./persistence";
import { resolveEffectiveDailyBudget } from "./rules";
import { upsertCampaignDailyBudgetSnapshot } from "@/lib/dashboard/budget-snapshots";
import { persistMetaAccountDailySpend } from "@/lib/dashboard/account-spend";

export type MetaSyncBatchResult = { progress: MetaSyncProgress; shouldContinue: boolean; blocked: boolean; paused: boolean };
const isRateLimit = (error: unknown) => error instanceof MetaApiError && [4,17,32,613].includes(error.code ?? -1) || error instanceof MetaSyncPauseError && error.rateLimited;
const safeError = (error: unknown) => error instanceof MetaApiError ? `Pembacaan Meta gagal${error.code ? ` (kode ${error.code})` : ""}.` : "Unit Sync gagal disimpan. WL lain dapat dilanjutkan.";
const asCoverage = (c: { id: number; metaCampaignId: string; startTime: Date | null; historySyncedThrough: Date | null; metaStatus?: string | null; effectiveDailyBudget?: { toNumber(): number } | null }): SyncCampaignCoverage => ({ id: c.id, metaCampaignId: c.metaCampaignId, startDate: c.startTime ? syncDate(c.startTime) : null, historySyncedThrough: c.historySyncedThrough ? syncDate(c.historySyncedThrough) : null, metaStatus: c.metaStatus ?? null, effectiveDailyBudget: c.effectiveDailyBudget?.toNumber() ?? null });

export async function runMetaSyncBatch({ shopeeAccountId, owner, now = new Date() }: { shopeeAccountId: number; owner: string; now?: Date }): Promise<MetaSyncBatchResult> {
  if (!Number.isInteger(shopeeAccountId) || shopeeAccountId <= 0 || !owner || owner.length > 64) throw new Error("Akun Shopee tidak valid.");
  const startedAt = Date.now();
  const run = await startOrResumeMetaSyncRun(prisma,shopeeAccountId,syncDate(now),now);
  const lease = await claimMetaSyncLease(prisma,run.id,owner,new Date());
  const result = async (blocked = false, paused = false): Promise<MetaSyncBatchResult> => {
    const progress = await getMetaSyncProgress(prisma,shopeeAccountId,run.id);
    if (!progress) throw new Error("Progres Sync tidak tersedia.");
    return { progress, shouldContinue: progress.status === "RUNNING" && !blocked && !paused, blocked, paused };
  };
  if (!lease) return result(true);
  const controller = new AbortController();
  const unitDeadline = startedAt + META_SYNC_UNIT_MS;
  const timer = setTimeout(() => controller.abort(new MetaSyncPauseError("DEADLINE")), Math.max(0,unitDeadline-Date.now()));
  const options = { deadline: Math.min(startedAt + META_SYNC_HTTP_MS,unitDeadline-15_000), signal: controller.signal };
  let progress: Awaited<ReturnType<typeof prisma.metaSyncWlProgress.findFirst>>;
  let client: MetaGraphClient | undefined;
  let summary = structuredClone(lease.summary) as unknown as FilterSyncSummary;
  const check = () => { controller.signal.throwIfAborted(); if (Date.now() >= unitDeadline) throw new MetaSyncPauseError("DEADLINE"); };
  const transaction = <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) => retryMetaSyncTransaction(() => prisma.$transaction(async tx => {
    check();
    summary = structuredClone(lease.summary) as unknown as FilterSyncSummary;
    // The conditional UPDATE locks this run until commit. A stale owner cannot persist data/progress.
    const fence = await tx.metaSyncRun.updateMany({ where: { id: run.id, leaseOwner: owner, generation: lease.generation, leaseExpiresAt: { gt: new Date() } }, data: { leaseOwner: owner } });
    if (fence.count !== 1) throw new Error("Lease Sync sudah berubah.");
    const value = await body(tx); check(); return value;
  },{ maxWait: 5_000, timeout: 10_000 }),controller.signal);
  try {
    progress = await prisma.metaSyncWlProgress.findFirst({ where: { runId: run.id, phase: { not: "DONE" } }, orderBy: { position: "asc" } });
    if (!progress) { await transaction(tx => completeMetaSyncRunIfTerminal(tx,run.id,new Date())); return result(); }
    const current = progress;
    const wl = current.metaAccountId === null ? null : await prisma.metaAccount.findFirst({ where: { id: current.metaAccountId, shopeeAccountId, accountId: current.accountId }, select: { id: true, status: true, spendHistorySyncedThrough: true } });
    if (!wl) throw new Error("WL tidak lagi berada dalam scope akun Shopee.");
    check();
    client = new MetaGraphClient();
    const cursor = current.cursor as unknown as SyncCursor;
    const unit = planNextMetaSyncUnit({ phase: current.phase, cursor });
    const save = async (tx: Prisma.TransactionClient, phase: string, next: SyncCursor, status = "RUNNING") => {
      await tx.metaSyncWlProgress.update({ where: { id: current.id }, data: { phase, cursor: next as unknown as Prisma.InputJsonValue, status, error: null } });
      await tx.metaSyncRun.update({ where: { id: run.id }, data: { status: "RUNNING", summary: summary as unknown as Prisma.InputJsonValue, error: null } });
      await completeMetaSyncRunIfTerminal(tx,run.id,new Date());
    };
    const finish = async (tx: Prisma.TransactionClient) => {
      if (cursor.inactive) { summary.wlSkipped++; summary.skippedWlNames.push(`${current.name} (INACTIVE)`); }
      else summary.wlSucceeded++;
      await save(tx,"DONE",{},cursor.inactive ? "SKIPPED" : "SUCCEEDED");
    };
    const nextPage = (after: string | undefined): SyncCursor => {
      if (after && (cursor.seen?.includes(after) || (cursor.seen?.length ?? 0) >= 10_000)) throw new MetaApiError("Cursor Meta berulang atau melampaui batas.");
      const next = { ...cursor, seen: after ? [...(cursor.seen ?? []),after] : [], ...(after ? { after } : {}) };
      if (!after) delete next.after;
      return next;
    };
    if (unit.kind === "STATUS") {
      const status = await client.getSyncAccountStatus(current.accountId,options);
      await transaction(async tx => {
        const inactive = status !== undefined && status !== 1;
        if (status !== undefined && wl.status !== (inactive ? "INACTIVE" : "ACTIVE")) await tx.metaAccount.update({ where: { id: wl.id }, data: { status: inactive ? "INACTIVE" : "ACTIVE" } });
        const known = inactive ? await tx.campaign.findMany({ where: { metaAccountId: wl.id }, select: { id: true, metaCampaignId: true, startTime: true, historySyncedThrough: true } }) : [];
        await save(tx,"METADATA",{ inactive, step: "CAMPAIGNS", knownCampaigns: known.map(asCoverage), spendCheckpoint: wl.spendHistorySyncedThrough ? syncDate(wl.spendHistorySyncedThrough) : null });
      });
    } else if (unit.kind === "METADATA") {
      if (cursor.step === "CAMPAIGNS") {
        const page = await client.getSyncPage<MetaCampaign>("campaigns",current.accountId,undefined,{ ...options, after: cursor.after });
        const next = nextPage(page.after); next.campaigns = [...(cursor.campaigns ?? []),...page.data];
        if (!page.after) { next.step = !cursor.inactive || next.campaigns.some(c => resolveEffectiveDailyBudget(c,[]).source === "UNRESOLVED") ? "ADSETS" : "PERSIST"; }
        await transaction(tx => save(tx,"METADATA",next));
      } else if (cursor.step === "ADSETS") {
        const page = await client.getSyncPage<MetaAdSet>("adSets",current.accountId,undefined,{ ...options, after: cursor.after });
        const next = nextPage(page.after); next.adSets = [...(cursor.adSets ?? []),...page.data];
        if (!page.after) next.step = "PERSIST";
        await transaction(tx => save(tx,"METADATA",next));
      } else if (cursor.step === "PERSIST") {
        const offset = cursor.offset ?? 0;
        const group = (cursor.campaigns ?? []).slice(offset,offset+50);
        const sets = new Map<string,MetaAdSet[]>();
        for (const set of cursor.adSets ?? []) { const rows = sets.get(set.campaign_id) ?? []; rows.push(set); sets.set(set.campaign_id,rows); }
        await transaction(async tx => {
          const persisted = [...(cursor.persisted ?? [])];
          for (const campaign of group) {
            check();
            const metadata = campaignSyncMetadata(campaign,sets.get(campaign.id) ?? [],wl.id);
            const stored = await upsertCampaignMetadata(metadata,tx); persisted.push(asCoverage(stored));
            if (!cursor.inactive && metadata.effectiveDailyBudget !== null) await upsertCampaignDailyBudgetSnapshot(tx,stored.id,run.targetDate.toISOString().slice(0,10),metadata.effectiveDailyBudget);
            if (metadata.budgetSource === "UNRESOLVED") summary.unresolvedBudgets++;
            summary.campaignsProcessed++;
          }
          const next = { ...cursor, persisted, offset: offset+group.length };
          if (next.offset >= (cursor.campaigns?.length ?? 0)) next.step = "PLAN";
          await save(tx,"METADATA",next);
        });
      } else {
        const byId = new Map((cursor.knownCampaigns ?? []).map(c => [c.metaCampaignId,c]));
        for (const c of cursor.persisted ?? []) byId.set(c.metaCampaignId,c);
        const coverage = buildMetaSyncCoverage({ inactive: !!cursor.inactive, spendCheckpoint: cursor.spendCheckpoint ?? null, campaigns: [...byId.values()] },run.targetDate.toISOString().slice(0,10));
        await transaction(tx => { summary.missingStartDates += coverage.missingStartDates; return save(tx,"ACCOUNT_SPEND",{ inactive: cursor.inactive, spendCheckpoint: cursor.spendCheckpoint, coverage, rangeIndex: 0 }); });
      }
    } else if (unit.kind === "ACCOUNT_SPEND") {
      const page = await client.getSyncPage<MetaAccountDailySpend>("spend",current.accountId,unit.range,{ ...options, after: cursor.after });
      if (cursor.inactive && page.data.some(row => row.date_start < unit.range.since || row.date_start > unit.range.until)) throw new MetaApiError("Spend di luar rentang rekonsiliasi.");
      const next = nextPage(page.after);
      await transaction(async tx => {
        if (page.after) {
          for (const row of page.data) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date_start) || row.spend === undefined) continue;
            const spend = new Prisma.Decimal(row.spend), date = new Date(row.date_start+"T00:00:00Z");
            await tx.metaAccountDailySpend.upsert({ where: { metaAccountId_date: { metaAccountId: wl.id, date } }, create: { metaAccountId: wl.id, date, spend }, update: { spend } });
          }
        } else {
          const through = cursor.inactive && cursor.spendCheckpoint && cursor.spendCheckpoint > unit.range.until ? cursor.spendCheckpoint : unit.range.until;
          await persistMetaAccountDailySpend(tx,wl.id,page.data,through);
          next.rangeIndex = (cursor.rangeIndex ?? 0)+1;
        }
        await save(tx,"ACCOUNT_SPEND",next);
      });
    } else if (unit.kind === "CAMPAIGN_INSIGHTS") {
      const page = await client.getSyncPage<MetaCampaignInsight>("insights",current.accountId,unit.range,{ ...options, after: cursor.after });
      if (cursor.inactive && page.data.some(row => row.date_start < unit.range.since || row.date_start > unit.range.until)) throw new MetaApiError("Insight di luar rentang rekonsiliasi.");
      const next = nextPage(page.after), ids = unit.campaignIds ?? [];
      const byMetaId = new Map((cursor.coverage?.campaigns ?? []).filter(c => ids.includes(c.id)).map(c => [c.metaCampaignId,c.id]));
      await transaction(async tx => {
        summary.insightRowsStored += await persistInsightChunk(byMetaId,page.data,ids,unit.range.until,{ db: tx, advanceCheckpoint: !page.after });
        if (!page.after) next.rangeIndex = (cursor.rangeIndex ?? 0)+1;
        await save(tx,"CAMPAIGN_INSIGHTS",next);
      });
    } else if (unit.kind === "ADVANCE") {
      if (current.phase === "ACCOUNT_SPEND") await transaction(tx => save(tx,"CAMPAIGN_INSIGHTS",{ ...cursor, rangeIndex: 0 }));
      else {
        if (current.position < summary.wlTotal-1) await client.waitBetweenAccounts();
        await transaction(finish);
      }
    }
    return result();
  } catch (error) {
    const current = progress!;
    if (!current) throw error;
    const paused = error instanceof MetaSyncPauseError || isRateLimit(error);
    // Do not release while HTTP, backoff or a DB transaction is still pending: all were awaited above.
    if (paused) {
      await transaction(async tx => {
        await tx.metaSyncRun.update({ where: { id: run.id }, data: { status: isRateLimit(error) ? "PAUSED_RATE_LIMIT" : "RUNNING", error: error instanceof MetaSyncPauseError ? error.message : "Sync dijeda karena batas request Meta. Lanjutkan setelah beberapa saat." } });
      }).catch(() => { /* An expired/stale lease cannot publish a result; cursor remains resumable. */ });
      return result(false,true);
    }
    if (client && current.position < (lease.summary as unknown as FilterSyncSummary).wlTotal-1 && !(current.phase === "STATUS" && error instanceof MetaApiError && [10,100,200].includes(error.code ?? -1))) await client.waitBetweenAccounts();
    await transaction(async tx => {
      const summary = structuredClone(lease.summary) as unknown as FilterSyncSummary;
      const unavailable = current.phase === "STATUS" && error instanceof MetaApiError && [10,100,200].includes(error.code ?? -1);
      if (unavailable) {
        if (current.metaAccountId !== null) await tx.metaAccount.update({ where: { id: current.metaAccountId }, data: { status: "UNAVAILABLE" } });
        summary.wlSkipped++; summary.skippedWlNames.push(`${current.name} (UNAVAILABLE)`);
      } else { summary.wlFailed++; summary.failedWlNames.push(current.name); }
      await tx.metaSyncWlProgress.update({ where: { id: current.id }, data: { phase: "DONE", status: unavailable ? "SKIPPED" : "FAILED", cursor: {}, error: unavailable ? null : safeError(error) } });
      await tx.metaSyncRun.update({ where: { id: run.id }, data: { status: "RUNNING", summary: summary as unknown as Prisma.InputJsonValue, error: unavailable ? null : safeError(error) } });
      await completeMetaSyncRunIfTerminal(tx,run.id,new Date());
    });
    return result();
  } finally {
    clearTimeout(timer); controller.abort(new MetaSyncPauseError("ABORTED"));
    await releaseMetaSyncLease(prisma,run.id,owner,lease.generation);
  }
}
