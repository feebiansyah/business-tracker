import Decimal from "decimal.js";
import { Prisma } from "../generated/prisma/client.ts";
import { CLICKADU_USD_IDR_RATE, calculateClickaduDailyFinancials } from "../clickadu-history/financials.ts";
import { parseClickaduOverviewParams, type ClickaduOverviewParams, type ClickaduOverviewSortKey } from "./clickadu-overview-params.ts";

type Database = Pick<Prisma.TransactionClient, "$queryRaw">;
type SourceRow = { date: Date; spendUsd: Prisma.Decimal | string | null; commissionIdr: Prisma.Decimal | string | null };
type QueryRow = SourceRow & { spendIdr: Prisma.Decimal | string | null; profitIdr: Prisma.Decimal | string | null; profitPercent: Prisma.Decimal | string | null };
type SummaryRow = { total: bigint; spendUsd: Prisma.Decimal | string | null; commissionIdr: Prisma.Decimal | string | null };
export type ClickaduOverviewDay = { date: string; spendUsd: string | null; spendIdr: string | null; commissionIdr: string | null; profitIdr: string | null; profitPercent: string | null };
export type ClickaduOverviewSummary = Omit<ClickaduOverviewDay, "date">;
export type ClickaduOverviewPagination = { page: number; pageSize: 25 | 50 | 100; total: number; pageCount: number };
export type ClickaduOverview = { days: ClickaduOverviewDay[]; summary: ClickaduOverviewSummary | null; pagination: ClickaduOverviewPagination; state: ClickaduOverviewParams };

const orderColumns: Record<ClickaduOverviewSortKey, string> = { date: "date", spendUsd: "spendUsd", spendIdr: "spendIdr", commission: "commissionIdr", profit: "profitIdr", profitPercent: "profitPercent" };
const day = (value: Date) => value.toISOString().slice(0, 10);
const decimal = (value: Prisma.Decimal | string | null) => value === null ? null : new Decimal(value.toString());
const sum = (values: (Decimal | null)[]) => { const known = values.filter((value): value is Decimal => value !== null); return known.length === 0 ? null : Decimal.sum(...known); };
const percent = (spendIdr: string | null, profitIdr: string | null) => spendIdr === null || profitIdr === null || new Decimal(spendIdr).isZero() ? null : new Decimal(profitIdr).div(spendIdr).mul(100).toString();
const pagination = (total: number, requested: number, pageSize: 25 | 50 | 100): ClickaduOverviewPagination => { const pageCount = Math.max(1, Math.ceil(total / pageSize)); return { total, pageSize, pageCount, page: Math.min(requested, pageCount) }; };

function financials(spendUsd: Decimal | null, commissionIdr: Decimal | null): ClickaduOverviewSummary {
  const spend = spendUsd?.toString() ?? null;
  const commission = commissionIdr?.toString() ?? null;
  const result = calculateClickaduDailyFinancials(spend, commission);
  return { spendUsd: spend, spendIdr: result.spendIdr, commissionIdr: commission, profitIdr: result.profitIdr, profitPercent: percent(result.spendIdr, result.profitIdr) };
}

function row(values: QueryRow): ClickaduOverviewDay {
  return { date: day(values.date), spendUsd: decimal(values.spendUsd)?.toString() ?? null, spendIdr: decimal(values.spendIdr)?.toString() ?? null, commissionIdr: decimal(values.commissionIdr)?.toString() ?? null, profitIdr: decimal(values.profitIdr)?.toString() ?? null, profitPercent: decimal(values.profitPercent)?.toString() ?? null };
}

function dailyCte(shopeeAccountId: number, from: string, to: string) {
  return Prisma.sql`
    WITH daily_metrics AS (
      SELECT metric.date,
        SUM(metric.spendUsd) AS spendUsd,
        SUM(metric.spendUsd) * ${CLICKADU_USD_IDR_RATE} AS spendIdr,
        SUM(metric.commissionIdr) AS commissionIdr,
        SUM(metric.commissionIdr) - (SUM(metric.spendUsd) * ${CLICKADU_USD_IDR_RATE}) AS profitIdr,
        CASE WHEN SUM(metric.spendUsd) = 0 THEN NULL ELSE (SUM(metric.commissionIdr) - (SUM(metric.spendUsd) * ${CLICKADU_USD_IDR_RATE})) / (SUM(metric.spendUsd) * ${CLICKADU_USD_IDR_RATE}) * 100 END AS profitPercent
      FROM ClickaduCampaignDailyMetric metric
      INNER JOIN ClickaduCampaignConfig config ON config.id = metric.clickaduCampaignConfigId
      WHERE config.shopeeAccountId = ${shopeeAccountId}
        AND (${from} = '' OR metric.date >= ${from})
        AND (${to} = '' OR metric.date <= ${to})
      GROUP BY metric.date
    )`;
}

export function buildClickaduOverview(rows: readonly SourceRow[]): Pick<ClickaduOverview, "days" | "summary"> {
  const grouped = new Map<string, { spendUsd: Decimal | null; commissionIdr: Decimal | null }>();
  for (const source of rows) {
    const key = day(source.date);
    const current = grouped.get(key) ?? { spendUsd: null, commissionIdr: null };
    const spendUsd = decimal(source.spendUsd);
    const commissionIdr = decimal(source.commissionIdr);
    grouped.set(key, { spendUsd: current.spendUsd === null ? spendUsd : spendUsd === null ? current.spendUsd : current.spendUsd.plus(spendUsd), commissionIdr: current.commissionIdr === null ? commissionIdr : commissionIdr === null ? current.commissionIdr : current.commissionIdr.plus(commissionIdr) });
  }
  const days = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({ date, ...financials(values.spendUsd, values.commissionIdr) }));
  return { days, summary: days.length === 0 ? null : financials(sum(days.map((value) => decimal(value.spendUsd))), sum(days.map((value) => decimal(value.commissionIdr)))) };
}

export async function getShopeeClickaduOverview(db: Database, shopeeAccountId: number, from: string, to: string, requestedState: ClickaduOverviewParams = parseClickaduOverviewParams({})): Promise<ClickaduOverview> {
  const summaryRows = await db.$queryRaw<SummaryRow[]>(Prisma.sql`${dailyCte(shopeeAccountId, from, to)} SELECT COUNT(*) AS total, SUM(spendUsd) AS spendUsd, SUM(commissionIdr) AS commissionIdr FROM daily_metrics`);
  const total = Number(summaryRows[0]?.total ?? 0);
  const page = pagination(total, requestedState.page, requestedState.pageSize);
  const state = { ...requestedState, page: page.page };
  const order = Prisma.raw(orderColumns[state.sort]);
  const direction = Prisma.raw(state.dir === "asc" ? "ASC" : "DESC");
  const pageRows = await db.$queryRaw<QueryRow[]>(Prisma.sql`${dailyCte(shopeeAccountId, from, to)} SELECT date, spendUsd, spendIdr, commissionIdr, profitIdr, profitPercent FROM daily_metrics ORDER BY ${order} IS NULL ASC, ${order} ${direction}, date DESC LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}`);
  const summary = summaryRows[0];
  return { days: pageRows.map(row), summary: total === 0 ? null : financials(decimal(summary.spendUsd), decimal(summary.commissionIdr)), pagination: page, state };
}

export { CLICKADU_USD_IDR_RATE };
