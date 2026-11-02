# Adsterra Replace Unblock Design

## Goal

Restore the practical Campaign → Placement → Apply flow when a completed
Custom Bid request has an unknown transport outcome, without declaring that
old request successful or generally weakening the physical-campaign guard.

## Root cause

Adsterra stores every provider write in one current-operation row. A Custom Bid
request that has returned through the application pipeline as
`UNVERIFIED / FINISHED / uncertain=true` remains the current main operation.
The generic `reserve()` check therefore blocks a later list application or
method confirmation forever. Clickadu has no cross-feature operation row, so
its fresh list confirmation is not coupled to an old per-item edit.

## Bounded policy

Only a fresh `APPLY_BLACKLIST`, `APPLY_WHITELIST`, or `SET_METHOD` preparation
may supersede a main operation when all of these durable fields match:

- action is `CUSTOM_BID_SAVE` or `CUSTOM_BID_DELETE`;
- status is `UNVERIFIED`;
- phase is `FINISHED`;
- `uncertain` is true;
- protective OFF is terminal and not uncertain.

The replacement is one fenced CAS that matches the old operation identity,
generation, action, status, phase, uncertainty and protective-OFF generation.
It increments the main generation and installs the new PREPARED operation.
This prevents compliant continuations from the old generation from changing
bookkeeping. It does not cancel, complete, retry, or prove the old provider
request.

All other writers retain the existing strict guard. In particular, another
Custom Bid write, ON/Auto, config mutation, a RUNNING operation, an unfinished
list/method operation, an ambiguous protective OFF, and a non-FINISHED unknown
request remain blocked.

## Evidence and operator flow

The CAS stores bounded structured evidence that the previous Custom Bid
outcome remains unknown. The server preview exposes one concise warning in the
existing browser confirmation. The final result preserves the warning in the
existing Detail area; there is no recovery panel or additional confirmation.

The new list operation still recalculates analysis, validates scope and method,
uses the signed five-minute confirmation, replaces the full target, performs
all existing Custom Bid behavior, and requires final GET verification. Cancel
uses the existing PREPARED cancellation path and sends no provider write.

## Residual risk

Generation fencing only controls this application's database continuations.
The earlier provider request may still be accepted or applied later. A final
GET proves the state only at the time it is read; it cannot retract an old HTTP
request or prevent direct external changes. The UI and saved diagnostics must
say this plainly. No success is inferred for the historical request.

Campaign `1447912` is the acceptance case: its generation-14
`CUSTOM_BID_SAVE / UNVERIFIED / FINISHED / uncertain=true` record can be
superseded only by a new confirmed list/method flow, while ordinary writes
remain blocked.
