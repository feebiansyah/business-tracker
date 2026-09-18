import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Clickadu page exposes configuration, read-only analysis, and copy-only candidates", async () => {
  const files = await Promise.all([
    "../../app/shopee/[id]/clickadu-roi/page.tsx",
    "../../components/clickadu-roi/credential-form.tsx",
    "../../components/clickadu-roi/config-form.tsx",
    "../../components/clickadu-roi/analysis-workflow.tsx",
    "../../components/clickadu-roi/analysis-summary.tsx",
    "../../components/clickadu-roi/zone-table.tsx",
    "../../components/traffic-roi/candidate-list.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const source = files.join("\n");
  for (const label of [
    "Clickadu ROI —",
    "Akun Shopee:",
    "Status Clickadu:",
    "Campaign ID Clickadu",
    "Nama Campaign",
    "Source Tag / Tag_link1 Shopee",
    "Campaign Clickadu",
    "Tanggal Mulai",
    "Tanggal Akhir",
    "Kurs USD → IDR",
    "CSV Komisi Shopee",
    "Aturan Kandidat Blacklist",
    "ROI < 30%",
    "Replace Blacklist Clickadu",
    "Biaya Iklan",
    "Komisi Bersih Shopee",
    "Kandidat Blacklist",
    "Zone",
    "Impressions",
    "Spend USD",
    "Cost IDR",
  ]) assert.match(source, new RegExp(label));
  assert.match(source, /shopeeAccountName/);
  assert.doesNotMatch(source, /CLICKADU_API_TOKEN|writeFile|localStorage/);
  assert.match(source, /noun="Zone"/);
  assert.match(source, /kandidat blacklist/);
  assert.match(source, /Lihat daftar/);
  assert.match(source, /Token baru \(token lama tidak ditampilkan\)/);
  assert.match(source, /onSubmit=\{/);
  assert.match(source, /preventDefault\(\)/);
  assert.match(source, /disabled=\{busy \|\| replacing/);
});

test("Clickadu analysis uses a synchronous in-flight guard and resets loading", async () => {
  const source = await readFile(new URL("../../components/clickadu-roi/analysis-workflow.tsx", import.meta.url), "utf8");
  assert.match(source, /analysisInFlight/);
  assert.match(source, /if \(analysisInFlight\.current\) return/);
  assert.match(source, /analysisInFlight\.current = true/);
  assert.match(source, /finally/);
  assert.match(source, /analysisInFlight\.current = false/);
  assert.match(source, /busy \? "Menganalisis\.\.\." : "Analisa"/);
  assert.match(source, /disabled=\{replacing \|\| busy\}/);
});

test("Clickadu explains the Rp1.000 minimum decision cost", async () => {
  const source = await readFile(new URL("../../components/clickadu-roi/analysis-workflow.tsx", import.meta.url), "utf8");
  assert.match(source, /Biaya Iklan ≥ Rp1\.000 dan ROI &lt; 30%/);
});
