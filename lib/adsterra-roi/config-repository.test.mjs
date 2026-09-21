import assert from "node:assert/strict";
import test from "node:test";
import { saveAdsterraConfig } from "./config-repository.ts";

function db({ duplicate = null } = {}) { return { shopeeAccount: { findUnique: async () => ({ id: 1 }) }, adsterraCampaignConfig: { findFirst: async (args) => args.where.sourceTag ? duplicate : ({ id: 3, campaignId: "9", label: null, sourceTag: "TERRA", shopeeAccountId: 1, lastBlacklistReplacedAt: null }), create: async ({ data }) => ({ id: 3, ...data, lastBlacklistReplacedAt: null }), updateMany: async () => ({ count: 1 }), findFirstOrThrow: async () => ({ id: 3, campaignId: "9", label: null, sourceTag: "TERRA", shopeeAccountId: 1, lastBlacklistReplacedAt: null }) } }; }
test("Adsterra config rejects a normalized source tag used by another campaign", async () => { await assert.rejects(saveAdsterraConfig(db({ duplicate: { id: 2 } }), 1, { campaignId: "9", label: "", sourceTag: " terra " }), /Source Tag Adsterra sudah digunakan/); });
test("same source tag is allowed when editing the owning config", async () => { let where; const fake = db(); fake.adsterraCampaignConfig.findFirst = async (args) => { where = args.where; return null; }; await saveAdsterraConfig(fake, 1, { id: 3, campaignId: "9", label: "", sourceTag: " terra " }); assert.deepEqual(where, { shopeeAccountId: 1, sourceTag: "TERRA", id: { not: 3 } }); });
