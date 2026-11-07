# Scalable Resumable Meta Sync Design

**Date:** 2026-11-06  
**Branch:** `fix/meta-sync-scalable-resume`

## Intent

Make the existing Meta Sync safe and usable for Shopee accounts with 61+ connected WL, many campaigns per WL, and history reaching back several months. A sync may be run repeatedly until all WL are complete. The change must optimize execution only; it must not change which Meta data is read, how metrics are interpreted, or how existing Business Tracker features behave.

## Current evidence and root cause

The current implementation processes every WL sequentially inside one Server Action request. On the Dedet Studio production project, the browser/proxy request ended after 300 seconds with HTTP 499 while server work continued. Railway logs also showed Meta error code 17 (user request limit), a Prisma P2034 write conflict/deadlock, and a P2002 unique-key collision. The data model uses checkpoints and upserts, so completed chunks were retained, but the request boundary and absence of a server-side execution lock allowed an ambiguous result and possible overlapping syncs.

History length itself is not the defect. Existing monthly chunking and checkpoints are the correct foundation. The defect is executing all chunks and all WL within one unbounded request.

## Goals

- Keep one existing **Sync Meta** entry point for the operator.
- Split a large sync into bounded, resumable server batches.
- Permit repeated Sync runs until every WL is complete.
- Allow only one claimed Meta Sync batch per Shopee account at a time, including across tabs/operators.
- Persist progress so closing the page, losing the response, deployment restart, or request timeout does not discard completed work.
- Stop safely on Meta rate limiting and allow a later resume.
- Show persisted progress, completion, partial failure, and paused-rate-limit state.
- Keep each successful chunk idempotent through existing unique keys, upserts, and checkpoints.
- Preserve performance as WL and campaign counts grow.

## Mandatory behavior preserved exactly

The implementation must continue using the existing domain rules and persistence semantics:

- Indonesia/Jakarta date boundaries.
- Existing D-1 overlap/readback behavior.
- Current-day reads where the existing ACTIVE path reads through today.
- INACTIVE reconciliation ending at yesterday.
- ACTIVE, INACTIVE, and UNAVAILABLE classification and handling.
- Rechecking previously inactive/unavailable WL on later syncs.
- Campaign and Ad Set discovery.
- Campaign start date handling and missing-start reporting.
- Campaign-level versus Ad Set-level daily budget resolution.
- Campaign `status` and `effective_status`.
- Existing history eligibility rules.
- Account daily-spend persistence.
- Campaign insight field mapping.
- Existing campaign, daily metric, account spend, and budget snapshot upserts.
- Updating Meta-owned fields without changing manual note/completed fields.
- Existing checkpoint rules, including intentional overlap needed to capture later Meta adjustments.
- Existing summaries for succeeded, skipped, failed WL, campaigns, stored rows, unresolved budgets, and missing start dates.

## Explicit non-goals

Do not change:

- Filter/Fix/OFF Filter/OFF Fix classification or calculations.
- Meta campaign OFF, Edit Budget, method controls, or any Meta write payload.
- Shopee commission/click imports.
- Clickadu or Adsterra sync, credentials, blacklist/whitelist, custom bid, or schedules.
- Dashboard calculations unrelated to Meta Sync progress.
- Authentication/session behavior.
- Traffic balances.
- Existing historical data or manual operator fields.
- Provider tokens or Railway infrastructure.
- General UI layout outside the existing Meta Sync/progress area.

No general refactor or unrelated cleanup is allowed.

## Approaches considered

### 1. Bounded resumable batches with a persisted lease and progress — selected

Keep the existing Sync Meta control. A run records a fixed target date and ordered WL scope. Short server calls atomically claim a lease, process one bounded unit, persist its checkpoint and progress, release/renew the lease, and return. The client may request the next unit sequentially. If the page closes, a later click resumes the same run.

This is selected because it stays within the existing application and Railway service while preventing the observed 300-second request and overlapping writes.

### 2. Dedicated Railway background worker

This would survive browser closure without client orchestration, but adds another runtime/service and substantially expands deployment and operational scope. Rejected for this focused change.

### 3. Manual per-WL buttons

This is simpler technically but creates operator burden and makes omissions likely across 61+ WL. Rejected.

## Architecture

### Approved client scope extension

The resumable path uses an opt-in page interface in `lib/meta/client.ts` (and focused client tests). Existing all-page methods retain their default behavior. A unit has a 45-second deadline, a 30-second HTTP deadline with 10-second request caps, and a 120-second lease. Fetch/body reads, pagination boundaries, retry backoff and Retry-After observe abort/deadline; excessive Retry-After returns an identified pause rather than waiting beyond the unit. One page cursor is persisted with the successful page; date coverage advances only after the final page. Metadata is not complete until all campaign/required Ad Set pages and bounded metadata writes finish. The lease is fenced and is released only after awaited work has stopped. No Promise.race-only cancellation is used for provider work.

### Persisted run and progress

Add sync-specific persistence scoped to one Shopee account. It records:

- run status: `RUNNING`, `PAUSED_RATE_LIMIT`, `PARTIAL`, `COMPLETE`, or terminal failure;
- run target date captured at start so D-1/today boundaries do not move mid-run;
- ordered WL scope or stable cursor;
- current WL and phase;
- bounded lease owner/expiry used for atomic claim and stale-lease recovery;
- accumulated existing summary counters;
- per-WL outcome and sanitized failure reason needed for progress display.

Only sync orchestration state is new. Existing campaign/account checkpoints remain the source of truth for completed historical coverage.

### Bounded work units

A server request processes a bounded unit rather than the entire Shopee account. Units follow the existing order for each WL:

1. Read and classify ad-account status.
2. Refresh campaign/Ad Set metadata and current budget resolution.
3. Persist one bounded account-spend date chunk.
4. Persist one bounded campaign-insight coverage chunk.
5. Mark the WL outcome and advance to the next WL.

Existing monthly range builders, coverage planning, reconciliation boundaries, persistence helpers, and checkpoint updates remain authoritative. The orchestration layer only chooses the next unit and records progress.

A single unit must return comfortably before Railway's 300-second request boundary. The implementation must not hide one unbounded loop inside a “batch”.

### Single-run safety

An atomic database lease prevents two tabs/operators from processing the same Shopee account concurrently. A fresh lease blocks the second caller with a neutral “Sync sedang berjalan” result. An expired lease can be reclaimed so a crashed request does not permanently block Sync.

This is a server guarantee; disabling the button in one browser is not treated as sufficient protection.

### Repeated runs

- A stopped or interrupted run resumes from persisted orchestration state and existing checkpoints.
- A rate-limited run remains paused and can be resumed later.
- A completed run may be followed by a new run. The new run preserves the existing D-1/current overlap rules and updates changed Meta values through existing upserts.
- Failed WL do not erase successful WL work. The run completes as `PARTIAL`; a later run retries them while completed history remains checkpointed.
- Repeated runs must never create duplicate campaign/day or account/day records.

### Meta limit handling

Existing finite retry behavior remains. When Meta still returns a rate-limit condition after those retries, orchestration records a paused-rate-limit state and stops scheduling additional units. It must not continue burning requests across the remaining WL. A later operator-initiated resume continues safely.

### Database conflicts

The server-side lease removes the primary observed source of concurrent P2002/P2034 conflicts. Any bounded retry added for a transient P2034 must apply only to the failed transaction/unit, use a finite attempt count, and never repeat a confirmed Meta write (this flow is GET-only) or the entire sync. A P2002 caused by genuine concurrent creation must be reconciled through existing unique identity/upsert semantics, not by deleting data.

### UI behavior

Keep the existing Sync Meta button and results area. Add only sync-specific progress such as:

- `WL 18 dari 61`;
- current WL/phase;
- completed, skipped, and failed counts;
- paused because of Meta limit;
- partial or complete final state.

The client calls subsequent bounded actions sequentially, never concurrently. Closing/reloading the page is safe because progress is read from the server. No new controls or unrelated layout changes are introduced.

## Data safety invariants

- No deletion or reset of existing campaign history.
- No duplicate row for `CampaignDailyMetric(campaignId, date)`.
- No duplicate row for the existing account/day identity.
- Manual `note` and `completed` values survive every Meta re-sync.
- A checkpoint advances only after its corresponding persistence succeeds.
- A failed unit does not advance its checkpoint.
- A stale lease may be reclaimed without treating an unconfirmed unit as complete.
- A later Sync can safely reread an intentional overlap and update Meta-derived values.

## Acceptance and verification

Automated tests must prove:

1. Baseline ACTIVE output is identical for the same fixture.
2. Baseline UNAVAILABLE behavior is identical.
3. Baseline INACTIVE reconciliation remains capped at yesterday.
4. D-1 overlap and current-day behavior remain identical.
5. Campaign/Ad Set budget resolution and status fields remain identical.
6. 61+ WL are processed through multiple bounded calls without a single all-WL request.
7. Many campaigns and history from March are split into resumable chunks.
8. Closing after any unit and resuming continues from persisted progress.
9. Two concurrent callers result in only one claimed unit.
10. An expired lease can be reclaimed.
11. Meta code 17 pauses the run without processing later WL.
12. P2034 retry is finite and unit-scoped.
13. Repeated runs create no duplicate metric/account-spend rows.
14. Meta resync updates Meta fields while preserving note/completed.
15. Failed WL yield PARTIAL and are retryable on a later run.
16. COMPLETE means every WL in that run has a terminal outcome.
17. Existing summary counts remain correct.
18. The existing small-account sync remains functionally equivalent.
19. TypeScript, scoped ESLint, production build, `git diff --check`, targeted tests, and the full existing test suite are run.
20. Exact diff review confirms no unrelated provider, calculation, campaign-write, auth, or import changes.

## Rollout constraints

- Implement only on `fix/meta-sync-scalable-resume`.
- Do not merge or deploy during implementation.
- Do not perform live Meta writes; this sync path remains GET-only.
- Do not perform manual production database mutations.
- Review the exact branch diff before any proposal to merge.
