import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setAdsterraAutoScheduleEnabled } from "../adsterra-roi/config-repository.ts";

test("auto schedule toggle scopes the config to its Shopee account and changes only the flag", async () => {
  let call;
  const db = { adsterraCampaignConfig: { updateMany: async (args) => { call = args; return { count: 1 }; } } };
  const result = await setAdsterraAutoScheduleEnabled(db, 7, 13, true);
  assert.deepEqual(call, { where: { id: 13, shopeeAccountId: 7 }, data: { autoScheduleEnabled: true } });
  assert.deepEqual(result, { autoScheduleEnabled: true });
});

test("auto schedule toggle rejects another account's config", async () => {
  const db = { adsterraCampaignConfig: { updateMany: async () => ({ count: 0 }) } };
  await assert.rejects(setAdsterraAutoScheduleEnabled(db, 7, 13, false), /Konfigurasi Adsterra tidak ditemukan/);
});

test("auto schedule action authenticates and never calls Adsterra provider activity code", async () => {
  const actions = await readFile(new URL("../../app/shopee/[id]/adsterra-roi/actions.ts", import.meta.url), "utf8");
  const match = actions.match(/export async function setAdsterraAutoScheduleEnabledAction[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(match, /await requireUser\(\)/);
  assert.match(match, /setAdsterraAutoScheduleEnabled\(prisma,\s*shopeeAccountId,\s*configId,\s*enabled\)/);
  assert.doesNotMatch(match, /campaignId|getAdsterraClient|scopedAdsterraClient|setAndVerifyAdsterraCampaignActive|\.getCampaignStatus|\.setCampaignActive/);
});

test("campaign UI keeps automation separate from the existing manual Power action", async () => {
  const source = await readFile(new URL("../../components/adsterra-roi/campaign-report-list.tsx", import.meta.url), "utf8");
  assert.match(source, /Auto ON\/OFF/);
  assert.match(source, /setAdsterraAutoScheduleEnabledAction\(shopeeAccountId, campaign\.id, enabled\)/);
  assert.match(source, /checked=\{autoScheduleByConfig\[campaign\.id\] \?\? campaign\.autoScheduleEnabled\}/);
  assert.match(source, /setPendingToggle\(\{ campaign, desiredActive: status === "INACTIVE" \}\)/);
});
