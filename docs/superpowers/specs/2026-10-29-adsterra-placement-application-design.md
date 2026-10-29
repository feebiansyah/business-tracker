# Confirmed Adsterra placement-list application

Baseline: feature/adsterra-placement-lists, 6beff94c34efb92727111c8a30531f0e835644b0.
User selected native implementation and authorized review-branch commit/push only.
No live writes, database writes during verification, migrations, login, or tests.

## Approach

An in-memory mutex cannot coordinate scheduler/server instances. A database lease
that expires RUNNING work cannot fence a late provider request. Use one durable
current-operation row per canonical numeric physical campaign, without cascading
foreign keys. Brief compare-and-swap database writes claim/fence work; HTTP never
runs inside a database transaction. No schema or deployment change is applied.

PREPARED expires in five minutes and is single-use. RUNNING, PARTIAL, and
UNVERIFIED never expire automatically. Every mutation records its phase first,
checks ownership/generation and deadline again immediately before dispatch, and
is attempted once. HTTP response errors are followed by GET, not retried writes.
Network ambiguity remains UNVERIFIED even if a later GET matches: GET does not
prove a timed-out request has stopped. No rollback or bid restoration.

## Provider contract (official partners-api.yml, read 2026-10-29)

Fixed GET campaign/{id}.json supplies id, active, pricing_type. Active=1 is
strictly INACTIVE; 2 LIMITED is insufficient for clearing. Unknown pricing is
read-only and CPA whitelist is refused. Fixed campaign linking GETs read both
lists. PUT linking/{blacklist|whitelist}.json has campaign_id + placement_ids.
Blacklist clear is POST linking/blacklist/clean.json with campaign_id. Whitelist
clear is POST campaign/{id}/linking/whitelist.json (no invented mode field).
Null, malformed, unsupported, 204, and 404 are never empty lists.

## Prepare / execute

Server recomputes analysis using existing CSV matching, period, FX, statistics,
blacklist target builder, or positive whitelist helper. Empty whitelist is refused
before claiming or mutating. Prepare reads both complete lists, campaign identity,
all configuration aliases/Auto flags and credential version, and all Custom Bids.
Preview shows old/target IDs, adds/removes, opposite clear and all-GEO bid effects.
HMAC domain is Adsterra-list-apply-v1, TTL five minutes, user/scope/input/rules and
precondition digests bound. Token contains hashes/IDs, not CSV/lists/credentials.

Execution atomically claims the stored confirmation then repeats all reads and
analysis. Drift requires a new confirmation without provider mutation. Clearing
requires strictly INACTIVE and every alias Auto disabled; ordinary PUT with an
empty opposite list does not require OFF. After clear, verify opposite empty and
repeat prerequisites before PUT. Exact final GETs of BOTH lists are required.
Blacklist alone deletes confirmed override keys (all GEOs) after list verification,
then GET verifies none remain; even unchanged lists need bid reset when applicable.
Whitelist/clear never delete bids. External/new bid drift stops instead of silently
expanding confirmed deletion. Metadata failure never erases partial provider facts.

## Other writers and recovery

Manual activation, Custom Bid, scheduler, Auto enable and legacy replace share
the row. Legacy unconfirmed list action is fail-closed and directs to prepare.
Scheduler rechecks the current config identity/Auto flag under its claim before
writing; aliases share the same physical ID. Auto disable is always available.
Protective OFF has its own ID/generation/status on the same row and does not
replace an uncertain main operation. At most one pending OFF; activation is
blocked by either uncertain slot. An overlapping activation can remain uncertain.

Config create/edit/delete claims affected physical keys in short DB-only
transactions, so moving an alias cannot bypass an in-flight scope check. Auto
disable atomically fences the primary generation while retaining its status and
uncertainty. Auto enable locks/checks that same generation with its flag update;
no provider HTTP occurs inside these transactions.

Recovery is explicit, signed and read-only toward the provider. It may acknowledge
a stable current snapshot for an operation whose provider requests returned; it
never repeats writes. Explicit signed recovery may fence a RUNNING continuation
with uncertain=false (no durable pending write). Its previous generation cannot
dispatch or overwrite the recovered generation; matching GET alone never unlocks.
A network-ambiguous operation cannot be unlocked by matching GET. Its recovery preview explains the unresolved old
request, keeps the guard, and leaves protective OFF/Auto disable available. No
claim of cancellation, atomicity with external operators, or exactly-once writes.

## Limits and UI

90-second action budget includes auth/database/analysis/HTTP. HTTP timeout 10s,
at most 40 requests, sequential writes and at most two reads (sequential is valid).
Reserve 35s before clear and 20s before subsequent mutations for verification.
No entire-pipeline Promise.race; timed-out auth/DB waits cannot resume the pipeline.
Their underlying database query may still finish; conservative durable guards stay.
Busy context locks tabs/targets/refresh/actions across the workspace. Read-only
Campaign list info refreshes after completion. No editor mode inference.

## Verification and limitations

Manual original helpers/components with injected provider and in-memory repository,
no live write transport or Prisma mutation. Inspect replay/drift/expiry, partial
responses/timeouts, aliases/stale scheduler, protective OFF and bid behavior.
Run TypeScript, scoped lint, production build, diff check, independent review.
Migration is a review artifact only; runtime application is intentionally blocked
until it is separately reviewed/applied. Provider-side requests from external
dashboards cannot be coordinated by this application.
