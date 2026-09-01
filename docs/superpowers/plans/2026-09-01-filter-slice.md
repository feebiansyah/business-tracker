# Filter Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working database-backed Filter workflow that bulk-syncs Meta metadata/history for a Shopee account's linked WLs and exposes a validated campaign list and daily detail.

**Architecture:** Extend the existing Meta client with paginated account-level campaign, ad-set, and insight calls. Keep pure budget/date/derived rules isolated from a sequential per-WL sync service, persist coverage using `Campaign.historySyncedThrough`, and make both Filter routes read Prisma only.

**Tech Stack:** Next.js 16.3.3 App Router, React 19 Server Components and Server Actions, TypeScript, Prisma 6.19.3/MySQL Decimal, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-01-filter-slice-design.md`

## Global Constraints

- Implement Filter only; keep Fix, OFF Filter, and OFF Fix as placeholders.
- Do not implement Shopee CSV import, lifetime-budget classification, fake zero metrics, or Meta mutations.
- Preserve Sync WL, Sync BM, Shopee management, WL-to-Shopee mapping, protected data, and every existing migration.
- Use account-level paginated Meta calls, sequential WL processing, monthly historical chunks, and persistent coverage checkpoints.
- Page/detail reads must never call Meta; only the explicit Sync Meta action may invoke the sync service.
- Work only on `feature/filter-slice`; do not push or merge.

---

### Task 1: Core campaign schema and safe migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create through Prisma: `prisma/migrations/<timestamp>_add_core_campaign_models/migration.sql`
- Preserve: all existing `prisma/migrations/**`

**Interfaces:**
- Produces `MetaAccount.campaigns Campaign[]`.
- Produces Prisma `Campaign` and `CampaignDailyMetric` models exactly as specified, including nullable `historySyncedThrough` and `@@unique([campaignId, date])`.

- [ ] Record protected row counts and `npx prisma migrate status` without printing credentials.
- [ ] Add only the new relation/models with Decimal fields and query indexes.
- [ ] Run `npx prisma format` and `npx prisma validate`.
- [ ] Run `npx prisma migrate dev --name add_core_campaign_models`, inspect SQL, reject any reset/protected-table changes, and apply it.
- [ ] Run `npx prisma generate`; resolve Windows DLL locks only by stopping verified project-owned Next/Studio processes.
- [ ] Recheck protected counts, table existence, and migration status.
- [ ] Commit: `feat: add core campaign data model`.

### Task 2: Pure Filter, budget, date, and metric rules via TDD

**Files:**
- Create: `lib/filter/types.ts`
- Create: `lib/filter/rules.ts`
- Create: `lib/filter/date-ranges.ts`
- Create: `lib/filter/metrics.ts`
- Create: `lib/filter/rules.test.mjs`
- Create: `lib/filter/date-ranges.test.mjs`
- Create: `lib/filter/metrics.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `resolveEffectiveDailyBudget(campaign, adSets): { amount: number | null; source: "CAMPAIGN" | "ADSET" | "UNRESOLVED" }`.
- `isFilterCampaign({ status, effectiveDailyBudget }): boolean` with strict `< 200000`.
- `buildMonthlyChunks(start: string, end: string): Array<{ since: string; until: string }>`.
- `getRequiredHistoryStart({ startDate, historySyncedThrough, today }): string | null`, using bootstrap/checkpoint or routine D-1.
- `calculateFinancialMetrics(spend, commission, clickFp, shopeeClicks)` returns nullable derived values without Infinity/NaN.
- `dailyMetricMetaUpdate(row)` contains only real Meta fields and cannot set Shopee fields.

- [ ] Change test script to run `components/**/*.test.mjs` and `lib/**/*.test.mjs`.
- [ ] Write failing literal tests for ACTIVE 199999, ACTIVE 200000, PAUSED 50000, campaign override, paused-adset sum, unresolved budget, monthly boundaries, checkpoint resume, routine D-1, zero division, null Shopee sources, and Meta update payload exclusions.
- [ ] Run `npm test` and verify failure is missing production modules.
- [ ] Implement minimal pure functions; treat invalid/absent/negative budget text as unusable and include zero only when Meta explicitly supplies zero.
- [ ] Run `npm test` and require all tests green.
- [ ] Commit: `feat: add tested Filter business rules`.

### Task 3: Existing Meta client account-level campaign APIs

**Files:**
- Modify: `lib/meta/types.ts`
- Modify: `lib/meta/client.ts`

**Interfaces:**
- `getCampaigns(accountId): Promise<MetaCampaign[]>`.
- `getAdSets(accountId): Promise<MetaAdSet[]>`.
- `getCampaignInsights(accountId, { since, until }): Promise<MetaCampaignInsight[]>` with `level=campaign` and `time_increment=1`.
- All three reuse private `getAllPages` and `normalizeMetaAccountPath`.

- [ ] Define complete response types with optional Meta string fields.
- [ ] Add the three narrow methods and required field arrays/params; do not change retry/pagination/redaction logic.
- [ ] Run tests, TypeScript, and lint.
- [ ] Audit that no per-campaign endpoint or hardcoded API version was added.
- [ ] Commit: `feat: add Meta campaign bulk endpoints`.

### Task 4: Filter persistence and sequential sync via TDD

**Files:**
- Create: `lib/filter/persistence.ts`
- Create: `lib/filter/sync.ts`
- Create: `lib/filter/sync-planning.ts`
- Create: `lib/filter/sync-planning.test.mjs`
- Create: `app/shopee/[id]/filter/actions.ts`
- Create: `components/filter/sync-meta-button.tsx`

**Interfaces:**
- `planCampaignCoverage(campaigns, today)` groups required campaign coverage into monthly WL-level chunks and identifies campaign IDs whose checkpoint may advance per successful chunk.
- `syncFilter(shopeeAccountId): Promise<FilterSyncSummary>` returns WL success/failure, campaigns processed, insight rows stored, unresolved budgets, and bootstrap warnings.
- `syncFilterAction(shopeeAccountId, previousState)` catches operational errors, revalidates only the Filter route, and returns user-facing state.

- [ ] Write failing planning tests proving an empty successful chunk advances the intended campaign checkpoint, failed/unattempted chunks do not, and daily rows remain response-driven.
- [ ] Implement coverage planning as pure data; merge account-level chunk requests without losing per-campaign checkpoint targets.
- [ ] Implement campaign metadata upsert and daily-metric upsert preserving nullable Shopee fields.
- [ ] Implement sequential WL sync with per-WL try/catch and client wait between WLs; process chunks sequentially and checkpoint only after successful responses/persistence.
- [ ] Implement the Server Action and pending/result button; validate Shopee integer/existence and never expose secrets.
- [ ] Run tests, TypeScript, and lint.
- [ ] Commit: `feat: sync Filter campaigns and history`.

### Task 5: Database query layer and Filter page

**Files:**
- Create: `lib/filter/queries.ts`
- Create: `components/filter/filter-table.tsx`
- Modify: `app/shopee/[id]/filter/page.tsx`

**Interfaces:**
- `getFilterPageData(shopeeAccountId, search): Promise<FilterPageData | null>` validates account, counts unresolved campaigns within linked WLs, loads Filter campaigns/metrics in bounded queries, and maps Decimal values to serializable display data.
- The page accepts promised `params` and `searchParams`, reads only the query layer, and renders `SyncMetaButton` plus `FilterTable`.

- [ ] Implement one Shopee ownership query plus bounded campaign/metric loading with exact ACTIVE and `< 200000` predicates.
- [ ] Derive totals and `Hari`; preserve null commission meaning across aggregates.
- [ ] Replace the Filter placeholder with title, search GET form, Sync Meta button, unresolved warning, empty state, and required table columns.
- [ ] Link campaign names to `/shopee/{shopeeId}/filter/{campaignId}`.
- [ ] Run tests, TypeScript, lint, and build.
- [ ] Commit: `feat: build Filter campaign page`.

### Task 6: Owned Filter campaign daily detail

**Files:**
- Create: `app/shopee/[id]/filter/[campaignId]/page.tsx`
- Create: `components/filter/campaign-daily-table.tsx`
- Extend: `lib/filter/queries.ts`

**Interfaces:**
- `getFilterCampaignDetail(shopeeAccountId, campaignId): Promise<FilterCampaignDetail | null>` applies ownership and exact current Filter scope in the database query.
- The route calls `notFound()` on invalid IDs or null detail and never imports Meta/sync modules.

- [ ] Add the ownership/scope query through `Campaign.metaAccount.shopeeAccountId` and load daily metrics ordered newest first.
- [ ] Render required header fields and daily columns, using `—` for null Shopee-derived values and safe derived calculations.
- [ ] Verify wrong Shopee ownership, absent campaign, non-ACTIVE campaign, unresolved budget, and budget 200000 cannot produce detail data through the query predicate/code audit.
- [ ] Run tests, TypeScript, lint, and build.
- [ ] Commit: `feat: add Filter campaign daily detail`.

### Task 7: Full verification and regression audit

**Files:**
- Modify only for in-scope defects discovered by verification, using a failing test before behavioral fixes.

**Interfaces:**
- Verifies the complete approved Filter slice and all protected boundaries.

- [ ] Run fresh `npx prisma format`, `npx prisma validate`, `npx prisma generate`, `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` with recorded exit codes.
- [ ] Confirm build contains `/shopee/[id]/filter` and `/shopee/[id]/filter/[campaignId]`; confirm the other three routes remain placeholders.
- [ ] Runtime-check Filter without sync first, verify no Meta calls in server logs, then invoke explicit sync for an existing Shopee account if credentials/API access permit.
- [ ] Verify displayed campaign ownership/status/budget, persisted dates/checkpoints, same-date upsert uniqueness, and campaign detail navigation using read-only database queries.
- [ ] Compare protected counts again and confirm no edits to Sync WL/BM, Shopee actions, mapping components, or prior migration files.
- [ ] Run `git status --short` and recent log; leave the feature branch/worktree intact and do not push or merge.
