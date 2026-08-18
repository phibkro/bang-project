# 0009 — Capability quantity and single-use grant boundary

- **Status:** accepted
- **Date:** 2026-08-16
- **Scope:** M018 exact-one capability use
- **Extends:** decisions 0006 and 0007

## Decision

Checked Core owns capability requirements, including the quantity kind and positive exact-use count. The Effect target may support only the checked `exactly 1` requirement for M018.

The target issues an opaque `DebitAccountGrant` and consumes it with an atomic state transition after destination and enabled checks and before the independent implementation. Consumption remains committed across typed failure and defect. A wrong destination or disabled transition does not consume the grant.

Evidence records observations and material closure. It must derive quantity from checked Core and must not turn one observed use into a lifetime, memory, delivery, termination, fairness, or distributed exactly-once claim.

## Consequences

- Reusable `WithdrawAccount` remains explicitly unbounded.
- `WithdrawAccountOnce` is a distinct realization with exact quantity `1` and failure `WithdrawalRejectedOnce`.
- Target-local reuse is reported as `DebitAccountGrantAlreadyConsumed`.
- Unsafe host code and direct implementation calls remain stated weakenings rather than hidden assumptions.

## Rejected alternatives

- Do not store quantity only in target metadata.
- Do not default a missing quantity to unbounded.
- Do not restore a consumed grant after an implementation failure.
- Do not add a general linear type system or distributed grant registry for this mission.
