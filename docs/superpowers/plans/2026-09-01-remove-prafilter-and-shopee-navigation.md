# Remove Prafilter and Add Shopee Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every Prafilter runtime and database artifact while preserving existing business data, then add database-driven nested Shopee navigation and four non-operational placeholder routes.

**Architecture:** `AppShell` remains a Server Component, selects active Shopee account identifiers/names, and passes serializable data into the existing client `Sidebar`. A small pure path-state helper drives tested active/open navigation behavior, while a shared server-rendered Shopee workflow placeholder validates account IDs and loads account names for four thin route pages.

**Tech Stack:** Next.js 16.3.3 App Router, React 19, TypeScript, Prisma 6.19.3 with MySQL, Node test runner, Tailwind CSS, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-09-01-remove-prafilter-and-shopee-navigation-design.md`

## Global Constraints

- Do not change Sync WL, Sync BM, Meta account discovery, Shopee-to-WL assignment, or `MetaBusinessMappingProgress` behavior.
- Do not add Filter/Fix/OFF Filter/OFF Fix business logic, database models, campaign fetches, Shopee data, ROI logic, or Meta mutations.
- Keep `prisma/migrations/20260831170524_add_prafilter_campaign_models` unchanged.
- Do not reset the database or delete existing Shopee, Meta/WL, Business Manager, mapping, or Sync BM progress data.
- Query only active Shopee accounts for the sidebar and order them by name ascending.
- Do not push to GitHub.
- Follow the installed Next.js documentation in `node_modules/next/dist/docs/`; route `params` are promises and database access stays in Server Components.

---

### Task 1: Tested Shopee navigation path state

**Files:**
- Create: `components/layout/navigation-state.ts`
- Create: `components/layout/navigation-state.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `getShopeeNavigationState(pathname: string, accountId: number): { shopeeActive: boolean; accountActive: boolean; activeWorkflow: ShopeeWorkflowSlug | null }`
- Produces: `type ShopeeWorkflowSlug = "filter" | "fix" | "off-filter" | "off-fix"`
- Produces: `npm test` running `node --test components/**/*.test.mjs`

- [ ] **Step 1: Write the failing path-state tests**

Create `components/layout/navigation-state.test.mjs` with literal expectations covering `/shopee`, `/shopee/3`, `/shopee/3/filter`, `/shopee/3/off-filter`, another account ID, and unrelated `/meta` paths. Import the not-yet-created helper from `./navigation-state.ts`.

- [ ] **Step 2: Point the test script at surviving tests and verify RED**

Change `package.json` to `"test": "node --test components/**/*.test.mjs"`, then run `npm test`.

Expected: FAIL because `components/layout/navigation-state.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

Parse the pathname into slash-delimited segments. Treat the Shopee parent as active only when the first segment is `shopee`, the account as active only when the second segment equals `String(accountId)`, and the workflow as active only when the third segment is one of the four exact workflow slugs for that account.

- [ ] **Step 4: Verify GREEN**

Run `npm test`.

Expected: all navigation-state tests PASS with zero failures.

- [ ] **Step 5: Commit the tested helper**

```powershell
git add -- package.json components/layout/navigation-state.ts components/layout/navigation-state.test.mjs
git commit -m "test: define Shopee navigation state"
```

### Task 2: Dynamic nested Shopee sidebar

**Files:**
- Modify: `components/layout/navigation.ts`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/app-shell.tsx`

**Interfaces:**
- Consumes: `getShopeeNavigationState(pathname, accountId)` and `ShopeeWorkflowSlug` from Task 1.
- Produces: `type SidebarShopeeAccount = { id: number; name: string }`
- Produces: `Sidebar({ shopeeAccounts }: { shopeeAccounts: SidebarShopeeAccount[] })`
- Produces: async `AppShell` query selecting `{ id: true, name: true }` with `where: { status: "ACTIVE" }` and `orderBy: { name: "asc" }`.

- [ ] **Step 1: Separate the Shopee root from ordinary static items**

Keep the existing static item type and icons, export the Shopee root descriptor separately, and leave Dashboard/WL/Meta/ADU/Terra/ROI/Settings unchanged.

- [ ] **Step 2: Load active accounts on the server**

Make `AppShell` async, import `prisma`, execute the narrow `findMany` selection/order/filter, and pass the result to `Sidebar`. Do not fetch from the browser or modify `app/layout.tsx` into a Client Component.

- [ ] **Step 3: Render accessible nested navigation**

Update `Sidebar` to accept account props, keep `usePathname`, and use local state for user-controlled expansion. Render the `/shopee` parent link plus a separate button with `aria-expanded`; render each account detail link plus its own expansion button; render the four workflow links from a fixed descriptor array. Automatically display the parent/account branch when the path helper reports it active, and style only the exact workflow link as selected.

- [ ] **Step 4: Run focused and static checks**

Run `npm test` and `npx tsc --noEmit`.

Expected: navigation tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the sidebar foundation**

```powershell
git add -- components/layout/navigation.ts components/layout/sidebar.tsx components/layout/app-shell.tsx
git commit -m "feat: add dynamic Shopee workflow navigation"
```

### Task 3: Validated workflow placeholder routes

**Files:**
- Create: `components/shopee/workflow-placeholder.tsx`
- Create: `app/shopee/[id]/filter/page.tsx`
- Create: `app/shopee/[id]/fix/page.tsx`
- Create: `app/shopee/[id]/off-filter/page.tsx`
- Create: `app/shopee/[id]/off-fix/page.tsx`

**Interfaces:**
- Produces: `ShopeeWorkflowPlaceholder({ params, workflow }: { params: Promise<{ id: string }>; workflow: "Filter" | "Fix" | "OFF Filter" | "OFF Fix" })`.
- Each route delegates its promised `params` and one literal workflow label to the shared server component.

- [ ] **Step 1: Create the shared server placeholder**

Await `params`, parse the ID with `Number`, require `Number.isInteger(id)` and `id > 0`, query `prisma.shopeeAccount.findUnique({ where: { id }, select: { id: true, name: true } })`, and call `notFound()` for invalid/missing accounts. Render the workflow/account heading, `Fitur {workflow} akan dibangun pada tahap berikutnya.`, and a link back to `/shopee/{id}`.

- [ ] **Step 2: Create four thin route pages**

Each `page.tsx` exports `dynamic = "force-dynamic"` and an async default page accepting `params: Promise<{ id: string }>` that returns the shared placeholder with the correct literal workflow label. Do not add actions, tables, schema, or Meta calls.

- [ ] **Step 3: Remove the Prafilter detail entry point**

Modify `app/shopee/[id]/page.tsx` so its action area contains only the existing `Tambah WL` behavior. Do not change the query or WL table.

- [ ] **Step 4: Verify the placeholder boundary**

Run `npx tsc --noEmit` and `npm run lint`.

Expected: both commands exit 0.

- [ ] **Step 5: Commit placeholder routes**

```powershell
git add -- components/shopee/workflow-placeholder.tsx app/shopee/[id]/filter/page.tsx app/shopee/[id]/fix/page.tsx app/shopee/[id]/off-filter/page.tsx app/shopee/[id]/off-fix/page.tsx app/shopee/[id]/page.tsx
git commit -m "feat: add Shopee workflow placeholders"
```

### Task 4: Remove Prafilter application code

**Files:**
- Delete: `app/shopee/[id]/prafilter/actions.ts`
- Delete: `app/shopee/[id]/prafilter/page.tsx`
- Delete: `components/prafilter/campaign-jenis-control.tsx`
- Delete: `components/prafilter/campaign-note-control.tsx`
- Delete: `components/prafilter/campaign-status-control.tsx`
- Delete: `components/prafilter/prafilter-table.tsx`
- Delete: `components/prafilter/prafilter-toolbar.tsx`
- Delete: `lib/prafilter/calculations.ts`
- Delete: `lib/prafilter/date.ts`
- Delete: `lib/prafilter/helpers.test.mjs`
- Delete: `lib/prafilter/queries.ts`
- Delete: `lib/prafilter/sync.ts`
- Delete: `lib/prafilter/types.ts`
- Delete: `lib/prafilter/upsert-data.ts`
- Delete: `docs/superpowers/plans/2026-09-01-prafilter-v1.md`
- Modify: `lib/meta/client.ts`

**Interfaces:**
- Removes: Prafilter routes/actions/components/services/types/tests and `MetaGraphClient.getCampaigns/getCampaignInsights`.
- Preserves: `normalizeMetaAccountPath` and all existing BM/WL Meta client methods.

- [ ] **Step 1: Delete the isolated Prafilter directories and old plan**

Use patch-based deletions for every listed file. Do not touch the applied migration directory.

- [ ] **Step 2: Remove Prafilter-only Meta client code**

Delete the `@/lib/prafilter/types` import and the two methods `getCampaigns` and `getCampaignInsights`. Leave retry, pagination, usage limiting, authorization, business discovery, ad-account discovery, and account-ID helper behavior unchanged.

- [ ] **Step 3: Audit runtime references**

Run:

```powershell
rg -n -i "prafilter|CampaignDailyMetric|syncPrafilter|getPrafilterPageData" app components lib package.json
```

Expected: no matches. Separately verify `rg -n "getCampaigns|getCampaignInsights" lib app components` has no matches.

- [ ] **Step 4: Run regression checks**

Run `npm test`, `npx tsc --noEmit`, and `npm run lint`.

Expected: all commands exit 0.

- [ ] **Step 5: Commit application cleanup**

```powershell
git add -A -- app/shopee/[id]/prafilter components/prafilter lib/prafilter docs/superpowers/plans/2026-09-01-prafilter-v1.md lib/meta/client.ts
git commit -m "refactor: remove Prafilter application code"
```

### Task 5: Remove Prafilter schema and migrate safely

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_remove_prafilter/migration.sql` through Prisma CLI.
- Preserve unchanged: `prisma/migrations/20260831170524_add_prafilter_campaign_models/migration.sql`

**Interfaces:**
- Removes: Prisma models `Campaign`, `CampaignDailyMetric`, and relation `MetaAccount.campaigns`.
- Preserves: `BusinessManager`, `ShopeeAccount`, `MetaAccount`, and `MetaBusinessMappingProgress` definitions/data.

- [ ] **Step 1: Capture protected pre-migration evidence**

Use a read-only Prisma/SQL query appropriate to the configured MySQL connection to record row counts for `BusinessManager`, `ShopeeAccount`, `MetaAccount`, and `MetaBusinessMappingProgress`, plus the current migration status. Do not print `DATABASE_URL` or credentials.

- [ ] **Step 2: Remove only the Prafilter schema declarations**

Delete `MetaAccount.campaigns`, `model Campaign`, and `model CampaignDailyMetric`. Do not reformat or alter unrelated model fields manually.

- [ ] **Step 3: Format and validate the reduced schema**

Run `npx prisma format` followed by `npx prisma validate`.

Expected: both exit 0.

- [ ] **Step 4: Generate and apply the new migration**

Run `npx prisma migrate dev --name remove_prafilter`. If Prisma warns about dropping Prafilter data, accept only that expected destructive change; never accept a reset. Inspect the generated SQL and require that it only drops Prafilter foreign keys/tables, with no protected-table drop or unrelated column change.

- [ ] **Step 5: Regenerate Prisma Client**

Run `npx prisma generate`. If Windows reports `EPERM` for a query-engine DLL, identify and stop only project-owned Next dev or Prisma Studio processes, then retry; do not ignore the error.

- [ ] **Step 6: Verify database state and preserved data**

Use read-only database metadata to confirm `Campaign` and `CampaignDailyMetric` no longer exist. Re-run the four protected row counts and compare them exactly with Step 1. Run `npx prisma migrate status` and require the schema to be up to date.

- [ ] **Step 7: Commit schema and migration**

```powershell
git add -- prisma/schema.prisma prisma/migrations
git commit -m "refactor: remove Prafilter database models"
```

### Task 6: Full validation and final audit

**Files:**
- Modify only if a verification command exposes an in-scope defect; follow a new RED/GREEN cycle for behavioral defects.

**Interfaces:**
- Verifies every goal and protected boundary from the spec.

- [ ] **Step 1: Run fresh Prisma verification**

Run `npx prisma format`, `npx prisma validate`, and `npx prisma generate`.

Expected: all exit 0.

- [ ] **Step 2: Run the complete code verification suite**

Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`, recording exit codes and test totals.

Expected: all exit 0. Build output lists `/shopee/[id]/filter`, `/shopee/[id]/fix`, `/shopee/[id]/off-filter`, and `/shopee/[id]/off-fix`, and does not list `/shopee/[id]/prafilter`.

- [ ] **Step 3: Run final repository searches**

Search `app`, `components`, `lib`, `package.json`, and `prisma/schema.prisma` for `prafilter`, `Prafilter`, `CampaignDailyMetric`, `syncPrafilter`, and `getPrafilterPageData`. Require zero matches. Search all of `prisma/migrations` separately and confirm matches occur only in preserved historical migration content and the new removal migration name/SQL.

- [ ] **Step 4: Audit protected code paths**

Use `git diff 7f48dd5 --` and confirm no behavioral edits to Sync WL, Sync BM, Shopee-to-WL form/actions, or protected Prisma models beyond deleting `MetaAccount.campaigns`.

- [ ] **Step 5: Perform safe runtime verification when possible**

Start `npm run dev`, verify the sidebar account list and the four workflow links against existing database accounts, open each placeholder route, confirm invalid account IDs return 404, and confirm Prafilter is absent. If browser access is unavailable, report manual UI verification as not performed rather than claiming it passed.

- [ ] **Step 6: Review status and prepare the report**

Run `git status --short` and `git log --oneline -8`. Report deleted files, removed models, migration name and table state, protected row-count comparison, dynamic sidebar data flow, placeholder routes, every validation result, and manual verification status. Do not push.
