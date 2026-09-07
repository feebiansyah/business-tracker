# Business Tracker Authentication Design

## Goal

Protect every Business Tracker page and sensitive server action with email/password authentication, database-backed seven-day sessions, and an admin-only terminal user creation workflow. There is no browser registration.

## Data model

Add `User` and `Session` using a new additive Prisma migration. `User.email` is unique and stored as `trim().toLowerCase()`. Passwords use bcrypt with cost 12 and are never logged. `Session` stores only a SHA-256 hash of a cryptographically random 32-byte browser token, has `expiresAt`, belongs to `User`, and cascades on user deletion. Table casing in migration SQL must exactly match `User` and `Session`. The existing Prisma generator remains unchanged.

## Session contract

The browser receives a `bt_session` cookie containing the raw random token. The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, and expires exactly seven days after login. Sessions do not slide or renew. Missing, invalid, expired, revoked, or inactive-user sessions are unauthenticated; expired database rows may be deleted opportunistically. Logout deletes the database session and expires the cookie.

## Authentication boundary

Server-only helpers expose `normalizeEmail`, credential verification, session creation/deletion, `getCurrentUser`, and `requireUser`. `proxy.ts` provides an early redirect for protected document requests without a session cookie, while database validation remains authoritative in `AppShell`. The proxy derives and overwrites an internal pathname header so the root layout can render `/login` without the application shell. `/login` is the only public application page.

Every existing `"use server"` action module calls `requireUser()` before business logic. This protects WL, Shopee, campaign manual history, Meta sync, and Shopee import mutations even if invoked without the UI. No business query, importer, sync, formula, or route behavior changes.

## Login and logout

`/login` renders a responsive Business Tracker-styled form. Its Server Action validates email/password server-side, returns one generic failure message for unknown email, wrong password, or inactive user, creates a session on success, and redirects only to `/`. An authenticated visit to `/login` redirects to `/`.

Logout is a Server Action invoked from the existing navigation shell. It revokes the current session, clears the cookie, and redirects to `/login`. No registration route or UI exists.

## Admin user creation

`npm run user:create` runs an interactive Node script. It loads `.env` only as a fallback while preserving an already supplied `DATABASE_URL`, prompts for email/name/password, masks password input when attached to a TTY, validates email and a minimum 12-character password, hashes with bcrypt cost 12, rejects duplicate normalized email, and prints no password or hash.

## Security and errors

Credential errors are generic. A dummy bcrypt hash is checked for nonexistent emails to reduce account-enumeration timing differences. No open redirect is accepted. Session and password helpers are server-only; secrets and hashes never enter Client Component props. Cookie mutation occurs only in Server Actions. The migration is additive and must not reset or delete existing data.

## Testing and verification

Tests cover email normalization, valid/invalid/inactive credentials, session hashing and expiry, valid/invalid/expired session lookup, logout revocation, proxy route policy, protected-action contracts, secure cookie options, user-create validation, and absence of registration. Run focused auth tests, existing tests, Prisma format/validate/generate/status, TypeScript, ESLint, and production build. Review the final diff for auth-only changes.
