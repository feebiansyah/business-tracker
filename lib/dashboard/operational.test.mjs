import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationalDashboard, getJakartaDate, getJakartaPreviousDate } from "./operational.ts";

test("D-1 follows Asia/Jakarta instead of the server timezone", () => {
  assert.equal(getJakartaPreviousDate(new Date("2026-09-11T17:30:00.000Z")), "2026-09-11");
  assert.equal(getJakartaPreviousDate(new Date("2026-09-11T16:30:00.000Z")), "2026-09-10");
});

test("today follows the Asia/Jakarta date boundary deterministically", () => {
  assert.equal(getJakartaDate(new Date("2026-09-11T16:30:00.000Z")), "2026-09-11");
  assert.equal(getJakartaDate(new Date("2026-09-11T17:30:00.000Z")), "2026-09-12");
});

const account = (overrides = {}) => ({
  id: 1,
  name: "BARRA",
  metaAccounts: [
    { spendHistorySyncedThrough: new Date("2026-09-11T00:00:00.000Z"), activeCampaignCount: 2 },
    { spendHistorySyncedThrough: new Date("2026-09-12T00:00:00.000Z"), activeCampaignCount: 3 },
  ],
  pendingNoteCount: 0,
  commissionCovered: true,
  clickCovered: true,
  clickaduCampaignConfigs: [],
  adsterraCampaignConfigs: [],
  ...overrides,
});

test("Dedetstudio does not expose Traffic daily coverage on Dashboard", () => {
  const result = buildOperationalDashboard([account({ clickaduCampaignConfigs: [{ historySyncedThrough: new Date("2026-09-11T00:00:00Z") }, { historySyncedThrough: new Date("2026-09-12T00:00:00Z") }] }), account({ id: 2 })], "2026-09-11");
  assert.equal(result.accounts[0].clickadu, undefined);
  assert.equal(result.accounts[1].adsterra, undefined);
  assert.equal(result.summary.needsAttention, 0);
});

test("null and stale Traffic checkpoints no longer trigger attention on Dedetstudio", () => {
  for (const provider of ["clickaduCampaignConfigs", "adsterraCampaignConfigs"]) {
    const result = buildOperationalDashboard([account({ [provider]: [{ historySyncedThrough: null }, { historySyncedThrough: new Date("2026-09-10T00:00:00Z") }, { historySyncedThrough: new Date("2026-09-11T00:00:00Z") }] })], "2026-09-11");
    const status = result.accounts[0][provider === "clickaduCampaignConfigs" ? "clickadu" : "adsterra"];
    assert.equal(status, undefined);
    assert.equal(result.accounts[0].complete, true);
    assert.equal(result.accounts[0].needsAttention, false);
  }
});

test("pending notes and only ACTIVE empty WL add reminders", () => {
  const covered = new Date("2026-09-11T00:00:00Z");
  const result = buildOperationalDashboard([
    account({ pendingNoteCount: 2 }),
    account({ id: 2, metaAccounts: [{ status: "ACTIVE", spendHistorySyncedThrough: covered, activeCampaignCount: 0 }] }),
    account({ id: 3, metaAccounts: [{ status: "INACTIVE", spendHistorySyncedThrough: null, activeCampaignCount: 0 }] }),
  ], "2026-09-11");
  assert.deepEqual(result.accounts.map(a => a.emptyActiveWlCount), [0, 1, 0]);
  assert.deepEqual(result.accounts.map(a => a.needsAttention), [true, true, false]);
  assert.deepEqual(result.accounts.map(a => a.complete), [false, false, true]);
  assert.equal(result.summary.needsAttention, 2);
});

test("non-null replacement timestamps do not create daily replacement reminders", () => {
  const config = { historySyncedThrough: new Date("2026-09-11T00:00:00Z") };
  const stale = account({ clickaduCampaignConfigs: [{ ...config, lastBlacklistReplacedAt: new Date("2000-01-01T00:00:00Z") }], adsterraCampaignConfigs: [{ ...config, lastBlacklistReplacedAt: new Date("2000-01-01T00:00:00Z") }] });
  const recent = account({ clickaduCampaignConfigs: [{ ...config, lastBlacklistReplacedAt: new Date() }], adsterraCampaignConfigs: [{ ...config, lastBlacklistReplacedAt: new Date() }] });
  assert.deepEqual(buildOperationalDashboard([stale], "2026-09-11"), buildOperationalDashboard([recent], "2026-09-11"));
});

test("never-replaced configs count only null timestamps and flag each Shopee once", () => {
  const config = (lastBlacklistReplacedAt) => ({ historySyncedThrough: new Date("2026-09-11T00:00:00Z"), lastBlacklistReplacedAt });
  const replaced = config(new Date("2000-01-01T00:00:00Z"));
  const never = config(null);
  const result = buildOperationalDashboard([
    account(),
    account({ id: 2, clickaduCampaignConfigs: [replaced], adsterraCampaignConfigs: [replaced] }),
    account({ id: 3, clickaduCampaignConfigs: [never, replaced, never] }),
    account({ id: 4, adsterraCampaignConfigs: [never, replaced] }),
    account({ id: 5, clickaduCampaignConfigs: [never], adsterraCampaignConfigs: [never] }),
  ], "2026-09-11");
  assert.deepEqual(result.accounts.map(a => [a.clickaduNeverReplacedCount, a.adsterraNeverReplacedCount]), [[0,0],[0,0],[2,0],[0,1],[1,1]]);
  assert.deepEqual(result.accounts.map(a => a.complete), [true,true,false,false,false]);
  assert.deepEqual(result.accounts.map(a => a.needsAttention), [false,false,true,true,true]);
  assert.equal(result.summary.needsAttention, 3);
  for (const status of result.accounts) {
    assert.equal(status.meta.complete, true);
  }
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

test("inactive WL do not require Meta D-1 and do not inflate active campaign totals", () => {
  const result = buildOperationalDashboard([account({ metaAccounts: [{ status: "INACTIVE", spendHistorySyncedThrough: null, activeCampaignCount: 9 }, { status: "ACTIVE", spendHistorySyncedThrough: new Date("2026-09-11T00:00:00Z"), activeCampaignCount: 2 }] })], "2026-09-11");
  assert.deepEqual(result.accounts[0].meta, { complete: true, coveredWlCount: 1, totalWlCount: 1 });
  assert.equal(result.summary.activeCampaigns, 2);
});
