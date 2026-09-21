import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actions = await readFile(new URL("../../app/shopee/[id]/adsterra-roi/actions.ts", import.meta.url), "utf8");

test("campaign activity actions authenticate, scope config ownership, and keep campaign ID server-authoritative", () => {
  assert.match(actions, /export async function getAdsterraCampaignStatusesAction/);
  assert.match(actions, /export async function setAdsterraCampaignActiveAction/);
  assert.match(actions, /setAdsterraCampaignActiveAction[\s\S]*?await requireUser\(\)/);
  assert.match(actions, /getAdsterraConfigById\(prisma,\s*shopeeAccountId,\s*configId\)/);
  assert.match(actions, /setAndVerifyAdsterraCampaignActive\(config\.campaignId,\s*desiredActive/);
  assert.doesNotMatch(actions, /setAdsterraCampaignActiveAction\([^)]*campaignId/);
});

test("campaign activity actions obtain and decrypt only the scoped ADSTERRA credential", () => {
  assert.match(actions, /getEncryptedTrafficCredential\(prisma,\s*shopeeAccountId,\s*TrafficProvider\.ADSTERRA\)/);
  assert.match(actions, /decryptTrafficSecret\(credential\.encryptedSecret\)/);
  assert.doesNotMatch(actions, /apiKey\s*:/);
});
