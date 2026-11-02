# Adsterra stuck operation: bounded correction

Baseline: `055e01b2cecabf322b53646b0362511dd85c4675`.

## Read-only production evidence

SELECT through the existing Railway application's private runtime found physical
campaign `1447912`, config `4`, label `medsos gilang (TERRA)`, Shopee `4`, Auto
disabled. There were no other aliases for this physical campaign.

Main operation: `CUSTOM_BID_SAVE`, generation `14`, `UNVERIFIED`, phase
`FINISHED`, **uncertain=true**, started `2026-11-01T09:03:59.746Z`.
Protective OFF: generation `3`, `VERIFIED`, uncertain=false, started
`2026-11-02T01:15:53.943Z`. Its legacy summary records one write and no
overlapping activation. The main legacy summary has no structured phase,
write count or original error. Last row update: `2026-11-02T01:15:54.441Z`.

This proves which slot blocks the campaign, not whether the original HTTP
request completed. No production record was changed. Current provider counts,
Inactive status, elapsed time and a later successful OFF cannot release it.

## Implementation plan

- Keep uncertainty fail-closed. Inspect both slots, with separate saved evidence
  and live GET observation. Report absent evidence explicitly.
- Record bounded structured diagnostics for coordinated Custom Bid / activity
  writes, including final rejection versus incomplete transport. A completed
  rejection or failed GET verification ends PARTIAL, not an ambiguous request.
- For OFF finishing while ON is still running, store a fence-bound completion
  receipt only when transport and marker acknowledgements are settled. A later
  reservation may close that bookkeeping via exact CAS only after the same ON
  operation has durably ended. No receipt, pending DB/HTTP, changed identity or
  generation mismatch: stay closed. Observation alone never writes/unlocks.
- Merge placement outcome and inspection into one top notice and one closed
  Detail. Preserve rejection action, native confirm, locks and protective actions.
- Manually exercise original helpers/components with fake DB/provider only;
  run TypeScript, scoped ESLint, production build and diff check. No automated
  tests, live writes, production changes, migrations, merge or deployment.
- Commit/push only this feature branch after review. The existing uncertain
  production operation remains unresolved unless additional request-completion
  evidence becomes available; do not claim the UI correction resolves it.

## Verification performed

- Railway runtime SELECT only: evidence above. Runtime log lookup for
  `2026-11-01T09:03:40Z`–`09:06:00Z` returned zero entries; no original HTTP
  outcome or marker/acknowledgement DB outcome could be recovered from it.
- Manual console observations using original store/provider/coordinated-write
  and Custom Bid helpers, with fake DB and HTTP only: final HTTP rejection and
  failed verification become PARTIAL and permit a new confirmation; HTTP
  timeout stays UNVERIFIED/uncertain and blocks it. A marker DB timeout yields
  MarkerPersistenceUncertain with no receipt settlement or provider dispatch.
- Receipt-bound OFF waiting for ON: remains blocked while ON runs; once that
  same ON has ended, exact CAS closes only OFF bookkeeping and increments its
  generation. Legacy unstructured OFF, uncertain OFF, changed main identity,
  and the production-shaped uncertain main remain blocked without DB changes.
- Original components in an isolated browser at 1440px and 390px: one top
  notice, one initially closed Detail, no page overflow. Inspection identifies
  main versus OFF blockers. Cancel makes zero execute calls; explicit rejected-ID
  exclusion uses a new single confirmation. Pending execution keeps tabs/action
  locked while OFF and AutoDisable remain accessible. Late inspection after
  a new action is ignored. NO_CHANGE displays "Sudah sesuai".
- TypeScript, scoped ESLint, final production build and diff check passed.
  First sandboxed build could not fetch Google Fonts; the network-enabled build
  succeeded without changing config. No automated tests were created or run.
- Independent read-only code review: no critical/important findings. A minor
  diagnostic wording issue was corrected (verification mismatch and concurrent
  activation are no longer labelled generic interruption).

These are mock/local checks, not proof of live writes or production resolution.
No production/provider writes, recovery, migration, merge or deploy were run.
