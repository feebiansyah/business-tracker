# Campaign-owned Adsterra placement method

Baseline: 6e8a8be57da5fdf01751bf480a49b58a4566deab on feature/adsterra-placement-lists.
Native implementation requested; no repeated conceptual approval is needed.

## Intent and boundaries

Campaign owns the application method. Placement analyzes/applies only that stored
method. Neither choice nor list contents claim the editor's actual provider mode.
CampaignInfo in the public OpenAPI has identity/status/pricing, no editor mode.
Keep all existing ROI/CTR, CSV/FX, bid, fencing, uncertainty and protective guards.
No real provider/DB write, login, Sync, automated test, migration execution, merge,
deploy, dependency or env change during this work. Commit/push review branch only.

## Approaches / implementation choice

Client-only selection or inference from lists cannot protect stale tabs/scheduler.
A separate history/settings table would duplicate canonical identity/locking.
Extend the existing single operation row instead: nullable placementMethod,
methodVersion, methodReady=false, approvedBlacklistHash and approvedWhitelistHash.
This is the author's routine implementation choice within the requested design.
An additive migration only; old rows start unset/unready. GET never creates rows.
Missing storage/columns is UNAVAILABLE, distinct from a successfully read absent
row (unset). Invalid/null list responses remain errors, not an empty collection.

## Campaign method confirmation

Prepare reads scoped config/credential/aliases, real campaign identity/pricing,
both complete lists, bids and stored method/version. HMAC purpose is distinct,
TTL five minutes, single-use stored confirmation; hash payload, not large lists.
Initial adoption of a nonempty compatible target with empty opposite list may
stay ACTIVE and keeps every bid. It becomes ready only after exact rereads and
fenced metadata commit. Both-empty initial assignment and EVERY stored-method
switch require strictly INACTIVE/all alias Auto disabled, even if no clear needed.
Both lists nonempty is a conflict and fails closed; no automatic conflict repair.
Selecting the same stored method is not a shortcut to approve drift: use Placement
application with its bid confirmation. Only Campaign may clear the opposite list.
Switch never fills the target from statistics and finishes NOT_APPLIED/unready.
Clear/assignment never reset bids. Compare both lists/bids/scope/prerequisites
after clear; uncertainty or partial data never commits a new ready method.

## Versioning / Placement execution

Snapshot preconditions include the exact method/version/readiness/approved hashes.
Version-2 confirmation domain/purposes reject all baseline tokens. Placement
rejects browser method mismatch, unset method and ANY nonempty/unknown opposite
list before confirmation. Whitelist-empty is rejected before a guard reservation.
After valid claimed preflight, durably increment methodVersion and invalidate
readiness, before provider dispatch. Preserve method and previous approved hashes.
Only the operation's exact returned version transition is substituted in the
expected snapshot; do not mask other drift. Never restore old readiness/version
on failure, known non-dispatch, timeout, recovery or DB ambiguity.
Provider writes stay sequential/no retry. Blacklist resets only confirmed all-GEO
bids after list verification. Empty blacklist can be explicitly applied ready,
with a warning that API excludes no placements. Empty whitelist is never ready.
Finalization transaction atomically checks fence/version/physical config, records
blacklist timestamp when appropriate, publishes approved digests/readiness and
finishes the guard. Metadata failure cannot publish readiness or replay writes.

## Activation and recovery

Manual/Dashboard ON, scheduler ON and AutoEnable must check stored ready method,
fresh valid BOTH lists, approved exact digests, empty opposite list, nonempty
whitelist and supported pricing. Recheck under the shared guard before write;
AutoEnable's DB transaction also predicates on the approved method/version.
GET never blesses external list drift or changes preferences. Existing ACTIVE
campaigns are not automatically OFF; show Auto active but new activation blocked.
Custom Bid writes do not constitute a method change. Protective OFF/AutoDisable
stay available and preserve method metadata. Config alias/move/delete and reserve/
finish preserve canonical method metadata. Explicit recovery increments method
version, invalidates readiness, and cannot infer/adopt a method or finish a switch.
Genuinely uncertain old requests remain blocked, even after matching GET.

## UI / request budget

Campaign shows separate method, API list counts/status/WIB times, readiness and
confirmed Set/Change Method. Placement has no method dropdown; reads scoped method
on target/revision change and invalidates stale analysis when method/version changes.
Shared busy lock, request sequencing and revision checks prevent late responses,
double clicks, target/tab/refresh changes during confirmation. No polling/resize GET.
Read-only list batches deduplicate physical aliases, cap 40 GETs/two workers.
Mutation actions retain 90s including cleanup reserve, 10s HTTP, max40 requests,
and reserve verification time before dispatch. No HTTP in database transactions.

## Verification and limitations

Manual original-helper/component mocks with provider and DB transports replaced:
unset/storage-failure/empty/conflict/drift; ACTIVE adoption; switches/zero whitelist;
all activation routes; stale tokens/versions/aliases; partial/ambiguous clear/PUT;
metadata/recovery/old process; protective races and all GEO bids; desktop/phone.
TypeScript/scoped ESLint/build/Prisma validate/diff check and independent review.
Public specification read is actual evidence; provider writes, real MySQL locking,
applied migrations and production/editor behavior remain unverified.
