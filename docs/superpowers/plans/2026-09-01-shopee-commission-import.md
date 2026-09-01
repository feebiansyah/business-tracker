# Shopee Commission CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a preview-first, Shopee-account-scoped CSV importer that replaces `CampaignDailyMetric.commission` by campaign/date, records transactional audit history and unmatched aggregates, and never overwrites Meta or manual fields.

**Architecture:** Keep parsing, value conversion, aggregation, matching, preview orchestration, persistence, and history querying in separate `lib/shopee-import` units. Preview parses and matches with zero writes; final import re-reads the browser-held file, recomputes its fingerprint and match digest, then serializes imports per Shopee account and writes history, commission-only metric upserts, and unmatched detail atomically.

**Tech Stack:** Next.js 16.3 App Router and Server Actions, React 19, TypeScript, Prisma 6.19/MySQL, Node `node:test`, `csv-parse` for RFC-style CSV records, and explicit `decimal.js` fixed-point arithmetic.

**Spec:** `docs/superpowers/specs/2026-09-01-shopee-commission-import-design.md`

## Global Constraints

- Work in an isolated feature worktree when execution begins; do not implement this plan on `main`.
- Follow TDD for every behavioral task: write the named failing test, observe the expected failure, implement only enough to pass, then run the focused and full relevant suites.
- Do not reset the database or delete/modify old migrations. The history migration is additive only.
- Preserve all existing `ShopeeAccount`, `MetaAccount`, `Campaign`, `CampaignDailyMetric`, Meta checkpoint, Note, and Selesai data.
- Do not change Filter/Fix/OFF classification, Meta rate-limit behavior, Meta transport, sync chunk/checkpoint behavior, or Prisma generator configuration.
- Import changes only `CampaignDailyMetric.commission`; Meta sync remains Meta-only and manual `note`/`completed` remain manual-only.
- Raw CSV exists only in browser/request memory. Do not write it to MySQL, filesystem, logs, fixtures copied from production, or import history.
- Matching normalization is exactly `trim().toUpperCase()` and matching is limited to `ShopeeAccount -> MetaAccount -> Campaign` without status/budget filters.
- Never query Campaign per CSV row, insert raw CSV rows, use JavaScript float arithmetic for commission, parse CSV with `split(',')`, or add fuzzy matching.
- Upload limits are exactly 10 MiB and 100,000 logical non-empty data rows.
- The example filename `AffiliateCommissionReport_202609012341.csv` may guide sanitized fixtures but must never be hardcoded.
- Each commit below is local only. Do not push or merge during plan execution.

## File Map

| File | Responsibility |
|---|---|
| `package.json`, `package-lock.json` | Direct `csv-parse` and `decimal.js` dependencies |
| `prisma/schema.prisma` | Additive history models and `ShopeeAccount` relation |
| `prisma/migrations/<timestamp>_add_shopee_commission_import_history/migration.sql` | Add only history tables, FKs, and indexes |
| `scripts/protected-row-counts.mjs` | Read-only protected table count snapshot |
| `lib/shopee-import/constants.ts` | Exact headers and upload/row limits |
| `lib/shopee-import/types.ts` | Shared internal and serializable DTO contracts |
| `lib/shopee-import/errors.ts` | Stable safe domain errors |
| `lib/shopee-import/csv.ts` | UTF-8 decoding, delimiter selection, header/row extraction |
| `lib/shopee-import/date.ts` | Strict Shopee date-to-`YYYY-MM-DD` parsing |
| `lib/shopee-import/commission.ts` | Exact IDR text-to-`Decimal` parsing |
| `lib/shopee-import/tags.ts` | Trim + uppercase only normalization |
| `lib/shopee-import/aggregate.ts` | Date/tag grouping and exact summary totals |
| `lib/shopee-import/matching.ts` | Pure unique/not-found/ambiguous matching |
| `lib/shopee-import/campaign-repository.ts` | One scoped campaign/account query |
| `lib/shopee-import/fingerprint.ts` | SHA-256 file and stable match digest |
| `lib/shopee-import/preview.ts` | Zero-write preview orchestration and DTO |
| `lib/shopee-import/upload.ts` | Untrusted File/FormData and filename validation |
| `lib/shopee-import/persistence.ts` | Lock, commission-only bulk upsert, history/unmatched writes |
| `lib/shopee-import/importer.ts` | Final reparse, stale check, retry, transaction orchestration |
| `lib/shopee-import/history.ts` | Account-scoped recent history query |
| `app/shopee/[id]/import/actions.ts` | Untrusted FormData validation and server action results |
| `app/shopee/[id]/import/page.tsx` | Account validation, initial history, import screen |
| `components/shopee-import/import-workflow.tsx` | Client File/preview/import state machine |
| `components/shopee-import/preview-summary.tsx` | Preview totals and confirmation |
| `components/shopee-import/unmatched-table.tsx` | Paginated unmatched aggregates only |
| `components/shopee-import/import-history-table.tsx` | Recent account-scoped audit history |
| `components/layout/navigation.ts`, `navigation-state.ts` | Import Shopee workflow link and active state |
| `app/shopee/[id]/page.tsx` | Import Shopee action on account detail |

---

### Task 1: Install Explicit Parser and Decimal Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/shopee-import/dependency-contract.test.mjs`

**Interfaces:**
- Consumes: Node 24 ESM/type stripping and the existing `npm test` glob.
- Produces: direct imports `parse` from `csv-parse/sync` and `Decimal` from `decimal.js` for Tasks 3–8.

- [ ] **Step 1: Write the failing dependency contract test**

```js
// lib/shopee-import/dependency-contract.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

test("CSV and decimal libraries are direct project dependencies", async () => {
  const [{ parse }, { default: Decimal }] = await Promise.all([
    import("csv-parse/sync"),
    import("decimal.js"),
  ]);
  assert.deepEqual(parse('a,b\n"x,y",2', { columns: true }), [{ a: "x,y", b: "2" }]);
  assert.equal(new Decimal("0.1").plus("0.2").toFixed(2), "0.30");
});
```

- [ ] **Step 2: Run the focused test and observe RED**

Run: `node --test lib/shopee-import/dependency-contract.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `csv-parse` or `decimal.js` because neither is a direct installed dependency.

- [ ] **Step 3: Install only the two approved runtime dependencies**

Run: `npm install csv-parse decimal.js`

Verify `package.json` places both packages under `dependencies`, not `devDependencies`, and review `package-lock.json` for only the expected dependency graph changes.

- [ ] **Step 4: Run the focused test and full existing suite**

Run: `node --test lib/shopee-import/dependency-contract.test.mjs`

Expected: PASS, including quoted comma behavior and exact `0.30` decimal result.

Run: `npm test`

Expected: all existing and new tests PASS.

- [ ] **Step 5: Commit the dependency boundary**

```bash
git add package.json package-lock.json lib/shopee-import/dependency-contract.test.mjs
git commit -m "build: add Shopee CSV import dependencies"
```

### Task 2: Add Import History Models and Safe Additive Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated_timestamp>_add_shopee_commission_import_history/migration.sql`
- Create: `scripts/protected-row-counts.mjs`
- Create: `lib/shopee-import/schema-contract.test.mjs`

**Interfaces:**
- Consumes: existing `ShopeeAccount` and generated Prisma client.
- Produces: Prisma delegates `shopeeCommissionImport` and `shopeeCommissionImportUnmatched`, relation `ShopeeAccount.commissionImports`, and protected count output.

- [ ] **Step 1: Add a failing generated-schema contract test**

```js
// lib/shopee-import/schema-contract.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../generated/prisma/client.ts";

test("generated schema exposes additive Shopee import history models", () => {
  const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  const history = models.get("ShopeeCommissionImport");
  const unmatched = models.get("ShopeeCommissionImportUnmatched");
  assert.ok(history);
  assert.ok(unmatched);
  assert.deepEqual(
    history.fields.filter((field) => ["shopeeAccountId", "fileSha256", "matchedCommission", "unmatchedCommission"].includes(field.name)).map((field) => field.name).sort(),
    ["fileSha256", "matchedCommission", "shopeeAccountId", "unmatchedCommission"],
  );
  assert.equal(unmatched.fields.find((field) => field.name === "reason")?.type, "String");
});
```

- [ ] **Step 2: Run the schema test and observe RED**

Run: `node --test lib/shopee-import/schema-contract.test.mjs`

Expected: FAIL because both history models are absent from the generated client.

- [ ] **Step 3: Add the read-only protected count script and capture BEFORE counts**

```js
// scripts/protected-row-counts.mjs
import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client.ts";

const prisma = new PrismaClient();
try {
  const [shopeeAccounts, metaAccounts, campaigns, dailyMetrics] = await Promise.all([
    prisma.shopeeAccount.count(), prisma.metaAccount.count(),
    prisma.campaign.count(), prisma.campaignDailyMetric.count(),
  ]);
  console.log(JSON.stringify({ shopeeAccounts, metaAccounts, campaigns, dailyMetrics }));
} finally {
  await prisma.$disconnect();
}
```

Run: `node scripts/protected-row-counts.mjs`

Expected: one JSON object. Copy it into the implementation log as `BEFORE`; do not write it into source control.

- [ ] **Step 4: Add the exact additive Prisma models**

Add `commissionImports ShopeeCommissionImport[]` to `ShopeeAccount`, then add:

```prisma
model ShopeeCommissionImport {
  id                  Int      @id @default(autoincrement())
  originalFilename    String   @db.VarChar(255)
  fileSha256          String   @db.Char(64)
  dateFrom            DateTime @db.Date
  dateTo              DateTime @db.Date
  csvRowCount         Int
  tagCount            Int
  matchedCount        Int
  unmatchedCount      Int
  matchedCommission   Decimal  @db.Decimal(18, 2)
  unmatchedCommission Decimal  @db.Decimal(18, 2)
  createdAt           DateTime @default(now())

  shopeeAccountId Int
  shopeeAccount   ShopeeAccount @relation(fields: [shopeeAccountId], references: [id], onDelete: Restrict)
  unmatched       ShopeeCommissionImportUnmatched[]

  @@index([shopeeAccountId, createdAt])
}

model ShopeeCommissionImportUnmatched {
  id         Int      @id @default(autoincrement())
  date       DateTime @db.Date
  tagLink2   String   @db.Text
  commission Decimal  @db.Decimal(18, 2)
  rowCount   Int
  reason     String   @db.VarChar(32)

  importId Int
  import   ShopeeCommissionImport @relation(fields: [importId], references: [id], onDelete: Cascade)

  @@index([importId, date])
}
```

Do not modify `Campaign`, `CampaignDailyMetric`, existing relations, generator, datasource, or migration files.

- [ ] **Step 5: Format, validate, create migration without reset, and generate**

Run in order:

```bash
npx prisma format
npx prisma validate
npx prisma migrate dev --name add_shopee_commission_import_history
npx prisma generate
npx prisma migrate status
```

Expected: one new migration creates only the two history tables, foreign keys, and indexes; status reports the database up to date. If Prisma requests a reset or detects destructive drift, STOP without accepting it.

- [ ] **Step 6: Inspect SQL and verify protected counts**

Run: `Get-Content -Raw prisma/migrations/<generated_timestamp>_add_shopee_commission_import_history/migration.sql`

Expected: only `CREATE TABLE`, indexes, and foreign keys for the two new models; no `DROP`, `TRUNCATE`, or `ALTER` on protected tables.

Run: `node scripts/protected-row-counts.mjs`

Expected: output exactly equals the recorded `BEFORE` JSON for all four protected counts.

- [ ] **Step 7: Run schema contract GREEN**

Run: `node --test lib/shopee-import/schema-contract.test.mjs`

Expected: PASS with both generated model contracts present.

- [ ] **Step 8: Commit schema, migration, and verification script**

```bash
git add prisma/schema.prisma prisma/migrations scripts/protected-row-counts.mjs lib/shopee-import/schema-contract.test.mjs
git commit -m "feat: add Shopee commission import history models"
```

### Task 3: Define Safe Upload Contracts and Parse CSV Structure

**Files:**
- Create: `lib/shopee-import/constants.ts`
- Create: `lib/shopee-import/types.ts`
- Create: `lib/shopee-import/errors.ts`
- Create: `lib/shopee-import/csv.ts`
- Create: `lib/shopee-import/csv.test.mjs`

**Interfaces:**
- Consumes: `parse` from `csv-parse/sync`.
- Produces: `decodeAndParseCsv(bytes: Uint8Array): CsvRecord[]`, `CsvRecord`, `ShopeeImportError`, `MAX_CSV_BYTES`, `MAX_CSV_ROWS`, and exact header constants.

- [ ] **Step 1: Write failing CSV boundary tests**

```js
// lib/shopee-import/csv.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { decodeAndParseCsv } from "./csv.ts";

const encode = (text) => new TextEncoder().encode(text);
test("parses UTF-8 BOM, quoted commas, CRLF, and exact required headers", () => {
  const rows = decodeAndParseCsv(encode(`\uFEFFWaktu Pemesanan,Tag_link2,Komisi Bersih Affiliate (Rp)\r\n2026-09-01 12:30:00,"A,B",1000`));
  assert.deepEqual(rows, [{ logicalRow: 2, orderedAt: "2026-09-01 12:30:00", tagLink2: "A,B", commission: "1000" }]);
});

test("accepts semicolon delimiter and embedded newline in a quoted field", () => {
  const rows = decodeAndParseCsv(encode('Waktu Pemesanan;Tag_link2;Komisi Bersih Affiliate (Rp)\n2026-09-01 12:30;"A\nB";1000'));
  assert.equal(rows[0].tagLink2, "A\nB");
});

test("rejects missing, duplicate, ambiguous, and fuzzy headers", () => {
  assert.throws(() => decodeAndParseCsv(encode("Waktu Pemesanan,Tag_link2\n2026-09-01 12:30,A")), /Komisi Bersih Affiliate \(Rp\)/);
  assert.throws(() => decodeAndParseCsv(encode("Waktu Pemesanan,Tag_link2,Tag_link2,Komisi Bersih Affiliate (Rp)\n2026-09-01 12:30,A,A,1")), /duplikat/i);
  assert.throws(() => decodeAndParseCsv(encode("Waktu Pemesanan,Tag Link 2,Komisi Bersih Affiliate (Rp)\n2026-09-01 12:30,A,1")), /Tag_link2/);
});

test("rejects invalid UTF-8, NUL bytes, empty data, byte overflow, and row overflow", () => {
  assert.throws(() => decodeAndParseCsv(Uint8Array.from([0xff, 0xfe])), /UTF-8/);
  assert.throws(() => decodeAndParseCsv(encode("Waktu Pemesanan,Tag_link2,Komisi Bersih Affiliate (Rp)\0")), /NUL/);
  assert.throws(() => decodeAndParseCsv(encode("Waktu Pemesanan,Tag_link2,Komisi Bersih Affiliate (Rp)\n")), /tidak memiliki data/);
});
```

Add generated boundary inputs without embedding a 10 MiB literal in the test file:

```js
test("enforces exact byte and logical-row limits", () => {
  assert.throws(() => decodeAndParseCsv(new Uint8Array(MAX_CSV_BYTES + 1)), /10 MiB/);
  const header = "Waktu Pemesanan,Tag_link2,Komisi Bersih Affiliate (Rp)\n";
  const row = "2026-09-01 12:30:00,A,1\n";
  assert.doesNotThrow(() => decodeAndParseCsv(encode(header + row.repeat(MAX_CSV_ROWS))));
  assert.throws(() => decodeAndParseCsv(encode(header + row.repeat(MAX_CSV_ROWS + 1))), /100\.000/);
});
```

- [ ] **Step 2: Run focused tests and observe RED**

Run: `node --test lib/shopee-import/csv.test.mjs`

Expected: FAIL with module-not-found for `csv.ts`.

- [ ] **Step 3: Implement constants, DTO primitives, and safe errors**

```ts
// constants.ts
export const REQUIRED_HEADERS = ["Waktu Pemesanan", "Tag_link2", "Komisi Bersih Affiliate (Rp)"] as const;
export const MAX_CSV_BYTES = 10 * 1024 * 1024;
export const MAX_CSV_ROWS = 100_000;

// types.ts
export type CsvRecord = { logicalRow: number; orderedAt: string; tagLink2: string; commission: string };

// errors.ts
export class ShopeeImportError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "ShopeeImportError"; }
}
```

Implement `decodeAndParseCsv` with `TextDecoder("utf-8", { fatal: true })`; reject byte/NUL limits before parsing. Attempt comma and semicolon parsing independently with `csv-parse/sync`, `bom: true`, relaxed extra columns disabled, empty lines skipped, and records returned with source line information. Select exactly one candidate whose trimmed header set contains each exact required header once. Reject zero or two valid candidates. Count logical data records after blank-line removal and stop above 100,000.

- [ ] **Step 4: Run focused and full tests GREEN**

Run: `node --test lib/shopee-import/csv.test.mjs`

Expected: PASS for delimiter, quoted content, headers, encoding, empty file, and limits.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit CSV structural parsing**

```bash
git add lib/shopee-import/constants.ts lib/shopee-import/types.ts lib/shopee-import/errors.ts lib/shopee-import/csv.ts lib/shopee-import/csv.test.mjs
git commit -m "feat: parse Shopee commission CSV safely"
```

### Task 4: Parse Dates, Commission, and Tags Strictly

**Files:**
- Create: `lib/shopee-import/date.ts`
- Create: `lib/shopee-import/date.test.mjs`
- Create: `lib/shopee-import/commission.ts`
- Create: `lib/shopee-import/commission.test.mjs`
- Create: `lib/shopee-import/tags.ts`
- Create: `lib/shopee-import/tags.test.mjs`
- Modify: `lib/shopee-import/types.ts`

**Interfaces:**
- Consumes: raw `CsvRecord` strings and `Decimal`.
- Produces: `parseShopeeDate(value, row): string`, `parseCommission(value, row): Decimal`, `normalizeTag(value, row): { display: string; normalized: string }`, and `ParsedCommissionRow`.

- [ ] **Step 1: Write failing date tests**

```js
test("accepts only the locked calendar formats without timezone shifting", () => {
  assert.equal(parseShopeeDate("2026-09-01 23:59:59", 2), "2026-09-01");
  assert.equal(parseShopeeDate("01/09/2026 00:01", 3), "2026-09-01");
  assert.equal(parseShopeeDate("2026-09-01", 4), "2026-09-01");
});
test("rejects impossible, non-padded, and ambiguous dates with row number", () => {
  assert.throws(() => parseShopeeDate("31/02/2026 10:00", 42), /Baris 42/);
  assert.throws(() => parseShopeeDate("2026-9-1", 43), /Baris 43/);
  assert.throws(() => parseShopeeDate("09/01/26", 44), /Baris 44/);
});
```

- [ ] **Step 2: Write failing decimal and tag tests**

```js
test("parses exact accepted IDR forms", () => {
  for (const [input, expected] of [["50000", "50000.00"], ["50000.25", "50000.25"], ["50.000", "50000.00"], ["Rp 50.000,25", "50000.25"], ["-1.000,50", "-1000.50"]]) {
    assert.equal(parseCommission(input, 2).toFixed(2), expected);
  }
});
test("rejects invalid grouping, exponent, excess scale, and Decimal(18,2) overflow", () => {
  for (const input of ["1.00.0", "1e3", "1,234", "10000000000000000.00", "NaN"]) assert.throws(() => parseCommission(input, 9), /Baris 9/);
});
test("normalizes only surrounding whitespace and case", () => {
  assert.deepEqual(normalizeTag("  Ab-c_ 12  ", 2), { display: "Ab-c_ 12", normalized: "AB-C_ 12" });
  assert.throws(() => normalizeTag("   ", 7), /Baris 7/);
});
```

- [ ] **Step 3: Run all three focused files and observe RED**

Run: `node --test lib/shopee-import/date.test.mjs lib/shopee-import/commission.test.mjs lib/shopee-import/tags.test.mjs`

Expected: FAIL because the parser modules do not exist.

- [ ] **Step 4: Implement strict value parsers**

Use regex branches for the exact date formats, reconstruct UTC with `Date.UTC`, and verify year/month/day round-trip before returning the textual date; never call locale-dependent `new Date(rawValue)`.

For commission, strip only optional `Rp` and edge whitespace, classify separators using the spec rules, normalize to a decimal point string, construct `Decimal`, require at most two fractional digits, and require absolute value `< 10^16`. Return a `Decimal`, never `number`.

Add:

```ts
export type ParsedCommissionRow = {
  logicalRow: number;
  date: string;
  tagLink2: string;
  normalizedTagLink2: string;
  commission: Decimal;
};
```

- [ ] **Step 5: Verify focused and full tests GREEN**

Run: `node --test lib/shopee-import/date.test.mjs lib/shopee-import/commission.test.mjs lib/shopee-import/tags.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit strict Shopee value parsing**

```bash
git add lib/shopee-import/date.ts lib/shopee-import/date.test.mjs lib/shopee-import/commission.ts lib/shopee-import/commission.test.mjs lib/shopee-import/tags.ts lib/shopee-import/tags.test.mjs lib/shopee-import/types.ts
git commit -m "feat: validate Shopee commission values"
```

### Task 5: Aggregate Rows with Exact Decimal Arithmetic

**Files:**
- Create: `lib/shopee-import/aggregate.ts`
- Create: `lib/shopee-import/aggregate.test.mjs`
- Modify: `lib/shopee-import/types.ts`

**Interfaces:**
- Consumes: `CsvRecord[]`, `parseShopeeDate`, `parseCommission`, and `normalizeTag`.
- Produces: `aggregateCommissionRows(records): AggregationResult`, `CommissionAggregate`, date range, raw row count, unique tag count, and exact total.

- [ ] **Step 1: Write the failing aggregation tests**

```js
test("groups by date and normalized tag with exact sums and row counts", () => {
  const result = aggregateCommissionRows([
    { logicalRow: 2, orderedAt: "2026-09-01 10:00", tagLink2: " Ab-1 ", commission: "0.10" },
    { logicalRow: 3, orderedAt: "2026-09-01 11:00", tagLink2: "ab-1", commission: "0.20" },
    { logicalRow: 4, orderedAt: "2026-09-02 09:00", tagLink2: "X_2", commission: "1.000" },
  ]);
  assert.equal(result.csvRowCount, 3);
  assert.equal(result.tagCount, 2);
  assert.equal(result.dateFrom, "2026-09-01");
  assert.equal(result.dateTo, "2026-09-02");
  assert.deepEqual(result.aggregates.map((row) => [row.date, row.normalizedTagLink2, row.commission.toFixed(2), row.rowCount]), [
    ["2026-09-01", "AB-1", "0.30", 2], ["2026-09-02", "X_2", "1000.00", 1],
  ]);
});
```

Add this second test proving first-trimmed display tag is retained and negative/zero rows contribute exactly:

```js
test("retains first trimmed display tag and sums zero and negative rows", () => {
  const result = aggregateCommissionRows([
    { logicalRow: 2, orderedAt: "2026-09-01", tagLink2: " First-Tag ", commission: "10.00" },
    { logicalRow: 3, orderedAt: "2026-09-01", tagLink2: "first-tag", commission: "-2.50" },
    { logicalRow: 4, orderedAt: "2026-09-01", tagLink2: "FIRST-TAG", commission: "0" },
  ]);
  assert.equal(result.aggregates[0].tagLink2, "First-Tag");
  assert.equal(result.aggregates[0].commission.toFixed(2), "7.50");
  assert.equal(result.aggregates[0].rowCount, 3);
});
```

- [ ] **Step 2: Run focused test and observe RED**

Run: `node --test lib/shopee-import/aggregate.test.mjs`

Expected: FAIL with module-not-found for `aggregate.ts`.

- [ ] **Step 3: Implement deterministic aggregation**

Add:

```ts
export type CommissionAggregate = {
  date: string; tagLink2: string; normalizedTagLink2: string;
  commission: Decimal; rowCount: number;
};
export type AggregationResult = {
  aggregates: CommissionAggregate[]; csvRowCount: number; tagCount: number;
  dateFrom: string; dateTo: string; totalCommission: Decimal;
};
```

Use a `Map` keyed by `${date}\u0000${normalizedTagLink2}`. Sum with `Decimal.plus`, count normalized tags in a `Set`, and sort aggregates by date then normalized tag so preview digests are stable.

- [ ] **Step 4: Verify aggregation and full suite GREEN**

Run: `node --test lib/shopee-import/aggregate.test.mjs`

Expected: PASS with `0.10 + 0.20 = 0.30` exactly.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit aggregation**

```bash
git add lib/shopee-import/aggregate.ts lib/shopee-import/aggregate.test.mjs lib/shopee-import/types.ts
git commit -m "feat: aggregate Shopee commissions by tag and date"
```

### Task 6: Match Campaigns Once Within Shopee Scope

**Files:**
- Create: `lib/shopee-import/matching.ts`
- Create: `lib/shopee-import/matching.test.mjs`
- Create: `lib/shopee-import/campaign-repository.ts`
- Create: `lib/shopee-import/campaign-repository.integration.test.mjs`
- Modify: `lib/shopee-import/types.ts`

**Interfaces:**
- Consumes: `CommissionAggregate[]`, `normalizeTag`, Prisma client/transaction client.
- Produces: `loadShopeeCampaignCandidates(db, shopeeAccountId)`, `matchCommissionAggregates(aggregates, campaigns): MatchResult`, reasons `CAMPAIGN_NOT_FOUND | AMBIGUOUS_CAMPAIGN_NAME`.

- [ ] **Step 1: Write failing pure matcher tests**

```js
test("matches exactly one normalized campaign and classifies missing or duplicate names", () => {
  const aggregates = [aggregate("2026-09-01", "A-1", "10"), aggregate("2026-09-01", "B_2", "20"), aggregate("2026-09-02", "C 3", "30")];
  const result = matchCommissionAggregates(aggregates, [
    { id: 11, name: " a-1 " }, { id: 21, name: "B_2" }, { id: 22, name: "b_2" },
  ]);
  assert.deepEqual(result.matched.map((row) => [row.campaignId, row.date]), [[11, "2026-09-01"]]);
  assert.deepEqual(result.unmatched.map((row) => row.reason), ["AMBIGUOUS_CAMPAIGN_NAME", "CAMPAIGN_NOT_FOUND"]);
  assert.equal(result.matchedCommission.toFixed(2), "10.00");
  assert.equal(result.unmatchedCommission.toFixed(2), "50.00");
});
```

- [ ] **Step 2: Run matcher test and observe RED**

Run: `node --test lib/shopee-import/matching.test.mjs`

Expected: FAIL because `matching.ts` does not exist.

- [ ] **Step 3: Implement pure unique/ambiguous matcher**

Create a `Map<string, CampaignCandidate[]>`, never pick the first duplicate, and preserve sorted aggregate order. Define serializable counts over aggregate groups, not raw rows.

Add these exact internal contracts to `types.ts`:

```ts
export type CampaignCandidate = { id: number; name: string };
export type UnmatchedReason = "CAMPAIGN_NOT_FOUND" | "AMBIGUOUS_CAMPAIGN_NAME";
export type MatchedCommission = CommissionAggregate & { campaignId: number };
export type UnmatchedCommission = CommissionAggregate & { reason: UnmatchedReason };
export type MatchResult = {
  matched: MatchedCommission[];
  unmatched: UnmatchedCommission[];
  matchedCommission: Decimal;
  unmatchedCommission: Decimal;
};
```

- [ ] **Step 4: Run matcher test GREEN**

Run: `node --test lib/shopee-import/matching.test.mjs`

Expected: PASS.

- [ ] **Step 5: Write failing scoped repository integration test**

Within an interactive Prisma transaction, create two Shopee accounts, one MetaAccount and Campaign under each, call the repository for account A, assert it returns only A's campaign regardless of campaign `metaStatus` or budget, then throw a named rollback sentinel. Catch only that sentinel outside the transaction.

```js
assert.deepEqual(await loadShopeeCampaignCandidates(tx, accountA.id), [{ id: campaignA.id, name: "SAME-NAME" }]);
```

Run: `node --test lib/shopee-import/campaign-repository.integration.test.mjs`

Expected: FAIL because `campaign-repository.ts` does not exist.

- [ ] **Step 6: Implement the one-query scoped repository**

```ts
export type CampaignQueryDb = Pick<PrismaClient, "campaign"> | Pick<Prisma.TransactionClient, "campaign">;

export async function loadShopeeCampaignCandidates(db: CampaignQueryDb, shopeeAccountId: number) {
  return db.campaign.findMany({
    where: { metaAccount: { shopeeAccountId } },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
}
```

Validate the Shopee account separately before this query. Do not add status, effective budget, or workflow filters.

- [ ] **Step 7: Run scoped integration and full tests GREEN**

Run: `node --test lib/shopee-import/campaign-repository.integration.test.mjs lib/shopee-import/matching.test.mjs`

Expected: PASS and transaction rollback leaves no fixture rows.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 8: Commit matcher and repository**

```bash
git add lib/shopee-import/matching.ts lib/shopee-import/matching.test.mjs lib/shopee-import/campaign-repository.ts lib/shopee-import/campaign-repository.integration.test.mjs lib/shopee-import/types.ts
git commit -m "feat: match Shopee tags within account scope"
```

### Task 7: Build Zero-Write Preview and Fingerprint Semantics

**Files:**
- Create: `lib/shopee-import/fingerprint.ts`
- Create: `lib/shopee-import/fingerprint.test.mjs`
- Create: `lib/shopee-import/preview.ts`
- Create: `lib/shopee-import/preview.test.mjs`
- Create: `lib/shopee-import/upload.ts`
- Create: `app/shopee/[id]/import/actions.ts`
- Create: `lib/shopee-import/actions.test.mjs`
- Modify: `lib/shopee-import/types.ts`

**Interfaces:**
- Consumes: file bytes, original filename, account ID, CSV/aggregation/matching functions, and `loadShopeeCampaignCandidates`.
- Produces: `buildShopeeCommissionPreview(input, deps): Promise<ShopeeCommissionPreview>`, `sha256(bytes)`, `buildMatchDigest(scopeId, result)`, and `previewShopeeCommissionAction(shopeeAccountId, formData)`.

- [ ] **Step 1: Write failing fingerprint tests**

Use known SHA-256 literal for `abc` and two match results whose arrays differ only in insertion order. Assert file hashes are exact and match digests are equal after canonical sorting; changing campaign ID, date, commission, unmatched reason, or Shopee account ID must change the digest.

Run: `node --test lib/shopee-import/fingerprint.test.mjs`

Expected: FAIL because `fingerprint.ts` does not exist.

- [ ] **Step 2: Implement canonical SHA-256 helpers**

Use `node:crypto` `createHash("sha256")`; canonicalize all Decimal values with `toFixed(2)` and sort matched/unmatched keys before `JSON.stringify`. Include `shopeeAccountId`, date range, all counts/totals, matched campaign/date/commission, and unmatched date/tag/commission/reason in the digest.

- [ ] **Step 3: Write failing zero-write preview tests**

Inject a fake campaign loader that records exactly one call and a persistence dependency that throws if invoked. Assert:

```js
const preview = await buildShopeeCommissionPreview({ shopeeAccountId: 2, originalFilename: "report.csv", bytes }, deps);
assert.equal(deps.loadCampaigns.calls, 1);
assert.equal(deps.writeCalls, 0);
assert.deepEqual(preview.unmatched[0], { date: "2026-09-01", tagLink2: "NO-MATCH", commission: "1000.00", rowCount: 1, reason: "CAMPAIGN_NOT_FOUND" });
assert.match(preview.fileSha256, /^[a-f0-9]{64}$/);
assert.match(preview.matchDigest, /^[a-f0-9]{64}$/);
```

Also assert matched/unmatched counts are aggregate counts, totals are serializable decimal strings, and filename is sanitized to a 255-character basename.

Run: `node --test lib/shopee-import/preview.test.mjs`

Expected: FAIL because `preview.ts` does not exist.

- [ ] **Step 4: Implement preview orchestration and DTO**

Define:

```ts
export type PreviewConfirmation = { fileSha256: string; matchDigest: string };
export type ShopeeCommissionPreview = {
  originalFilename: string; fileSha256: string; matchDigest: string;
  dateFrom: string; dateTo: string; csvRowCount: number; tagCount: number;
  matchedCount: number; unmatchedCount: number;
  matchedCommission: string; unmatchedCommission: string;
  unmatched: SerializableUnmatched[];
};
```

`buildShopeeCommissionPreview` validates positive integer account ID, verifies account existence, sanitizes filename, parses/aggregates, loads all scoped campaigns once, matches in memory, and converts Decimal to two-decimal strings. It has no persistence dependency and therefore no write code path.

- [ ] **Step 5: Write failing action boundary tests**

Test a pure `readCsvUpload(formData)` helper used by the server action: missing/non-File upload, non-`.csv`, MIME other than empty/`text/csv`/`application/vnd.ms-excel`, oversized file, invalid account ID, and valid File. Assert errors are safe domain messages.

Run: `node --test lib/shopee-import/actions.test.mjs`

Expected: FAIL because the upload boundary helper is absent.

- [ ] **Step 6: Implement the preview Server Action**

Keep reusable FormData validation in `lib/shopee-import/upload.ts`; keep `actions.ts` thin:

```ts
"use server";
export async function previewShopeeCommissionAction(shopeeAccountId: number, formData: FormData): Promise<PreviewActionResult> {
  try {
    const upload = await readCsvUpload(formData);
    return { success: true, preview: await buildShopeeCommissionPreview({ shopeeAccountId, ...upload }, realPreviewDeps) };
  } catch (error) {
    return { success: false, message: publicImportMessage(error) };
  }
}
```

Do not log raw rows or echo uploaded values in generic errors.

- [ ] **Step 7: Run preview tests and full suite GREEN**

Run: `node --test lib/shopee-import/fingerprint.test.mjs lib/shopee-import/preview.test.mjs lib/shopee-import/actions.test.mjs`

Expected: PASS, including zero writes and one campaign load.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 8: Commit preview flow**

```bash
git add lib/shopee-import app/shopee/[id]/import/actions.ts
git commit -m "feat: preview Shopee commission imports"
```

### Task 8: Implement Atomic Commission-Only Persistence

**Files:**
- Create: `lib/shopee-import/persistence.ts`
- Create: `lib/shopee-import/persistence.test.mjs`
- Create: `lib/shopee-import/persistence.integration.test.mjs`
- Modify: `lib/shopee-import/types.ts`

**Interfaces:**
- Consumes: a Prisma transaction client, Shopee account ID, preview/import metadata, matched and unmatched aggregates.
- Produces: `persistCommissionImportInTransaction(tx, input): Promise<ImportReceipt>`, `lockShopeeAccount(tx, id)`, `upsertCommissionChunks(tx, matched)`, and `createUnmatchedChunks(tx, importId, unmatched)`. The writer consumes an already locked, freshly matched input; Task 9 owns lock/match ordering.

- [ ] **Step 1: Write failing payload/chunk tests**

Extract pure chunk and SQL-fragment builders. Tests must assert 1,001 matched aggregates become chunks `[500, 500, 1]`, and the duplicate update fragment is exactly commission plus `updatedAt`, with none of these identifiers: `spend`, `clickFp`, `cpcFp`, `shopeeClicks`, `note`, `completed`.

```js
assert.deepEqual(chunkValues(Array.from({ length: 1001 }), 500).map((chunk) => chunk.length), [500, 500, 1]);
assert.deepEqual(metricDuplicateUpdateColumns, ["commission", "updatedAt"]);
```

Run: `node --test lib/shopee-import/persistence.test.mjs`

Expected: FAIL because persistence helpers do not exist.

- [ ] **Step 2: Implement lock and parameterized batch helpers**

Use `Prisma.sql`, `Prisma.join`, and `$executeRaw` parameterization. Each matched chunk executes:

```sql
INSERT INTO `campaigndailymetric`
  (`campaignId`, `date`, `commission`, `createdAt`, `updatedAt`)
VALUES
  (?, ?, ?, NOW(), NOW()), ...
ON DUPLICATE KEY UPDATE
  `commission` = VALUES(`commission`),
  `updatedAt` = NOW()
```

Implement `lockShopeeAccount(tx, id)` with parameterized `SELECT id FROM shopeeaccount WHERE id = ? FOR UPDATE`; absence is a safe account-not-found error. Task 9 must call it before loading campaign candidates. Unmatched uses `createMany` chunks of 500.

- [ ] **Step 3: Write failing rollback-safe integration test**

Inside an outer interactive transaction, seed one campaign metric with non-null Meta fields, `shopeeClicks`, `note`, and `completed`; call `lockShopeeAccount` and then `persistCommissionImportInTransaction`; assert:

- history and unmatched rows exist;
- commission is replaced;
- every Meta/manual field is byte-for-byte unchanged;
- a Shopee-first campaign/date creates a metric with Meta fields null, `note` null, `completed` false;
- a campaign/date absent from input is unchanged.

Throw the rollback sentinel after assertions. Add a second test that injects a failure after history creation and asserts no history/metric/unmatched records remain after rollback.

Run: `node --test lib/shopee-import/persistence.integration.test.mjs`

Expected: FAIL before persistence implementation.

- [ ] **Step 4: Implement one-transaction history/metric/unmatched writer**

`persistCommissionImportInTransaction` assumes the caller opened the transaction and already locked/validated the account. It creates history, performs matched chunk upserts, creates unmatched chunks, and returns only serializable receipt fields. It never catches errors inside the transaction; errors must propagate so Prisma rolls back everything.

Use these exact contracts:

```ts
export type ImportTransaction = Prisma.TransactionClient;
export type PersistImportInput = {
  shopeeAccountId: number;
  originalFilename: string;
  fileSha256: string;
  dateFrom: string;
  dateTo: string;
  csvRowCount: number;
  tagCount: number;
  matched: MatchedCommission[];
  unmatched: UnmatchedCommission[];
  matchedCommission: Decimal;
  unmatchedCommission: Decimal;
};
export type ImportReceipt = {
  importId: number;
  matchedCount: number;
  unmatchedCount: number;
  matchedCommission: string;
  unmatchedCommission: string;
  createdAt: string;
};
```

- [ ] **Step 5: Run persistence tests GREEN**

Run: `node --test lib/shopee-import/persistence.test.mjs lib/shopee-import/persistence.integration.test.mjs`

Expected: PASS; rollback fixture cleanup leaves protected counts unchanged.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit atomic persistence**

```bash
git add lib/shopee-import/persistence.ts lib/shopee-import/persistence.test.mjs lib/shopee-import/persistence.integration.test.mjs lib/shopee-import/types.ts
git commit -m "feat: persist Shopee commissions atomically"
```

### Task 9: Build Final Import, Stale Detection, and Retry

**Files:**
- Create: `lib/shopee-import/importer.ts`
- Create: `lib/shopee-import/importer.test.mjs`
- Create: `lib/shopee-import/importer.integration.test.mjs`
- Modify: `app/shopee/[id]/import/actions.ts`
- Modify: `lib/shopee-import/types.ts`

**Interfaces:**
- Consumes: file bytes/filename, `PreviewConfirmation`, preview pipeline, Prisma transaction, and persistence function.
- Produces: `importShopeeCommissions(input, deps): Promise<ImportReceipt>` and `importShopeeCommissionAction(shopeeAccountId, confirmation, formData)`.

- [ ] **Step 1: Write failing final orchestration tests**

Use fake dependencies to assert:

- final import always invokes parse/aggregate again and performs a fresh match rather than accepting client aggregates;
- file SHA mismatch throws `FILE_CHANGED` before transaction;
- recomputed match digest mismatch throws `PREVIEW_STALE` before transaction;
- matching confirmation opens exactly one transaction, locks before loading candidates, loads campaigns exactly once per attempt, and calls persistence once;
- transient deadlock codes `P2034`, MySQL `1213`, and connection reset retry at most twice (three total attempts);
- validation, stale, and arbitrary errors are never retried.

```js
await assert.rejects(() => importShopeeCommissions(changedFileInput, deps), (error) => error.code === "FILE_CHANGED");
assert.equal(deps.transactionCalls, 0);
```

Run: `node --test lib/shopee-import/importer.test.mjs`

Expected: FAIL because `importer.ts` does not exist.

- [ ] **Step 2: Implement final reparse/stale/retry service**

Re-read bytes, sanitize filename, calculate SHA-256, parse, and aggregate outside the transaction without querying Campaign. Reject a file hash mismatch before opening a transaction. Then execute:

```ts
await prisma.$transaction(
  (tx) => persistCommissionImportInTransaction(tx, input),
  { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 },
);
```

Inside each transaction attempt call `lockShopeeAccount(tx, shopeeAccountId)`, then `loadShopeeCampaignCandidates(tx, shopeeAccountId)` exactly once, match the already parsed aggregates, recompute the canonical digest, and compare it to the confirmation with constant-time `timingSafeEqual` after length validation. A digest mismatch throws `PREVIEW_STALE` before history creation. A matching digest calls `persistCommissionImportInTransaction` with the fresh match result.

Define the injectable boundary used by unit and rollback integration tests:

```ts
export type ImporterDeps = {
  withTransaction<T>(work: (tx: ImportTransaction) => Promise<T>): Promise<T>;
  lockAccount(tx: ImportTransaction, shopeeAccountId: number): Promise<void>;
  loadCampaigns(tx: ImportTransaction, shopeeAccountId: number): Promise<CampaignCandidate[]>;
  persist(tx: ImportTransaction, input: PersistImportInput): Promise<ImportReceipt>;
};
```

The production `withTransaction` adapter uses Prisma `$transaction` with `ReadCommitted` and a 30-second timeout. Retry the entire transaction only for the enumerated transient codes and only twice. Each retry locks first, reloads campaign scope once, rechecks the digest, and never reuses a transaction result from a failed attempt.

- [ ] **Step 3: Write source-order and idempotency integration tests**

Using rollback fixtures, inject `withTransaction` so the importer callback receives the outer rollback transaction client; test:

1. Meta-first → Shopee sets commission and preserves Meta/manual fields.
2. Shopee-first → inside the same rollback transaction perform the production-shaped Prisma upsert using the real `dailyMetricMetaUpdate` payload; commission/note/completed survive because that payload contains only Meta fields.
3. Re-import same aggregate twice → commission remains the aggregate, not doubled, while two history rows exist.
4. Re-import changed aggregate → commission equals latest aggregate only.
5. Cross-Shopee confirmation/import attempt is rejected and writes nothing.

Run: `node --test lib/shopee-import/importer.integration.test.mjs`

Expected: FAIL until final importer integration is connected.

- [ ] **Step 4: Add final Server Action boundary**

Validate `confirmation` is an object containing exactly two lowercase 64-character hex strings. Reuse `readCsvUpload`; derive account ID only from bound server argument; call final importer; `revalidatePath(`/shopee/${id}/import`)` only after success; return a constrained receipt/error DTO.

- [ ] **Step 5: Run importer tests and full regression GREEN**

Run: `node --test lib/shopee-import/importer.test.mjs lib/shopee-import/importer.integration.test.mjs lib/filter/metrics.test.mjs`

Expected: PASS, including replacement rather than addition and Meta/manual preservation.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit final importer**

```bash
git add lib/shopee-import/importer.ts lib/shopee-import/importer.test.mjs lib/shopee-import/importer.integration.test.mjs lib/shopee-import/types.ts app/shopee/[id]/import/actions.ts
git commit -m "feat: import Shopee commissions transactionally"
```

### Task 10: Add Account-Scoped History Query

**Files:**
- Create: `lib/shopee-import/history.ts`
- Create: `lib/shopee-import/history.integration.test.mjs`
- Modify: `lib/shopee-import/types.ts`

**Interfaces:**
- Consumes: Prisma client and Shopee account ID.
- Produces: `getShopeeImportPageData(db, shopeeAccountId): Promise<ShopeeImportPageData | null>` with account identity and recent history DTOs.

- [ ] **Step 1: Write failing account-scoped query test**

In a rollback transaction, seed histories for account A and B. Assert query A returns only A, newest-first, with Decimal fields converted to two-decimal strings and date fields converted to `YYYY-MM-DD`/ISO timestamps. Assert invalid/missing accounts return null.

Run: `node --test lib/shopee-import/history.integration.test.mjs`

Expected: FAIL because `history.ts` does not exist.

- [ ] **Step 2: Implement one bounded history query**

Use the injected Prisma client/transaction client with `findUnique` on Shopee account and nested `commissionImports`, `take: 50`, `orderBy: { createdAt: "desc" }`, and explicit `select`. Do not load raw CSV (none exists) or unmatched children in the initial history list. Convert all Prisma Decimal/Date values to serializable strings server-side. The page calls this function with the shared `prisma` instance; integration tests call it with their rollback transaction client.

Return this serializable contract:

```ts
export type ImportHistoryRow = {
  id: number; originalFilename: string; dateFrom: string; dateTo: string;
  csvRowCount: number; tagCount: number; matchedCount: number; unmatchedCount: number;
  matchedCommission: string; unmatchedCommission: string; createdAt: string;
};
export type ShopeeImportPageData = {
  shopeeAccount: { id: number; name: string };
  history: ImportHistoryRow[];
};
```

- [ ] **Step 3: Run history and full tests GREEN**

Run: `node --test lib/shopee-import/history.integration.test.mjs`

Expected: PASS with account isolation and deterministic formatting DTO.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 4: Commit history query**

```bash
git add lib/shopee-import/history.ts lib/shopee-import/history.integration.test.mjs lib/shopee-import/types.ts
git commit -m "feat: query Shopee commission import history"
```

### Task 11: Add Import Navigation and Dynamic Route

**Files:**
- Modify: `components/layout/navigation-state.ts`
- Modify: `components/layout/navigation-state.test.mjs`
- Modify: `components/layout/navigation.ts`
- Modify: `app/shopee/[id]/page.tsx`
- Create: `app/shopee/[id]/import/page.tsx`
- Create: `lib/shopee-import/route-contract.test.mjs`

**Interfaces:**
- Consumes: `getShopeeImportPageData`, existing sidebar workflow mapping, Next async params/notFound.
- Produces: workflow slug `import`, first-position `Import Shopee` navigation, detail-account link, and dynamic route shell.

- [ ] **Step 1: Extend navigation tests first**

```js
test("identifies Import Shopee without confusing other account workflows", () => {
  assert.equal(getShopeeNavigationState("/shopee/3/import", 3).activeWorkflow, "import");
  assert.equal(getShopeeNavigationState("/shopee/4/import", 3).activeWorkflow, null);
  assert.equal(getShopeeNavigationState("/shopee/3/filter", 3).activeWorkflow, "filter");
});
```

Add a contract test importing `shopeeWorkflows` and asserting exact order `import, filter, fix, off-filter, off-fix`.

- [ ] **Step 2: Run navigation tests and observe RED**

Run: `node --test components/layout/navigation-state.test.mjs lib/shopee-import/route-contract.test.mjs`

Expected: FAIL because `import` is not a valid workflow and no Import link exists.

- [ ] **Step 3: Add only the navigation and route shell**

Extend `ShopeeWorkflowSlug`, its set, and `shopeeWorkflows` with `{ href: "import", label: "Import Shopee" }` first. Add an Import Shopee `Button`/`Link` on account detail without changing the WL table.

Create a dynamic Server Component that validates the integer ID through `getShopeeImportPageData`, calls `notFound()` on null, and renders the account name, back link, and page heading `Import Shopee`. Do not import the Task 12 client component yet, query Campaign, or parse files in the page. Task 12 replaces the static page body with the complete workflow after all UI components exist, so this commit remains buildable independently.

- [ ] **Step 4: Run navigation tests GREEN**

Run: `node --test components/layout/navigation-state.test.mjs lib/shopee-import/route-contract.test.mjs`

Expected: PASS; existing Filter/OFF state tests remain green.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit route/navigation wiring**

```bash
git add components/layout/navigation-state.ts components/layout/navigation-state.test.mjs components/layout/navigation.ts app/shopee/[id]/page.tsx app/shopee/[id]/import/page.tsx lib/shopee-import/route-contract.test.mjs
git commit -m "feat: add Shopee commission import route"
```

### Task 12: Build Preview, Unmatched, Import, and History UI

**Files:**
- Create: `components/shopee-import/import-workflow.tsx`
- Create: `components/shopee-import/preview-summary.tsx`
- Create: `components/shopee-import/unmatched-table.tsx`
- Create: `components/shopee-import/import-history-table.tsx`
- Create: `components/shopee-import/view-model.ts`
- Create: `components/shopee-import/view-model.test.mjs`
- Modify: `app/shopee/[id]/import/page.tsx`

**Interfaces:**
- Consumes: preview/final actions, `ShopeeCommissionPreview`, `ImportReceipt`, and history DTOs.
- Produces: browser-only File state, preview confirmation UX, paginated unmatched aggregates, and formatted history table.

- [ ] **Step 1: Write failing UI view-model tests**

Test `formatImportRupiah`, `formatImportDateRange`, `paginateUnmatched`, and the state reducer. Required assertions:

```js
assert.equal(formatImportRupiah("27419.70"), "Rp 27.420");
assert.equal(formatImportDateRange("2026-09-01", "2026-09-03"), "1 Sep 2026 – 3 Sep 2026");
assert.equal(reduceImportState(previewed, { type: "FILE_CHANGED", file: nextFile }).preview, null);
assert.equal(reduceImportState(importing, { type: "IMPORT_SUCCEEDED", receipt }).phase, "success");
```

Also assert page clamping after unmatched data changes and no state field stores raw CSV text/rows.

Run: `node --test components/shopee-import/view-model.test.mjs`

Expected: FAIL because `view-model.ts` does not exist.

- [ ] **Step 2: Implement pure formatting/pagination/state reducer**

Use `Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })` for display only; Decimal strings remain unchanged in DTO/state. The reducer phases are `idle | previewing | previewed | importing | success | error`; changing file clears preview, confirmation, receipt, and error.

- [ ] **Step 3: Build focused presentation components**

`PreviewSummary` renders filename, date range, raw row count, unique tags, matched/unmatched aggregate counts, and matched/unmatched totals. `UnmatchedTable` renders only date, Tag_link2, commission, rowCount, and reason with local 25-row pagination. `ImportHistoryTable` renders the latest 50 account-scoped history DTOs. None accept or render raw CSV rows.

- [ ] **Step 4: Build the client workflow state machine**

`ImportWorkflow` keeps the selected `File` in React state, constructs a fresh `FormData` for preview and final requests, disables controls during requests, and passes only `{ fileSha256, matchDigest }` as confirmation. On final success call `router.refresh()` to reload history. Catch action/network errors into visible safe messages; do not `console.log` FormData, file contents, preview aggregates, or error objects containing row data.

The `Import Sekarang` button is enabled only when phase is `previewed`, the current file object is unchanged, and confirmation belongs to the current preview.

- [ ] **Step 5: Wire the page and run tests**

Run: `node --test components/shopee-import/view-model.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Run typecheck and lint before committing UI**

Run: `npx tsc --noEmit`

Expected: PASS; Server Component props and Server Action DTOs are serializable.

Run: `npm run lint`

Expected: PASS with no hook or client/server-boundary errors.

- [ ] **Step 7: Commit UI**

```bash
git add components/shopee-import app/shopee/[id]/import/page.tsx
git commit -m "feat: add Shopee commission import workflow UI"
```

### Task 13: Complete Security, Atomicity, and Regression Audit

**Files:**
- Modify: `lib/shopee-import/actions.test.mjs`
- Modify: `lib/shopee-import/importer.test.mjs`
- Modify: `lib/shopee-import/persistence.integration.test.mjs`
- Modify: `lib/shopee-import/persistence.ts`
- Modify: `lib/filter/metrics.test.mjs` only if the existing Meta-only payload assertion does not already cover `commission`, `note`, and `completed`
- Create: `lib/shopee-import/security-regression.test.mjs`

**Interfaces:**
- Consumes: all importer public boundaries.
- Produces: explicit regression evidence for limits, untrusted input, account scope, atomicity, source ownership, and no double commission.

- [ ] **Step 1: Add failing security/ownership tests**

Add table-driven tests proving these mutations fail:

- `MAX_CSV_BYTES` changed above/below 10 MiB;
- `MAX_CSV_ROWS` changed above/below 100,000;
- filename traversal `..\\secret.csv` persists only `secret.csv`;
- invalid account IDs (`0`, negative, fractional, string) never reach repositories;
- client-supplied aggregate/totals are ignored because actions accept only File plus confirmation;
- cross-Shopee campaign IDs cannot enter matched persistence;
- ambiguous campaign name cannot enter matched persistence;
- duplicate update columns expanded to any Meta/manual field;
- re-import implementation changed from replacement to addition;
- preview obtains a persistence dependency or opens a transaction.

The deliberate RED assertion imports a not-yet-existing defensive guard:

```js
test("commission persistence rejects any expanded duplicate-update ownership", () => {
  assert.doesNotThrow(() => assertCommissionOnlyUpdateColumns(["commission", "updatedAt"]));
  for (const field of ["spend", "clickFp", "cpcFp", "shopeeClicks", "note", "completed"]) {
    assert.throws(() => assertCommissionOnlyUpdateColumns(["commission", "updatedAt", field]), /commission-only/);
  }
});
```

Run: `node --test lib/shopee-import/security-regression.test.mjs`

Expected: FAIL because `assertCommissionOnlyUpdateColumns` is not exported by `persistence.ts`.

- [ ] **Step 2: Implement and invoke the exact ownership guard**

```ts
export function assertCommissionOnlyUpdateColumns(columns: readonly string[]) {
  if (columns.length !== 2 || columns[0] !== "commission" || columns[1] !== "updatedAt") {
    throw new Error("Shopee metric upsert must remain commission-only");
  }
}
```

Call it with the exported frozen `metricDuplicateUpdateColumns` immediately before building every bulk upsert statement. Export the already-used upload limits, filename sanitizer, confirmation validator, and read-only preview dependency type so the remaining table-driven regression assertions exercise real boundaries. Do not change Filter or Meta production modules.

- [ ] **Step 3: Run focused security and source-ownership tests GREEN**

Run:

```bash
node --test lib/shopee-import/security-regression.test.mjs lib/shopee-import/actions.test.mjs lib/shopee-import/importer.test.mjs lib/shopee-import/persistence.integration.test.mjs lib/filter/metrics.test.mjs
```

Expected: PASS, demonstrating preview zero-write, final atomicity, cross-account exclusion, replacement semantics, and Meta/manual preservation.

- [ ] **Step 4: Commit regression hardening**

```bash
git add lib/shopee-import lib/filter/metrics.test.mjs
git commit -m "test: harden Shopee commission import boundaries"
```

### Task 14: Full Migration, Test, Build, and Runtime Verification

**Files:**
- No planned source changes. If any command fails, invoke `superpowers:systematic-debugging`, preserve the failure evidence, and fix only the proven in-scope defect before rerunning this task from Step 1.

**Interfaces:**
- Consumes: complete implementation and migration.
- Produces: final verification evidence and a clean feature branch ready for review, without push/merge.

- [ ] **Step 1: Re-run protected count and migration safety checks**

Run: `node scripts/protected-row-counts.mjs`

Expected: counts equal the Task 2 `BEFORE` values for `ShopeeAccount`, `MetaAccount`, `Campaign`, and `CampaignDailyMetric` after rollback-safe tests.

Run:

```bash
npx prisma format
npx prisma validate
npx prisma generate
npx prisma migrate status
```

Expected: all PASS; status reports database up to date; no reset and no migration beyond the one additive history migration.

- [ ] **Step 2: Run complete automated verification**

Run in order:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all tests PASS with zero failures; typecheck, lint, and production build exit 0. Build output includes `/shopee/[id]/import` and all existing Filter/Fix/OFF routes.

- [ ] **Step 3: Perform runtime preview checks without final write**

Start production server, then verify:

- `/shopee/2/import` returns 200 for an existing account;
- invalid/missing account returns 404;
- `/shopee/2`, `/shopee/2/filter`, one Filter detail, `/wl`, and `/meta` still return 200;
- a small sanitized comma CSV and semicolon CSV both preview successfully;
- missing header, invalid date, invalid commission, oversized bytes, and >100,000 rows are rejected with exact safe messages;
- preview creates no `ShopeeCommissionImport`, unmatched, or metric changes by comparing counts/selected metric values before and after.

- [ ] **Step 4: Perform rollback-safe final import runtime checks**

Use a dedicated sanitized campaign fixture created inside an interactive transaction that deliberately rolls back after assertions. Verify Shopee-first, Meta-first, replacement re-import, unmatched history, Note/Selesai preservation, account scoping, and injected mid-write failure rollback. Do not use or overwrite a real operational campaign commission for runtime testing.

- [ ] **Step 5: Audit source boundaries and working tree**

Run:

```bash
rg -n "split\(['\"][,]" lib/shopee-import
rg -n "commission.*plus|existing.*commission" lib/shopee-import
rg -n "spend|clickFp|cpcFp|shopeeClicks|note|completed" lib/shopee-import/persistence.ts
git diff --check
git status --short
git log --oneline --decorate -15
```

Expected:

- no manual comma-split parser;
- no addition to existing commission;
- persistence references forbidden fields only in explicit guards/tests, never duplicate update SQL;
- no raw CSV fixture/output or unrelated source changes;
- branch contains the planned small commits and remains unpushed.

- [ ] **Step 6: Stop and report**

Report migration name/SQL safety, protected counts, test totals, Prisma status, typecheck, lint, build routes, runtime outcomes, final branch HEAD/status, and any warnings. Do not push, merge, or delete the worktree until the user chooses a finishing option.

## Plan Completion Checklist

- [ ] Every spec section maps to at least one task above.
- [ ] Parser, date, commission, tags, aggregation, matcher, preview, importer, persistence, and history query remain separate files.
- [ ] Preview has no write/transaction dependency and final import re-parses bytes.
- [ ] Final import locks the Shopee account and writes history/metrics/unmatched atomically.
- [ ] Metric duplicate update changes commission only; re-import replaces rather than adds.
- [ ] Meta fields, `shopeeClicks`, `note`, and `completed` are preserved in both source orders.
- [ ] Matching loads campaigns once through Shopee scope and rejects missing/ambiguous/cross-account candidates.
- [ ] No raw CSV storage, fuzzy matching, per-row campaign query, JS float arithmetic, or manual comma splitting exists.
- [ ] Only one additive history migration exists and protected counts remain unchanged.
- [ ] Existing Filter/Fix/OFF and Meta sync behavior passes regression verification.
