# Remove Prafilter and Add Shopee Navigation — Design

## Goal

Remove the current Prafilter feature and its database storage completely while preserving applied migration history and all existing Business Manager, Meta account/WL, Shopee account, Shopee-to-WL mapping, and Sync BM progress data. Replace the Prafilter entry point with a dynamic Shopee workflow navigation foundation for Filter, Fix, OFF Filter, and OFF Fix. The four workflows remain placeholders only.

## Scope

This change removes the Prafilter route, UI components, application services, Prafilter-only tests, Prisma models, and Prafilter-only Meta client methods. It also removes the obsolete Prafilter implementation plan.

This change adds dynamic nested Shopee navigation and four lightweight placeholder routes per Shopee account. It does not add campaign storage, operational workflow logic, Meta API calls, Shopee performance data, or new database models.

## Database Cleanup

Remove `Campaign` and `CampaignDailyMetric` from `prisma/schema.prisma`, together with `MetaAccount.campaigns`. Do not modify the remaining fields or relations in `BusinessManager`, `ShopeeAccount`, `MetaAccount`, or `MetaBusinessMappingProgress`.

Keep `prisma/migrations/20260831170524_add_prafilter_campaign_models` unchanged because it is part of the applied migration history. After updating the schema, create a new Prisma migration named `remove_prafilter`. Its SQL must be generated after Prisma compares the updated schema with the current migration/database state. Review the generated SQL before application and confirm that it only removes the Prafilter foreign keys/tables, dropping `CampaignDailyMetric` before `Campaign` as required by their dependency.

No database reset, broad data deletion, or manual SQL written before inspecting the existing migration is allowed. Database verification must confirm that the two Prafilter tables are gone and the four protected models and their data remain available.

## Application Cleanup

Delete `app/shopee/[id]/prafilter`, `components/prafilter`, and `lib/prafilter`. Remove the Prafilter button from the existing Shopee detail page and delete the old Prafilter plan.

Remove `MetaGraphClient.getCampaigns()` and `MetaGraphClient.getCampaignInsights()` and their Prafilter type imports because commit inspection shows they were introduced solely for Prafilter. Retain `normalizeMetaAccountPath`; it is a reusable account-path boundary and is not harmful dead code. A final repository search must show no runtime or schema references to Prafilter, `CampaignDailyMetric`, `syncPrafilter`, or `getPrafilterPageData`. References inside preserved migration history are expected and are not runtime references.

The current `npm test` script runs only the Prafilter helper test. Replace it with the project-appropriate command for any new navigation/helper tests, or with Node's general test discovery if that matches the resulting test layout. Do not leave a script that targets deleted files.

## Dynamic Navigation Architecture

Keep the existing component boundary: `AppShell` remains a server component and `Sidebar` remains a focused client component. `AppShell` queries active Shopee accounts from Prisma using only `id` and `name`, ordered by name ascending, and passes that serializable list to `Sidebar`. This avoids browser-side database fetching and avoids converting the root layout into a client component.

Static navigation remains in the existing navigation module. The Shopee entry is rendered as a dedicated nested group rather than introducing an unrestricted recursive navigation framework. Its parent label links to `/shopee` and can also control expansion using a separate accessible toggle. Every account links to its existing detail route and owns a collapsible list containing:

- Filter → `/shopee/[id]/filter`
- Fix → `/shopee/[id]/fix`
- OFF Filter → `/shopee/[id]/off-filter`
- OFF Fix → `/shopee/[id]/off-fix`

The Shopee group automatically appears open for any `/shopee` path. The matching account automatically appears open for `/shopee/[id]` and its workflow paths. Users can toggle groups without a complex animation. Active state uses path-prefix/segment-aware matching so the root, account parent, and exact workflow link are distinguishable.

## Placeholder Routes

Create the four requested server-rendered pages. Each validates that the route ID is an integer, queries `ShopeeAccount` for its name, and calls `notFound()` when invalid or absent. Each page displays its workflow name, the Shopee account name, a short statement that the feature will be built later, and a link back to `/shopee/[id]`.

To avoid four copies of validation and layout logic, use one small shared server helper/component with a fixed workflow descriptor supplied by each page. The abstraction remains local to Shopee workflow placeholders and performs no operational work or Meta API request.

## Testing and Verification

Use test-first development for any pure navigation matching/helper logic: add focused failing tests for Shopee parent activation, account activation, and exact workflow activation before implementing the helper. Placeholder validity and database behavior are verified by TypeScript/build checks and safe runtime/database inspection unless the current project has an established integration-test harness.

Run Prisma format, validate, migration, and generation in the required order. Then run the available test command, `npx tsc --noEmit`, lint, and production build. Inspect build routes to ensure the four new dynamic routes exist and the Prafilter route does not.

For database safety, record protected-table row counts before migration and compare them afterward. Confirm the removed tables no longer exist using Prisma/database metadata without modifying unrelated rows. Manual UI verification may be performed with the development server if the environment permits browser access; otherwise report it explicitly as not performed and provide the automated/runtime evidence obtained.

## Non-Goals and Safety Boundaries

- Do not change Sync WL, Sync BM, Meta account discovery, or Shopee-to-WL assignment behavior.
- Do not introduce Filter/Fix/OFF Filter/OFF Fix business logic or storage.
- Do not fetch campaigns or insights from Meta.
- Do not reset the database or delete applied migration history.
- Do not push to GitHub.
