import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/adsterra-scheduler.yml", import.meta.url);

test("GitHub workflow has explicit UTC schedules and manual ON/OFF choice", async () => {
  const source = await readFile(workflowUrl, "utf8");
  assert.match(source, /cron:\s*["']5 1 \* \* \*["']/);
  assert.match(source, /cron:\s*["']50 14 \* \* \*["']/);
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /options:\s*\r?\n\s*- ["']ON["']\s*\r?\n\s*- ["']OFF["']/);
  assert.match(source, /github\.event\.schedule == '5 1 \* \* \*'/);
  assert.match(source, /github\.event\.schedule == '50 14 \* \* \*'/);
});

test("each workflow job sends exactly one authenticated request without retry", async () => {
  const source = await readFile(workflowUrl, "utf8");
  assert.equal((source.match(/curl --fail-with-body/g) ?? []).length, 2);
  assert.equal((source.match(/BUSINESS_TRACKER_SCHEDULER_URL/g) ?? []).length, 2);
  assert.match(source, /ADSTERRA_SCHEDULER_CRON_SECRET/);
  assert.doesNotMatch(source, /retry|for\s+.*in|while\s+/i);
  assert.doesNotMatch(source, /api3\.adsterratools|PATCH/);
});
