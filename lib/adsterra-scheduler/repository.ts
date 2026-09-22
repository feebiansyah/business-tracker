import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type { AdsterraScheduledAction, AdsterraScheduleTerminalStatus } from "./run.ts";

type Db = Pick<PrismaClient, "adsterraCampaignConfig" | "adsterraCampaignScheduleRun"> | Pick<Prisma.TransactionClient, "adsterraCampaignConfig" | "adsterraCampaignScheduleRun">;

export function loadEnabledAdsterraScheduleConfigs(db: Pick<Db, "adsterraCampaignConfig">) {
  return db.adsterraCampaignConfig.findMany({
    where: { autoScheduleEnabled: true },
    select: { id: true, campaignId: true, shopeeAccountId: true },
    orderBy: [{ shopeeAccountId: "asc" }, { id: "asc" }],
  });
}

export async function claimAdsterraScheduleRun(db: Pick<Db, "adsterraCampaignScheduleRun">, input: { adsterraCampaignConfigId: number; businessDate: string; action: AdsterraScheduledAction }) {
  try {
    return await db.adsterraCampaignScheduleRun.create({
      data: {
        adsterraCampaignConfigId: input.adsterraCampaignConfigId,
        businessDate: new Date(`${input.businessDate}T00:00:00.000Z`),
        action: input.action,
        status: "RUNNING",
        startedAt: new Date(),
      },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueConflict(error)) return null;
    throw error;
  }
}

export async function finishAdsterraScheduleRun(db: Pick<Db, "adsterraCampaignScheduleRun">, input: { id: number; status: AdsterraScheduleTerminalStatus; actualStatus?: string | null; errorMessage?: string | null }) {
  const updated = await db.adsterraCampaignScheduleRun.updateMany({
    where: { id: input.id, status: "RUNNING" },
    data: { status: input.status, actualStatus: input.actualStatus ?? null, errorMessage: input.errorMessage ?? null, finishedAt: new Date() },
  });
  if (updated.count !== 1) throw new Error("Schedule run Adsterra tidak dapat diselesaikan.");
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
