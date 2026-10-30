import type { PrismaClient } from "../generated/prisma/client";
import type { CampaignOperationStore, Fence } from "./repository";
import type { OperationBudget } from "./budget";
import type { Alias } from "./types";
import { digest } from "./canonical";
import { OperationError } from "./types";

export class AutoNotDispatched extends OperationError {
  constructor(readonly status: "PARTIAL" | "RECONFIRM_REQUIRED") { super("Konfirmasi reset berakhir sebelum perubahan Auto dimulai."); }
}

/** Only the confirmed reset may disable all aliases under its own fence. No HTTP. */
export async function disableMethodAuto<T extends { scopeHash: string; aliases: Alias[] }>(
  db: Pick<PrismaClient, "$transaction">, store: CampaignOperationStore, budget: OperationBudget,
  fence: Fence, expected: T, load: (tx: Pick<PrismaClient, "adsterraCampaignConfig">) => Promise<T>, expiresAt: number,
): Promise<T> {
  const valid = () => { budget.check(); if (budget.now() >= expiresAt) throw new OperationError("Konfirmasi reset kedaluwarsa."); };
  valid();
  const marker = await store.beforeWrite(fence, "METHOD_AUTO_PENDING");
  try { valid(); } catch { throw new AutoNotDispatched(await store.settleNotDispatched(marker, false)); }
  // This is a DB write, not provider dispatch. Once started, a DB timeout is
  // uncertain too; never use the HTTP non-dispatch shortcut to release it.
  store.markDispatched(marker);
  const fresh = await budget.wait(db.$transaction(async (tx) => {
    valid();
    const owned = await tx.adsterraCampaignOperation.updateMany({ where: {
      campaignId: fence.campaignId, operationId: fence.operationId, generation: fence.generation,
      status: "RUNNING", action: "SET_METHOD", uncertain: true,
      protectiveOffStatus: { in: ["IDLE", "VERIFIED", "NO_CHANGE", "RECONFIRM_REQUIRED", "PARTIAL"] }, protectiveOffUncertain: false,
    }, data: { phase: "METHOD_AUTO_PENDING" } });
    if (owned.count !== 1) throw new OperationError("Perubahan lain membatalkan reset; Auto tidak diubah oleh proses lama.");
    const before = await load(tx);
    if (before.scopeHash !== expected.scopeHash || digest(before.aliases) !== digest(expected.aliases)) throw new OperationError("Scope/Auto berubah; konfirmasi ulang reset.");
    for (const alias of before.aliases.filter((a) => a.autoScheduleEnabled)) {
      valid();
      const changed = await tx.adsterraCampaignConfig.updateMany({ where: {
        id: alias.id, shopeeAccountId: alias.shopeeAccountId, campaignId: alias.campaignId, autoScheduleEnabled: true,
      }, data: { autoScheduleEnabled: false } });
      if (changed.count !== 1) throw new OperationError("Alias Auto berubah selama reset; tidak meneruskan clear.");
    }
    const after = await load(tx);
    if (after.aliases.some((a) => a.autoScheduleEnabled)) throw new OperationError("Seluruh Auto belum terbukti nonaktif.");
    return after;
  }, { isolationLevel: "Serializable", maxWait: Math.min(5000, budget.remaining()), timeout: Math.min(5000, budget.remaining()) }));
  await store.acknowledged(fence);
  await store.assert(fence);
  return fresh;
}
