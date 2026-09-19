import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync(new URL("../../app/shopee/[id]/clickadu-roi/actions.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/shopee/[id]/clickadu-roi/page.tsx", import.meta.url), "utf8");

test("Clickadu configuration actions authenticate and remain account scoped", () => {
  assert.match(actions, /"use server"/);
  assert.equal(actions.match(/await requireUser\(\)/g)?.length, 9);
  assert.match(actions, /syncClickaduDailyAction/);
  assert.match(actions, /getClickaduDailyHistoryAction/);
  assert.match(actions, /saveClickaduConfig\(prisma,\s*shopeeAccountId/);
  assert.match(actions, /deleteClickaduConfig\(prisma,\s*shopeeAccountId/);
  const configActions = actions.slice(actions.indexOf("export async function listClickaduConfigsAction"));
  assert.doesNotMatch(configActions, /ClickaduClient|fetch\(|method:\s*["'](?:PUT|PATCH|DELETE)["']|blacklist/i);
});

test("Clickadu route validates and scopes the Shopee account", () => {
  assert.match(page, /getClickaduConfigPageData\(prisma,\s*shopeeAccountId\)/);
  assert.match(page, /if \(!data\) notFound\(\)/);
  assert.doesNotMatch(page, /ClickaduClient|fetch\(|upload|blacklist/i);
});
