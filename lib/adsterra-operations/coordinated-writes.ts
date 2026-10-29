import "server-only";
import { randomUUID } from "node:crypto";
import { setAndVerifyAdsterraCampaignActive } from "../adsterra-roi/campaign-activity";
import { prisma } from "../prisma";
import { operationContext, loadOperationScope } from "./runtime";
import { OperationBudget } from "./budget";
import { OperationError } from "./types";
import { campaignKey } from "./canonical";
import { CampaignOperationStore } from "./repository";
import { parseAdsterraConfigId, parseAdsterraConfigInput, parseShopeeAccountId } from "../adsterra-roi/config-input";
import { saveAdsterraConfig, deleteAdsterraConfig } from "../adsterra-roi/config-repository";
import type { PlacementProvider } from "./provider";

/** Every existing writer shares the same physical-campaign guard. No HTTP in tx. */
export async function runCoordinatedWrite<T>(input: {
  accountId: number; configId: number; owner: string; action: string; protective?: boolean;
  budget: OperationBudget; authorize?: () => Promise<void>;
}, work: (provider: PlacementProvider, campaignId: string) => Promise<T>, verified: (value: T) => boolean): Promise<T> {
  const ctx = await operationContext(input.accountId, input.configId, input.budget);
  const fence = input.protective ? await ctx.store.claimOff(ctx.scope.campaignId, input.owner)
    : await ctx.store.reserve(ctx.scope.campaignId, input.owner, input.action);
  ctx.provider.fence = fence;
  const scopeCheck = ctx.provider.beforeMutation;
  ctx.provider.beforeMutation = async () => { await scopeCheck?.(); await input.authorize?.(); };
  try {
    await ctx.provider.campaign(); // validates real identity before any write
    await input.authorize?.();
    const result = await work(ctx.provider, ctx.scope.campaignId);
    if (ctx.provider.notDispatchedStatus) throw new OperationError("Validasi/deadline berubah sebelum HTTP. Marker diselesaikan secara fenced; tidak ada retry write otomatis.");
    const row = await ctx.store.read(ctx.scope.campaignId);
    const overlappingOn = input.protective && row?.status === "RUNNING" && ["ACTIVATE", "SCHEDULE_ON"].includes(row.action);
    const status = await ctx.store.finish(fence, ctx.provider.ambiguous || overlappingOn ? "UNVERIFIED" : verified(result) ? "VERIFIED" : "PARTIAL",
      JSON.stringify({ action: input.action, writes: ctx.provider.sent, overlappingOn: !!overlappingOn }));
    if (status !== "VERIFIED") throw new OperationError("Perubahan belum terverifikasi penuh; guard tetap terkunci. Periksa operasi/pemulihan sebelum mencoba write lain.");
    return result;
  } catch (error) {
    // Never retry work/POST. Failure to record leaves the durable RUNNING guard.
    if (!ctx.provider.notDispatchedStatus) {
      try { await ctx.store.finish(fence, ctx.provider.sent || ctx.provider.ambiguous ? "UNVERIFIED" : "RECONFIRM_REQUIRED", "Operasi dihentikan; periksa keadaan provider/metadata. Tidak ada retry otomatis."); } catch { /* preserve original safety failure */ }
    }
    throw error;
  }
}
export async function coordinatedCampaignActivity(accountId: number, configId: number, owner: string, desired: boolean,
  budget = new OperationBudget(), scheduler = false, expectedCampaignId?: string) {
  const before = await loadOperationScope(accountId, configId, budget);
  if (expectedCampaignId !== undefined && campaignKey(expectedCampaignId) !== before.scope.campaignId) throw new OperationError("Scope job scheduler lama sudah berubah; tidak memindahkan target.");
  const authorize = async () => {
    const fresh = await loadOperationScope(accountId, configId, budget);
    if (fresh.scope.campaignId !== before.scope.campaignId) throw new OperationError("Scope campaign scheduler berubah.");
    if (scheduler && !fresh.row.autoScheduleEnabled) throw new OperationError("Auto ON/OFF sudah dinonaktifkan. Job lama tidak boleh menulis provider.");
  };
  return runCoordinatedWrite({ accountId, configId, owner, action: scheduler ? desired ? "SCHEDULE_ON" : "SCHEDULE_OFF" : desired ? "ACTIVATE" : "PROTECTIVE_OFF",
    protective: !desired, budget, authorize }, async (provider, id) => setAndVerifyAdsterraCampaignActive(id, desired, {
      setCampaignActive: (campaignId, active) => provider.legacy.setCampaignActive(campaignId, active),
      getCampaignStatus: async () => { const actual = await provider.campaign(); return { campaignId: Number(actual.id), activeCode: actual.active,
        status: ({ 1: "INACTIVE", 2: "LIMITED", 3: "ACTIVE", 4: "NOT_IN_USE" } as const)[actual.active] }; },
    }), (result) => result.verified);
}
export async function coordinatedAutoDisable(accountId: number, configId: number, budget: OperationBudget) {
  accountId = parseShopeeAccountId(accountId); configId = parseAdsterraConfigId(configId);
  // Short DB-only transaction, no provider/callback retry. The generation bump
  // cancels old continuations without erasing a pending/uncertain main operation.
  return budget.wait(prisma.$transaction(async (tx) => {
    const config = await tx.adsterraCampaignConfig.findFirst({ where: { id: configId, shopeeAccountId: accountId }, select: { campaignId: true } });
    if (!config) throw new OperationError("Konfigurasi Adsterra tidak ditemukan.");
    // Lock/create the canonical guard before locking the config. The upsert is
    // a current write, not a repeatable-read snapshot that could miss a new job.
    const row = await tx.adsterraCampaignOperation.upsert({ where: { campaignId: campaignKey(config.campaignId) },
      create: { campaignId: campaignKey(config.campaignId), operationId: randomUUID(), generation: 1, owner: "auto-disable", action: "AUTO_DISABLE", status: "IDLE", phase: "AUTO_DISABLED" },
      update: { generation: { increment: 1 } } });
    const changed = await tx.adsterraCampaignConfig.updateMany({ where: { id: configId, shopeeAccountId: accountId, campaignId: config.campaignId }, data: { autoScheduleEnabled: false } });
    if (changed.count !== 1) throw new OperationError("Scope konfigurasi berubah.");
    return { autoScheduleEnabled: false, warning: row?.status === "RUNNING" ? "Auto nonaktif. Operasi lama dibatasi fencing; request provider yang sudah terkirim mungkin tetap diterapkan. Periksa status dan gunakan protective OFF bila perlu." : "" };
  }, { isolationLevel: "Serializable", maxWait: Math.min(5000, budget.remaining()), timeout: Math.min(5000, budget.remaining()) }));
}
export async function coordinatedAutoEnable(accountId: number, configId: number, owner: string, budget: OperationBudget) {
  const ctx = await operationContext(accountId, configId, budget);
  const fence = await ctx.store.reserve(ctx.scope.campaignId, owner, "AUTO_ENABLE");
  try {
    const fresh = await loadOperationScope(accountId, configId, budget);
    if (fresh.scopeHash !== ctx.scopeHash) throw new OperationError("Scope berubah sebelum mengaktifkan Auto.");
    // Mark pending before even the DB flag write: a timed-out query can finish late.
    await ctx.store.beforeWrite(fence, "AUTO_FLAG_PENDING");
    const changed = await budget.wait(prisma.$transaction(async (tx) => {
      const owned = await tx.adsterraCampaignOperation.updateMany({ where: { campaignId: fence.campaignId,
        operationId: fence.operationId, generation: fence.generation, status: "RUNNING", uncertain: true,
        protectiveOffStatus: { in: ["IDLE", "VERIFIED", "NO_CHANGE", "RECONFIRM_REQUIRED"] }, protectiveOffUncertain: false },
      data: { phase: "AUTO_FLAG_PENDING" } });
      if (owned.count !== 1) throw new OperationError("Auto enable dibatalkan generation lain; flag tidak diaktifkan.");
      return tx.adsterraCampaignConfig.updateMany({ where: { id: configId, shopeeAccountId: accountId,
        campaignId: fresh.row.campaignId, updatedAt: fresh.row.updatedAt }, data: { autoScheduleEnabled: true } });
    }, { isolationLevel: "Serializable", maxWait: Math.min(5000, budget.remaining()), timeout: Math.min(5000, budget.remaining()) }));
    await ctx.store.acknowledged(fence);
    if (changed.count !== 1) throw new OperationError("Konfigurasi berubah sebelum mengaktifkan Auto.");
    await ctx.store.finish(fence, "VERIFIED", "Auto ON/OFF diaktifkan eksplisit oleh operator.");
    return { autoScheduleEnabled: true };
  } catch (error) {
    try { await ctx.store.finish(fence, "UNVERIFIED", "Hasil pengaktifan Auto belum pasti; periksa ulang flag, jangan otomatis membuka guard."); } catch { /* durable guard remains */ }
    throw error;
  }
}

export async function coordinatedConfigChange(account: unknown, input: { id?: unknown; campaignId: unknown; label: unknown; sourceTag: unknown } | number,
  owner: string, budget: OperationBudget) {
  const accountId = parseShopeeAccountId(account);
  const parsed = typeof input === "number" ? null : parseAdsterraConfigInput(input);
  const configId = parsed?.id ?? (typeof input === "number" ? parseAdsterraConfigId(input) : undefined);
  // All related guard claims and the config write are one short DB-only tx.
  // Reject editing/moving/deleting ANY alias while a physical campaign is busy.
  return budget.wait(prisma.$transaction(async (tx) => {
    const old = configId ? await tx.adsterraCampaignConfig.findFirst({ where: { id: configId, shopeeAccountId: accountId }, select: { campaignId: true } }) : null;
    if (configId && !old) throw new OperationError("Konfigurasi dalam scope tidak ditemukan.");
    const ids = [...new Set([...(old ? [campaignKey(old.campaignId)] : []), ...(parsed ? [campaignKey(parsed.campaignId)] : [])])].sort();
    const store = new CampaignOperationStore(tx, budget), fences = [];
    for (const id of ids) fences.push(await store.reserve(id, owner, "CONFIG_CHANGE"));
    if (parsed) await saveAdsterraConfig(tx, accountId, parsed);
    else await deleteAdsterraConfig(tx, accountId, configId);
    for (const fence of fences) await store.finish(fence, "VERIFIED", "Perubahan konfigurasi terkoordinasi; tidak ada write provider.");
  }, { maxWait: Math.min(5000, budget.remaining()), timeout: Math.min(5000, budget.remaining()) }));
}
