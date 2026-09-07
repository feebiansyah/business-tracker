# Business Tracker Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure email/password login, database sessions, route/action protection, logout, and terminal-only user creation.

**Architecture:** Custom server-only auth uses bcrypt password hashes and SHA-256-hashed random database session tokens. Next.js Proxy provides an optimistic cookie gate; layouts and Server Actions perform authoritative database checks.

**Tech Stack:** Next.js 16 App Router, Prisma 6.19.3, MySQL, TypeScript, bcryptjs, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-07-business-tracker-auth-design.md`

## Global Constraints

- Preserve the `prisma-client` generator and output path.
- Add one additive migration; never reset or alter business data.
- No registration, JWT, localStorage auth, credential logging, or open redirect.
- Session lifetime is exactly seven days without renewal.
- Do not modify business logic, queries, importers, sync, classifications, or formulas.
- Do not commit or push during this execution.

---

### Task 1: Auth schema and password primitives

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260907131906_add_user_auth/migration.sql`
- Create: `lib/auth/credentials.ts`
- Test: `lib/auth/credentials.test.mjs`, `lib/auth/schema-contract.test.mjs`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `normalizeEmail(value): string`, `validateNewUserInput(input)`, `hashPassword(password)`, `verifyPassword(password, hash)`.
- Produces: Prisma `User` and `Session` models.

- [ ] Write tests for normalization, password validation/hash verification, inactive/unknown/wrong credentials, and exact additive schema contract.
- [ ] Run focused tests and confirm failures because auth modules/models do not exist.
- [ ] Install only `bcryptjs`, implement primitives, update schema, create migration with `prisma migrate dev --create-only`, inspect SQL, apply normally, and generate client.
- [ ] Run focused tests and confirm PASS.

### Task 2: Database session lifecycle

**Files:**
- Create: `lib/auth/session-core.ts`, `lib/auth/session.ts`
- Test: `lib/auth/session-core.test.mjs`, `lib/auth/session.integration.test.mjs`

**Interfaces:**
- Produces: `createSessionToken()`, `hashSessionToken(token)`, `sessionExpiry(now)`, `getCurrentUser()`, `requireUser()`, `createUserSession(userId)`, `deleteCurrentSession()`.

- [ ] Write failing unit/integration tests for secure token hashing, seven-day fixed expiry, valid session, invalid/expired session, inactive user, and revocation.
- [ ] Run focused tests and confirm expected RED.
- [ ] Implement server-only cookie/database adapter; store only token hash and use secure cookie options.
- [ ] Run focused tests and confirm PASS.

### Task 3: Login and logout UI

**Files:**
- Create: `app/login/page.tsx`, `app/login/actions.ts`, `components/auth/login-form.tsx`, `app/auth-actions.ts`
- Modify: `app/layout.tsx`, `components/layout/app-shell.tsx`, `components/layout/sidebar.tsx`
- Test: `lib/auth/ui-contract.test.mjs`

**Interfaces:**
- Consumes: credential/session helpers.
- Produces: `loginAction(state, formData)` and `logoutAction()`.

- [ ] Write failing contract tests for login fields, generic error, authenticated redirect, responsive styling, logout action/button, and no registration UI.
- [ ] Run focused tests and confirm RED.
- [ ] Implement login action/form/page and logout action/button; render `/login` without `AppShell` while preserving existing shell for protected pages.
- [ ] Run focused tests and confirm PASS.

### Task 4: Route and Server Action protection

**Files:**
- Create: `proxy.ts`, `lib/auth/route-policy.ts`
- Modify: every existing `app/**/actions.ts` server-action module.
- Test: `lib/auth/route-policy.test.mjs`, `lib/auth/action-protection.test.mjs`

**Interfaces:**
- Consumes: `SESSION_COOKIE_NAME`, `requireUser()`.
- Produces: public/protected route policy and early unauthenticated redirect.

- [ ] Write failing tests for `/login` public, business routes protected, valid cookie pass-through, and `requireUser()` at every sensitive action entry point.
- [ ] Run tests and confirm RED.
- [ ] Implement Proxy gate and add one auth guard at the start of every exported sensitive Server Action.
- [ ] Run auth and affected action tests and confirm PASS.

### Task 5: Terminal user creation

**Files:**
- Create: `scripts/create-user.mjs`, `lib/auth/create-user-input.ts`
- Test: `lib/auth/create-user-input.test.mjs`, `lib/auth/create-user-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: normalized email/password hash and generated Prisma client.
- Produces: `npm run user:create` interactive workflow.

- [ ] Write failing tests for normalized valid input, invalid email, password shorter than 12, no password CLI argument, hidden TTY prompt contract, and duplicate handling.
- [ ] Run focused tests and confirm RED.
- [ ] Implement validation and interactive script using active `DATABASE_URL`, with `.env` as non-overriding fallback.
- [ ] Run focused tests and confirm PASS.

### Task 6: Full verification and diff review

**Files:** all auth files above only.

- [ ] Run focused auth tests and full `npm test`.
- [ ] Run `npx prisma format`, `npx prisma validate`, `npx prisma generate`, and `npx prisma migrate status`.
- [ ] Run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- [ ] Run `git diff --check`, inspect all changed paths and migration SQL, confirm generator unchanged and no registration route.
- [ ] Stop without commit or push and report commands for local/production user creation and localhost manual testing.
