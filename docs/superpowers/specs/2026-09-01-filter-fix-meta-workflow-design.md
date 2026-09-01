# Filter/Fix Meta Workflow — Design

## Goal

Build the core Meta campaign workflow behind each Shopee account's four existing pages: Filter, Fix, OFF Filter, and OFF Fix. The system stores campaign metadata and daily Meta performance in MySQL so the pages and campaign detail view read from the database rather than calling Meta when opened.

This subsystem replaces the old spreadsheet role for Meta campaign history while preserving the existing Business Manager, WL/MetaAccount, ShopeeAccount, WL-to-Shopee mapping, and BM mapping progress flows.

## Scope

This design adds:

- persistent Campaign storage linked to MetaAccount/WL
- persistent daily campaign metrics
- Meta synchronization scoped to WLs linked to the selected Shopee account
- campaign/ad-set budget resolution
- automatic classification into Filter/Fix/OFF Filter/OFF Fix
- campaign summary tables
- campaign daily-history detail UI
- rate-limit-aware historical bootstrap and incremental refresh

Shopee CSV import is explicitly deferred to the next subsystem. The database may reserve nullable daily fields for Shopee commission and Shopee clicks so that the later import can enrich the same daily record without redesigning the Meta history model.

## Workflow Classification

The four pages are database views over the same Campaign records. Campaigns are never copied or physically moved between four tables.

Classification uses the current Meta campaign status and effective configured daily budget:

- Filter: campaign is ACTIVE and effective daily budget < Rp200,000
- Fix: campaign is ACTIVE and effective daily budget >= Rp200,000
- OFF Filter: campaign is not ACTIVE and effective daily budget < Rp200,000
- OFF Fix: campaign is not ACTIVE and effective daily budget >= Rp200,000

Rp200,000 belongs to Fix/OFF Fix.

The campaign's own status determines ACTIVE versus OFF. Ad-set status does not decide which of the four workflow pages contains the campaign.

## Effective Daily Budget

Budget resolution is deterministic:

1. If `campaign.daily_budget` exists, use it as the effective daily budget and mark the budget source as CAMPAIGN.
2. If campaign daily budget is absent, sum the configured `daily_budget` values of all ad sets belonging to that campaign and mark the source as ADSET.
3. Paused ad sets remain included in this configured-budget sum. Their status does not change workflow classification.

The system is classifying campaigns by configured daily budget, not total spend and not the amount spent on a particular day.

If Meta returns no usable daily budget at either level, retain the campaign but classify its budget as unresolved rather than inventing zero. It must not be silently placed into Filter. The UI/sync result should surface unresolved-budget campaigns for correction/inspection.

Lifetime-budget-only behavior is outside the initial workflow rule because the business rule is specifically based on daily budget. Such campaigns are treated as unresolved until a concrete business rule is added.

## Data Model

Reintroduce campaign models as core workflow models, not as Prafilter-specific storage.

### Campaign

Required conceptual fields:

- id
- metaCampaignId — unique Meta campaign identifier
- name
- metaAccountId — relation to WL/MetaAccount
- startTime — nullable if Meta does not provide it
- metaStatus
- effectiveStatus
- effectiveDailyBudget — nullable when unresolved
- budgetSource — CAMPAIGN, ADSET, or UNRESOLVED
- createdAt
- updatedAt

`MetaAccount` owns many Campaign records.

### CampaignDailyMetric

Required conceptual fields:

- id
- campaignId
- date
- spend
- clickFp
- cpcFp
- commission — nullable, populated later by Shopee import
- shopeeClicks — nullable, populated later by Shopee import
- createdAt
- updatedAt

Enforce a unique key on `(campaignId, date)`. Syncing the same campaign/date updates that row; syncing a new date appends history.

Use database numeric types appropriate for currency/Meta decimal values; do not use floating-point storage where rounding errors would affect financial totals.

Do not store derived values such as +5%, profit, ROI/profit percentage, click percentage, or Shopee CPC. Calculate them from source fields.

## Shopee Matching Boundary

There is no separate operational `tagLink2` field on Campaign.

The agreed identifier is:

`Meta Campaign.name = Shopee Tag Link 2`

The later Shopee importer will normalize both sides by trimming surrounding whitespace and comparing case-insensitively/uppercase. It must not remove punctuation or otherwise rewrite the identifier because that could merge distinct campaigns.

## Derived Metrics

For a daily row or an aggregate period:

- costWithFee = spend × 1.05
- profit = commission - costWithFee
- profitPercent = profit / costWithFee × 100
- clickPercent = shopeeClicks / clickFp × 100
- cpcShopee = spend / shopeeClicks

Division-by-zero must return an empty/not-applicable display rather than Infinity or NaN.

Commission and Shopee clicks remain null until Shopee data is actually imported. If commission has never been imported for the relevant rows, aggregate Commission, Profit, and ROI/Profit % display as `—`; missing Shopee data must not be presented as a verified zero.

`clickFp` follows the existing Meta exporter semantics: Meta's campaign-level `clicks` field. `cpcFp` uses Meta's returned campaign-level `cpc` value when available.

## Meta Sync Scope

A Sync Meta action is scoped to the Shopee account whose workflow page is open.

1. Load that ShopeeAccount.
2. Load its linked MetaAccount/WL records from the database.
3. Process those WLs with low concurrency, initially one or at most two WLs concurrently.
4. For each WL, fetch campaign metadata and ad-set metadata at account level, following Meta pagination.
5. Resolve effective daily budgets in memory by campaign ID.
6. Upsert Campaign records.
7. Fetch campaign-level daily insights in bulk for required date ranges.
8. Upsert CampaignDailyMetric records.

Do not make one metadata/insights request per campaign when an account-level request can return the set. This is required because the existing Meta integration has previously encountered application request limits.

Meta credentials remain server-side only and use the project's configured API version; this feature must not hardcode a different API version.

## Meta Fields

Campaign metadata should request only fields needed by this workflow, including the Meta campaign ID, name, status/effective status, start time, daily budget, and lifetime budget when useful for detecting unsupported lifetime-only budgeting.

Ad-set metadata should request only fields needed for budget resolution, including ID, campaign ID, status/effective status, daily budget, and lifetime budget.

Campaign insights use account-level insights with `level=campaign` and the existing proven performance semantics, including campaign ID/name, spend, clicks, CPC, date start, and date stop. Daily historical responses use `time_increment=1`.

All paginated Meta responses must follow paging until exhausted for the requested scope.

## Historical Bootstrap

The first successful sync of a campaign should build history from the campaign start date through the current date when a usable start date exists.

Do not issue one API request per day and do not request an unbounded lifetime in one giant call. Split history into bounded date chunks, preferably calendar-month-sized ranges, and request daily rows using `time_increment=1`.

Example for a campaign beginning June 1 with a September 1 sync:

- June 1–30
- July 1–31
- August 1–31
- September 1

The sync is resumable through persisted daily data: successful chunks remain committed. A retry determines missing/required ranges from stored history instead of deleting successful history and starting over.

If start time is unavailable, do not invent a campaign start date. Surface the campaign as needing a fallback/bootstrap decision rather than silently fabricating history.

## Incremental Sync

After bootstrap, ACTIVE campaigns normally refresh D-1 through today. Refreshing D-1 allows Meta's recently settled figures to update while avoiding a full historical reload.

OFF campaigns retain their stored history and are not continuously refreshed as if still spending. When a campaign transitions from ACTIVE to non-ACTIVE, perform/finalize the required recent range so the last active performance is not cut off, then stop routine daily insight refresh for that campaign.

Metadata for campaigns is still refreshed during Sync Meta so status and budget changes can move a campaign automatically between workflow views.

A campaign can therefore move without any record migration:

- ACTIVE Rp50,000 -> Filter
- ACTIVE Rp250,000 -> Fix
- PAUSED Rp50,000 -> OFF Filter
- PAUSED Rp250,000 -> OFF Fix

## Sync Failure and Progress Behavior

Failure of one WL must not roll back or discard successful data from other WLs.

Expose sync progress at WL level, including current WL and current phase such as metadata or historical date range. At completion show useful counts such as successful WLs, failed WLs, and campaigns processed.

Rate-limit/network/API failures must be returned as clear operational errors. Already-upserted historical rows remain valid and a later retry resumes safely.

Never write fake zero metrics solely because Meta returned no row or because today's insights are unavailable. Absence and verified zero are different states.

## Filter/Fix Page UI

All four workflow routes reuse one focused workflow table component and differ only by classification query and page title.

The main table shows:

- Campaign — clickable
- WL
- Budget/Hari
- Hari
- Total Spend
- +5%
- Total Komisi
- Profit
- % Profit

The page also shows compact aggregate cards for campaign count, total spend, commission, profit, and ROI/profit percentage. Shopee-derived aggregates display `—` until applicable Shopee data exists.

Provide campaign search. The initial primary action is `Sync Meta`. A visible `Import Shopee` action may be reserved/disabled until the separate Shopee-import subsystem is implemented rather than pretending import already works.

`Hari` is derived from campaign start/history and is not a separately stored business metric.

## Campaign Daily Detail

Clicking a campaign opens a focused detail view/modal that reads the database only. Opening it must not call Meta.

Header information includes campaign name, WL, effective daily budget, current campaign status, start date, and aggregate Spend/Commission/Profit/ROI values.

Only the Harian view is required. Do not build Placement, Platform, Age/Gender, or other tabs.

Daily columns are:

- Tanggal
- Spend
- +5%
- Komisi
- Profit
- % Profit
- Klik FP
- Klik Shopee
- % Klik
- CPC FP
- CPC Shopee

Do not show Tag Link 2 because campaign name is now the matching identifier. Do not repeat current campaign Status on every historical row because it would misleadingly imply that the current status was necessarily the status on that historical date.

## Query and Performance Boundaries

Pages read persisted MySQL data and derived aggregates; they do not synchronously depend on Meta availability.

Avoid N+1 database queries for campaign summaries. Aggregate or load daily metrics in a bounded query strategy appropriate to the existing Prisma architecture. Index foreign keys/date fields needed by Shopee-account -> WL -> campaign -> daily-history queries.

Keep sync services, Meta transport/client logic, budget resolution, persistence, and UI querying as separate focused units rather than building one large route/action file.

## Migration Safety

The repository intentionally contains an older applied migration that once created Prafilter Campaign tables and a later migration that removed them. Preserve both migration-history files unchanged.

Add a new migration for these newly approved core Campaign models. Do not edit or reuse the old Prafilter migration. Review generated SQL before applying it and confirm it creates only the intended new workflow tables/relations/indexes and does not reset or delete existing BusinessManager, ShopeeAccount, MetaAccount, or MetaBusinessMappingProgress data.

Record protected row counts before and after migration as an additional safety check.

## Testing and Verification

Use test-first development for pure business rules and service behavior.

At minimum cover:

- Rp199,999 ACTIVE -> Filter
- Rp200,000 ACTIVE -> Fix
- Rp199,999 non-ACTIVE -> OFF Filter
- Rp200,000 non-ACTIVE -> OFF Fix
- campaign daily budget overrides ad-set sum
- missing campaign budget sums all ad-set daily budgets, including paused ad sets
- missing usable daily budget remains unresolved and is not silently Filter
- unique campaign/date upsert behavior prevents duplicates
- Shopee matching normalization is trim + case normalization only when that subsystem is added
- divide-by-zero derived metrics never produce Infinity/NaN
- null Shopee data is distinguishable from verified zero
- failed WL does not erase successful WL data

Run Prisma format/validate/generate, migration verification, unit tests, TypeScript checks, lint, production build, and focused runtime checks for all four workflow routes.

Verify existing Sync WL, Sync BM, Shopee account management, and WL-to-Shopee mapping remain intact.

## Non-Goals

This implementation does not yet include:

- Shopee Affiliate CSV parsing/import
- ADU or Terra integration
- Placement/Platform/Age/Gender Meta breakdowns
- ad-level performance UI
- manually moving campaigns between workflow tables
- editing campaign budget/status on Meta from this web app
- lifetime-budget classification rules

## Implementation Order

Implement this subsystem incrementally:

1. core Campaign and CampaignDailyMetric schema/migration
2. pure budget-resolution and workflow-classification rules
3. Meta campaign/ad-set metadata sync
4. historical/incremental campaign insights sync
5. database query layer for workflow summaries/history
6. shared Filter/Fix/OFF Filter/OFF Fix UI
7. campaign Harian detail
8. verification and regression checks

Shopee CSV import is designed and implemented afterward as a separate subsystem.