import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { formatShopeeActivityTime } from "../shopee/activity-time.ts";

type Provider = "CLICKADU" | "ADSTERRA";
type Database =
  | Pick<PrismaClient, "clickaduCampaignConfig" | "adsterraCampaignConfig">
  | Pick<Prisma.TransactionClient, "clickaduCampaignConfig" | "adsterraCampaignConfig">;

export function formatBlacklistReplacementTime(value: string | Date | null) {
  return formatShopeeActivityTime(value ? new Date(value) : null, "Belum pernah");
}

export async function markBlacklistReplaced(
  db: Database,
  provider: Provider,
  shopeeAccountId: number,
  configId: number,
  at: Date,
) {
  const args = { where: { id: configId, shopeeAccountId }, data: { lastBlacklistReplacedAt: at } };
  const result = provider === "CLICKADU"
    ? await db.clickaduCampaignConfig.updateMany(args)
    : await db.adsterraCampaignConfig.updateMany(args);
  if (result.count !== 1) throw new Error("Konfigurasi campaign tidak ditemukan saat menyimpan waktu replace blacklist.");
}

export async function runVerifiedBlacklistReplacement<T extends { status: "UPDATED" | "NO_CHANGE" }>(
  replace: () => Promise<T>,
  record: (at: Date) => Promise<unknown>,
  now: () => Date = () => new Date(),
) {
  const result = await replace();
  if (result.status === "NO_CHANGE") return { ...result, lastBlacklistReplacedAt: null };
  const replacedAt = now();
  await record(replacedAt);
  return { ...result, lastBlacklistReplacedAt: replacedAt.toISOString() };
}
