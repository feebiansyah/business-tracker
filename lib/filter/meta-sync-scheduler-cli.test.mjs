import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Meta scheduler CLI reuses the batch runner and always disconnects Prisma", async () => {
  const script = await readFile(new URL("../../scripts/run-meta-sync-scheduler.ts", import.meta.url), "utf8");
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.match(script, /runScheduledMetaSyncs/);
  assert.match(script, /runMetaSyncBatch/);
  assert.match(script, /finally[\s\S]*\$disconnect/);
  assert.doesNotMatch(script, /fetch\(|setInterval|setTimeout/);
  assert.equal(pkg.scripts["meta:sync:schedule"], "tsx --env-file-if-exists=.env --conditions=react-server scripts/run-meta-sync-scheduler.ts");
});
