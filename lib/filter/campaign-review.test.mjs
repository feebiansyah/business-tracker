import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadTs } from "./sync-baseline.test.mjs";

function fixture() {
  const records = new Map(), reads = [], writes = [];
  let fail = false, duplicate = false;
  const key = value => `${value.userId}:${value.campaignId}:${value.businessDate.toISOString().slice(0, 10)}`;
  const db = { campaignDailyReview: {
    upsert: async args => {
      writes.push(args);
      if (fail) throw new Error("private database details");
      const value = args.where.userId_campaignId_businessDate, id = key(value);
      if (!records.has(id)) records.set(id, args.create);
      if (duplicate) throw Object.assign(new Error("duplicate"), { code: "P2002" });
      return records.get(id);
    },
    findUnique: async args => records.get(key(args.where.userId_campaignId_businessDate)) ?? null,
    findMany: async args => {
      reads.push(args);
      return [...records.values()].filter(r => r.userId === args.where.userId && r.businessDate.getTime() === args.where.businessDate.getTime() && args.where.campaignId.in.includes(r.campaignId));
    },
  } };
  const api = loadTs("lib/filter/campaign-review.ts", { "@/lib/prisma": { prisma: db } });
  return { api, records, reads, writes, fail: () => { fail = true; }, duplicate: () => { duplicate = true; } };
}
const reviewer = { id: 1, role: "REVIEWER" };
const now = new Date("2026-11-19T03:00:00Z");

test("OPERATOR and legacy/default actors never write or read review state", async () => {
  const h = fixture();
  for (const user of [{ id: 2, role: "OPERATOR" }, { id: 2 }]) {
    assert.equal((await h.api.recordCampaignReview(user, 41, now)).status, "NOT_APPLICABLE");
    assert.equal(await h.api.readCampaignReviewsForToday(user, [41], now), null);
  }
  assert.equal(h.writes.length, 0);
  assert.equal(h.reads.length, 0);
});

test("review writes are idempotent under concurrent tabs and duplicate-key races", async () => {
  const h = fixture();
  const results = await Promise.all(Array.from({ length: 8 }, () => h.api.recordCampaignReview(reviewer, 41, now)));
  assert(results.every(r => r.status === "RECORDED"));
  assert.equal(h.records.size, 1);
  assert.equal(results[0].mark.businessDate, "2026-11-19");
  const stamp = h.records.values().next().value.reviewedAt;
  await h.api.recordCampaignReview(reviewer, 41, new Date("2026-11-19T04:00:00Z"));
  assert.equal(h.records.values().next().value.reviewedAt, stamp);
  h.duplicate();
  assert.equal((await h.api.recordCampaignReview(reviewer, 41, now)).status, "RECORDED");
  h.fail();
  const failed = await h.api.recordCampaignReview(reviewer, 42, now);
  assert.equal(failed.status, "FAILED");
  assert(!JSON.stringify(failed).includes("private database details"));
  assert.equal(h.records.size, 1);
});

test("bulk reads isolate user/campaign/day and WIB midnight creates a new daily key", async () => {
  const h = fixture();
  await h.api.recordCampaignReview(reviewer, 41, new Date("2026-11-19T16:59:59.999Z"));
  await h.api.recordCampaignReview({ id: 2, role: "REVIEWER" }, 42, now);
  await h.api.recordCampaignReview(reviewer, 999, now);
  const ids = Array.from({ length: 100 }, (_, i) => 41 + i);
  const before = await h.api.readCampaignReviewsForToday(reviewer, ids, now);
  assert.deepEqual(before.campaignIds, [41]);
  assert.equal(h.reads.length, 1);
  assert.deepEqual(h.reads[0].where.campaignId.in, ids);
  const tomorrow = new Date("2026-11-19T17:00:00.000Z");
  assert.deepEqual((await h.api.readCampaignReviewsForToday(reviewer, ids, tomorrow)).campaignIds, []);
  await h.api.recordCampaignReview(reviewer, 41, tomorrow);
  assert.equal(h.records.size, 4);
  assert.deepEqual((await h.api.readCampaignReviewsForToday(reviewer, ids, tomorrow)).campaignIds, [41]);
});

test("detail action records only after successful scoped history, never from a client role", async () => {
  let actor = reviewer, valid = true, fail = false;
  const events = [];
  const { getFilterCampaignDetailAction } = loadTs("app/shopee/[id]/filter/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/filter/sync": {},
    "@/lib/filter/meta-sync-batch": {},
    "@/lib/prisma": { prisma: {} },
    "@/lib/auth/session": { requireUser: async () => actor },
    "@/lib/filter/queries": { getCampaignWorkspaceDetail: async (...args) => { events.push(["scope", ...args]); return valid ? { campaign: { id: 41 } } : null; } },
    "@/lib/filter/campaign-review": { recordCampaignReview: async (user, id) => {
      events.push(["record", user.id, id]);
      return fail ? { status: "FAILED", message: "Review belum tercatat." } : { status: "RECORDED", mark: { userId: user.id, campaignId: id, businessDate: "2026-11-19" } };
    } },
  });
  const params = { sort: "date", dir: "asc", page: 1, pageSize: 25 };
  valid = false;
  assert.equal((await getFilterCampaignDetailAction(7, "filter", 41, params)).success, false);
  assert.equal(events.filter(e => e[0] === "record").length, 0);
  valid = true; actor = { id: 2, role: "OPERATOR" };
  assert.equal((await getFilterCampaignDetailAction(7, "filter", 41, params)).success, true);
  assert.equal(events.filter(e => e[0] === "record").length, 0);
  actor = reviewer;
  const result = await getFilterCampaignDetailAction(7, "filter", 41, params);
  assert.equal(result.review.status, "RECORDED");
  assert.deepEqual(events.slice(-1)[0], ["record", 1, 41]);
  fail = true;
  const failed = await getFilterCampaignDetailAction(7, "filter", 41, params);
  assert.equal(failed.success, true);
  assert.equal(failed.review.status, "FAILED");
});

test("migration is additive with default OPERATOR and exact daily review keys", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const sql = readFileSync("prisma/migrations/20261119000000_add_campaign_daily_review/migration.sql", "utf8");
  assert.match(schema, /role\s+UserRole\s+@default\(OPERATOR\)/);
  assert.match(sql, /ADD COLUMN `role` ENUM\('OPERATOR', 'REVIEWER'\) NOT NULL DEFAULT 'OPERATOR'/);
  assert.match(sql, /PRIMARY KEY \(`userId`, `campaignId`, `businessDate`\)/);
  assert.match(sql, /INDEX .*\(`campaignId`, `businessDate`\)/);
  assert.match(sql, /`businessDate` DATE NOT NULL/);
  assert.doesNotMatch(sql, /DROP|TRUNCATE|DELETE FROM|UPDATE `/i);
});
