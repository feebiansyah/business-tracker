# Adsterra practical Campaign / Placement flow

Baseline: origin/main `e10d5efcf36c974ff6e1702e0668039ae2861f1a`.
User supplied the final design and explicitly waived further design/phase questions. Native implementation, no automated tests.

## Decisions

- Campaign method selection prepares a signed preview inside one dialog. Confirming an actual change disables every physical-campaign alias Auto flag in a short fenced DB transaction, verifies OFF, clears each nonempty list once, verifies exact empty lists and unchanged bids, then commits the new method. No HTTP in DB transactions, retries, bid reset, or automatic reactivation.
- Initial adoption of a compatible nonempty list is read-only at the provider. Initial Blacklist with two verified empty lists is also adoptable while ACTIVE and becomes usable after explicit confirmation. Initial empty Whitelist stays unready. Selecting the same method never resets lists or silently approves drift.
- A completed PARTIAL/FINISHED record with uncertainty=false can be atomically superseded by a fresh operation. Its failure evidence is retained. RUNNING/UNVERIFIED, ambiguous HTTP/DB or pending protective OFF remains blocked regardless of elapsed time or matching GET. No automatic recovery or resumption.
- Legacy unselected campaigns keep basic activation/Auto behavior under the same physical-campaign guard. Selected methods still enforce readiness; empty Whitelist and unfinished changes block activation. Protective OFF/Auto-disable stay reachable outside the UI lock.
- Placement keeps server method/version validation, one impact confirmation, positive whitelist eligibility and existing blacklist bid reset. Old method-switch tokens cannot authorize the expanded reset flow.
- Documented error IDs are intersected with the confirmed PUT target and bounded before DTO/persistence. “Not suitable tags” is a provider eligibility rejection, not evidence about application sourceTag. Successful bid reads remain successful independently of list application outcome.

## Work / verification

1. Preserve repository state; audit method, guard, scope, activation and UI paths plus official whitelist contract.
2. Implement narrowly scoped guard completion/evidence retention, method reset orchestration and authoritative alias disabling with the existing schema.
3. Simplify Campaign/Placement confirmation and status UI; preserve safe controls and late-response/lock behavior.
4. Manually inspect original helpers/components through fake provider and DB transports: adoption, both switches, legacy activation, empty Whitelist, rejection/partial/timeout, existing terminal records, alias drift, bid preservation, replay and stale responses. No real provider/business DB writes or login.
5. TypeScript, scoped ESLint, build, Prisma validate, diff check and independent review. Commit/push repair branch, integrate only it into current main and observe the existing Railway deployment to a terminal state and matching SHA. No extra redeploy.

## Constraints / risks

No schema/migration/dependency/env changes. No changes to Meta, Clickadu, importer, ROI thresholds, scheduler timing or credential handling. Provider operations are not atomic against external operators; ambiguous writes remain blocked and never retried. Release success does not establish live whitelist acceptance for campaign 1485934.

## Verification evidence (2026-10-30, before release)

- TypeScript, scoped ESLint, production build, Prisma validate and diff check passed on final source. No automated tests created/run. Build generated Prisma Client only; no migration or business DB access.
- Manual Node console used original store/provider/method/application helpers with in-memory DB and a fake HTTP transport (no forwarding). Initial ACTIVE + empty Blacklist adopted with zero provider writes and Auto unchanged. Both method switches verified OFF, disabled both canonical/leading-zero aliases, cleared only the nonempty list and preserved three ID/GLOBAL/US overrides. Same-method selection caused no write/reset.
- Original whitelist application succeeded with one PUT and unchanged bids. Original blacklist application reset all confirmed GEO overrides and preserved an unrelated placement bid. A fake 422 captured only rejected IDs in the confirmed target; known PARTIAL/FINISHED allowed fresh confirmation and retained prior diagnostics. Replay and precondition drift rejected without extra write.
- HTTP timeout after applied clear stayed UNVERIFIED/uncertain despite matching empty GET. Fake DB timeout left uncertainty and zero provider writes. Receipt-proven validation failure after marker persistence (after an earlier OFF) settled PARTIAL/FINISHED with uncertainty=false, and allowed fresh confirmation. Empty stored Whitelist blocked activation; no local method allowed legacy activation.
- Original Campaign and Placement components were manually inspected in isolated Chrome at 1440px and 390px, with local fake server actions backed by the original helpers. Confirmations displayed reset/OFF/Auto/bid impacts, OFF/Auto-disable remained enabled, one double-click sent one execution/PUT, and status/Auto reflected the verified reset. Mobile document width remained 390px; dialog width 374px. Screenshots/preview artifacts are outside Git. No login, real provider write, Sync or database mutation.
- The original analysis workflow and placement table were also mounted against fake actions: after a rejected Whitelist application, ID/GLOBAL prices remained visible, no false bid-loading error appeared, bid writes were disabled, and manual bid GET remained available. Late-response/revision checks and analysis invalidation were reviewed in source; a multi-process browser race was not reproduced live.
- Independent read-only review found three issues (overlapping ON/protective exception settlement, known non-dispatch completion, final signed expiry); these were fixed and re-reviewed without a definite remaining safety blocker. Real database contention, external-operator races and live provider eligibility were not exercised.
- Official `partners-api.yml` confirms PUT `/advertiser/linking/whitelist.json`, `campaign_id` plus `placement_ids`, and per-placement `Not suitable tags` validation errors. Nothing proves this reason refers to application sourceTag. Production 1485934's supplied 422 remains unresolved provider eligibility; no live retry was performed and acceptance is not claimed.
