# Adsterra whitelist failure diagnostics

Goal: preserve bounded, sanitized provider failure evidence without changing mutation decisions, fencing, readiness, recovery authorization, or retries.

## Scope and evidence

- Baseline: `b070253bc81eabdb28952529f846266a17593162`; branch `fix/adsterra-whitelist-diagnostics`.
- Provider currently discards non-2xx bodies; application hides origin errors; persisted summaries contain only outcome/phase/metadata/write count. Recovery does not expose those summaries.
- Official `partners-api.yml` documents PUT `/advertiser/linking/whitelist.json`, JSON `campaign_id` and `placement_ids`, and validation errors including per-placement rejection reasons. The existing request matches that contract; this does not identify the actual production rejection.
- Production SSH authentication now succeeds, but the SSH gateway reports `The agent path is temporarily unavailable`; selecting the previously active instance explicitly reports that its container exited. No restart/deploy was attempted. No production record has been read or changed. Historical response bodies cannot be reconstructed from the code.

## Implementation / manual verification plan

1. Add a small diagnostics DTO, allowlisted provider reason extraction and a versioned summary codec bounded below the existing 2,000-character column limit. Never persist arbitrary error messages, URLs, payloads, credentials, or raw bodies. Old records explicitly have no original reason available.
2. Bound response body consumption within the original HTTP timeout/budget; retain HTTP status even when a body cannot be consumed. Capture request stage and actual dispatch count; preserve existing uncertainty on ambiguous HTTP/body/DB outcomes.
3. Carry evidence through application results, persisted summaries, and both existing recovery displays. Do not change guard predicates, API payloads, success checks, confirmation, or recovery behavior.
4. Manually inspect original helpers with injected fake transport/store for API rejection, invalid response, GET mismatch, timeout, body limit, unknown/secret-bearing messages and old summaries. No automated tests and no real provider/database writes.
5. Run TypeScript, scoped ESLint, production build and diff check. Obtain independent diff review, then explicitly stage only this patch and push only the repair branch.

## Review focus

- A failed/ambiguous request must not become success through diagnostics.
- Unknown provider prose is withheld rather than copied into logs/DTOs.
- Response caps/timeouts include streaming body reads and do not schedule retries.
- Stored JSON remains valid within 2,000 characters; legacy summary text is never trusted for display.
- Recovery shows saved failure evidence separately from current GET observations and does not unlock uncertainty.

## Execution evidence

- Manual Node console (not an automated test suite), original prepare/execute/store/provider/recovery helpers, injected in-memory DB and fake HTTP only: HTTP 422 with `Validation failed` / `Not suitable ad unit` -> PARTIAL; invalid JSON -> PARTIAL; PUT echo followed by empty GET -> PARTIAL; transport timeout -> UNVERIFIED with uncertainty retained. Each scenario dispatched exactly one fake PUT, no retries.
- An oversized 422 body -> UNVERIFIED with HTTP 422 retained. A stalled 422 stream with a short manual request budget stopped after about 284ms, retaining HTTP 422. No raw body was persisted.
- Unknown secret-bearing messages and unexpected stored properties were withheld. Legacy summaries retained known phase/write count but had no reconstructed original reason. Original diagnostics component rendered both the stored error and explicit legacy-unavailable message.
- Independent read-only review: no remaining Critical/Important issues. One minor deferred: semantic shape errors on successful method-clear responses still use existing generic handling rather than an `INVALID_RESPONSE` entry. Non-2xx clear errors are captured; mutation/guard behavior is unchanged.
- TypeScript, scoped ESLint, and diff check passed. On 2026-10-30, after the user stopped the dev server, the final `npm run build` passed (Prisma generate, Next.js compilation, TypeScript, and page generation). Earlier attempts were blocked by an engine DLL lock; no user process was terminated by the agent.
- Production cause remains unproven because SSH access was unavailable. No production SELECT, recovery, provider write, database write, migration, merge, or deploy was performed.
