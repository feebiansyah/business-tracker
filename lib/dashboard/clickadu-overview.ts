import Decimal from "decimal.js";
import { Prisma } from "../generated/prisma/client.ts";
import { CLICKADU_USD_IDR_RATE, calculateClickaduDailyFinancials } from "../clickadu-history/financials.ts";
import { parseDashboardParams } from "./params.ts";
import { parseClickaduOverviewParams, type ClickaduOverviewParams, type ClickaduOverviewSortKey } from "./clickadu-overview-params.ts";

type Database = Pick<Prisma.TransactionClient, "$queryRaw">;
type Amount = Prisma.Decimal | string | null;
type DayRow = { date: Date; spendUsd: Amount; commissionIdr: Amount };
type SummaryRow = { total: bigint; incompleteDays: bigint; spendUsd: Amount; commissionIdr: Amount };
export type ClickaduOverviewFinancials = {
  spendUsd: string | null;
  spendIdr: string | null;
  commissionIdr: string | null;
  profitIdr: string | null;
  profitPercent: string | null;
};
export type ClickaduOverview = {
  days: (ClickaduOverviewFinancials & { date: string })[];
  summary: ClickaduOverviewFinancials | null;
  incompleteDays: number;
  pagination: { page: number; pageSize: 25 | 50 | 100; total: number; pageCount: number };
  state: ClickaduOverviewParams;
};

const orderColumns: Record<ClickaduOverviewSortKey, string> = {
  date: "date", spendUsd: "spendUsd", spendIdr: "spendIdr",
  commission: "commissionIdr", profit: "profitIdr", profitPercent: "profitPercent",
};

function financials(spendUsd: Amount, commissionIdr: Amount): ClickaduOverviewFinancials {
  const spend = spendUsd === null ? null : new Decimal(spendUsd.toString()).toString();
  const commission = commissionIdr === null ? null : new Decimal(commissionIdr.toString()).toString();
  const result = calculateClickaduDailyFinancials(spend, commission);
  const profitPercent = result.spendIdr === null || result.profitIdr === null || new Decimal(result.spendIdr).isZero()
    ? null : new Decimal(result.profitIdr).div(result.spendIdr).mul(100).toString();
  return { spendUsd: spend, spendIdr: result.spendIdr, commissionIdr: commission, profitIdr: result.profitIdr, profitPercent };
}

function dailyCte(shopeeAccountId: number, from: string, to: string) {
  return Prisma.sql`
    WITH scoped_configs AS (
      SELECT id FROM ClickaduCampaignConfig WHERE shopeeAccountId = ${shopeeAccountId}
    ), daily_base AS (
      SELECT metric.date,
        CASE WHEN COUNT(metric.spendUsd) = (SELECT COUNT(*) FROM scoped_configs)
          THEN SUM(metric.spendUsd) ELSE NULL END AS spendUsd,
        CASE WHEN COUNT(metric.commissionIdr) = (SELECT COUNT(*) FROM scoped_configs)
          THEN SUM(metric.commissionIdr) ELSE NULL END AS commissionIdr
      FROM ClickaduCampaignDailyMetric metric
      INNER JOIN scoped_configs config ON config.id = metric.clickaduCampaignConfigId
      WHERE (${from} = '' OR metric.date >= ${from})
        AND (${to} = '' OR metric.date <= ${to})
      GROUP BY metric.date
    ), daily_metrics AS (
      SELECT date, spendUsd, spendUsd * ${CLICKADU_USD_IDR_RATE} AS spendIdr, commissionIdr,
        commissionIdr - spendUsd * ${CLICKADU_USD_IDR_RATE} AS profitIdr,
        CASE WHEN spendUsd = 0 THEN NULL
          ELSE (commissionIdr - spendUsd * ${CLICKADU_USD_IDR_RATE}) / (spendUsd * ${CLICKADU_USD_IDR_RATE}) * 100 END AS profitPercent
      FROM daily_base
    )`;
}

export async function getShopeeClickaduOverview(
  db: Database, shopeeAccountId: number, from: string, to: string,
  requestedState: ClickaduOverviewParams = parseClickaduOverviewParams({}),
): Promise<ClickaduOverview> {
  if (!Number.isSafeInteger(shopeeAccountId) || shopeeAccountId <= 0) throw new Error("Akun Shopee tidak valid.");
  const range = parseDashboardParams({ from, to }, []);
  const parsed = parseClickaduOverviewParams({
    clickaduSort: requestedState.sort, clickaduDir: requestedState.dir,
    clickaduPage: String(requestedState.page), clickaduPageSize: String(requestedState.pageSize),
  });
  const cte = dailyCte(shopeeAccountId, range.from, range.to);
  // NULL or a missing campaign/day is unknown, never an implicit zero. Summary
  // fields also stay unknown if any day in the entire filtered range is incomplete.
  const summaries = await db.$queryRaw<SummaryRow[]>(Prisma.sql`${cte}
    SELECT COUNT(*) AS total,
      COUNT(*) - COUNT(profitIdr) AS incompleteDays,
      CASE WHEN COUNT(spendUsd) = COUNT(*) THEN SUM(spendUsd) ELSE NULL END AS spendUsd,
      CASE WHEN COUNT(commissionIdr) = COUNT(*) THEN SUM(commissionIdr) ELSE NULL END AS commissionIdr
    FROM daily_metrics`);
  const totals = summaries[0];
  const total = Number(totals?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / parsed.pageSize));
  const state = { ...parsed, page: Math.min(parsed.page, pageCount) };
  const pagination = { total, pageCount, page: state.page, pageSize: state.pageSize };
  if (total === 0) return { days: [], summary: null, incompleteDays: 0, state, pagination };

  const order = Prisma.raw(orderColumns[state.sort]);
  const direction = Prisma.raw(state.dir === "asc" ? "ASC" : "DESC");
  const rows = await db.$queryRaw<DayRow[]>(Prisma.sql`${cte}
    SELECT date, spendUsd, commissionIdr FROM daily_metrics
    ORDER BY ${order} IS NULL ASC, ${order} ${direction}, date DESC
    LIMIT ${state.pageSize} OFFSET ${(state.page - 1) * state.pageSize}`);
  return {
    days: rows.map((row) => ({ date: row.date.toISOString().slice(0, 10), ...financials(row.spendUsd, row.commissionIdr) })),
    summary: financials(totals.spendUsd, totals.commissionIdr),
    incompleteDays: Number(totals.incompleteDays), pagination, state,
  };
}
