# Meta campaign OFF implementation plan

Goal: implement the user's Stage 2 specification on branch feature/meta-campaign-controls-off, baseline 33b7d92ab75f6955d21c71d29b228e06781df514.

Architecture: reuse scoped SELECT lookup and the hierarchy reader. Prepare a short-lived, actor-bound signed confirmation digest; rebuild the live plan before execution. Only the server-only mutation client may POST status=PAUSED. No database writes or snapshot persistence.

Stack: existing Next.js Server Actions, TypeScript, native dialog, node:crypto; no dependencies.

Constraints: no automated tests or live provider writes during development; no OFF/validate_only live, Sync, database/schema/env/deployment changes. Commit/push only the feature branch after checks. Preserve main, read-only branch, and stash.

## Tasks

- [x] Add shared action budget/fetch envelope (60s including auth/lookup, 100 Meta requests, max two in flight, 10s per request); readonly waits may expire without cancelling DB, mutation pipeline must never be detached by Promise.race.
- [x] Add minimum scoped object reads, typed plans and signed confirmation (existing server secret, five-minute expiry, actor/scope/IDs/names/parent/status digest). Full OFF requires complete valid hierarchy; single OFF reads only target/necessary parent.
- [x] Add sequential PAUSED-only execution: campaign gate, per-object scope proof, POST without retry, GET verification, honest ambiguous/partial/not-attempted outcomes, relevant final read and new-object detection. Reject provably oversized request plans before any POST.
- [x] Add authenticated prepare/execute actions with readOnly auth and scoped SELECT only. Rethrow auth redirects; do not update DB metaStatus.
- [x] Add modal confirmation and results, immutable target identity and local lock for prepare/execute; block refresh/close/target switching and duplicate clicks. Keep history and distinguish configured/effective statuses.
- [x] Manually inspect actual helpers/components through isolated mock desktop/mobile. Cover all three actions, changed/partial hierarchy, wrong relation, denied permission, ambiguous POST, failed verification, timeout, limits, double clicks, and final-read drift. All provider/database boundaries mocked.
- [x] Run TypeScript, scoped ESLint, production build, diff check; fresh read-only code review. Release handoff: explicitly stage feature files, commit and normal push only the feature branch after this final pre-commit review.

## Review focus

1. No late auth/lookup/GET may schedule a POST after action deadline.
2. An ambiguous POST may still apply; never retry, roll back, or claim verified without GET.
3. Children configured ACTIVE under a paused parent still require their own pause.
4. Confirmation must fail closed on actor, scope, target, membership, parent, name/status drift or expiry.
5. Final new objects are never silently added; incomplete final verification is not full success.

Local UI locks and stateless confirmations do not provide cross-tab/process exactly-once execution or control external Meta operators. POST live remains unverified until separately authorized.

## Manual verification record (2026-10-28)

No automated tests were created or run. A disposable localhost sandbox outside the repository bundled the actual actions, helpers, Filter table, and modal. Only auth headers/cookies, Prisma SELECT results, Graph transport, and sandbox clock were mocked; the transport never delegates to live fetch. No real database or provider requests were made.

- ALL: campaign then two ad sets then three ads; six unique POSTs, configured PAUSED confirmed by GET and final read (30 Meta requests).
- ADSET: one POST, campaign/ads/sibling configuration unchanged (5 requests). AD: one POST, all parents/siblings unchanged (9 requests).
- Parent already PAUSED / children ACTIVE: campaign skipped; every child paused independently (27 requests). 2,602 already-paused descendants: complete preflight/final pagination, zero POST, 56 shared requests.
- Changed confirmation membership, invalid scope/signature, incomplete hierarchy, orphan relation, repeated cursor, >5,000 children, and provably oversized active plan: no POST.
- Non-PAUSED configured-status drift or missing status immediately before write: no POST; subsequent objects remain NOT_ATTEMPTED. Parent drift after an ad POST: UNVERIFIED and no later writes.
- Parent permission rejection: FAILED, descendants NOT_ATTEMPTED. Ambiguous POST applied: GET can verify PAUSED, no POST retry. Ambiguous POST not applied or verification denied: PARTIAL / UNVERIFIED, descendants stopped. One child rejection retains other outcomes.
- New final object: PARTIAL, new object never written. Final ads read failure: PARTIAL, no complete claim.
- Shared deadline advanced only inside the sandbox during an in-flight POST: one attempted POST, UNVERIFIED, remaining objects NOT_ATTEMPTED, no late continuation. Slow auth/lookup expire with zero Meta requests even after the mocked database promise is released. Expired session preserves the Next.js redirect. Timers cleaned up.
- Rate limit with Retry-After beyond budget: no retry. Transient GET timeout: at most one retry. Optional diagnostics unavailable: basic hierarchy remains readable; no false "no issues" claim.
- Actual UI inspected at 1440px and 390px: confirmation names/IDs/counts, horizontal result-table scroll, no page overflow, keyboard Enter/Tab/Escape and focus return. Three clicks produced one execution. Pending close/Escape, refresh, actions, and target buttons locked; backdrop uses the same synchronous ref guard by code inspection. Native closedby=none plus Escape prevention covers noncancelable dialog cancellation.
- Delayed campaign A result after closing/reopening campaign B: B remains displayed. No hierarchy request before opening; no polling or automatic Sync.

Independent read-only code review initially found status-drift, integrity-stop, and cumulative object-cap issues; all three were corrected and re-reviewed with no remaining Critical/Important findings. TypeScript, scoped ESLint, production build, and tracked diff check pass on final source. Production build initially blocked by a user process loading the Prisma DLL; rerun after the user stopped dev passed (Next compile 8.5s, built-in TypeScript 11.6s, all four static pages generated). No live OFF/permission-write validation is claimed.

Provider contract checked against the official Meta Business SDK: [campaign](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/campaign.js), [ad set](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ad-set.js), [ad](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ad.js), and [node update POST](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/abstract-crud-object.js). This is not proof of the configured token's live write permission.
