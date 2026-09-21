import assert from "node:assert/strict";
import test from "node:test";
import { getAdsterraSyncStart, indonesiaToday, listDatesInclusive, sumPlacementSpend, syncAdsterraDailyMetrics } from "./daily-sync.ts";

test("Adsterra sync uses Jakarta today and bounded checkpoint catch-up", () => {
  assert.equal(indonesiaToday(new Date("2026-09-20T17:30:00Z")), "2026-09-21");
  assert.equal(getAdsterraSyncStart({ checkpoint: null, latestMetricDate: null, today: "2026-09-21" }), "2026-09-21");
  assert.equal(getAdsterraSyncStart({ checkpoint: null, latestMetricDate: "2026-09-18", today: "2026-09-21" }), "2026-09-18");
  assert.equal(getAdsterraSyncStart({ checkpoint: "2026-09-21", latestMetricDate: null, today: "2026-09-21" }), "2026-09-20");
  assert.equal(getAdsterraSyncStart({ checkpoint: "2026-09-18", latestMetricDate: null, today: "2026-09-21" }), "2026-09-18");
  assert.deepEqual(listDatesInclusive("2026-09-18", "2026-09-21"), ["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"]);
});

test("placement spend is Decimal-safe and empty statistics remain unknown", () => {
  assert.equal(sumPlacementSpend([{ spent: "0.1" }, { spent: "0.2" }]), "0.3");
  assert.equal(sumPlacementSpend([]), null);
});

test("sync requests exactly one day, persists before coverage advances, and stops on failure", async () => {
  const calls = [];
  await assert.rejects(syncAdsterraDailyMetrics({ shopeeAccountId: 7, today: "2026-09-21" }, {
    loadConfigs: async () => [{ id: 3, campaignId: "99", historySyncedThrough: "2026-09-19", latestMetricDate: null }],
    getStatistics: async (input) => { calls.push(["api", input]); if (input.dateFrom === "2026-09-20") throw new Error("API failed"); return [{ spent: "1.25" }, { spent: "2.75" }]; },
    persistDay: async (input) => calls.push(["persist", input]),
  }), /API failed/);
  assert.deepEqual(calls, [
    ["api", { campaignId: "99", dateFrom: "2026-09-19", dateTill: "2026-09-19" }],
    ["persist", { adsterraCampaignConfigId: 3, date: "2026-09-19", spendUsd: "4" }],
    ["api", { campaignId: "99", dateFrom: "2026-09-20", dateTill: "2026-09-20" }],
  ]);
});

test("empty statistics still persist coverage and successful catch-up is idempotent", async () => {
  const persisted = [];
  const result = await syncAdsterraDailyMetrics({ shopeeAccountId: 1, today: "2026-09-21" }, {
    loadConfigs: async () => [{ id: 2, campaignId: "88", historySyncedThrough: "2026-09-20", latestMetricDate: "2026-09-20" }],
    getStatistics: async () => [],
    persistDay: async (input) => persisted.push(input),
  });
  assert.deepEqual(persisted.map((x) => x.date), ["2026-09-20", "2026-09-21"]);
  assert.ok(persisted.every((x) => x.spendUsd === null));
  assert.deepEqual(result, { configCount: 1, dateCount: 2, from: "2026-09-20", through: "2026-09-21" });
});
