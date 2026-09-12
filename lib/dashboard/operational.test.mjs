import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationalDashboard, getJakartaPreviousDate } from "./operational.ts";

test("D-1 follows Asia/Jakarta instead of the server timezone", () => {
  assert.equal(getJakartaPreviousDate(new Date("2026-09-11T17:30:00.000Z")), "2026-09-11");
  assert.equal(getJakartaPreviousDate(new Date("2026-09-11T16:30:00.000Z")), "2026-09-10");
});

const account = (overrides = {}) => ({
  id: 1,
  name: "BARRA",
  metaAccounts: [
    { spendHistorySyncedThrough: new Date("2026-09-11T00:00:00.000Z"), activeCampaignCount: 2 },
    { spendHistorySyncedThrough: new Date("2026-09-12T00:00:00.000Z"), activeCampaignCount: 3 },
  ],
  commissionCovered: true,
  clickCovered: true,
  ...overrides,
});

test("an account is complete only when every WL, commission, and click cover D-1", () => {
  const result = buildOperationalDashboard([account()], "2026-09-11");
  assert.equal(result.accounts[0].meta.complete, true);
  assert.equal(result.accounts[0].meta.coveredWlCount, 2);
  assert.equal(result.accounts[0].complete, true);
  assert.deepEqual(result.summary, { totalShopee: 1, totalWl: 2, activeCampaigns: 5, needsAttention: 0 });
});

test("lagging, null, and absent WL coverage are incomplete", () => {
  const result = buildOperationalDashboard([
    account({ id: 1, metaAccounts: [{ spendHistorySyncedThrough: new Date("2026-09-10T00:00:00.000Z"), activeCampaignCount: 1 }] }),
    account({ id: 2, metaAccounts: [{ spendHistorySyncedThrough: null, activeCampaignCount: 1 }] }),
    account({ id: 3, metaAccounts: [] }),
  ], "2026-09-11");
  assert.deepEqual(result.accounts.map((item) => item.meta.complete), [false, false, false]);
  assert.equal(result.summary.needsAttention, 3);
});

test("commission and click completeness come from date coverage, independent of amounts", () => {
  const result = buildOperationalDashboard([
    account({ commissionCovered: true, clickCovered: false }),
    account({ id: 2, commissionCovered: false, clickCovered: true }),
  ], "2026-09-11");
  assert.equal(result.accounts[0].commissionComplete, true);
  assert.equal(result.accounts[0].clickComplete, false);
  assert.equal(result.accounts[1].commissionComplete, false);
  assert.equal(result.accounts[1].clickComplete, true);
  assert.equal(result.summary.needsAttention, 2);
});

test("active campaign totals remain scoped to linked WL records", () => {
  const result = buildOperationalDashboard([
    account({ metaAccounts: [{ spendHistorySyncedThrough: new Date("2026-09-11T00:00:00.000Z"), activeCampaignCount: 4 }] }),
    account({ id: 2, metaAccounts: [{ spendHistorySyncedThrough: new Date("2026-09-11T00:00:00.000Z"), activeCampaignCount: 7 }] }),
  ], "2026-09-11");
  assert.equal(result.summary.activeCampaigns, 11);
});
