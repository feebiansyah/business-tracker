import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("schema and additive migration store the Shopee Meta sync timestamp", async () => {
  const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model ShopeeAccount \{[\s\S]*lastMetaSyncAt\s+DateTime\?/);
  const migrations = await readFile(new URL("../../prisma/migrations/20260912120000_add_shopee_last_meta_sync_at/migration.sql", import.meta.url), "utf8");
  assert.match(migrations, /ALTER TABLE `ShopeeAccount` ADD COLUMN `lastMetaSyncAt` DATETIME\(3\) NULL/);
  assert.doesNotMatch(migrations, /DROP|TRUNCATE|DELETE/i);
});

test("Sync Meta records completion once without adding a Meta request and revalidates Overview", async () => {
  const [sync, action] = await Promise.all([
    readFile(new URL("./sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/shopee/[id]/filter/actions.ts", import.meta.url), "utf8"),
  ]);
  assert.equal((sync.match(/lastMetaSyncAt/g) ?? []).length, 1);
  assert.match(sync, /shopeeAccount\.update\([\s\S]*lastMetaSyncAt: new Date\(\)/);
  assert.match(action, /revalidatePath\(`\/shopee\/\$\{shopeeAccountId\}`\)/);
});
