import assert from "node:assert/strict";
import test from "node:test";
import { buildShopeeClickPreview } from "./preview.ts";
import { importShopeeClicks } from "./importer.ts";

const bytes = new TextEncoder().encode("Klik ID,Waktu Klik,Wilayah Klik,Tag_link,Perujuk\n1,2026-09-01 10:00:00,ID,META-CAMPAIGNA---,x");
const campaigns = [{ id: 10, name: "CAMPAIGNA" }];
const preview = () => buildShopeeClickPreview({ shopeeAccountId: 2, originalFilename: "click.csv", bytes }, { accountExists: async () => true, loadCampaigns: async () => campaigns });

test("final click import reparses, locks, rematches, then persists", async () => {
  const events = [];
  const result = await importShopeeClicks({ shopeeAccountId: 2, originalFilename: "click.csv", bytes, confirmation: (await preview()).confirmation }, {
    withTransaction: async (work) => { events.push("tx"); return work({}); },
    lockAccount: async () => events.push("lock"),
    loadCampaigns: async () => { events.push("load"); return campaigns; },
    persist: async (_tx, input) => { events.push("persist"); return { importId: 1, matchedCount: input.matched.length, unmatchedCount: input.unmatched.length, matchedClicks: input.matchedClicks, unmatchedClicks: input.unmatchedClicks, createdAt: "2026-09-01T00:00:00.000Z" }; },
  });
  assert.deepEqual(events, ["tx", "lock", "load", "persist"]);
  assert.equal(result.matchedClicks, 1);
});

test("changed file and stale match never persist", async () => {
  const confirmation = (await preview()).confirmation;
  let persisted = false;
  const deps = { withTransaction: async (work) => work({}), lockAccount: async () => {}, loadCampaigns: async () => [], persist: async () => { persisted = true; } };
  await assert.rejects(importShopeeClicks({ shopeeAccountId: 2, originalFilename: "click.csv", bytes: new TextEncoder().encode("changed"), confirmation }, deps), /File berubah/);
  await assert.rejects(importShopeeClicks({ shopeeAccountId: 2, originalFilename: "click.csv", bytes, confirmation }, deps), /Preview/);
  assert.equal(persisted, false);
});
