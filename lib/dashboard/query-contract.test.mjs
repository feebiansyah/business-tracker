import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard query scopes campaigns by Shopee and paginates aggregated dates in SQL", async () => {
  const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
  assert.match(source, /MetaAccountDailySpend/);
  assert.match(source, /ma\.shopeeAccountId/);
  assert.match(source, /LIMIT/);
  assert.match(source, /OFFSET/);
  assert.doesNotMatch(source, /effectiveDailyBudget/);
  assert.doesNotMatch(source, /CampaignDailyBudgetSnapshot/);
});

test("dashboard summary query is separate from page limit", async () => {
  const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
  assert.match(source, /summaryRows/);
  assert.match(source, /pageRows/);
});
