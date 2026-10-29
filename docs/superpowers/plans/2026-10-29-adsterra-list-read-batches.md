# Campaign list reading: canonical IDs and bounded continuation

> Native execution with superpowers:executing-plans and one independent review.
> User explicitly forbids automated tests; use manually invoked original-code mocks.

**Goal:** Every physical campaign gets both lists and capability without alias-order
dependence or starvation, retaining independent errors and progressive UI results.
**Spec:** User's review request against `1fa65ac8f52dc08f9d45b507f4a04bf55824c6ad`,
plus the read-only boundaries in `specs/2026-10-29-adsterra-campaign-method-design.md`.
**Tech:** Existing Next/React/TypeScript/Prisma; no dependency/schema changes.

## Design / alternatives

- Raising/removing the request cap is rejected: it defeats the bounded read.
- Rotating the first slice on each refresh is rejected: it cannot complete one
  refresh coherently, or report its progress reliably.
- Chosen: sorted validated canonical campaign IDs, thirteen physical campaigns
  per batch (39 GET maximum), then explicit finite continuation. Each batch
  reauthenticates and SELECT-validates current account/config/credential scope.
  Cursor binds its last canonical ID to a nonsecret scope/credential fingerprint;
  changed scope invalidates continuation rather than mixing snapshots.
- Every physical campaign appears once per batch scan; aliases receive the same
  provider results. Output preserves original config ID/raw campaign metadata for
  matching existing UI rows, but raw alias IDs never build/validate provider jobs.
- Refresh All runs sequential batches once, not polling. A batch has two shared
  workers, existing 10s HTTP/30s provider/45s action deadlines, no retry. Work not
  scheduled before deadline is explicitly unavailable, never empty or ready.
- The client merges by config identity after every batch; later errors retain
  prior completed batches. Pending rows are visibly unread. Scope/revision/request
  sequence fences prevent stale responses and stop scheduling old continuations.
  Repeated refresh shares the current scan/request rather than starting new GETs.
- Database read failures report fixed safe categories (table/column missing,
  connection, invalid metadata, otherwise unavailable), never raw error text,
  credentials or query connection strings. GET still cannot create a guard row.

## Scope and review focus

Only list reader/types, read action, list display/hook and Campaign integration.
Keep mutation guards/methods, schema/migrations, main/Meta/stash/.env/Clickadu intact.
Manual original-code observations: aliases in both orders; 13/14/25 campaigns;
partial errors; repeated refresh; delayed old account/revision response; resize;
unknown != empty/ready; scope drift during continuation. No provider/DB write.

## Tasks

- [x] 1. Reproduce baseline reader behavior and diagnose local storage read-only.
- [x] 2. Implement canonical batch/cursor DTO and scope validation in read action.
- [x] 3. Implement progressive client merging, dedup/stale guards and read status UI.
- [x] 4. Manual original-code mock observations and independent read-only review.
- [x] 5. TypeScript, scoped lint, build, diff check; scoped commit/normal feature push.

## Ledger

Initial branch/HEAD match request; working tree clean. Protected refs/stash recorded.
Static root cause: last alias supplies the job's raw-ID validation; jobs are cut at
forty without continuation, leaving campaign fourteen perpetually incomplete.
Local database audit: .env loaded server-side, host verified local; SELECT 1 PASS.
information_schema shows `_prisma_migrations`, no `AdsterraCampaignOperation` and
zero operation columns. Both expected Adsterra migration names absent from history.
Prisma method SELECT fails P2021 TABLE_MISSING. This is not invalid metadata, unset
method or connectivity failure. Neither migration executed; local application of
the two reviewed migrations remains a separate user-authorized step.

Ruling: scope fingerprint includes alias config identity and credential digest,
not a persistent cursor/database row. This preserves SELECT-only behavior; drift
requires a fresh refresh rather than quietly continuing under changed scope.

## Verification record (2026-10-29)

Baseline manual observation with original helper and fake transport: alias normal
then zero-prefixed produced zero GET and unavailable lists; reverse order produced
three GET and successful lists. Fourteen campaigns produced forty GET with the
last whitelist/capability unread. No test runner/assertions or automated tests.

After correction, manually selected fixtures with original reader/hook/components:

| Case | Observed |
| --- | --- |
| Alias 1485934 / 001485934 in either order | Same results; exactly three canonical GET, no duplicate physical read |
| 13 physical campaigns | 39 GET, one batch, both lists/capability available |
| 14 physical campaigns in React StrictMode | 39 + 3 GET, 14 rows, no unavailable capability/list |
| 25 physical campaigns | 39 + 36 GET, 25 rows, peak two active requests |
| Second batch held | Progress 13/25; thirteen earlier rows remain visible, remaining rows explicitly unread |
| Repeated Refresh while held | Same pending scan promise, no additional provider GET |
| Second batch structured failure | Thirteen rows/progress retained; global error, not empty or ready |
| Unexpected rejected action carrying internal marker | Fixed safe message; marker absent from page; thirteen rows retained |
| One whitelist GET 404 | That list UNAVAILABLE and readiness UNVERIFIABLE; other campaign/list successes retained |
| Account 1 response delayed, switch to account 2 | Account 2 finishes 25 rows (20001..20025); releasing old response does not overwrite it or continue old scan |
| Config physical mapping changes before continuation | Rejected before additional GET; 39 earlier GET and thirteen earlier rows retained |
| Missing column / connection error / invalid metadata fixtures | Distinct fixed safe messages; method UNAVAILABLE, readiness UNVERIFIABLE, never unset |
| Original Campaign table, mocked P2021 | Shows missing-table message and unavailable method, not Belum ditetapkan; 14/14 progress |
| Resize 1440px -> 390px -> desktop | Mock GET count 42 before and 42 after; mobile document width 390, local table scrolling |

All provider transports were fake GET-only implementations; all scope/method
dependencies were in-memory. UI actions for mutations/login/Sync were blocked.
Screenshots/bundles are temporary artifacts outside the repository/commit.
No live provider request or database write was used for these observations.

Independent read-only review found one Important regression: arbitrary rejected
action Error.message could render. Fixed by distinguishing safe DTO/reader errors
from unknown exceptions; the original-hook mock proved the marker is not exposed.
No Critical findings reported. Reviewer declined live provider, runtime checks and
local DB diagnosis; those are not inferred from review. Author's mock/SELECT/check
evidence is recorded separately here.

Actual local DB audit, after explicit local-host/project-env equality checks:

```sql
SELECT 1 AS connected;
SELECT TABLE_NAME FROM information_schema.tables
 WHERE TABLE_SCHEMA=DATABASE()
 AND TABLE_NAME IN ('AdsterraCampaignOperation','_prisma_migrations');
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.columns
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AdsterraCampaignOperation'
 ORDER BY ORDINAL_POSITION;
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
 FROM _prisma_migrations WHERE migration_name IN
 ('20261029090000_add_adsterra_campaign_operation',
  '20261029160000_add_adsterra_application_method');
```

Connection/SELECT PASS; only `_prisma_migrations` found; no operation table/columns;
neither migration recorded. Original Prisma model SELECT returned sanitized
`PrismaClientKnownRequestError / P2021 / TABLE_MISSING`. Metadata quality cannot be
evaluated without the table. Environment matches the project's .env; no values,
credentials, connection URL or raw Prisma messages printed. No migration executed.
Local next step is separate review/application of those two existing migrations,
in order, with local Prisma history reconciliation as necessary; not a blind
production migration or automatic resolve/deploy.

Final source checks: TypeScript PASS; scoped ESLint all six TS/TSX files PASS;
production build PASS after final source change; project-configured diff check PASS.
No schema/migration/guard/mutation, main/Meta/Clickadu, .env/dependency/stash change.
