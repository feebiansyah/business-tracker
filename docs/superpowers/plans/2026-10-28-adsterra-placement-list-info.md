# Adsterra Campaign API list information

## Scope and approach

Implement the user's approved read-only Campaign information, not editor mode detection.
Keep the shared Adsterra client, auth helpers, blacklist replacement, Custom Bid,
Auto ON/OFF, database schema, and Meta features unchanged.

Use an isolated GET adapter rather than changing the shared client's empty-response
handling. Reuse the existing session validator with SELECT-only dependencies in
the new action; expired sessions remain rejected without cleanup writes.

## Implementation plan

- [x] Add safe DTOs for independent blacklist/whitelist success, unavailable, and failure.
- [x] Read both documented campaign linking endpoints with fixed URLs, no-store,
  no redirects/retries, 10-second request timeout, at most two concurrent requests,
  and a 45-second action deadline including read-only auth and scope lookup.
- [x] Resolve campaigns and ADSTERRA credential from the selected Shopee account.
  Strictly distinguish a valid empty list from null, malformed data, 204, and HTTP failures.
- [x] Add Blacklist API / Whitelist API cells and Refresh Daftar API to the original
  Campaign component. Load once on mount, deduplicate in-flight reads, ignore stale
  results, and never refetch because of resize. Show successful read time or failed
  attempt time separately per list. Do not infer editor mode.
- [x] Inspect original components in a browser using actual GET data, including
  desktop/mobile, refresh, and independent failure states with isolated manual mocks.
- [x] Run TypeScript, scoped ESLint, production build, and git diff --check.
- [x] Review and explicitly stage only this feature. Authorized release target:
  commit/push only feature/adsterra-placement-lists; preserve main, Meta branches,
  and stash. No merge or deploy.

## Verification constraints and review focus

No automated tests are created or run, per the user's explicit instruction.
No provider/database writes, login/session creation, Sync, or write-control clicks
are used for verification. Temporary browser/diagnostic helpers stay outside Git.
Check invalid/null/unsupported responses never become zero; one failed list must
not hide the other. Credential and raw provider bodies never reach the browser.
Database timeout bounds waiting, not cancellation of an already-started SELECT;
late database results cannot schedule provider GETs after the deadline.

## Contract references

- https://docs.adsterratools.com/docs/public/v3/partners-api.yml
- GET /advertiser/campaign/{campaign_id}/linking/blacklist.json
- GET /advertiser/campaign/{campaignId}/linking/whitelist.json

These linking lists do not establish the website editor's current mode.

## Manual verification record

- Original Campaign component rendered in an isolated localhost GET-only bridge,
  using the production list loader and local SELECT-only credential/config reads.
  This was not a login/session-creation or production-site verification.
- Actual GET on campaign 1485934 returned blacklist 383 / whitelist 0, independently
  timestamped; final browser read 2026-10-28 21:38:59 WIB. No result is hardcoded.
- Desktop 1440px and mobile 390px inspected; page width matched viewport, with local
  table scrolling. Resize left request counters unchanged. Keyboard Refresh
  updated both successful read timestamps and disabled the button while pending.
- Manual mock selections: whitelist 404, null, blacklist HTTP 503, malformed IDs,
  valid empty collections, loading, no credential, and no campaigns. Errors stayed
  distinct from empty lists; failure of one list did not erase the other.
- Review found hard action timeout could discard a completed list after slow
  auth/scope. Fixed by reserving one second within the remaining action deadline;
  manual short-budget mock retained blacklist success while whitelist timed out.
- Shared auth, provider client, replacement/reset/write logic, and Meta files
  remain unchanged. Temporary preview helpers/screenshots are outside the repo.
- Final source checks: npx.cmd tsc --noEmit PASS; scoped ESLint PASS;
  npm.cmd run build PASS (optimized compilation 46s, build TypeScript 12.5s);
  git diff --check and staged diff check PASS. No automated tests were run.
