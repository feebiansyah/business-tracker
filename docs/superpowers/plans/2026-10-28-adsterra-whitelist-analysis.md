# Adsterra placement analysis list choice

## Approved scope

Continue feature/adsterra-placement-lists from 89a6c752. Add a local analysis
choice, not provider mode detection or a provider write capability.
Whitelist requires cost >= IDR 1000 and (ROI >= 20 OR (ROI > 10 AND CTR > 8)).
Use original Decimal values. Valid zero impressions may still qualify via ROI
>=20; unknown/invalid data and insufficient spend must not qualify by inversion.

## Approach and file boundaries

Keep decision.ts, analysis.ts, blacklist.ts, actions, and provider clients intact.
Add a positive whitelist classifier in lib/adsterra-roi/whitelist-analysis.ts.
Use it for the selected candidate list and table status. Preserve existing
blacklist candidates and all financial summaries.
Add optional copy-list/sorting labels with identical defaults for other callers;
do not change sorting algorithms, Custom Bid handlers, or existing write payloads.

## Steps

- [x] Implement positive whitelist classification and stable candidate IDs.
- [x] Add Blacklist/Whitelist choice, selected rules/count/copy list, and analysis
  status labels. Separate analysis from provider state in visible copy.
- [x] Block the Replace Blacklist handler and omit its control in Whitelist;
  block choice changes during existing busy/write locks. Invalidate old results
  when campaign, period, CSV, or FX input changes; do not trigger requests.
- [x] Manually inspect original workflow/table with isolated mocks, no provider
  or database transport: exact spend/ROI/CTR boundaries, zero impressions, unknown
  data, empty candidates, copy output, scope changes, desktop/mobile, write guard.
- [x] Run TypeScript, scoped ESLint, production build, and diff checks. No
  automated tests are created or run, as explicitly requested by the user.
- [x] Review this scope. Release authorized only to this feature branch, with
  explicit staging and normal push after final staged-diff inspection.

## Review focus

- Blacklist rule, original candidate order, CSV matching, FX, and period unchanged.
- ROI null/invalid counts/invalid placement ID never become whitelist candidates.
- Mode choice alone never fetches, replaces, resets bids, or changes provider mode.
- Sorting remains global-before-pagination and Custom Bid editors retain identity.
- No Meta/shared auth/schema/database/.env/stash/main changes; no merge/deploy.

## Verification evidence (2026-10-28)

- Manual Chrome preview used the original workflow, table, analysis math, and
  whitelist helper, with mocked actions and provider/database transport blocked.
  No automated tests or real provider writes were run.
- Cost 1000: ROI 15/CTR 9 qualifies; ROI 15/CTR 5, ROI 10/CTR 9,
  ROI 19.999/CTR 8, and ROI 15/CTR 8 do not. ROI 20 qualifies with
  CTR 5, CTR 0, or valid zero impressions. ROI 10.01/CTR 8.01 qualifies.
  Cost 999 stays insufficient; null ROI/invalid statistics stay unknown.
- Boundary fixture: original blacklist stays 4 IDs; whitelist is 5 IDs. Copy
  matches those 5 IDs and the underlying analysis is not mutated. Switching
  choices preserves the Custom Bid draft and never invokes an action. Whitelist
  omits Replace Blacklist and its handler also rejects that analysis choice.
- Campaign/date changes clear stale results without fetching. Empty candidates
  disable Copy and do not clear provider lists. Busy analysis locks the choice.
- A 66-row preview has 60 whitelist candidates on both pages; sorting precedes
  pagination, copy covers the full result, and unknown status stays last.
- Desktop 1440px / mobile 390px inspected visually: no page overflow, table
  scrolls locally. Keyboard choice selection works. Screenshots remain outside
  the repository and are not release files.
- Read-only review found an ID-guard mismatch. The corrected guard accepts
  supported leading-zero IDs (0099), rejects unsafe integer IDs and zero, and
  preserves the original display/copy identity. Rechecked in the browser.
- Final source: TypeScript, scoped ESLint, and production build exited 0.
  Prisma generate ran as part of build; no migration or database write ran.
  Diff check passed. CSV parsing/matching, live provider reads, and write behavior
  were not exercised live in this stage; their existing implementation is intact.
