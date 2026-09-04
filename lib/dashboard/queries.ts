import { Prisma } from "../generated/prisma/client.ts";
import { calculateDashboardFinancials, type DashboardFinancials } from "./calculations.ts";
import { parseDashboardParams, type DashboardAccountParams, type DashboardParams, type DashboardSortKey } from "./params.ts";

export type DashboardDay = DashboardFinancials & { date: string };
export type DashboardPageInfo = { page: number; pageSize: 25 | 50 | 100; total: number; pageCount: number };
export type DashboardAccountData = { id: number; name: string; wlCount: number; summary: DashboardFinancials; days: DashboardDay[]; pagination: DashboardPageInfo; state: DashboardAccountParams };
export type DashboardData = { accounts: DashboardAccountData[]; state: DashboardParams };

type RawParams = Record<string, string | string[] | undefined>;
type DashboardDb = Pick<Prisma.TransactionClient, "shopeeAccount" | "$queryRaw">;
type SummaryRow = { total: bigint; budgetKnown: bigint; budgetTotal: Prisma.Decimal | null; commissionKnown: bigint; commissionTotal: Prisma.Decimal | null };
type DayRow = { date: Date; budget: Prisma.Decimal | null; costWithFee: Prisma.Decimal | null; commission: Prisma.Decimal | null; profit: Prisma.Decimal | null; profitPercent: Prisma.Decimal | null };

const orderColumns: Record<DashboardSortKey, string> = { date: "date", budget: "budget", costWithFee: "costWithFee", commission: "commission", profit: "profit", profitPercent: "profitPercent" };
const day = (value: Date) => value.toISOString().slice(0, 10);
const number = (value: Prisma.Decimal | null) => value === null ? null : Number(value);
function pageInfo(total: number, requested: number, pageSize: 25 | 50 | 100): DashboardPageInfo { const pageCount = Math.max(1, Math.ceil(total / pageSize)); return { page: Math.min(requested, pageCount), pageSize, total, pageCount }; }

function dailyCte(shopeeAccountId: number, from: string, to: string) {
  return Prisma.sql`
    WITH scoped_campaigns AS (
      SELECT c.id FROM Campaign c INNER JOIN MetaAccount ma ON ma.id = c.metaAccountId WHERE ma.shopeeAccountId = ${shopeeAccountId}
    ), dashboard_dates AS (
      SELECT s.date FROM MetaAccountDailySpend s INNER JOIN MetaAccount ma ON ma.id = s.metaAccountId WHERE ma.shopeeAccountId = ${shopeeAccountId}
      UNION
      SELECT dm.date FROM CampaignDailyMetric dm INNER JOIN scoped_campaigns c ON c.id = dm.campaignId
    ), daily_base AS (
      SELECT d.date,
        (SELECT SUM(s.spend) FROM MetaAccountDailySpend s INNER JOIN MetaAccount ma ON ma.id = s.metaAccountId WHERE ma.shopeeAccountId = ${shopeeAccountId} AND s.date = d.date) AS budget,
        (SELECT SUM(dm.commission) FROM CampaignDailyMetric dm INNER JOIN scoped_campaigns c ON c.id = dm.campaignId WHERE dm.date = d.date) AS storedCommission,
        EXISTS (SELECT 1 FROM ShopeeCommissionImport i WHERE i.shopeeAccountId = ${shopeeAccountId} AND d.date BETWEEN i.dateFrom AND i.dateTo) AS commissionCovered
      FROM dashboard_dates d
      WHERE (${from} = '' OR d.date >= ${from}) AND (${to} = '' OR d.date <= ${to})
    ), daily_values AS (
      SELECT date, budget, CASE WHEN storedCommission IS NOT NULL THEN storedCommission WHEN commissionCovered THEN 0 ELSE NULL END AS commission FROM daily_base
    ), daily_metrics AS (
      SELECT date, budget, budget * 1.05 AS costWithFee, commission,
        CASE WHEN budget IS NULL OR commission IS NULL THEN NULL ELSE commission - budget * 1.05 END AS profit,
        CASE WHEN budget IS NULL OR commission IS NULL OR budget = 0 THEN NULL ELSE (commission - budget * 1.05) / (budget * 1.05) * 100 END AS profitPercent
      FROM daily_values
    )`;
}

async function loadAccount(db: DashboardDb, account: { id: number; name: string; _count: { metaAccounts: number } }, state: DashboardAccountParams, from: string, to: string): Promise<DashboardAccountData> {
  const summaryRows = await db.$queryRaw<SummaryRow[]>(Prisma.sql`${dailyCte(account.id, from, to)}
    SELECT COUNT(*) AS total, COUNT(budget) AS budgetKnown, SUM(budget) AS budgetTotal, COUNT(commission) AS commissionKnown, SUM(commission) AS commissionTotal FROM daily_metrics`);
  const totals = summaryRows[0];
  const total = Number(totals?.total ?? 0);
  const pagination = pageInfo(total, state.page, state.pageSize);
  const order = Prisma.raw(orderColumns[state.sort]);
  const direction = Prisma.raw(state.dir === "asc" ? "ASC" : "DESC");
  const pageRows = await db.$queryRaw<DayRow[]>(Prisma.sql`${dailyCte(account.id, from, to)}
    SELECT date, budget, costWithFee, commission, profit, profitPercent FROM daily_metrics
    ORDER BY ${order} IS NULL ASC, ${order} ${direction}, date DESC
    LIMIT ${pagination.pageSize} OFFSET ${(pagination.page - 1) * pagination.pageSize}`);
  const budget = total > 0 && Number(totals.budgetKnown) === total ? number(totals.budgetTotal) : null;
  const commission = total > 0 && Number(totals.commissionKnown) === total ? number(totals.commissionTotal) : null;
  return { id: account.id, name: account.name, wlCount: account._count.metaAccounts, summary: calculateDashboardFinancials(budget, commission), days: pageRows.map((row) => ({ date: day(row.date), budget: number(row.budget), costWithFee: number(row.costWithFee), commission: number(row.commission), profit: number(row.profit), profitPercent: number(row.profitPercent) })), pagination, state: { ...state, page: pagination.page } };
}

export async function getDashboardData(raw: RawParams, db: DashboardDb): Promise<DashboardData> {
  const accounts = await db.shopeeAccount.findMany({ select: { id: true, name: true, _count: { select: { metaAccounts: true } } }, orderBy: { name: "asc" } });
  const state = parseDashboardParams(raw, accounts.map((account) => account.id));
  return { state, accounts: await Promise.all(accounts.map((account) => loadAccount(db, account, state.accounts[account.id], state.from, state.to))) };
}
