import "server-only";

import { calculatePrafilterValues } from "@/lib/prafilter/calculations";
import { getOperationalDateRange } from "@/lib/prafilter/date";
import { prisma } from "@/lib/prisma";

export async function getPrafilterPageData(shopeeAccountId: number, selectedDate: string) {
  const { start, end } = getOperationalDateRange(selectedDate);
  const shopeeAccount = await prisma.shopeeAccount.findUnique({
    where: { id: shopeeAccountId },
    select: { id: true, name: true, _count: { select: { metaAccounts: true } } },
  });
  if (!shopeeAccount) return null;

  const campaigns = await prisma.campaign.findMany({
    where: {
      startTime: { gte: start, lt: end },
      metaAccount: { shopeeAccountId },
    },
    include: {
      metaAccount: { select: { name: true } },
      dailyMetrics: { where: { date: start }, take: 1 },
    },
    orderBy: [{ operationalStatus: "asc" }, { name: "asc" }],
  });

  const rows = campaigns.map((campaign) => {
    const metric = campaign.dailyMetrics[0];
    const spend = metric?.spend === null || metric?.spend === undefined ? null : Number(metric.spend);
    const cpc = metric?.cpc === null || metric?.cpc === undefined ? null : Number(metric.cpc);
    const commission = metric?.commission === null || metric?.commission === undefined ? null : Number(metric.commission);
    return {
      id: campaign.id,
      name: campaign.name,
      metaAccountName: campaign.metaAccount.name,
      jenis: campaign.jenis,
      operationalStatus: campaign.operationalStatus,
      note: campaign.note,
      cpc,
      spend,
      clicks: metric?.clicks ?? null,
      commission,
      ...calculatePrafilterValues(spend, commission),
    };
  });

  return {
    shopeeAccount,
    rows,
    summary: {
      campaigns: rows.length,
      metaAccounts: shopeeAccount._count.metaAccounts,
      on: rows.filter((row) => row.operationalStatus === "ON").length,
      off: rows.filter((row) => row.operationalStatus === "OFF").length,
    },
  };
}
