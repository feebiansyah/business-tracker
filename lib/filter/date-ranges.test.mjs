import assert from "node:assert/strict";
import test from "node:test";
import { buildMonthlyChunks, getAccountSpendHistoryStart, getRequiredHistoryStart } from "./date-ranges.ts";

test("splits historical coverage on calendar-month boundaries", () => {
  assert.deepEqual(buildMonthlyChunks("2026-06-29", "2026-09-01"), [
    { since: "2026-06-29", until: "2026-06-30" },
    { since: "2026-07-01", until: "2026-07-31" },
    { since: "2026-08-01", until: "2026-08-31" },
    { since: "2026-09-01", until: "2026-09-01" },
  ]);
});

test("first sync begins at campaign start", () => {
  assert.equal(getRequiredHistoryStart({ startDate: "2026-06-29", historySyncedThrough: null, today: "2026-09-01" }), "2026-06-29");
});

test("multi-day catch-up overlaps the last synchronized checkpoint", () => {
  assert.equal(getRequiredHistoryStart({ startDate: "2026-09-01", historySyncedThrough: "2026-09-09", today: "2026-09-12" }), "2026-09-09");
});

test("daily routine overlaps yesterday", () => {
  assert.equal(getRequiredHistoryStart({ startDate: "2026-09-01", historySyncedThrough: "2026-09-11", today: "2026-09-12" }), "2026-09-11");
});

test("covered campaign refreshes D-1 through today", () => {
  assert.equal(getRequiredHistoryStart({ startDate: "2026-09-01", historySyncedThrough: "2026-09-12", today: "2026-09-12" }), "2026-09-11");
});

test("campaign without start or checkpoint cannot invent history", () => {
  assert.equal(getRequiredHistoryStart({ startDate: null, historySyncedThrough: null, today: "2026-09-01" }), null);
});

test("account spend first sync uses earliest campaign start or today", () => {
  assert.equal(getAccountSpendHistoryStart({ earliestStart: "2026-09-01", spendHistorySyncedThrough: null, today: "2026-09-12" }), "2026-09-01");
  assert.equal(getAccountSpendHistoryStart({ earliestStart: null, spendHistorySyncedThrough: null, today: "2026-09-12" }), "2026-09-12");
});

test("account spend catch-up overlaps a multi-day checkpoint", () => {
  assert.equal(getAccountSpendHistoryStart({ earliestStart: "2026-09-01", spendHistorySyncedThrough: "2026-09-09", today: "2026-09-12" }), "2026-09-09");
});

test("account spend routine refreshes D-1 through today", () => {
  assert.equal(getAccountSpendHistoryStart({ earliestStart: "2026-09-01", spendHistorySyncedThrough: "2026-09-11", today: "2026-09-12" }), "2026-09-11");
  assert.equal(getAccountSpendHistoryStart({ earliestStart: "2026-09-01", spendHistorySyncedThrough: "2026-09-12", today: "2026-09-12" }), "2026-09-11");
});

test("account spend start never falls after today", () => {
  assert.equal(getAccountSpendHistoryStart({ earliestStart: "2026-09-20", spendHistorySyncedThrough: null, today: "2026-09-12" }), "2026-09-12");
  assert.equal(getAccountSpendHistoryStart({ earliestStart: null, spendHistorySyncedThrough: "2026-09-20", today: "2026-09-12" }), "2026-09-11");
});
