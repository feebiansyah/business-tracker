import assert from "node:assert/strict";
import test from "node:test";
import Decimal from "decimal.js";
import { buildMatchDigest, sha256 } from "./fingerprint.ts";

function matched(campaignId, date, commission) {
  return {
    campaignId,
    date,
    tagLink2: `Campaign ${campaignId}`,
    normalizedTagLink2: `CAMPAIGN ${campaignId}`,
    commission: new Decimal(commission),
    rowCount: 1,
  };
}

function unmatched(date, tagLink2, commission, reason) {
  return {
    date,
    tagLink2,
    normalizedTagLink2: tagLink2.trim().toUpperCase(),
    commission: new Decimal(commission),
    rowCount: 1,
    reason,
  };
}

function digestInput(overrides = {}) {
  return {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-02",
    csvRowCount: 4,
    tagCount: 4,
    matched: [matched(11, "2026-09-01", "10"), matched(12, "2026-09-02", "20")],
    unmatched: [
      unmatched("2026-09-01", "MISSING", "30", "CAMPAIGN_NOT_FOUND"),
      unmatched("2026-09-02", "DUPLICATE", "40", "AMBIGUOUS_CAMPAIGN_NAME"),
    ],
    matchedCommission: new Decimal("30"),
    unmatchedCommission: new Decimal("70"),
    ...overrides,
  };
}

test("calculates the known deterministic SHA-256 for file bytes", () => {
  assert.equal(
    sha256(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("canonical match digest ignores matched and unmatched insertion order", () => {
  const original = digestInput();
  const reordered = digestInput({
    matched: [...original.matched].reverse(),
    unmatched: [...original.unmatched].reverse(),
  });

  assert.equal(buildMatchDigest(2, original), buildMatchDigest(2, reordered));
});

test("match digest changes with campaign, date, commission, reason, or account scope", () => {
  const original = digestInput();
  const digest = buildMatchDigest(2, original);
  const mutations = [
    digestInput({ matched: [matched(99, "2026-09-01", "10"), original.matched[1]] }),
    digestInput({ matched: [matched(11, "2026-09-03", "10"), original.matched[1]] }),
    digestInput({
      matched: [matched(11, "2026-09-01", "10.01"), original.matched[1]],
      matchedCommission: new Decimal("30.01"),
    }),
    digestInput({
      unmatched: [
        unmatched("2026-09-01", "MISSING", "30", "AMBIGUOUS_CAMPAIGN_NAME"),
        original.unmatched[1],
      ],
    }),
  ];

  for (const mutation of mutations) assert.notEqual(buildMatchDigest(2, mutation), digest);
  assert.notEqual(buildMatchDigest(3, original), digest);
});
