import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Clickadu overview totals sum available metrics without changing strict daily rows", async () => {
  const source = await readFile(new URL("./clickadu-overview.ts", import.meta.url), "utf8");
  const view = await readFile(new URL("../../components/dashboard/shopee-clickadu-overview.tsx", import.meta.url), "utf8");

  assert.match(source, /summary_base AS \([\s\S]*SUM\(metric\.spendUsd\)[\s\S]*SUM\(metric\.commissionIdr\)/);
  assert.match(source, /\(SELECT spendUsd FROM summary_base\) AS spendUsd/);
  assert.match(source, /\(SELECT commissionIdr FROM summary_base\) AS commissionIdr/);
  assert.match(source, /CASE WHEN COUNT\(metric\.commissionIdr\) = \(SELECT COUNT\(\*\) FROM scoped_configs\)[\s\S]*ELSE NULL END AS commissionIdr/);
  assert.match(view, /Total memakai data yang tersedia/);
  assert.doesNotMatch(view, /Total terkait dan profit tidak ditampilkan sampai lengkap/);
});
