# Adsterra Placement Application Implementation Plan

> Native execution: superpowers:executing-plans. Manual mock verification replaces
> automated tests at the user's explicit instruction. One independent final review.

**Goal:** Confirmed, fenced blacklist/whitelist application and conservative recovery.
**Architecture:** Durable canonical-campaign CAS repository, bounded transport,
signed hash-only plans, server recomputation, shared writer guard and UI busy lock.
**Tech Stack:** Existing Next.js/TypeScript/Prisma MySQL, node:crypto, decimal.js.
**Spec:** docs/superpowers/specs/2026-10-29-adsterra-placement-application-design.md

## Global constraints

No real provider/DB writes or login during verification; no automated tests,
migration execution, .env/dependency/Meta/auth-shared changes, merge or deploy.
Only review-branch commit/push after checks. Write attempts never retry.

## Review focus

- Old process/request after timeout cannot obtain a new generation or unlock itself.
- Alias configurations and stale enabled-config scheduler jobs cannot bypass guards.
- Any sent request, including 4xx/timeout, gets verification; uncertainty persists.
- Custom Bid confirmation includes every removed GEO/price; no restoration.
- Opposite-list clear, replay/drift and recovery cannot silently expand the action.

### Task 1: Provider contract and operation foundation
- [x] Read official OpenAPI, existing write call sites and local Next guides.
- [x] Add types/canonical IDs, 90s budget, bounded fixed-endpoint provider adapter.
- [x] Add current-operation Prisma model + ONE migration, no cascading FK/history.
- [x] Add CAS repository and signed purpose-specific confirmation helpers.

### Task 2: Confirmed application and recovery
- [x] Prepare recomputed targets and exact precondition digests, reject empty whitelist.
- [x] Claim once; re-read; sequential clear/verify/PUT/verify/reset-bids/final GET.
- [x] Preserve result facts on metadata failure and persistent uncertain states.
- [x] Explicit signed recovery; never unlock unproven pending provider requests.

### Task 3: Coordinate existing writers
- [x] Guard Custom Bid, activation, Auto enable and legacy list action.
- [x] Scheduler re-reads identity/Auto flag under coordination; aliases canonicalized.
- [x] Protective OFF separate fenced slot; Auto disable remains available.

### Task 4: Original UI integration
- [x] Shared workspace lock; signed confirmation preview + result/recovery UI.
- [x] Preserve existing analysis/table/bid behavior; refresh Campaign list info.
- [x] Explicit preconditions, not editor-mode claims or automatic OFF/Auto changes.

### Task 5: Verification and review release
- [x] Manual isolated original-helper/component mock observations, desktop/HP.
- [x] TypeScript, scoped ESLint, build, Prisma schema validation, diff check.
- [x] Independent review and scoped fixes; document actual gaps, no false completion.
- [ ] Explicit scoped stage, commit/push feature branch only; verify refs/stash/clean.

## Execution ledger

Pre-flight: task 2 uses task 1's bounded provider and fencing repository; task 3
must use that same row before any write; task 4 consumes task 2 DTOs. No alternative
write pipeline is retained. Claims never contain provider calls/transaction retries.
Ruling: user forbids automated tests; use manual isolated mocks, not TDD scripts.
Ruling: no runtime schema application is authorized; missing operation table fails
closed, including coordinated writers, until a separately approved migration.

### Completed verification (manual, 2026-10-29)

No tests were created/run. Temporary localhost preview bundled ORIGINAL service,
store, provider, classifiers, application/recovery and UI components. Provider
fetch and Prisma delegates were injected memory mocks; no .env, real login, live
provider traffic or database writes. Screenshots remain outside the repository.

- Whitelist: explicit clear-blacklist POST then whitelist PUT, bids unchanged.
- Blacklist: explicit clear-whitelist POST, blacklist PUT, DELETE ID/GLOBAL/US
  pairs from preview, exact GETs. Same blacklist with remaining overrides performs
  DELETE, not false NO_CHANGE. Manual activation does not restore deleted bids.
- Empty whitelist: refused with no guard row or write. LIMITED, enabled alias Auto,
  CPA whitelist and unknown pricing block confirmation. Daily PUT with empty
  opposite list works while ACTIVE, without a status PATCH.
- Double-click Prepare/Execute schedules one flow. Replay, tampered/expired token,
  and preflight list drift schedule zero new writes. TTL crossing after clear
  prevents the subsequent PUT. Partial clear stops before PUT; partial PUT stops
  before bid reset. A 400 after actual clear is GET-verified and retains warnings.
- PUT timeout applied in mock: UNVERIFIED with uncertainty retained, ON blocked,
  recovery preview blocked, protective OFF independently VERIFIED without erasing
  main operation. A second pending OFF is refused. Auto disable remains possible.
  New context/clock advance does not release unresolved state.
- New unconfirmed GEO after PUT produces PARTIAL and no broader DELETE. Metadata
  failure preserves PARTIAL and actual lists/bids. Explicit stable-snapshot
  recovery advances generation without provider writes; network ambiguity stays
  blocked. Null list is invalid, never empty.
- Stale scheduler flag and changed target produce zero writes. Alias 001485934
  cannot claim physical 1485934 while PREPARED. Config move/delete against that
  guard is rejected with unchanged generation and no provider write.
- Original confirmation/workspace/protective components inspected at 1440px and
  390px: no page overflow, readable wrapping, shared target/tab lock, independent
  protective buttons remain enabled, all affected GEO/prices visible in preview.
- Final TypeScript and scoped ESLint exited 0 without warnings. Production build
  exited 0 (compile 28.0s, TypeScript 30.5s). Prisma validate and diff check passed.

### Independent review and rulings

One independent read-only reviewer inspected the local scope; no tests or live
calls by the reviewer. Unknown-pricing eligibility, observation despite DB drift,
and unavailable protective controls were identified and corrected during review.

Important config-edit race was fixed by routing ALL config save/delete actions
through coordinatedConfigChange: short DB-only claims of affected physical keys,
with rollback on busy guard. Manual move/delete/alias attempts were rejected while
PREPARED. Low-level repository functions remain internal transaction primitives;
production callers were checked with rg. No direct uncoordinated route remains.

Ruling: explicit signed recovery of RUNNING/uncertain=false is allowed, not an
automatic lease release. Reviewer found no pending-HTTP bypass: pending uncertainty
is durably stored before dispatch, and CAS recovery fences an old continuation.
Cost if wrong would be an uncoordinated write; genuinely uncertain requests are
therefore still blocked, even after matching GET.

The stale replacement timestamp finding was treated as a behavior regression
(risk of an unnecessary repeated replace), not cosmetic polish. The service now
returns the actual recorded server timestamp; the workflow updates it only when
metadata recording succeeded. No client-generated success timestamp.

Declined-to-judge rulings: live response guarantees, real MySQL isolation/restart
behavior and applied migration/production rollout were NOT exercised; mocks do
not prove those. Browser checks/build results are the native implementer's
observations, not an independent runtime review. External operators remain outside
coordination. No deferred code-polish findings; runtime limitations below remain.

### Remaining operational gates

- Migration 20261029090000_add_adsterra_campaign_operation is NOT applied. All
  guarded runtime writers fail closed until separate migration approval.
- No live provider write, validate_only, Sync/import, session creation, or real
  database mutation was performed. Matching provider-dashboard behavior remains
  unverified; the protocol is based on the official OpenAPI source.
- Ambiguous old network/DB requests cannot be proven stopped through GET. Their
  recovery remains blocked pending a separately reviewed proof/operational path;
  this branch does NOT claim complete operational recovery or production readiness.
- Rollout must review/apply the migration separately and drain older application/
  scheduler binaries without this guard before enabling use. Code cannot retroactively
  coordinate an already-running old binary or direct external Adsterra changes.
- The final release checkbox is executed only after this documentation snapshot;
  Git commit/upstream and the delivery report are the release record.
