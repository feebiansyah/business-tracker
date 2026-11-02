# Adsterra Replace Unblock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Automated tests are explicitly prohibited by the user; use the original helpers with fake database/provider transports for manual verification.

**Goal:** Allow a freshly confirmed Adsterra list/method operation to supersede only a completed ambiguous Custom Bid operation, without treating the old request as successful.

**Architecture:** Keep the existing single physical-campaign operation row and all normal fencing. Add one narrow reservation policy for list/method preparation, preserve bounded historical uncertainty in diagnostics, and surface one warning through the existing confirmation/result UI.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma/MySQL, existing Adsterra operation helpers.

**Spec:** `docs/superpowers/specs/2026-11-02-adsterra-replace-unblock-design.md`

## Global Constraints

- No automated tests or live provider/database writes.
- No schema, migration, dependency, API, candidate-rule, Clickadu, Meta, Sync, or import changes.
- Keep one browser confirmation and the existing compact notice/Detail UI.
- Never retry, complete, or claim success for the old ambiguous request.

## Review Focus

- RUNNING or non-FINISHED uncertainty must remain blocked.
- An ambiguous list/method operation must never be superseded by this policy.
- New Custom Bid, ON/Auto, and config writes must remain blocked.
- Protective OFF uncertainty must still block every main reservation.
- A late old provider request remains an explicit residual risk after final GET.

---

### Task 1: Bounded reservation policy

**Files:**
- Modify: `lib/adsterra-operations/operation-state.ts`
- Modify: `lib/adsterra-operations/repository.ts`
- Modify: `lib/adsterra-operations/diagnostics.ts`

- [x] Add a pure predicate for the exact completed ambiguous Custom Bid shape.
- [x] Extend reservation with an explicit list/method-only policy flag.
- [x] Use one full-row fenced CAS to supersede the old generation and retain structured unknown-outcome evidence.
- [x] Keep all default reservation behavior unchanged.
- [x] Manually verify the acceptance and rejection matrix with an in-memory Prisma-shaped fake.

### Task 2: Bind the policy to list/method confirmation

**Files:**
- Modify: `lib/adsterra-operations/service.ts`
- Modify: `lib/adsterra-operations/method-service.ts`
- Modify: `lib/adsterra-operations/types.ts`
- Modify: `components/adsterra-roi/placement-application.tsx`
- Modify: `components/adsterra-roi/campaign-method-controls.tsx`

- [x] Enable the policy only for placement application and method preparation.
- [x] Bind the historical-risk warning to the signed preparation result.
- [x] Show the warning in the existing single `window.confirm()` and preserve it in the existing result Detail.
- [x] Keep Cancel, double-click protection, exclusion flow, and provider payloads unchanged.
- [x] Manually verify Blacklist, Whitelist, method switch, rejection, timeout and campaign-1447912-shaped records with fake transports.

### Task 3: Remove obsolete recovery write surface and verify

**Files:**
- Modify: `app/shopee/[id]/adsterra-roi/placement-application-actions.ts`
- Delete: `lib/adsterra-operations/recovery.ts`
- Modify only if required by references: `lib/adsterra-operations/repository.ts`, `lib/adsterra-operations/types.ts`

- [x] Remove unused recovery server actions and confirmation purpose; keep read-only `Periksa Status` in the single notice.
- [x] Confirm no recovery write UI or normal operator dependency remains.
- [x] Run TypeScript, scoped ESLint, production build, and `git diff --check`.
- [x] Review the complete diff, commit, and push only `fix/adsterra-stuck-operation`.
