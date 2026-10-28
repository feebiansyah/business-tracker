# Meta daily budget controls — approved bounded design

Baseline: `cb18360c32637da7610b236381cc8531188d2298`.
Branch: `feature/meta-daily-budget-controls`.

Goal: edit exactly one proven campaign/adset daily budget in IDR, with signed
confirmation, fresh preconditions, GET verification and the existing OFF lock.
The user's detailed task is the approved specification. No automatic tests,
database writes, live Meta writes, migrations, environment changes or deployment.

## Plan

1. Audit official currency/budget/typed-edge contracts; implement exact money and
   conservative source eligibility. Expected: unknown/lifetime/schedule/non-IDR
   configurations are read-only, not silently normalized.
2. Implement isolated budget GET/POST transport, signed plans, authenticated
   actions and shared action budget. Expected: only one `daily_budget` field can
   be written, with fresh scope/type/source/amount checks and final exact GET.
3. Integrate on-demand budget controls and shared OFF/budget modal lock.
   Expected: one confirmation, no per-keystroke requests, no Ad budget editor.
4. Manually exercise actual helpers/components against an isolated mock
   transport; run TypeScript, scoped ESLint, build and diff checks; fresh review.
5. Explicitly stage reviewed feature files, commit and push only feature branch.

## Official contracts

- https://developers.facebook.com/docs/marketing-api/currencies/
  Official table: Indonesian Rupiah / IDR / offset **1**. Therefore API
  `daily_budget="500000"` corresponds exactly to `Rp500.000`, not Rp5.000.
- https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/
  Campaign daily budget is shared by its adsets; budgets are at campaign OR
  adset level, not both. Budget writes are unsigned integer subunits.
- https://developers.facebook.com/docs/marketing-api/reference/ad-account/minimum_budgets/
  Minimum daily budgets depend on billing/bid conditions. Do not invent a fixed
  IDR floor or silently increase an amount; Meta remains authoritative.
- Official SDK: facebook/facebook-python-business-sdk, `campaign.py`, `adset.py`,
  `adaccount.py`, `minimumbudget.py`: fields, POST daily_budget unsigned int,
  schedule/sharing fields and typed `/campaigns`, `/adsets` edges.

## Execution ledger / rulings

- Ruling: execute the user's already-approved design without another design
  approval round — requested explicitly — no additional scope is inferred.
- Ruling: no automated tests/TDD scripts — explicit user prohibition overrides
  skill defaults. Manual mock observations are not reported as automated tests.
- Ruling: missing/null/invalid budget or schedule evidence is not zero/false —
  fail closed; some valid but incompletely exposed Meta configurations may remain
  read-only until their source can be proven.
- Ruling: no hardcoded universal minimum — official minima depend on delivery
  conditions; provider rejection is preserved, without rounding/auto-adjustment.
- Preparation: clean working tree, exact baseline verified; branch created.
- Contract audit: public official pages returned HTTP 200; IDR offset 1 verified.
- Implementation: isolated budget modules/actions, exact integer input, on-demand
  UI and common OFF/budget lock. Initial TypeScript and scoped ESLint pass.
- Live read-only audit: four HTTP 200 GETs with existing v25.0 config. Nipon /
  CECEKADES `120254300922790170`, WL `1117493900402351`, IDR, sharing TRUE;
  set `120254300922800170` daily `500000`, lifetime `0`, schedule FALSE.
  Campaign daily/lifetime fields were MISSING: source remains UNKNOWN/read-only.
  No live write, permission-write proof or dashboard amount comparison claimed.
- Final review: fresh reviewer found confirmation expiry could pass during slow
  preflight. Fixed: retain signed expiresAt and recheck before POST. Manual mock
  showed RECONFIRM_REQUIRED after preflight crosses expiry, zero POST.
  No Critical findings or deferred minors.
- Final: Ruling: reviewer excluded live permissions/minima, external atomicity,
  historical OFF backend and runtime checks — verify available read-only evidence
  and own runtime checks; no live-write/cross-process guarantees are claimed.
- Ruling: user's integration choice is already explicit: commit/push feature
  branch only for review. No merge, deployment, main update or automatic PR.

## Actual verification (2026-10-28)

- Resume after approval usage limit: prior commit command was not executed;
  branch/HEAD and all eleven staged files preserved, no unstaged changes.
  No implementation repeated or changed. TypeScript, scoped ESLint, production
  build and staged/unstaged diff checks rerun successfully before publication.
- TypeScript `npx.cmd tsc --noEmit`: exit 0.
- Scoped ESLint, all ten feature source files: exit 0.
- `npm.cmd run build`: exit 0, Prisma generation and Next production build pass.
  No migration or database write invoked.
- Automated tests: neither created nor run, per instruction.
- Interactive sandbox used actual actions, helpers, modal and OFF controls.
  Transport hard-blocked live network; auth/SELECT and provider state in memory.
  Browser desktop 1440px and mobile 390px inspected, screenshots outside repo;
  no page overflow. Only mock writes, no real Meta or database writes.
- Campaign daily edit verified one-field POST, exact 500000 -> 750000. Sharing
  enabled set edit changed only 150000 -> 350000, sibling stayed 150000 and
  campaign stayed zero. Summary 300000 was display-only.
- Missing/null campaign fields, lifetime, schedule, unknown/unsupported schedule,
  contradictory sources and non-IDR all blocked prepare. Wrong kind (Ad ID as
  adset), wrong Shopee scope, wrong signature, OFF token and expired token: no POST.
- Exact Rp500.000 -> 500000 -> Rp500.000. Fraction, comma, exponent, zero,
  negative and unsafe-range inputs rejected. Invalid browser submit/typing made
  no request. Already-matching amount returned ALREADY_MATCH, no POST.
- Drift in old amount/currency returned RECONFIRM_REQUIRED. POST rejection or
  unapplied timeout remained UNVERIFIED. Applied timeout and rejected response
  followed by matching GET returned VERIFIED, preserving uncertainty/denial and
  explicitly not attributing cause. Failed GET/changed final relation: UNVERIFIED.
- Paged read completed; failed second page stayed partial and blocked prepare.
  Forty one-row adset pages required 43 preflight reads: rejected before POST
  because verification reserve would exceed 100 requests. Observed concurrency 1.
- Delayed auth/lookup expired at shared deadline: zero Meta requests even after
  late DB resolution, timers cleared, expired session kept Next redirect, no DB
  cleanup write. Pending POST at deadline returned UNVERIFIED, one attempt only.
- Shared lock disabled OFF, budget, Refresh, close and target buttons during
  write. Double-click produced one POST, Escape did not close. Cancel/success
  released lock. OFF confirmation blocked budget; mock OFF still verified.
- Initial table mount made no preview/budget request. Forced unmount of pending
  A and opening B: late A did not overwrite B. No secret found in rendered modal.
- Remaining limitation: current live sample lacks campaign budget fields, so it
  is intentionally read-only. No live write permission/minimum acceptance or
  provider dashboard comparison has been verified. External operators can race
  between GET and POST; no atomicity/exactly-once guarantee.

## Review focus

Typed object proof versus browser kind; ambiguous missing budget fields;
campaign/set source conflicts; exact IDR conversion and signature purpose;
stale preconditions and late responses; budget admission before POST; final GET
after rejected/ambiguous POST; common confirmation lock; no DB/live write paths
in mock verification. External Meta operators remain outside application locks.

## Follow-up: positive evidence for shared adset budgets

Baseline `edbba219f78d8b444c4fd0ef534c7485b23f69d7`. Official v24 changelog
read via public GET (HTTP 200):
https://developers.facebook.com/docs/graph-api/changelog/version24.0/
Adset budget sharing is intended for campaigns not using campaign budget.
Sharing TRUE plus a proven daily-budgeted set and a complete list now proves
ADSET mode when campaign amounts are zero or unavailable. Missing/null remain
unchanged; they do not prove mode without that positive evidence. Positive
campaign budgets conflicting with sharing, invalid amounts, active lifetime and
active/unknown schedules still block saving. Existing signed preconditions,
verification and OFF behavior are unchanged.

Live GET audit: same CECEKADES target, v25.0, IDR, sharing TRUE, campaign budget
fields MISSING, set daily 500000/lifetime 0, schedules FALSE, list complete.
Original modal rendered in a temporary local GET-only preview using actual Meta
data, not mock data: one enabled form for set `120254300922800170`, no campaign
editor. Browser inspected at 1440px/390px; screenshots kept outside repository.
The preview read hierarchy with 3 GETs and budget with 4 GETs. All mutation
handlers blocked at its boundary; no POST/validate_only or database write.
This verifies actual data/rendering, not a fresh end-to-end application login
or successful live budget write.

Manual mock observations: campaign mode, explicit-zero adset mode, shared mode
with MISSING/NULL preserved, conflicts, invalid/absent evidence, lifetime and
schedule guards; configuration changes after confirmation returned
RECONFIRM_REQUIRED without POST, including a change to another valid ADSET
configuration. No automated tests created/run.
Final TypeScript, scoped ESLint and production build passed. The first build
hit a Prisma DLL lock from this audit's own live-preview process; that process
was closed and the full build passed on retry. No user process was stopped.
