import assert from "node:assert/strict";
import test from "node:test";
import { assertClickOnlyUpdateColumns, buildClickUpsertQuery, upsertClickChunks } from "./persistence.ts";

const matched = { campaignId: 10, date: "2026-09-01", tagLink2: "A", normalizedTagLink2: "A", clickCount: 7 };

test("click upsert owns only shopeeClicks and updatedAt", () => {
  assert.doesNotThrow(() => assertClickOnlyUpdateColumns(["shopeeClicks", "updatedAt"]));
  for (const field of ["commission", "spend", "clickFp", "cpcFp", "note", "completed"]) {
    assert.throws(() => assertClickOnlyUpdateColumns(["shopeeClicks", "updatedAt", field]), /click-only/);
  }
  const query = buildClickUpsertQuery([matched]);
  const duplicate = query.sql.split("ON DUPLICATE KEY UPDATE")[1];
  assert.match(duplicate, /`shopeeClicks` = VALUES\(`shopeeClicks`\)/);
  assert.match(duplicate, /`updatedAt` = NOW\(\)/);
  assert.equal(duplicate.includes("commission"), false);
});

test("click upsert rejects duplicate keys instead of adding clicks", async () => {
  let calls = 0;
  await assert.rejects(upsertClickChunks({ $executeRaw: async () => { calls += 1; } }, [matched, matched]), /duplicate/i);
  assert.equal(calls, 0);
});
