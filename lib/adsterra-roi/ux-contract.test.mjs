import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Adsterra connection and analysis expose the refined safe UX", async () => {
  const credential = await readFile(new URL("../../components/adsterra-roi/credential-form.tsx", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../../components/adsterra-roi/analysis-workflow.tsx", import.meta.url), "utf8");
  const candidates = await readFile(new URL("../../components/traffic-roi/candidate-list.tsx", import.meta.url), "utf8");
  const source = `${workflow}\n${candidates}`;
  assert.match(credential, /Akun Shopee:/);
  assert.match(credential, /Status Adsterra:/);
  assert.match(credential, /API Key baru \(API Key lama tidak ditampilkan\)/);
  assert.doesNotMatch(credential, /encryptedSecret|decryptTrafficSecret/);
  assert.match(workflow, /Menganalisis\.\.\./);
  assert.match(workflow, /replaceInFlight/);
  assert.match(source, /Placement/);
  assert.match(source, /kandidat blacklist/);
  assert.match(source, /Lihat daftar/);
  assert.doesNotMatch(workflow, /candidatePlacements\.join\(", "\).*\|\| "Tidak ada kandidat Placement/);
  assert.match(workflow, /onSubmit=\{/);
  assert.match(workflow, /preventDefault\(\)/);
  assert.match(workflow, /disabled=\{busy \|\| replacing/);
});

test("Adsterra explains the Rp1.000 minimum and labels insufficient spend", async () => {
  const workflow = await readFile(new URL("../../components/adsterra-roi/analysis-workflow.tsx", import.meta.url), "utf8");
  const table = await readFile(new URL("../../components/adsterra-roi/placement-table.tsx", import.meta.url), "utf8");
  assert.match(workflow, /Biaya Iklan ≥ Rp1\.000 dan ROI &lt; 30%/);
  assert.match(table, /Belum Cukup Spend/);
});
