import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatBlacklistReplacementTime,
  markBlacklistReplaced,
  runVerifiedBlacklistReplacement,
} from "./replacement-timestamp.ts";

test("schema and additive migration add nullable replacement timestamps to both configs", async () => {
  const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  const migration = await readFile(new URL("../../prisma/migrations/20260918090000_add_blacklist_replacement_timestamps/migration.sql", import.meta.url), "utf8");
  assert.match(schema, /model ClickaduCampaignConfig \{[\s\S]*lastBlacklistReplacedAt\s+DateTime\?/);
  assert.match(schema, /model AdsterraCampaignConfig \{[\s\S]*lastBlacklistReplacedAt\s+DateTime\?/);
  assert.match(migration, /ALTER TABLE `ClickaduCampaignConfig` ADD COLUMN `lastBlacklistReplacedAt` DATETIME\(3\) NULL/);
  assert.match(migration, /ALTER TABLE `AdsterraCampaignConfig` ADD COLUMN `lastBlacklistReplacedAt` DATETIME\(3\) NULL/);
  assert.doesNotMatch(migration, /DROP|DELETE|TRUNCATE/i);
});

test("null timestamp formats as Belum pernah and a value uses Jakarta time", () => {
  assert.equal(formatBlacklistReplacementTime(null), "Belum pernah");
  assert.equal(formatBlacklistReplacementTime("2026-09-18T02:42:00.000Z"), "18 Sep 2026, 09:42 WIB");
});

test("successful verified replacement records the server timestamp", async () => {
  const recorded = [];
  const result = await runVerifiedBlacklistReplacement(
    async () => ({ status: "UPDATED", count: 3 }),
    async (at) => recorded.push(at),
    () => new Date("2026-09-18T02:42:00.000Z"),
  );
  assert.equal(result.lastBlacklistReplacedAt, "2026-09-18T02:42:00.000Z");
  assert.deepEqual(recorded.map((date) => date.toISOString()), ["2026-09-18T02:42:00.000Z"]);
});

test("NO_CHANGE does not update the timestamp", async () => {
  let records = 0;
  const result = await runVerifiedBlacklistReplacement(
    async () => ({ status: "NO_CHANGE", count: 3 }),
    async () => { records += 1; },
  );
  assert.equal(records, 0);
  assert.equal(result.lastBlacklistReplacedAt, null);
});

test("failed write or failed verification never updates the timestamp", async () => {
  for (const message of ["write failed", "verification failed"]) {
    let records = 0;
    await assert.rejects(
      runVerifiedBlacklistReplacement(async () => { throw new Error(message); }, async () => { records += 1; }),
      new RegExp(message),
    );
    assert.equal(records, 0);
  }
});

test("an ambiguous write verified exact is recorded as UPDATED", async () => {
  let records = 0;
  const result = await runVerifiedBlacklistReplacement(
    async () => ({ status: "UPDATED", verifiedAfterAmbiguousWrite: true }),
    async () => { records += 1; },
  );
  assert.equal(result.status, "UPDATED");
  assert.equal(records, 1);
});

test("Clickadu and Adsterra timestamps update only their scoped campaign config", async () => {
  const calls = [];
  const db = {
    clickaduCampaignConfig: { updateMany: async (args) => { calls.push(["CLICKADU", args]); return { count: 1 }; } },
    adsterraCampaignConfig: { updateMany: async (args) => { calls.push(["ADSTERRA", args]); return { count: 1 }; } },
  };
  const at = new Date("2026-09-18T02:42:00.000Z");
  await markBlacklistReplaced(db, "CLICKADU", 7, 11, at);
  await markBlacklistReplaced(db, "ADSTERRA", 8, 12, at);
  assert.deepEqual(calls, [
    ["CLICKADU", { where: { id: 11, shopeeAccountId: 7 }, data: { lastBlacklistReplacedAt: at } }],
    ["ADSTERRA", { where: { id: 12, shopeeAccountId: 8 }, data: { lastBlacklistReplacedAt: at } }],
  ]);
});

test("editing campaign config does not write the replacement timestamp", async () => {
  const clickadu = await readFile(new URL("../clickadu-roi/config-repository.ts", import.meta.url), "utf8");
  const adsterra = await readFile(new URL("../adsterra-roi/config-repository.ts", import.meta.url), "utf8");
  const clickaduEdit = clickadu.match(/updateMany\([\s\S]*?\n\s*}\);/)?.[0] ?? "";
  const adsterraEdit = adsterra.match(/updateMany\([\s\S]*?\);/)?.[0] ?? "";
  assert.doesNotMatch(clickaduEdit, /lastBlacklistReplacedAt/);
  assert.doesNotMatch(adsterraEdit, /lastBlacklistReplacedAt/);
});
