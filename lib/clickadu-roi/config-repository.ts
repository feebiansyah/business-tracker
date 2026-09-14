import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import {
  ClickaduConfigError,
  parseClickaduConfigId,
  parseClickaduConfigInput,
  parseShopeeAccountId,
  type ClickaduConfigInput,
} from "./config-input.ts";

type ClickaduConfigDb =
  | Pick<PrismaClient, "shopeeAccount" | "clickaduCampaignConfig">
  | Pick<Prisma.TransactionClient, "shopeeAccount" | "clickaduCampaignConfig">;

const configSelect = {
  id: true,
  campaignId: true,
  label: true,
  sourceTag: true,
  shopeeAccountId: true,
} as const;

export async function getClickaduConfigPageData(db: ClickaduConfigDb, accountIdValue: unknown) {
  const shopeeAccountId = parseShopeeAccountId(accountIdValue);
  const account = await db.shopeeAccount.findUnique({
    where: { id: shopeeAccountId },
    select: {
      id: true,
      name: true,
      clickaduCampaignConfigs: {
        select: configSelect,
        orderBy: [{ label: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!account) return null;
  return { account: { id: account.id, name: account.name }, configs: account.clickaduCampaignConfigs };
}

export async function saveClickaduConfig(
  db: ClickaduConfigDb,
  accountIdValue: unknown,
  input: ClickaduConfigInput,
) {
  const shopeeAccountId = parseShopeeAccountId(accountIdValue);
  const parsed = parseClickaduConfigInput(input);
  await requireShopeeAccount(db, shopeeAccountId);

  try {
    if (parsed.id === undefined) {
      return await db.clickaduCampaignConfig.create({
        data: {
          shopeeAccountId,
          campaignId: parsed.campaignId,
          label: parsed.label,
          sourceTag: parsed.sourceTag,
        },
        select: configSelect,
      });
    }

    const updated = await db.clickaduCampaignConfig.updateMany({
      where: { id: parsed.id, shopeeAccountId },
      data: { campaignId: parsed.campaignId, label: parsed.label, sourceTag: parsed.sourceTag },
    });
    if (updated.count !== 1) throw new ClickaduConfigError("Konfigurasi Clickadu tidak ditemukan.");
    return await db.clickaduCampaignConfig.findFirstOrThrow({
      where: { id: parsed.id, shopeeAccountId },
      select: configSelect,
    });
  } catch (error) {
    if (error instanceof ClickaduConfigError) throw error;
    if (isUniqueConstraintError(error)) {
      throw new ClickaduConfigError("Campaign Clickadu tersebut sudah ada pada akun Shopee ini.");
    }
    throw error;
  }
}

export async function deleteClickaduConfig(
  db: ClickaduConfigDb,
  accountIdValue: unknown,
  configIdValue: unknown,
) {
  const shopeeAccountId = parseShopeeAccountId(accountIdValue);
  const id = parseClickaduConfigId(configIdValue);
  await requireShopeeAccount(db, shopeeAccountId);
  const deleted = await db.clickaduCampaignConfig.deleteMany({ where: { id, shopeeAccountId } });
  if (deleted.count !== 1) throw new ClickaduConfigError("Konfigurasi Clickadu tidak ditemukan.");
  return true;
}

async function requireShopeeAccount(db: ClickaduConfigDb, shopeeAccountId: number) {
  const account = await db.shopeeAccount.findUnique({ where: { id: shopeeAccountId }, select: { id: true } });
  if (!account) throw new ClickaduConfigError("Akun Shopee tidak ditemukan.");
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
