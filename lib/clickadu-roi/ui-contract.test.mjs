import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Clickadu page exposes configuration, read-only analysis, and copy-only candidates", async () => {
  const files = await Promise.all([
    "../../app/shopee/[id]/clickadu-roi/page.tsx",
    "../../components/clickadu-roi/config-form.tsx",
    "../../components/clickadu-roi/analysis-workflow.tsx",
    "../../components/clickadu-roi/analysis-summary.tsx",
    "../../components/clickadu-roi/zone-table.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const source = files.join("\n");
  for (const label of ["Campaign ID", "Source Tag", "Date From", "Date Till", "Biaya Iklan", "Komisi Bersih Shopee", "Kandidat Blacklist", "Zone", "Impressions", "Spend USD", "Cost IDR"]) assert.match(source, new RegExp(label));
  assert.doesNotMatch(source, /CLICKADU_API_TOKEN|blacklistZone|writeFile|localStorage/);
});
