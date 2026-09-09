import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { metaFieldsFromInsight } from "./metrics.ts";

test("campaign insight maps Ads Manager link-click result semantics", () => {
  const fields = metaFieldsFromInsight({
    campaign_id: "meta-1",
    spend: "53669",
    clicks: "2651",
    inline_link_clicks: "1222",
    outbound_clicks: "1220",
    cpc: "20.244813",
    cost_per_inline_link_click: "43.918985",
    date_start: "2026-09-05",
    date_stop: "2026-09-05",
  });
  assert.deepEqual(fields, { spend: "53669", clickFp: 1222, cpcFp: "43.918985" });
});

test("schema preserves six-decimal CPC and persists semantic migration version", async () => {
  const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /metaMetricSemanticVersion\s+Int\s+@default\(1\)/);
  assert.match(schema, /cpcFp\s+Decimal\?\s+@db\.Decimal\(20, 6\)/);
});
