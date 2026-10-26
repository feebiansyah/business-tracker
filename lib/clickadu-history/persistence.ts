import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import Decimal from "decimal.js";
import { ClickaduDailySyncError, type ClickaduDailyMetricInput } from "./daily-sync.ts";

type DailyMetricDb = Pick<PrismaClient, "clickaduCampaignDailyMetric"> | Pick<Prisma.TransactionClient, "clickaduCampaignDailyMetric">;

export function buildDailyMetricUpsert(input: ClickaduDailyMetricInput) {
  // Reject unknown/invalid spend before an upsert or checkpoint can be written.
  if (typeof input.spendUsd !== "string" || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(input.spendUsd)
    || !new Decimal(input.spendUsd).isFinite() || new Decimal(input.spendUsd).isNegative()) {
    throw new ClickaduDailySyncError("Spend Clickadu tidak valid; histori dan checkpoint tidak diubah.");
  }
  const date = new Date(`${input.date}T00:00:00.000Z`);
  const available = {
    spendUsd: input.spendUsd,
    ...(input.dailyBudget !== null ? { dailyBudget: input.dailyBudget } : {}),
  };
  return {
    where: { clickaduCampaignConfigId_date: { clickaduCampaignConfigId: input.clickaduCampaignConfigId, date } },
    create: {
      clickaduCampaignConfigId: input.clickaduCampaignConfigId,
      date,
      spendUsd: input.spendUsd,
      dailyBudget: input.dailyBudget,
    },
    update: available,
  };
}

export function upsertClickaduDailyMetric(db: DailyMetricDb, input: ClickaduDailyMetricInput) {
  return db.clickaduCampaignDailyMetric.upsert(buildDailyMetricUpsert(input));
}

export async function persistClickaduDailyMetricAndCheckpoint(db: PrismaClient, input: ClickaduDailyMetricInput) {
  return db.$transaction(async (tx) => {
    const metric = await upsertClickaduDailyMetric(tx, input);
    const checkpoint = new Date(`${input.date}T00:00:00.000Z`);
    await tx.clickaduCampaignConfig.updateMany({
      where: {
        id: input.clickaduCampaignConfigId,
        OR: [{ historySyncedThrough: null }, { historySyncedThrough: { lt: checkpoint } }],
      },
      data: { historySyncedThrough: checkpoint },
    });
    return metric;
  });
}
