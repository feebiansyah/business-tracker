# Adsterra review hardening implementation plan

> Native execution with superpowers:executing-plans; one independent final review.
> Explicit user override: no automated tests; manual original-code mocks only.

**Goal:** Resolve proven non-dispatch markers, fence replacement metadata, and
refresh authoritative Campaign status/Auto after protective actions.
**Baseline:** f56138cf9fc060ed3e3433db7d800542de61bdb4, feature/adsterra-placement-lists.
**Architecture:** Confirmed marker receipts plus fenced CAS settlement; short
DB-only metadata transaction; revision/sequence-guarded client refresh.
**Tech stack:** Existing TypeScript, Prisma/MySQL and React/Next.js.
**Spec:** Three user review findings and existing placement-application design.

## Constraints / review focus

- Never release HTTP/DB ambiguity or another generation by sent===0 or matching GET.
- A marker receipt exists only after persistence is acknowledged. Settlement
  checks the same operation/generation/phase, and is impossible after dispatch.
- Metadata locks/checks operation and original campaign in ONE short transaction.
- Protective OFF/Auto disable remain outside the busy lock. Old reads and action
  results must not overwrite a newer authoritative refresh.
- No live provider/DB writes, login, Sync, tests, migration, .env/dependency changes.
- Preserve main, Meta branches, stash and Clickadu; commit/push feature branch only.

## Tasks

- [x] 1. Confirmed marker receipt, atomic not-dispatched settlement, actual HTTP
  entry tracking; preserve unresolved DB/HTTP failure and changed-generation locks.
- [x] 2. Fenced metadata transaction and service/action integration; inspect old
  recovery generation and moved config, success, rollback and failure reporting.
- [x] 3. Lock-independent refresh revision, authoritative Auto read with status,
  latest-response guards; original UI desktop/phone with reordered fake actions.
- [ ] 4. TypeScript, scoped ESLint, build, Prisma validate, diff check, independent
  read-only review; scoped stage/commit/push and verify protected refs/stash.

## Ledger

Pre-flight: task 1 produces marker proof used only by the provider. Task 2 uses the
same fence, never HTTP in a transaction. Task 3 shares revision, never claims or
releases the main lock when a protective action completes.
Ruling: the user's no-automated-tests requirement replaces TDD/test-runner steps
with manual mocked observations, not a claim of automated regression coverage.
Ruling: marker persistence/settlement DB ambiguity stays blocked. Even a known
non-dispatch does not prove an underlying pending database query was cancelled.

## Actual verification / independent review

No automated tests were created/run. A temporary localhost console bundled the
original repository/provider/budget, metadata, recovery and coordinated writer
helpers, plus original Campaign/ProtectiveControls/operation-context components.
Provider transport and Prisma delegates were replaced with in-memory fakes; live
fetch was blocked and project env/login/real database were never loaded there.
This is manual mock evidence, not proof of MySQL/provider live behavior.

- Last validation rejected after marker acknowledgment: zero HTTP writes,
  protective slot RECONFIRM_REQUIRED/uncertain=false. TTL expiry behaved likewise.
- Work deadline at 86s: zero HTTP writes, reserved cleanup completed within the
  original 90s deadline and resolved the OFF slot. No background continuation.
- OFF/AutoDisable interleaving: Auto disabled without erasing the OFF slot; known
  scope drift settled without HTTP. Concurrent original UI actions also produced
  verified INACTIVE and Auto=false with the main UI lock still held.
- HTTP timeout after fake apply: GET saw INACTIVE, but protective slot remained
  UNVERIFIED/uncertain=true. Matching GET did not release it.
- Pending DB marker and pending cleanup: stayed RUNNING. Releasing the late marker
  made uncertainty true; releasing late cleanup persisted proof but left RUNNING,
  never automatically advancing to terminal state. No HTTP write was dispatched.
- Changed OFF generation rejected settlement and left the new fence untouched.
  After one acknowledged PUT, rejection before the next dispatch yielded PARTIAL,
  not RECONFIRM_REQUIRED/reusable state; only one PUT was sent.
- Current metadata transaction wrote timestamp. Signed recovery then coordinated
  config move to another physical ID made the old fence's timestamp write fail
  before config UPDATE. Wrong-physical target also rolled the transaction back.
- Original UI at 1440px/390px: protective actions stayed enabled under main lock,
  status/Auto refreshed, delayed old status response was ignored, no page overflow.
  Disconnected AutoDisable changed checked=true to false, showed unknown provider
  status rather than OFF, and sent no provider request. Screenshots outside Git.

Independent read-only reviewer found two Important gaps: deadline cleanup and
disconnected Auto refresh. Both were fixed in one scoped pass. The stale action
message finding was treated as a correctness issue: an old 'activated' message
after protection is misleading, so messages/errors share revision fencing too.

Ruling: reserve 5s of the original 90s action budget for receipt-proven cleanup;
ordinary work stops at 85s. Cleanup first persists proof while retaining RUNNING,
then completes with fenced CAS only after proof persistence is acknowledged. A
late uncertain cleanup alone cannot release the guard. Earlier dispatched steps
keep PARTIAL; no earlier dispatch plus confirmed receipt may require reconfirmation.
Cost if the proof/fence were wrong: unsafe release; uncertainty/generation failures
therefore remain fail-closed instead of relying on sent===0 or GET alone.

Ruling: source review cannot establish live MySQL isolation, provider cancellation,
or live deployment safety. Those remain unverified. The previous unapplied
migration and ambiguous-request recovery/old-binary rollout gates still apply.

Final source checks: npx.cmd tsc --noEmit PASS; scoped ESLint PASS without warning;
npm.cmd run build PASS (compile 8.1s, TypeScript 13.3s); Prisma validate PASS; diff
check PASS. Initial build failed fetching Google Fonts in the restricted network;
the identical-source retry with network access passed, without config changes.
The final release step is recorded by the subsequent Git commit/upstream check,
not an assertion that migrations, real provider writes or deployment were tested.
