import assert from "node:assert/strict";
import test from "node:test";
import { buildMonthlyChunks, getRequiredHistoryStart } from "./date-ranges.ts";

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

test("partial bootstrap resumes after persistent checkpoint", () => {
  assert.equal(getRequiredHistoryStart({ startDate: "2026-06-29", historySyncedThrough: "2026-07-31", today: "2026-09-01" }), "2026-08-01");
});

test("covered campaign refreshes D-1 through today", () => {
  assert.equal(getRequiredHistoryStart({ startDate: "2026-06-29", historySyncedThrough: "2026-09-01", today: "2026-09-01" }), "2026-08-31");
});

test("campaign without start or checkpoint cannot invent history", () => {
  assert.equal(getRequiredHistoryStart({ startDate: null, historySyncedThrough: null, today: "2026-09-01" }), null);
});
