# Clickadu placement lists implementation plan

**Goal:** Use the existing Campaign/Zone workflow to choose a planned method and
replace its final Zone list, without an empty Whitelist intermediate state.

**Architecture:** GET campaign is authoritative (`targeting.zone.list` and boolean
`isExcluded`). Campaign choice is temporary client state only. Read-only prepare
recalculates CSV/statistics and returns the exact old/new methods and target.
Execution recalculates again and checks a digest of scope, analysis and campaign
before one PUT using the existing campaign payload builder. Final GET must match
the method and entire Zone set. No clear, write retries, new persistence or
cross-process coordination guarantees.

**Contract:** Official advertiser app config `apiDescriptionUrl` resolves to
`https://adv.clickadu.com/api//swagger/clickadu/swagger-v2.json` (GET 200).
PUT `/api/v2/campaigns/{campaignId}/` references CreateCampaign ->
TargetingCampaignModel -> zone -> list:string[] + isExcluded:boolean. Host is
ssp.clickadu.com. Empty Whitelist traffic semantics remain unproven and are never
used. Existing GET campaign 3946605: HTTP 200, isExcluded=true, 314 string IDs.

## Constraints and review focus

- No automatic tests or live provider mutations; use manual original-helper and
  original-component fake transport inspections instead (explicit user override).
- Blacklist candidates remain cost >=1000 and ROI <30. Whitelist uses the positive
  safe rule cost >=1000, finite nonnull ROI >=30; never invert the blacklist flag.
- Actual method is never updated from a plan or PUT response; only validated GET.
- Invalid/missing/null targeting is not an empty list. ID/scope/drift validation,
  stale results, double-click prevention and existing other-targeting fields matter.
- Preserve Adsterra, Meta, Clickadu daily Sync/import/status and all credentials.

## Tasks

- [x] Add strict scoped list parser, candidate selection and bounded one-PUT/GET
  verification using the existing builder. Keep legacy Blacklist action safe.
- [x] Add authenticated read/prepare/apply actions; rederive targets server-side,
  reject empty Whitelist, preserve only existing Blacklist timestamp writes.
- [x] Add small shared client plan/read state, Campaign method column and Zone
  confirmation; keep original table, summary, CSV and navigation behavior.
- [x] Inspect helpers/components manually with fake transports (both methods,
  switch, cancel, duplicate click, error, timeout, mobile/desktop). Run TypeScript,
  scoped ESLint, production build, diff check and independent code review.
- [ ] Commit and push feature/clickadu-placement-lists only; no merge/deploy.

## Verification ledger

TypeScript, scoped ESLint, production build and diff check passed on final source.
No automated tests were created/run. No real provider/database writes, login,
Sync or migrations were used for verification.

Manual Node console used original ClickaduClient, list application/candidate
helpers and legacy Blacklist helper with fake transport only. Observed BL -> WL
and WL -> BL, one PUT per explicit application, exact GET verification, NO_CHANGE
without PUT, empty Whitelist rejected with zero writes, drift rejected, HTTP 400
and timeout without retry, and preserved status/budget/rates/other targeting.

Original Campaign/Zone React components ran at 1440px and 390px with local fake
actions backed by original helpers. Plan selection did not change the provider;
Campaign actual method changed only after verification. Native single-confirm
text showed old/new method, campaign and final count. Cancel had zero PUTs;
double click dispatched one apply action, pending disabled form/tab/application;
rejection and timeout left actionable failure text. Page width stayed within the
viewport, tables scrolled locally, and resize added no calls. Screenshots remain
in Temp outside Git.

Independent review found stale config-mapping reads and legacy final-method
verification gaps. Fixed provider identity key to include physical campaign and
sourceTag; legacy action is preserved but now verifies strict campaign GET/method
and full list rather than trusting the permissive blocked-list parser. Its
existing non-ambiguous error classification is retained. New path refuses a
rejected PUT as success even when a later GET matches. Blacklist metadata update
is conditional on original campaign/config/sourceTag, not an unrelated moved row.

Limitations: no live PUT acceptance is claimed. GET/precondition/PUT is not
atomic against external operators or other processes; local locks are not
distributed exactly-once guarantees. Empty Whitelist remains unsupported by the
application. Existing campaign settings supported by the existing update contract
are copied; zoneRates is deliberately not written (provider docs prohibit that
field via campaign PUT). No operation/recovery framework or persistent method
state was introduced. A plan is temporary and disappears on a full page reload.
