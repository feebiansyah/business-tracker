# Filter Slice — Design

## Goal

Implement only the working Filter workflow for a Shopee account: synchronize Meta campaign metadata and real daily campaign insights for linked WLs, persist the data, list only active campaigns whose resolved daily budget is below Rp200,000, and open a database-backed daily-history detail page.

Fix, OFF Filter, and OFF Fix remain unchanged placeholders. Shopee CSV import is deferred.

## Safety and Scope

Preserve Sync WL, Sync BM, Shopee account management, WL-to-Shopee mapping, and `MetaBusinessMappingProgress`. Preserve all existing migrations, including both Prafilter creation and removal migrations. Add a new core-campaign migration without resetting the database.

Record row counts for `BusinessManager`, `ShopeeAccount`, `MetaAccount`, and `MetaBusinessMappingProgress` before migration and require the same counts afterward.

## Data Model

Add `MetaAccount.campaigns Campaign[]` and two core models.

`Campaign` contains `id`, unique `metaCampaignId`, `name`, `metaAccountId`, nullable `startTime`, nullable `metaStatus`, nullable `effectiveStatus`, nullable Decimal `effectiveDailyBudget`, `budgetSource`, nullable `historySyncedThrough`, `createdAt`, and `updatedAt`.

`budgetSource` is stored as a readable string constrained by application code to `CAMPAIGN`, `ADSET`, or `UNRESOLVED`. `historySyncedThrough` is a date checkpoint representing successful historical coverage, not the last date that produced an insight row.

`CampaignDailyMetric` contains `id`, `campaignId`, `date`, nullable Decimal `spend`, nullable integer `clickFp`, nullable Decimal `cpcFp`, nullable Decimal `commission`, nullable integer `shopeeClicks`, `createdAt`, and `updatedAt`. It has a unique key on `(campaignId, date)` and an index supporting date/history queries.

Do not store +5%, profit, profit percentage, click percentage, CPC Shopee, or workflow classification. Do not create a Filter table or Tag Link field.

## Filter and Budget Rules

A campaign is in Filter only when its campaign status is exactly `ACTIVE`, its effective daily budget is resolved, and that budget is strictly below `200000`. Exactly Rp200,000 is excluded. The persisted `effectiveStatus` is metadata and does not override the requested campaign-status rule.

Budget resolution:

1. A valid campaign `daily_budget` wins and sets `budgetSource = CAMPAIGN`.
2. Otherwise, sum every valid ad-set `daily_budget` belonging to the campaign and set `budgetSource = ADSET`. Paused ad sets remain included.
3. If neither level has a usable daily budget, store null and `budgetSource = UNRESOLVED`. Lifetime-budget-only campaigns remain unresolved.

Missing or invalid budget values never become zero.

## Meta Transport

Extend the existing `MetaGraphClient`; do not add parallel HTTP infrastructure or hardcode another API version.

Per WL, use paginated account-level requests for:

- campaigns: `id,name,status,effective_status,start_time,daily_budget,lifetime_budget`
- ad sets: `id,campaign_id,status,effective_status,daily_budget,lifetime_budget`
- insights: `campaign_id,campaign_name,spend,clicks,cpc,date_start,date_stop`, with `level=campaign`, `time_increment=1`, and bounded `time_range`

Never request metadata, ad sets, or insights once per campaign. Process WLs sequentially and retain the client's existing retry, pagination, redaction, authorization, app-secret-proof, and rate-limit delays.

## Sync Flow

The Filter page exposes a server-side `Sync Meta` action scoped to its Shopee account. Validate the account and load only MetaAccount/WL records linked through `shopeeAccountId`.

For each WL:

1. Fetch all campaigns and all ad sets.
2. Resolve budgets and upsert every campaign's current metadata without erasing history.
3. Select current Filter campaigns (`ACTIVE`, resolved budget `< 200000`).
4. Fetch account-level daily insights only for required historical coverage.
5. Persist only returned rows belonging to selected Filter campaigns.
6. Advance each applicable campaign's `historySyncedThrough` through the successfully processed chunk even when that campaign produced no insight row.

Daily metrics are never fabricated. Returned campaign/date rows use upsert so resync updates the same row and new dates append.

One WL failure is recorded and does not stop later WLs. Successful metadata, chunks, metrics, and checkpoints remain committed.

## Historical Coverage

For a Filter campaign with no checkpoint and a valid start date, bootstrap begins on its operational start date. A campaign without a usable start date remains stored, is reported as unable to bootstrap, and receives no invented start/checkpoint.

For a campaign with a checkpoint behind D-1, resume at the day after the checkpoint. For already covered campaigns, routine sync refreshes D-1 through today so recent Meta values can settle. Refreshing an already covered day does not move the checkpoint backward.

Build calendar-month-bounded requests per WL. Account-level responses may contain campaigns outside Filter; discard those rows. After each successful request chunk, advance checkpoints for Filter campaigns whose required coverage intersects that chunk, including campaigns for which Meta returned no rows. A failed chunk does not advance its checkpoint.

## Filter Page

`/shopee/[id]/filter` is a dynamic Server Component that validates the Shopee account and reads only MySQL. Opening it never calls Meta.

It provides campaign search through a `q` query parameter, a Sync Meta control, a visible unresolved-budget warning, and a table containing Campaign, WL, Budget/Hari, Hari, Total Spend, +5%, Total Komisi, Profit, and % Profit.

The query follows `ShopeeAccount -> MetaAccount -> Campaign`, applies the exact Filter rule, and avoids per-row metric queries. `Hari` is derived from stored history/start information. Until Shopee import exists, aggregate commission, profit, and profit percentage render `—`, not Rp0.

## Campaign Daily Detail

Campaign links use `/shopee/[shopeeId]/filter/[campaignId]`.

The page returns `notFound()` unless:

- the Shopee account exists;
- the campaign exists;
- the campaign belongs to a MetaAccount/WL;
- that WL is linked to the Shopee account in the URL;
- the campaign currently satisfies `ACTIVE` plus effective daily budget `< 200000`.

The detail reads only the database. Its header shows Campaign, WL, Budget, Status, Start date, and Total Spend. Daily rows show Tanggal, Spend, +5%, Komisi, Profit, % Profit, Klik FP, Klik Shopee, % Klik, CPC FP, and CPC Shopee.

Shopee-derived cells render `—` while their source data is null. Divide-by-zero and missing inputs return null/not-applicable, never Infinity or NaN. Do not show Tag Link, daily status, Placement, Platform, or Age/Gender.

## Testing and Verification

Use TDD for budget resolution, Filter eligibility, date chunk/checkpoint planning, daily metric upsert payloads, and derived metrics. Tests cover ACTIVE 199999, ACTIVE 200000, PAUSED 50000, campaign-budget override, all-ad-set summation including paused sets, unresolved exclusion, empty successful chunks advancing coverage, same campaign/date update semantics, zero denominators, and nullable Shopee values.

Verify the new migration SQL creates only the core campaign tables, relations, and indexes. After migration, compare protected row counts. Run Prisma format/validate/generate, all tests, TypeScript, lint, build, and runtime checks for Filter list/detail plus the three untouched placeholder routes.

Audit that opening Filter/detail does not instantiate or call `MetaGraphClient`; only the explicit server action invokes sync. Audit Sync WL, Sync BM, Shopee management, and mapping code for no behavioral changes.

## Non-Goals

- Fix, OFF Filter, or OFF Fix implementation
- Shopee CSV import or campaign-name matching
- Fake zero metrics
- Lifetime-budget classification
- Meta budget/status mutations
- Placement, Platform, demographic, ad-set, or ad-level reporting
- Push, merge, or changes outside the isolated feature branch
