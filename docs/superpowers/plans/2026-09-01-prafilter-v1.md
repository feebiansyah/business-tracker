# Prafilter v1 Implementation Plan

## Scope

Implement a Shopee-account-scoped Prafilter page that synchronizes campaigns and daily Meta metrics for a selected operational date (+07:00), preserves manual campaign fields, and presents editable operational controls. Do not alter Sync WL, Sync BM, Shopee-to-WL mapping behavior, or implement later Filter/Fix features.

## Task 1 — Database foundation

1. Extend `MetaAccount` with `campaigns Campaign[]`.
2. Add `Campaign` and `CampaignDailyMetric` models using MySQL `Decimal` fields and the requested unique keys.
3. Create a clearly named migration `add_prafilter_campaign_models`.
4. Run Prisma format and validate before continuing.

## Task 2 — Pure date and calculation helpers (TDD)

1. Add tests for explicit +07:00 campaign-date matching.
2. Add tests for fee, profit, null commission, and zero-cost percentage behavior.
3. Implement minimal helpers until tests pass.
4. Keep derived fee/profit values out of Prisma models.

## Task 3 — Reuse the Meta Graph client

1. Add campaign and campaign-insight response types.
2. Add one account-ID normalization helper that prevents `act_act_...`.
3. Add `getCampaigns(accountId)` using `/act_{id}/campaigns`.
4. Add `getCampaignInsights(accountId, date)` using account-level insights with `level=campaign` and one-day `time_range`.
5. Reuse the existing authorization, app secret proof, pagination, redaction, and rate-limit behavior.

## Task 4 — Prafilter synchronization and queries

1. Validate the Shopee account and load only its connected WL records.
2. Stop before Meta requests when no WL is connected.
3. Process WL sequentially: campaigns first, filter by +07:00 start date, then one account-level insights request.
4. Match insights by `campaign_id`.
5. Upsert Campaign Meta fields only; never overwrite `jenis`, `note`, or `operationalStatus`.
6. Upsert daily metrics Meta fields only; never overwrite `commission`.
7. Query rows by Shopee scope plus campaign `startTime` date boundaries in +07:00, not by metric date alone.

## Task 5 — Server Actions and manual edits

1. Add an action for `Ambil Prafilter` with strict date/account validation and friendly errors.
2. Add small actions for `jenis`, `note`, and `operationalStatus`.
3. Verify campaign ownership through `Campaign -> MetaAccount -> ShopeeAccount` in every manual update.
4. Revalidate only the relevant Prafilter route.

## Task 6 — Route and UI

1. Add `/shopee/[id]/prafilter` with date query support and a default operational date.
2. Add a Prafilter entry point from Shopee detail.
3. Add toolbar, summary cards, and the requested desktop-first table columns.
4. Add small client controls for Jenis, Note, and ON/OFF without triggering Meta sync.
5. Render clear missing-account, no-WL, empty-date, zero-result, loading, success, and error states.

## Task 7 — Migration and verification

1. Run helper tests.
2. Run `npx prisma format` and `npx prisma validate`.
3. Apply the development migration and regenerate Prisma Client.
4. Run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
5. Audit that Sync WL, Sync BM, and Shopee relation code paths remain behaviorally unchanged.
