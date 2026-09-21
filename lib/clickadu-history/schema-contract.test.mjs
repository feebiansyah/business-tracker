import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

test("Clickadu daily metrics use isolated config-scoped storage", () => {
  assert.match(schema, /dailyMetrics\s+ClickaduCampaignDailyMetric\[\]/);
  const model = schema.match(/model ClickaduCampaignDailyMetric \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(model, /date\s+DateTime\s+@db\.Date/);
  assert.match(model, /spendUsd\s+Decimal\?\s+@db\.Decimal\(20, 6\)/);
  assert.match(model, /dailyBudget\s+Decimal\?\s+@db\.Decimal\(20, 6\)/);
  assert.match(model, /commissionIdr\s+Decimal\?\s+@db\.Decimal\(21, 5\)/);
  assert.match(model, /clickaduCampaignConfigId\s+Int/);
  assert.match(model, /@@unique\(\[clickaduCampaignConfigId, date\]\)/);
  assert.match(model, /@@index\(\[date\]\)/);
  assert.doesNotMatch(model, /\bcampaignId\b|\bmetaAccountId\b|\bcampaign\s+Campaign\b|\bmetaAccount\s+MetaAccount\b/);
  const config = schema.match(/model ClickaduCampaignConfig \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(config, /historySyncedThrough\s+DateTime\?\s+@db\.Date/);
});
