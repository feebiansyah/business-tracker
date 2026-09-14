# Clickadu ROI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan workflow Clickadu ROI read-only per Shopee Account yang mengambil statistik Clickadu melalui API, mencocokkan Zone dengan Shopee Tag_link3, menghitung ROI dengan kurs manual, dan menghasilkan kandidat blacklist yang bisa di-copy tanpa melakukan write ke Clickadu.

**Architecture:** Tambahkan model konfigurasi Clickadu yang opsional per Shopee Account. Analisis tetap stateless: server action membaca konfigurasi + CSV upload, memanggil client Clickadu yang menangani pagination, lalu fungsi domain murni menghitung rows/totals yang dikembalikan ke client. Navigation mengikuti workflow Shopee existing dan API token tetap server-side dari environment variable.

**Tech Stack:** Next.js 16.3.3 App Router, React 19, TypeScript 5, Prisma 6.19.3, MySQL, csv-parse, decimal.js, Node test runner, Tailwind/shadcn foundation.

**Spec:** `docs/superpowers/specs/2026-09-14-clickadu-roi-design.md`

## Global Constraints

- Tahap ini read-only terhadap Clickadu: tidak ada PUT campaign, blacklist API, atau status change.
- Prisma generator tetap `provider = "prisma-client"` dan `output = "../lib/generated/prisma"`.
- API token hanya dari `process.env.CLICKADU_API_TOKEN` di server-side code.
- Tidak boleh ada token/API secret pada source, test fixture, commit, browser payload, atau log.
- Pagination statistics Clickadu dimulai dari page 1 dan harus mengambil seluruh `totalPages`.
- Clickadu Zone dan Shopee Tag_link3 diperlakukan sebagai string.
- Kurs USD→IDR manual; tidak ada external FX API.
- Blacklist candidate hanya bila `costIdr > 0 && roi < 30`.
- Jangan mengubah behavior Meta/Shopee existing dan jangan memakai placeholder lama `/adu` atau `/roi-tracker`.

---

### Task 1: Add optional Clickadu campaign configuration schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260914090000_add_clickadu_campaign_config/migration.sql`
- Test: `lib/clickadu-roi/config-shape.test.mjs`

**Interfaces:**
- Produces Prisma model `ClickaduCampaignConfig` with fields `id`, `campaignId`, `label`, `sourceTag`, timestamps, `shopeeAccountId`, and relation to `ShopeeAccount`.
- Produces relation `ShopeeAccount.clickaduCampaignConfigs`.

- [ ] **Step 1: Write the failing schema-shape test**

Create `lib/clickadu-roi/config-shape.test.mjs` that reads `prisma/schema.prisma` and asserts the exact generator remains unchanged, `ShopeeAccount` includes `clickaduCampaignConfigs ClickaduCampaignConfig[]`, and model `ClickaduCampaignConfig` contains `campaignId String`, `label String?`, `sourceTag String`, `shopeeAccountId Int`, compound unique `[shopeeAccountId, campaignId]`, and no token field.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
node --test lib/clickadu-roi/config-shape.test.mjs
```

Expected: FAIL because the model/relation does not exist yet.

- [ ] **Step 3: Add Prisma model and migration**

Add to `ShopeeAccount`:

```prisma
clickaduCampaignConfigs ClickaduCampaignConfig[]
```

Add:

```prisma
model ClickaduCampaignConfig {
  id              Int      @id @default(autoincrement())
  campaignId      String   @db.VarChar(64)
  label           String?  @db.VarChar(191)
  sourceTag       String   @db.VarChar(64)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  shopeeAccountId Int
  shopeeAccount   ShopeeAccount @relation(fields: [shopeeAccountId], references: [id], onDelete: Cascade)

  @@unique([shopeeAccountId, campaignId])
  @@index([shopeeAccountId])
}
```

Migration SQL must create table `ClickaduCampaignConfig`, unique index on `(shopeeAccountId, campaignId)`, index on `shopeeAccountId`, and foreign key to `ShopeeAccount(id)` with `ON DELETE CASCADE`.

- [ ] **Step 4: Generate Prisma client and run focused test**

Run:

```bash
npx prisma generate
node --test lib/clickadu-roi/config-shape.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260914090000_add_clickadu_campaign_config/migration.sql lib/clickadu-roi/config-shape.test.mjs
git commit -m "feat: add Clickadu campaign configuration"
```

---

### Task 2: Build Clickadu statistics client with full pagination

**Files:**
- Create: `lib/clickadu-roi/types.ts`
- Create: `lib/clickadu-roi/clickadu-client.ts`
- Create: `lib/clickadu-roi/clickadu-client.test.mjs`

**Interfaces:**
- Produces `fetchClickaduZoneStatistics(input, deps?)`.
- Input: `{ campaignId: string; dateFrom: string; dateTill: string; token?: string }`.
- Output: `{ items: ClickaduZoneStat[]; totalSpentUsd: number; totalImpressions: number }`.
- `ClickaduZoneStat`: `{ zone: string; impressions: number; clicks: number; spentUsd: number }`.

- [ ] **Step 1: Write failing tests for page-1 start, pagination, parsing, and error secrecy**

Use a fake `fetch` dependency that returns page 1 with `totalPages: 2`, then page 2. Assert requested query contains:

```text
page=1
page=2
groupBy=zone
campaignId=<id>
withTestExpenses=0
dateFrom=<date>
dateTill=<date>
```

Assert numeric API `zone` becomes string and all items are combined. Add tests for malformed response and non-2xx response; error messages must not contain the supplied fake token.

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
node --test lib/clickadu-roi/clickadu-client.test.mjs
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement minimal client**

Use base URL:

```text
https://ssp.clickadu.com/v1.0/api/client/statistics/
```

Build `URLSearchParams`, start page at 1, use `limit=50`, `groupBy=zone`, `withTestExpenses=0`, and loop until current page reaches `totalPages`. Header must include `Authorization` and `Accept: application/json`.

Use `process.env.CLICKADU_API_TOKEN` when input token is omitted. Throw a safe error if absent. Validate the minimal shape of `result.page`, `result.items`, `result.totalPages`, and numeric fields used by the app.

- [ ] **Step 4: Run focused tests**

```bash
node --test lib/clickadu-roi/clickadu-client.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/clickadu-roi/types.ts lib/clickadu-roi/clickadu-client.ts lib/clickadu-roi/clickadu-client.test.mjs
git commit -m "feat: add paginated Clickadu statistics client"
```

---

### Task 3: Parse Shopee ROI CSV and aggregate commission by Tag_link3

**Files:**
- Create: `lib/clickadu-roi/shopee-csv.ts`
- Create: `lib/clickadu-roi/shopee-csv.test.mjs`
- Reuse: `lib/shopee-import/commission.ts`

**Interfaces:**
- Produces `parseShopeeRoiCsv(bytes, sourceTag)` returning `{ commissionByZone: Map<string, Decimal>; processedRows: number; ignoredRows: number }`.
- Required headers: `Tag_link1`, `Tag_link3`, `Komisi Bersih Affiliate (Rp)`.

- [ ] **Step 1: Write failing parser tests**

Cover:

```text
ADU
Adu
 adu 
```

against configured sourceTag `ADU`; all must match after normalization. Test that two rows with the same Tag_link3 sum commission. Test Zone IDs remain exact strings. Test rows with another Tag_link1 or empty Tag_link3 are ignored. Test comma and semicolon CSV delimiters and BOM support. Test missing/duplicate required headers fail.

- [ ] **Step 2: Run tests and verify failure**

```bash
node --test lib/clickadu-roi/shopee-csv.test.mjs
```

Expected: FAIL because parser does not exist.

- [ ] **Step 3: Implement parser**

Use `csv-parse/sync` following existing safety behavior. Enforce 10 MiB and 100,000 data rows. Decode UTF-8 fatally. Normalize source tag with `trim().toUpperCase()`. Trim Tag_link3 without numeric conversion. Use `parseCommission` from `lib/shopee-import/commission.ts` for exact commission parsing.

- [ ] **Step 4: Run parser tests**

```bash
node --test lib/clickadu-roi/shopee-csv.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/clickadu-roi/shopee-csv.ts lib/clickadu-roi/shopee-csv.test.mjs
git commit -m "feat: parse Shopee traffic ROI CSV"
```

---

### Task 4: Implement ROI domain calculation

**Files:**
- Create: `lib/clickadu-roi/calculate.ts`
- Create: `lib/clickadu-roi/calculate.test.mjs`
- Modify: `lib/clickadu-roi/types.ts`

**Interfaces:**
- Produces `calculateClickaduRoi({ stats, commissionByZone, exchangeRate })`.
- Output includes `rows`, totals, and `blacklistCandidates: string[]`.

- [ ] **Step 1: Write failing calculation tests**

Use deterministic fixtures and assert:

```text
costIdr = spentUsd * exchangeRate
profit = commission - costIdr
roi = profit / costIdr * 100 when costIdr > 0
```

Cover ROI 29.99% as candidate, exactly 30% as not candidate, cost 0 → `roi=null` and not candidate, missing Shopee Zone → commission 0, total ROI based on aggregate total profit/aggregate total cost, and default row sort descending by spent USD.

- [ ] **Step 2: Run tests and verify failure**

```bash
node --test lib/clickadu-roi/calculate.test.mjs
```

Expected: FAIL because calculator does not exist.

- [ ] **Step 3: Implement calculation using Decimal for money math**

Validate exchange rate > 0. Keep API stats in USD but perform multiplication/commission/profit with `decimal.js`. Convert only final serializable values to number/string consistently for UI.

- [ ] **Step 4: Run focused tests**

```bash
node --test lib/clickadu-roi/calculate.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/clickadu-roi/types.ts lib/clickadu-roi/calculate.ts lib/clickadu-roi/calculate.test.mjs
git commit -m "feat: calculate Clickadu ROI by zone"
```

---

### Task 5: Add Shopee workflow navigation for Clickadu ROI

**Files:**
- Modify: `components/layout/navigation-state.ts`
- Modify: `components/layout/navigation.ts`
- Modify: `components/layout/navigation-state.test.mjs`
- Modify: `components/layout/navigation.test.mjs`

**Interfaces:**
- Adds workflow slug/key `clickadu-roi`.
- Route: `/shopee/{id}/clickadu-roi`.

- [ ] **Step 1: Add failing navigation tests**

Assert `getShopeeNavigationState('/shopee/12/clickadu-roi', 12).activeWorkflow === 'clickadu-roi'` and `shopeeWorkflows` includes label `Clickadu ROI` with href `clickadu-roi`.

- [ ] **Step 2: Run navigation tests and verify failure**

```bash
node --test components/layout/navigation-state.test.mjs components/layout/navigation.test.mjs
```

Expected: FAIL before workflow is added.

- [ ] **Step 3: Add workflow slug and navigation entry**

Extend `ShopeeWorkflowSlug` and `workflowSlugs`, then append:

```ts
{ key: "clickadu-roi", href: "clickadu-roi", label: "Clickadu ROI" }
```

Do not modify unrelated sidebar layout.

- [ ] **Step 4: Run navigation tests**

```bash
node --test components/layout/navigation-state.test.mjs components/layout/navigation.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/layout/navigation-state.ts components/layout/navigation.ts components/layout/navigation-state.test.mjs components/layout/navigation.test.mjs
git commit -m "feat: add Clickadu ROI Shopee workflow"
```

---

### Task 6: Add configuration repository and authenticated server actions

**Files:**
- Create: `lib/clickadu-roi/config.ts`
- Create: `lib/clickadu-roi/config.test.mjs`
- Create: `app/shopee/[id]/clickadu-roi/actions.ts`
- Create: `app/shopee/[id]/clickadu-roi/actions.test.mjs`

**Interfaces:**
- `normalizeClickaduSourceTag(value: string): string`.
- `validateClickaduCampaignId(value: string): string`.
- Server actions: `saveClickaduConfigAction`, `deleteClickaduConfigAction`, `analyzeClickaduRoiAction`.

- [ ] **Step 1: Write failing validation/action tests**

Cover sourceTag trimming/uppercase, blank campaign ID rejection, positive finite exchange rate requirement, invalid date range rejection, and ownership rule that config must belong to the Shopee Account passed to the action.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
node --test lib/clickadu-roi/config.test.mjs app/shopee/[id]/clickadu-roi/actions.test.mjs
```

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement config helpers and server actions**

Every exported server action begins with `await requireUser()`.

`saveClickaduConfigAction` validates the account, upserts by `(shopeeAccountId, campaignId)`, stores normalized sourceTag, and revalidates `/shopee/${shopeeAccountId}/clickadu-roi`.

`deleteClickaduConfigAction` deletes only with both `id` and `shopeeAccountId` ownership verified.

`analyzeClickaduRoiAction` accepts FormData keys:

```text
configId
dateFrom
dateTill
exchangeRate
file
```

It validates config ownership, file presence/size, dates, and exchange rate; parses Shopee CSV with config sourceTag; fetches Clickadu stats using config campaignId; calculates ROI; and returns a serializable result. It does not write analysis rows to DB.

- [ ] **Step 4: Run focused tests**

```bash
node --test lib/clickadu-roi/config.test.mjs app/shopee/[id]/clickadu-roi/actions.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/clickadu-roi/config.ts lib/clickadu-roi/config.test.mjs app/shopee/[id]/clickadu-roi/actions.ts app/shopee/[id]/clickadu-roi/actions.test.mjs
git commit -m "feat: add Clickadu ROI server workflow"
```

---

### Task 7: Build Clickadu ROI page and interactive analysis UI

**Files:**
- Create: `app/shopee/[id]/clickadu-roi/page.tsx`
- Create: `components/clickadu-roi/clickadu-roi-workspace.tsx`
- Create: `components/clickadu-roi/copy-zone-list-button.tsx`
- Create: `components/clickadu-roi/format.ts`
- Create: `components/clickadu-roi/format.test.mjs`

**Interfaces:**
- Server page loads Shopee Account + config list only.
- Client workspace invokes server actions and renders result.

- [ ] **Step 1: Write failing format/UI helper tests**

Test formatter output for USD, IDR, ROI null, and candidate list string exactly:

```text
2101219, 2141603, 2102502
```

- [ ] **Step 2: Run focused tests and verify failure**

```bash
node --test components/clickadu-roi/format.test.mjs
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement server page**

Parse numeric `id`, `notFound()` invalid/missing account, load configs ordered by label/campaign ID, and render page heading plus `ClickaduRoiWorkspace`. Do not fetch Clickadu on page load.

- [ ] **Step 4: Implement workspace**

Provide configuration area, analysis form, loading/error state, summary cards, candidate copy block, and responsive data-dense table.

Summary fields:

```text
Total Spend USD
Total Biaya IDR
Total Komisi
Total Profit
ROI Total
Kandidat Blacklist
```

Table columns:

```text
Zone
Impressions
Clicks
Spend USD
Cost IDR
Commission
Profit
ROI
Status
```

Use red text/background cues for blacklist/loss and green for safe/profit. Keep table horizontally scrollable on mobile.

- [ ] **Step 5: Implement copy button**

Use `navigator.clipboard.writeText(candidateString)` only in the client. Disable when no candidates. Never call Clickadu write API.

- [ ] **Step 6: Run focused tests and lint touched code**

```bash
node --test components/clickadu-roi/format.test.mjs
npm run lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/shopee/[id]/clickadu-roi/page.tsx components/clickadu-roi
 git commit -m "feat: add Clickadu ROI workspace"
```

---

### Task 8: End-to-end verification and regression check

**Files:**
- Modify only if verification exposes a Clickadu ROI defect.

**Interfaces:**
- No new interfaces; verifies all previous tasks together.

- [ ] **Step 1: Run all Clickadu ROI tests**

```bash
node --test lib/clickadu-roi/*.test.mjs components/clickadu-roi/*.test.mjs app/shopee/[id]/clickadu-roi/*.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full automated tests**

```bash
npm test
```

Expected: all non-baseline tests PASS. If an existing baseline failure remains, record its exact unchanged failure and verify it predates this branch before proceeding.

- [ ] **Step 3: Run lint, Prisma validation/generation, and production build**

```bash
npm run lint
npx prisma validate
npx prisma generate
npm run build
```

Expected: PASS.

- [ ] **Step 4: Manual read-only smoke test with real Clickadu API**

Set `CLICKADU_API_TOKEN` only in local `.env`, never commit it. Start app and open one Shopee Account → Clickadu ROI. Create a config for a known campaign, choose the same period as a known CSV sample, enter manual exchange rate, upload Shopee CSV, and verify:

- all 9+ API pages are fetched when `totalPages` requires it;
- total Clickadu spend matches API totals for the same campaign/date range;
- a sample Zone such as a known Tag_link3 match receives its Shopee commission;
- candidate list includes only cost>0 and ROI<30%;
- no PUT/PATCH/POST request is sent to Clickadu.

- [ ] **Step 5: Inspect browser/network and logs for secret leakage**

Confirm token is absent from browser HTML, RSC payloads, client JS props, action results, console logs, and server error messages.

- [ ] **Step 6: Check branch diff scope**

```bash
git diff main...HEAD --stat
git diff main...HEAD -- prisma/schema.prisma components/layout/navigation.ts components/layout/navigation-state.ts app/shopee lib/clickadu-roi components/clickadu-roi
```

Confirm no unrelated Meta/Shopee formula/import changes and no edits under old placeholder `/adu` or `/roi-tracker`.

- [ ] **Step 7: Commit any verification-only fixes**

If verification required Clickadu-specific fixes:

```bash
git add <only Clickadu-related files>
git commit -m "fix: stabilize Clickadu ROI workflow"
```

If no fixes were needed, do not create an empty commit.

- [ ] **Step 8: Stop before merge**

Push `feature/clickadu-roi` for review. Do not merge into `main` until exact diff review and user approval are complete.
