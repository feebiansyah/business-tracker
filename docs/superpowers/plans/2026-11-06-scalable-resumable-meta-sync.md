# Scalable Resumable Meta Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Meta Sync safely resumable across many short requests for 61+ WL and large campaign histories while preserving every existing data rule, including D-1 overlap and INACTIVE-through-yesterday behavior.

**Architecture:** Add a sync-only persisted run/progress model with an expiring server lease. Replace the one-request all-WL execution path with one bounded work unit per Server Action call; the existing client button drives calls sequentially and can resume after reload. Reuse the current date planners, status classification, budget resolution, persistence mappings, and checkpoints; split only orchestration and oversized database writes.

**Tech Stack:** Next.js 16 Server Actions, TypeScript, React 19, Prisma 6/MySQL, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-06-scalable-resumable-meta-sync-design.md`

## Global Constraints

- Scope is only Meta Sync scalability, resumability, locking, progress, and unit-scoped transient retry.
- Preserve Asia/Jakarta boundaries, D-1 overlap, ACTIVE through today, INACTIVE through yesterday, UNAVAILABLE handling, budget/status rules, and all current checkpoints.
- Preserve existing metric meanings and Meta-derived field mappings.
- Never overwrite manual `CampaignDailyMetric.note` or `completed`.
- Do not change Filter/Fix/OFF calculations, Meta write actions, Shopee imports, Clickadu, Adsterra, auth, traffic balances, or unrelated UI.
- One claimed work unit per Shopee account at a time across tabs/operators.
- A checkpoint/progress cursor advances only after its data persistence succeeds.
- No live Meta/database writes during verification; use fakes/fixtures.
- Work only on `fix/meta-sync-scalable-resume`; do not merge or deploy.

## Review Focus

- A response lost after a committed unit must resume without duplicate rows or skipped coverage.
- Lease expiry must never allow overlap while a valid owner is still processing.
- A run crossing midnight must keep the target date captured at run creation.
- A campaign discovered after a run snapshot must wait for the next run rather than corrupting current progress.
- Meta rate limiting and transient database conflicts must stop/retry only the bounded unit, never replay the whole account.

---

### Task 1: Characterize Existing Sync Semantics Before Refactoring

**Files:**
- Create: `lib/filter/sync-baseline.test.mjs`
- Read-only reference: `lib/filter/sync.ts`
- Read-only reference: `lib/filter/inactive-reconciliation.ts`
- Read-only reference: `lib/filter/date-ranges.ts`
- Read-only reference: `lib/filter/sync-planning.ts`
- Read-only reference: `lib/filter/persistence.ts`

**Interfaces:**
- Consumes: current `syncFilter(shopeeAccountId)` behavior and existing fake DB/client harness pattern.
- Produces: executable parity fixtures used to reject semantic drift in later tasks.

- [ ] **Step 1: Build a fake Prisma/Meta harness around the unmodified sync path**

Cover one ACTIVE WL with campaign-level budget, one ACTIVE WL with Ad Set budget, one INACTIVE WL, and one access-error UNAVAILABLE WL. Record GET order, requested ranges, DB writes, checkpoints, summary, and manual fields.

- [ ] **Step 2: Add passing characterization tests for current rules**

Assert:
- routine ACTIVE coverage requests D-1 through today;
- initial ACTIVE coverage begins at campaign start and uses calendar-month chunks;
- INACTIVE coverage ends yesterday;
- access errors 10/100/200 produce UNAVAILABLE without reconciliation;
- budget/status/effective status values match current output;
- a Meta resync updates spend/click fields while preserving `note` and `completed`;
- summary counters match existing behavior.

- [ ] **Step 3: Run the characterization and existing planning/reconciliation tests**

Run:
`node --test lib/filter/sync-baseline.test.mjs lib/filter/date-ranges.test.mjs lib/filter/sync-planning.test.mjs lib/filter/inactive-reconciliation.test.mjs`

Expected: PASS before production changes.

- [ ] **Step 4: Commit**

`git commit -m "test: characterize existing Meta sync semantics"`

---

### Task 2: Add Sync-Only Run, WL Progress, and Lease Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261106_add_resumable_meta_sync/migration.sql`
- Create: `lib/filter/meta-sync-state.ts`
- Create: `lib/filter/meta-sync-state.test.mjs`

**Interfaces:**
- Produces:
  - `MetaSyncRunStatus = "RUNNING" | "PAUSED_RATE_LIMIT" | "PARTIAL" | "COMPLETE" | "FAILED"`
  - `MetaSyncWlStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "SKIPPED" | "FAILED"`
  - `MetaSyncPhase = "STATUS" | "METADATA" | "ACCOUNT_SPEND" | "CAMPAIGN_INSIGHTS" | "DONE"`
  - `startOrResumeMetaSyncRun(prisma, shopeeAccountId, targetDate, now)`
  - `claimMetaSyncLease(prisma, runId, owner, now)`
  - `releaseMetaSyncLease(prisma, runId, owner)`
  - `getMetaSyncProgress(prisma, shopeeAccountId)`
  - `completeMetaSyncRunIfTerminal(prisma, runId, now)`

- [ ] **Step 1: Write failing tests for the persisted state API**

Tests must prove:
- starting creates one ordered progress row per currently linked WL;
- the target date is immutable for a resumed run;
- concurrent starts return the same active run rather than creating two;
- only one caller claims a fresh lease;
- a second caller is blocked while the lease is valid;
- only an expired lease is reclaimable;
- terminal runs release the active-run uniqueness guard;
- progress survives a new repository/service instance.

Run: `node --test lib/filter/meta-sync-state.test.mjs`  
Expected: FAIL because the module/schema do not exist.

- [ ] **Step 2: Add minimal Prisma models and migration**

Add dedicated `MetaSyncRun` and `MetaSyncWlProgress` models only. Use a database-enforced one-active-run identity per Shopee account, an expiring lease owner, fixed target date, accumulated existing summary counters, stable WL position, phase, bounded cursors, outcome, and sanitized error text. Relate them to `ShopeeAccount` and `MetaAccount` with safe cascade behavior limited to orchestration records.

Do not alter campaign, metric, import, provider, auth, or traffic models.

- [ ] **Step 3: Implement the minimal state repository**

Use atomic create/updateMany/transaction operations. Treat a unique collision while starting as a signal to read the already-active run. Never infer lock ownership from client UI state.

- [ ] **Step 4: Generate Prisma and run the state tests**

Run:
- `npx prisma generate`
- `node --test lib/filter/meta-sync-state.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: persist resumable Meta sync state"`

---

### Task 3: Extract One-WL Bounded Work Planning Without Changing Data Rules

**Files:**
- Create: `lib/filter/meta-sync-work.ts`
- Create: `lib/filter/meta-sync-work.test.mjs`
- Modify: `lib/filter/inactive-reconciliation.ts`
- Modify only if required for reusable signatures: `lib/filter/sync-planning.ts`
- Modify only if required for reusable signatures: `lib/filter/date-ranges.ts`

**Interfaces:**
- Consumes: existing `getAccountSpendHistoryStart`, `planCampaignCoverage`, `resolveEffectiveDailyBudget`, existing status/error rules.
- Produces:
  - `planNextMetaSyncUnit(progress, persistedCoverage, targetDate)`
  - a discriminated `MetaSyncWorkUnit` for STATUS, METADATA, one ACCOUNT_SPEND range, one CAMPAIGN_INSIGHTS range, or DONE;
  - bounded ACTIVE and INACTIVE work helpers with identical existing boundaries.

- [ ] **Step 1: Write failing planner tests**

Assert:
- 61 WL are represented as ordered progress, but one call selects work for only one WL;
- history from March is exposed one calendar-month unit at a time;
- a completed month advances to the next month without repeating indefinitely at the overlapped checkpoint day;
- a routine completed campaign still performs the existing D-1-through-today unit exactly once in the run;
- INACTIVE work caps every range at yesterday;
- UNAVAILABLE has no metadata/history work;
- campaign without start/checkpoint remains reported missing;
- fixed run target date prevents midnight drift.

Run: `node --test lib/filter/meta-sync-work.test.mjs`  
Expected: FAIL because the planner does not exist.

- [ ] **Step 2: Implement the pure next-unit planner**

Use persisted per-run phase/cursors only to prevent replay inside the same run. Keep campaign/account checkpoints authoritative for durable data coverage. Reuse current monthly range and campaign coverage functions; do not replace their date semantics.

- [ ] **Step 3: Refactor INACTIVE reconciliation into bounded reusable phases**

Keep its public behavior and existing tests. Separate status/metadata, account-spend range, and campaign-insight range so the batch executor can run one unit without invoking the old unbounded loop. Do not create budget snapshots for historical INACTIVE metadata.

- [ ] **Step 4: Run new and existing date/planning/reconciliation tests**

Run:
`node --test lib/filter/meta-sync-work.test.mjs lib/filter/date-ranges.test.mjs lib/filter/sync-planning.test.mjs lib/filter/inactive-reconciliation.test.mjs lib/filter/sync-baseline.test.mjs`

Expected: PASS with baseline assertions unchanged.

- [ ] **Step 5: Commit**

`git commit -m "refactor: plan bounded Meta sync work units"`

---

### Task 4: Make Persistence Safe for Large Monthly Insight Results

**Files:**
- Modify: `lib/filter/persistence.ts`
- Create: `lib/filter/persistence-batching.test.mjs`

**Interfaces:**
- Preserve the existing `persistInsightChunk(...)` observable contract.
- Add an internal bounded database write helper with a finite retry limited to Prisma P2034.
- Checkpoint update remains after every data batch succeeds.

- [ ] **Step 1: Write failing persistence tests**

Assert:
- a large monthly insight set is written in bounded transaction groups;
- every unique campaign/day row is written once;
- a P2034 retries only the failed database group with a finite maximum;
- a non-P2034 error is not retried;
- exhausted retry leaves the campaign checkpoint unchanged;
- rerunning after ambiguous interruption upserts the same rows;
- manual `note`, `completed`, commission, and Shopee click fields remain unchanged by Meta updates.

Run: `node --test lib/filter/persistence-batching.test.mjs`  
Expected: FAIL because writes are currently one unbounded transaction and have no unit retry.

- [ ] **Step 2: Implement bounded persistence groups**

Choose a fixed, tested row limit small enough to avoid oversized MySQL transactions. Retry only P2034 with finite attempts/backoff. Do not retry Meta API calls here. Advance existing campaign checkpoints only after all groups succeed.

- [ ] **Step 3: Run persistence and baseline tests**

Run:
`node --test lib/filter/persistence-batching.test.mjs lib/filter/sync-baseline.test.mjs lib/filter/inactive-reconciliation.test.mjs`

Expected: PASS.

- [ ] **Step 4: Commit**

`git commit -m "fix: bound Meta history database writes"`

---

### Task 5: Execute Exactly One Claimed Sync Unit per Server Call

**Files:**
- Create: `lib/filter/meta-sync-batch.ts`
- Create: `lib/filter/meta-sync-batch.test.mjs`
- Modify: `lib/filter/sync.ts`

**Interfaces:**
- Produces:
  - `runMetaSyncBatch({ shopeeAccountId, owner, now }): Promise<MetaSyncBatchResult>`
  - `MetaSyncBatchResult = { progress, shouldContinue, blocked, paused }`
- Consumes: state repository from Task 2, work planner/helpers from Task 3, existing Meta client and persistence helpers.

- [ ] **Step 1: Write failing executor tests**

Assert:
- one invocation performs no more than one planned unit;
- sequential invocations eventually complete 61 WL;
- GET order and stored result for the small ACTIVE fixture equal the baseline;
- successful persistence advances phase/cursor and releases the lease;
- a lost response after commit resumes at the next unit;
- two concurrent invocations issue one Meta unit only;
- status errors 10/100/200 mark UNAVAILABLE/SKIPPED exactly as baseline;
- other per-WL failure records FAILED and advances to the next WL;
- code 17 and other confirmed rate-limit codes mark PAUSED_RATE_LIMIT and do not touch later WL;
- an expired lease resumes without assuming an uncheckpointed unit succeeded;
- terminal counts produce COMPLETE or PARTIAL correctly;
- a later run retries prior failed WL while completed history remains incremental.

Run: `node --test lib/filter/meta-sync-batch.test.mjs`  
Expected: FAIL because the executor does not exist.

- [ ] **Step 2: Implement the batch executor**

Claim the server lease before any provider/DB work. Instantiate the existing Meta client only inside the claimed unit. Persist data first, then progress/cursors. Release the lease in a guarded finally path only when owner matches. Sanitize stored errors. Stop on rate limit rather than continuing across remaining WL.

- [ ] **Step 3: Retire the unbounded UI execution path without deleting domain rules**

Refactor `syncFilter` or replace its UI caller so no production Server Action can still start the all-WL unbounded loop. Retain reusable current rules/helpers and baseline tests. Use `rg "syncFilterAction|syncFilter"` to identify every caller before changing the interface.

- [ ] **Step 4: Run executor, baseline, and existing filter tests**

Run:
`node --test lib/filter/meta-sync-batch.test.mjs lib/filter/sync-baseline.test.mjs lib/filter/date-ranges.test.mjs lib/filter/sync-planning.test.mjs lib/filter/inactive-reconciliation.test.mjs lib/filter/persistence-batching.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: execute resumable Meta sync batches"`

---

### Task 6: Wire Sequential UI Progress Without Adding New Workflow Controls

**Files:**
- Modify: `app/shopee/[id]/filter/actions.ts`
- Modify: `components/dashboard/shopee-overview-sync.tsx`
- Modify: `app/shopee/[id]/page.tsx`
- Create: `components/dashboard/shopee-overview-sync.test.mjs`

**Interfaces:**
- Server Action returns the persisted `MetaSyncBatchResult`.
- Server page loads initial persisted progress.
- Existing Sync Meta button remains the only operator control.

- [ ] **Step 1: Write failing action/UI acceptance tests**

Assert:
- one click starts/resumes and calls batches strictly sequentially;
- the next batch is never requested before the previous response;
- reload shows persisted progress;
- valid server lease displays “Sync sedang berjalan” and does not call Meta twice;
- progress shows WL position/count and succeeded/skipped/failed counts;
- PAUSED_RATE_LIMIT stops the client loop and gives a clear resume-later message;
- PARTIAL and COMPLETE are directly visible;
- browser/action failure reports ambiguous display state without starting a concurrent retry;
- disabled Clickadu/Adsterra behavior and their handlers remain identical;
- mobile/desktop layout does not overflow.

Run: `node --test components/dashboard/shopee-overview-sync.test.mjs`  
Expected: FAIL before UI wiring.

- [ ] **Step 2: Replace the Meta action implementation only**

Keep authentication and existing revalidation targets. Call one bounded batch. Do not modify Clickadu/Adsterra actions.

- [ ] **Step 3: Add persisted progress to the existing Overview component**

Use the existing button/results area. Do not add a new page, provider control, or unrelated panel. Drive subsequent calls sequentially while the page is open; allow later clicks/reload to resume persisted work.

- [ ] **Step 4: Add the minimal initial-progress query**

Load only the current/latest Meta sync state for this Shopee account. Do not add N+1 WL/campaign queries to the Overview page.

- [ ] **Step 5: Run component, action-related, and existing tests**

Run:
`node --test components/dashboard/shopee-overview-sync.test.mjs lib/filter/*.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -m "feat: show resumable Meta sync progress"`

---

### Task 7: Full Verification and Scope Audit

**Files:**
- Modify only if verification identifies an in-scope defect.
- Update: `docs/superpowers/specs/2026-11-06-scalable-resumable-meta-sync-design.md` only if implementation-required clarification is approved.
- Plan remains: `docs/superpowers/plans/2026-11-06-scalable-resumable-meta-sync.md`

- [ ] **Step 1: Run targeted scale acceptance**

Use fake Meta/Prisma fixtures for:
- 61+ WL;
- multiple WL with hundreds of campaigns;
- campaign history beginning March 2026;
- ACTIVE, INACTIVE, UNAVAILABLE, and reactivated WL;
- request interruption after every phase;
- rate limit after partial success;
- concurrent callers;
- P2034;
- repeated complete runs.

Expected: every run is bounded, resumable, idempotent, and preserves baseline output.

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`

Report every failure by name and compare with the exact branch baseline; do not hide pre-existing failures.

- [ ] **Step 3: Run static/build checks**

Run:
- `npx tsc --noEmit`
- scoped ESLint for every changed TS/TSX file;
- `npm run build -- --webpack`
- `git diff --check`

Expected: PASS, except any proven baseline-only full-suite failures must be listed exactly.

- [ ] **Step 4: Audit the exact diff against the design scope**

Confirm:
- no Clickadu/Adsterra changes;
- no Meta write payload/action changes;
- no Filter/Fix/OFF calculation changes;
- no Shopee import/auth/traffic balance changes;
- no manual-field overwrite;
- no unrelated UI/layout changes;
- migration contains orchestration tables/indexes only.

- [ ] **Step 5: Independent whole-branch review**

Review concurrency, lease recovery, checkpoint ordering, midnight boundary, D-1 parity, error sanitization, query count, transaction size, and migration safety. Resolve blockers before completion.

- [ ] **Step 6: Commit any approved verification-only fixes and push**

Push only to `fix/meta-sync-scalable-resume`. Do not merge or deploy. Report SHA, exact files changed, migration, targeted/full test counts, build/static results, and known limitations.
