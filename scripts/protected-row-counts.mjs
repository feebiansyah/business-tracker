import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client.ts";

const prisma = new PrismaClient();
try {
  const [shopeeAccounts, metaAccounts, campaigns, dailyMetrics] = await Promise.all([
    prisma.shopeeAccount.count(), prisma.metaAccount.count(),
    prisma.campaign.count(), prisma.campaignDailyMetric.count(),
  ]);
  console.log(JSON.stringify({ shopeeAccounts, metaAccounts, campaigns, dailyMetrics }));
} finally {
  await prisma.$disconnect();
}
