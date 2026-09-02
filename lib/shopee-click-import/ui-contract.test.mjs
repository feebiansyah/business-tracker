import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Import Shopee route exposes separate commission and click workflows", async () => {
  const page = await readFile(new URL("../../app/shopee/[id]/import/page.tsx", import.meta.url), "utf8");
  const clickUi = await readFile(new URL("../../components/shopee-import/click-import-workflow.tsx", import.meta.url), "utf8");
  assert.match(page, /ImportWorkflow/);
  assert.match(page, /ClickImportWorkflow/);
  assert.match(clickUi, /previewShopeeClickAction/);
  assert.match(clickUi, /importShopeeClickAction/);
  assert.doesNotMatch(clickUi, /persistClick/);
});
