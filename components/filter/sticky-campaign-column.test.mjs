import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared workspace table freezes only the Campaign column", async () => {
  const [table, header] = await Promise.all([
    readFile(new URL("./filter-table.tsx", import.meta.url), "utf8"),
    readFile(new URL("./sortable-header.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(table, /column\.key === "name"/);
  assert.match(table, /sticky left-0/);
  assert.match(header, /className/);
  assert.doesNotMatch(table, /campaign\.wlName[\s\S]{0,100}sticky left-0/);
});

test("WL column keeps a readable width without hiding the full name", async () => {
  const table = await readFile(new URL("./filter-table.tsx", import.meta.url), "utf8");
  assert.match(table, /column\.key === "wlName"[^\n]+min-w-44/);
  assert.match(table, /min-w-44[^\n]+whitespace-normal[^\n]+campaign\.wlName/);
  assert.doesNotMatch(table, /campaign\.wlName[^\n]+truncate/);
});

test("all four routes continue to use the shared campaign workspace", async () => {
  for (const mode of ["filter", "fix", "off-filter", "off-fix"]) {
    const source = await readFile(new URL(`../../app/shopee/[id]/${mode}/page.tsx`, import.meta.url), "utf8");
    assert.match(source, /CampaignWorkspacePage/);
  }
});
