import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL("../../scripts/run-adsterra-scheduler.ts", import.meta.url);
const packageUrl = new URL("../../package.json", import.meta.url);

test("production entry point is one-shot and delegates explicit action to the existing runner", async () => {
  const source = await readFile(scriptUrl, "utf8");
  assert.match(source, /runAdsterraScheduledCampaigns/);
  assert.match(source, /runAdsterraSchedulerCli/);
  assert.match(source, /prisma\.\$disconnect/);
  assert.doesNotMatch(source, /setInterval|setTimeout|fetch\(|PATCH|cron|railway/i);
});

test("package commands map explicitly to ON and OFF through tsx", async () => {
  const pkg = JSON.parse(await readFile(packageUrl, "utf8"));
  assert.equal(pkg.scripts["adsterra:schedule:on"], "tsx --conditions=react-server scripts/run-adsterra-scheduler.ts ON");
  assert.equal(pkg.scripts["adsterra:schedule:off"], "tsx --conditions=react-server scripts/run-adsterra-scheduler.ts OFF");
  assert.match(pkg.engines.node, /20|22/);
  assert.ok(pkg.dependencies.tsx);
  assert.ok(pkg.dependencies["server-only"]);
});
