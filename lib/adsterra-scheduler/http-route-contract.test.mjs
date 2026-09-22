import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../../app/api/internal/adsterra-scheduler/route.ts", import.meta.url);

test("internal POST route wires only the cron secret and existing runner", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /export async function POST/);
  assert.match(source, /ADSTERRA_SCHEDULER_CRON_SECRET/);
  assert.match(source, /runAdsterraScheduledCampaigns/);
  assert.match(source, /handleAdsterraSchedulerRequest/);
  assert.doesNotMatch(source, /fetch\(|PATCH|setInterval|setTimeout/);
});
