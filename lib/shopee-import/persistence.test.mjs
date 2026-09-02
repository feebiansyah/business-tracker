import assert from "node:assert/strict";
import test from "node:test";
import Decimal from "decimal.js";
import {
  buildMetricUpsertQuery,
  chunkValues,
  metricDuplicateUpdateColumns,
  upsertCommissionChunks,
} from "./persistence.ts";

function matched(campaignId, date, commission) {
  return {
    campaignId,
    date,
    tagLink2: `CAMPAIGN-${campaignId}`,
    normalizedTagLink2: `CAMPAIGN-${campaignId}`,
    commission: new Decimal(commission),
    rowCount: 1,
  };
}

test("chunks metric persistence at a maximum of 500 rows", () => {
  assert.deepEqual(
    chunkValues(Array.from({ length: 1001 }), 500).map((chunk) => chunk.length),
    [500, 500, 1],
  );
});

test("duplicate metric updates are restricted to commission and updatedAt", () => {
  assert.deepEqual(metricDuplicateUpdateColumns, ["commission", "updatedAt"]);
  for (const forbidden of ["spend", "clickFp", "cpcFp", "shopeeClicks", "note", "completed"]) {
    assert.equal(metricDuplicateUpdateColumns.includes(forbidden), false);
  }
});

test("parameterized duplicate SQL updates only commission and updatedAt", () => {
  const query = buildMetricUpsertQuery([matched(11, "2026-09-01", "22985.94997")]);
  const sql = query.sql.replace(/\s+/g, " ").trim();
  const duplicateClause = sql.split("ON DUPLICATE KEY UPDATE")[1];

  assert.ok(duplicateClause);
  assert.match(duplicateClause, /`commission` = VALUES\(`commission`\)/);
  assert.match(duplicateClause, /`updatedAt` = NOW\(\)/);
  for (const forbidden of ["spend", "clickFp", "cpcFp", "shopeeClicks", "note", "completed"]) {
    assert.equal(duplicateClause.includes(`\`${forbidden}\``), false);
  }
  assert.equal(sql.includes("22985.94997"), false);
  assert.equal(query.values.includes("22985.94997"), true);
});

test("rejects duplicate internal keys before executing SQL", async () => {
  let executions = 0;
  const tx = { async $executeRaw() { executions += 1; } };
  const row = matched(11, "2026-09-01", "100.00000");

  await assert.rejects(upsertCommissionChunks(tx, [row, { ...row, commission: new Decimal("150.12345") }]), /duplicate campaign and date/i);
  assert.equal(executions, 0);
});

test("rejects unmatched input before executing SQL", async () => {
  let executions = 0;
  const tx = { async $executeRaw() { executions += 1; } };
  const unmatched = {
    date: "2026-09-01",
    tagLink2: "MISSING",
    normalizedTagLink2: "MISSING",
    commission: new Decimal("10.00000"),
    rowCount: 1,
    reason: "CAMPAIGN_NOT_FOUND",
  };

  await assert.rejects(upsertCommissionChunks(tx, [unmatched]), /matched commission/i);
  assert.equal(executions, 0);
});
