# Compact Adsterra operator UI

## Approved design and scope

Implement the user's supplied Campaign/Placement design on baseline
`9268001a393cfd5d27b965585dafa5b3f991091b`. This is presentation only.
Campaign has six columns; per-list availability/timestamps remain independent.
Method selection and confirmation move into accessible dialogs. Placement keeps
the server-selected method, analysis, candidate copy, and explicit prepare/execute.
Critical opposite-list and all-GEO bid effects remain visible before confirmation.

Approach: reuse existing action calls, props, locks, revision checks and mounted
components. Add a small local dialog/notice presentation helper rather than
changing shared application dialogs or operation state. Dialogs are modeless
(`aria-modal=false`): initial/return focus and Escape work, but the background is
not inert and keyboard can reach the existing protective controls. No new fetch,
polling, persistence, server contract, or mutation logic.

## Plan

- [x] Campaign: compact table, method badge/setup dialog, per-list Detail.
- [x] Placement: method badge, rules disclosure, explicit confirmation dialog;
  retain recovery without CSV and pending controls outside disabled fieldsets.
- [x] Manual isolated browser preview with original components and fake actions:
  1440/390px, long names/many campaigns, loading/errors/unset/conflict, keyboard,
  confirmation/pending and protective controls. No automated tests, live write,
  database operation, login, or real method change.
- [x] TypeScript, scoped ESLint, production build, diff check, final review.
  Stage explicit files, commit and push only this feature branch.

## Review focus

Do not change server actions, readiness, guard/signatures, TTL, recovery protocol,
analysis/candidates, API, scheduling, credentials, schema/migrations or dependencies.
Never treat missing/error as zero. Portal confirmation controls must remain usable
under the existing ancestor fieldset lock. Preserve component keys/lifetimes and
all action calls/payloads. Preserve main, Meta branches, stash and `.env`.

## Verification record

No automated tests created or run, as instructed. Manual Chrome preview used the
original UI with in-memory fake action DTOs, no project environment or database,
and CSP connect-src none. Observed 1440px/390px without page overflow, separate
unset/unavailable/conflict/list errors, 13/25 progressive loading and partial batch
failure retaining previous rows. Resize did not add calls. Opening method setup
did not add calls. Portaled confirmations remained enabled while background
fieldset/tabs were locked. Fake protective OFF and AutoDisable remained available
and did not unmount the pending confirmation. Keyboard Enter twice caused one
fake execute; Escape did not close pending. Fake PARTIAL rendered Selesai sebagian
and released the lock after result. Target/opposite counts and all-GEO bid impact
were visible without opening Detail. Screenshots are private scratch artifacts
outside Git, not live provider evidence.

Final source: npx.cmd tsc --noEmit PASS; scoped ESLint PASS; npm.cmd run build
PASS; git diff --check PASS. Earlier build attempts hit Prisma DLL lock. The
remaining locker was traced to the agent-owned dev launcher from the prior task;
only its verified Next descendants were stopped, not user processes.
Independent source review found no blockers. No server actions, API/DB, operation
context, guards, rule helpers, schema/migrations, auth or dependencies changed.
