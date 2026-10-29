# Adsterra campaign-owned method implementation plan

> Native execution: superpowers:executing-plans; one independent final reviewer.
> User override: no automated tests; manual original-code mocks instead of TDD.

**Goal:** Campaign-only method control, Placement following it, verified readiness
gating every new activation without changing existing preferences automatically.
**Architecture:** Additive metadata on canonical operation row, V2 signed plans,
fenced invalidation/finalization and shared read-only method DTOs.
**Tech stack:** Existing Next/React/TypeScript/Prisma/Decimal, no dependencies.
**Spec:** docs/superpowers/specs/2026-10-29-adsterra-campaign-method-design.md

## Constraints / review focus

- No GET writes, mode inference or unknown-as-empty; storage unavailable != unset.
- Before dispatch, version/readiness invalidation is durable and never rolled back.
- Only exact own internal transition is exempt from precondition comparison.
- Final ready publication, timestamp and guard completion are one fenced commit.
- Stale browser kind/token/alias/scheduler/recovery cannot bypass method readiness.
- Original marker/non-dispatch/uncertainty and protective slots remain effective.
- No real write/login/Sync/tests/migration/.env/stash/main/Meta/Clickadu changes.

## Tasks

- [x] 1. Add five schema fields + additive migration; pure method parsing/readiness
  helpers; repository invalidation/finalization and V2 confirmation contract.
- [x] 2. Campaign prepare/execute/cancel method service: adoption, inactive switch,
  opposite clear only, verified unchanged bids, unready switch finalization.
- [x] 3. Placement server method validation, internal version transition, no clear;
  atomic final timestamp/readiness/guard commit; recovery invalidates only.
- [x] 4. Coordinate all ON/AutoEnable routes with live approved-list checks under
  existing guard; preserve OFF/AutoDisable, preferences and bid semantics.
- [x] 5. Campaign information/read-only batch and method controls; Placement reads
  server method, removes independent dropdown, sequence/revision protects state.
- [x] 6. Original-code manual mocks desktop/HP and failures/races; final checks,
  independent review, scoped commit/push and verify protected refs/stash/clean.

## Ledger

Pre-flight: method parser feeds snapshots, UI and activation; repository version
transition feeds both execution services; finalization consumes only verified
provider facts. No provider calls occur inside finalization/flag DB transactions.
Ruling: reuse existing canonical row rather than new settings/history table.
Ruling: both-nonempty lists fail closed; same-method Campaign request cannot bypass
Placement's confirmed blacklist bid reset or bless externally changed lists.
Ruling: no repeated design questions; the user already specified native execution,
storage, rules, lifecycle and review-branch publication. Automated tests forbidden.

## Implementation and manual observation ledger

- All work is on the specified feature branch, starting at
  `6e8a8be57da5fdf01751bf480a49b58a4566deab`; initial tree was clean.
- Additive migration `20261029160000_add_adsterra_application_method` is a file
  for review only. Neither it nor the earlier guard migration was executed.
- Official public OpenAPI `CampaignInfo` was read; it contains no editor-mode
  field. Counts and application method remain explicitly different concepts.
- Review independent of the author found two Important UI issues: pending
  Placement confirmation unmounting on protective revision, and recovery
  unavailable for a null-method failed first setup. Both were fixed. Confirmation
  and outcome stay mounted; Campaign offers recovery without CSV/analysis/method.
- Original components and helper/services were bundled into a disposable local
  observation console. Prisma was replaced with an in-memory delegate; every
  provider request used a fake fetch transport; session/login was blocked and no
  project environment was loaded. No assertions, test runner or automated test
  suite was created/run. Console operations and browser controls were selected
  manually. Scratch bundles/screenshots are outside the repository/commit.

Observed using the original server helpers with fake transports:

| Observation | Actual result |
| --- | --- |
| Initial existing Blacklist adoption while ACTIVE | VERIFIED, version 1, ready true, zero provider writes |
| Replayed confirmation | Rejected as consumed |
| Switch while ACTIVE | Blocked before clear |
| INACTIVE Blacklist -> Whitelist | One clear, all ID/GLOBAL/US bids preserved; method Whitelist, ready false |
| Empty initial Whitelist | Stored unready; manual ON and AutoEnable blocked |
| Whitelist apply then ON | PUT only positive candidate 102; ready atomically true; subsequent ON allowed |
| Wrong browser kind | Rejected before planning/application |
| External list drift | LIST_CHANGED; ON rejected; GET did not update approval |
| Recovery | Method preserved, version increased, ready false; old token rejected |
| Already-blacklisted placement with three GEO bids | One DELETE containing only confirmed ID/GLOBAL/US; exact final GET; ready and timestamp finalized |
| Clear timeout after fake provider applied it | UNVERIFIED/uncertain; matching GET did not unlock recovery |
| Metadata failure after bid reset | PARTIAL/FAILED; ready false, timestamp transaction rolled back |
| Expiry after acknowledged marker, before dispatch | RECONFIRM_REQUIRED; zero HTTP writes, fenced marker settled |
| DB marker query timeout then late commit | Initially RUNNING, later uncertain true; no HTTP dispatch; guard remained blocked |
| Recovery generation followed by config move and old finalizer | Fencing rejected; new campaign timestamp remained null |
| Storage unavailable vs GET 404 vs both lists filled | UNAVAILABLE vs nonempty/unknown read status vs CONFLICT; no guard records created by GET |
| Canonical alias with Auto enabled | Shared metadata; empty initial method assignment blocked by other alias Auto |
| Whitelist no positive candidates | Rejected, zero writes, no version change |
| Explicit empty Blacklist apply | NO_CHANGE, then ready true; readout warns no placements are excluded |
| Protective OFF and AutoDisable together | INACTIVE verified, Auto false, OFF slot verified; main method metadata preserved |
| TTL expires during read-only adoption preflight | RECONFIRM_REQUIRED; version remains 0, no method/readiness/provider write |
| TTL expires before adoption finalization | UNVERIFIED, method remains null, incremented version remains unready |

Observed through original browser components at 1440px and 390px:

- Campaign shows method/readiness and independent list counts/timestamps; no
  independent method dropdown remains in Placement.
- Initial ACTIVE adoption preview/confirm worked, shared controls disabled, and
  the confirmation itself remained usable outside the disabled fieldset.
- Placement confirmation stayed visible after both protective OFF and AutoDisable
  refreshed status; confirm/cancel remained mounted rather than stranding lock.
- First setup PARTIAL with null method exposed standalone recovery without CSV.
  Native keyboard focus and Enter completed recovery; method stayed null and
  readiness false, version advanced, final message persisted.
- At 390px document scrollWidth equaled viewport 390; wide tables scroll locally.
  Desktop/mobile screenshots are mock evidence only, not provider/account proof.
- Resize from desktop to HP and back left observed provider mock call count at
  12 before / 12 after; no polling or resize-driven request.

Ruling: AutoEnable preflight refusal before starting the DB marker finishes as
RECONFIRM_REQUIRED, not UNVERIFIED. Once marker/flag DB work may have started,
uncertainty remains closed. Cost if wrong: unnecessary blocked Auto or unsafe
release; manual preflight/ambiguous-marker observations cover these boundaries.

Final review declined-to-judge rulings: real provider write behavior, deployed
MySQL locking/migration, production compatibility and readiness are not claimed.
They require separate authorized verification. Manual mock evidence cannot prove
those properties. External Adsterra operators can race between GET and mutation;
the provider contract supplies no CAS/transaction/exactly-once guarantee. No
automatic retry, rollback or bid restoration is introduced.

Final source verification (2026-10-29): TypeScript `npx.cmd tsc --noEmit` PASS;
scoped ESLint all changed/new TS/TSX PASS (latest two service changes rechecked);
`npm.cmd run build` PASS after final code changes; `npx.cmd prisma validate` PASS;
`git diff --check` PASS. A check using an overridden core.autocrlf=false first
misclassified the existing CRLF line endings; the project-configured check passed
without changing line-ending settings or unrelated files. No automated tests run.
Independent review's two Important findings were repaired and manually observed
with original UI/helpers; no Critical finding was reported. Production behavior
and real MySQL transaction/concurrency semantics remain unverified.
Remote feature branch was fetched and matched baseline before scoped staging.
Publication is a normal commit/push to this feature branch only; no merge/deploy.
