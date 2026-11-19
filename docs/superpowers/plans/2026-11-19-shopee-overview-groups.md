# Shopee Overview Groups Implementation Plan

> Execute inline using superpowers:executing-plans; tests first.

**Goal:** Authenticated users manage disjoint reporting groups; individual operations remain unchanged.
**Architecture:** Additive group/member tables, transactional membership repository, separate bulk reporting queries and route. Existing account Overview is untouched.
**Tech Stack:** Prisma/MySQL, Next Server Actions, React, existing financial helpers.
**Spec:** Approved user requirements in this conversation.

## Constraints and review focus
- No automatic groups or account/data moves. No combined Sync/import actions.
- Membership races: account row locks sorted by ID, unique account membership, rollback on conflict.
- Missing per-account/date coverage must not become zero or be hidden by another member's import.
- Aggregate sources separately to avoid fanout; sort/page only after grouping.
- Keep balances per account; warn on provider campaign IDs overlapping across members.
- Main keeps read-only Traffic reports; Dedetstudio must not regain daily Traffic.

## Task 1: Membership
- [x] Add failing repository/migration tests, run red.
- [x] Add group/member schema and additive migration; repository save/delete transactions with server validation and locks.
- [x] Run green; validate schema and generated migration diff.

## Task 2: Bulk reporting
- [x] Add failing tests for aggregation/coverage/pagination, constant query count and branch-specific Traffic.
- [x] Implement separate member/date CTEs, aggregate financials using existing formulas, note/WL bulk reminders and origin-labelled provider history.
- [x] Run green. Do not change individual query or page.

## Task 3: Authenticated UI/navigation
- [x] Add failing action/UI tests for auth, membership forms, shared desktop/mobile menu and read-only report.
- [x] Implement Settings form/actions, group route/report, group navigation props from AppShell to shared panel.
- [x] Verify green and browser fixtures desktop/mobile.

## Task 4: Port/verify/release
- [x] Port only equivalent files to Dedetstudio; omit main-only Traffic renderer/query.
- [x] Targeted tests, TypeScript, scoped lint, Prisma validate/diff, webpack build, diff check.
- [ ] Review exact diff, commit/push separately, verify existing auto-deploy migrations/app and login HTTP 200.

## Verification record
Feature/targeted regression tests, desktop/mobile fixtures, TypeScript, lint, schema validation, additive migration diff and webpack build passed. Individual Overview source is unchanged. Full-suite comparison stalls in existing meta-sync-batch.test.mjs on both baseline and feature; no full-suite green claim. Independent review found incomplete Traffic totals; corrected in the new main-only report with a failing-then-passing fixture. Balances remain per account, with no automatic group creation.
