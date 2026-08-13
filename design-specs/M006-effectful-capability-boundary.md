---
id: M006
title: Effectful capability boundary
status: active
timebox: 5 focused sessions
vision_claims:
  - effect-contracts
  - capability-requirements
  - typed-failure
  - state-operation-realization
depends_on:
  - M004
  - M005A
---

# Mission

BANG can bind the checked `Account.withdraw` state transition to an effectful
realization boundary that requires declared debit authority and reports a typed
failure when the requested transition is outside the legal state relation.

M006 adds one vertical connection between the already demonstrated state,
effect, capability, and evidence axes. It does not add a general effect system
or authorization policy language.

## User journey

```text
Account state machine + withdraw precondition
  → DebitAccount capability declaration
  → WithdrawAccount realization contract
  → checked Core references
  → Effect service + typed error + capability requirement
  → independent Layer-backed realization
  → legal withdrawal succeeds when DebitAccount is provided
  → overdraft fails as WithdrawalRejected
  → defecting realization is distinguished from typed failure
  → evidence reports structural, scenario, and unsupported guarantees
```

Run `bun run demo:m006`. Inspect the generated withdrawal kit and
`.bang/evidence/M006.json`.

## Felt capability

A BANG contributor declares that realizing `Account.withdraw` is an effectful
operation requiring `DebitAccount`. The generated Effect port exposes that
authority in the Effect requirement channel and exposes expected rejection in
the typed error channel. A caller cannot compose the generated operation
without selecting a Layer that supplies the capability.

At the observable boundary:

```text
balance = 10, amount = 4, DebitAccount supplied
  → success AccountState { balance: 6 }

balance = 10, amount = 11, DebitAccount supplied
  → typed WithdrawalRejected { balance: 10, amount: 11 }

defecting implementation
  → conformance failure classified as a defect, not WithdrawalRejected
```

## Core fragment

Explanatory notation:

```text
capability DebitAccount

realization WithdrawAccount binds Account.withdraw {
  requires DebitAccount
  when disabled fail WithdrawalRejected
}
```

Canonical JSON adds two declarations:

```json
{
  "kind": "capability",
  "id": "DebitAccount"
}
```

```json
{
  "kind": "operationRealization",
  "id": "WithdrawAccount",
  "operation": {
    "stateMachine": "Account",
    "operation": "withdraw"
  },
  "requires": ["DebitAccount"],
  "disabled": {
    "kind": "failure",
    "id": "WithdrawalRejected"
  }
}
```

The realization derives its state input, operation parameters, success state,
and enabled relation from the referenced checked state-machine operation. The
failure carries the pre-state and operation parameters so a generated target
can preserve the rejected request without inventing domain fields.

## Semantic judgments

Let `Σ` contain checked state machines and `Κ` contain declared capabilities.

```text
K ∈ Κ
──────────────
Σ ; Κ ⊢ K capability

M ∈ Σ    op ∈ transitions(M)    K₁ ... Kₙ ∈ Κ
capability identities unique    failure identity fresh in realization
───────────────────────────────────────────────────────────────────
Σ ; Κ ⊢ realization R binds M.op requires K₁ ... Kₙ
```

For a state `s` and operation arguments `a`:

```text
enabled(M.op, s, a)
────────────────────────────────────────────
R(s, a) may succeed with implementation state s′

¬enabled(M.op, s, a)
────────────────────────────────────────────
R(s, a) must fail with the declared failure
```

The existing invariant-preservation obligation still governs successful next
states. M006 does not reinterpret the M004 state relation. Capability presence
authorizes attempting the effectful boundary; it does not make an otherwise
illegal state transition legal.

## Orthogonality contract

- state legality comes from `Account.withdraw` requirements;
- expected rejection comes from the realization's typed failure;
- environmental authority comes from `DebitAccount`;
- implementation behavior remains supplied by an independent target Layer;
- conformance observations produce evidence but do not become Core laws.

None of these facts silently implies another. In particular, providing debit
authority does not prove sufficient funds, and a legal state transition does
not imply that the caller possesses debit authority.

## Effect projection

The generated kit contains:

- the existing projected `AccountState` Schema and enabled predicate;
- `WithdrawalRejected` as an Effect Schema tagged error carrying `state` and
  `amount`;
- `DebitAccount` as a `Context.Service` requirement with a stable Core source
  identity;
- `WithdrawAccount` as a `Context.Service` whose method returns
  `Effect.Effect<AccountState, WithdrawalRejected, DebitAccount>`;
- a Layer adapter boundary for an independently written realization;
- conformance scenarios that use real Effect requirements and Layers;
- a result classifier that keeps success, typed failure, and defect distinct.

The projector follows the official `../effect` repository. Services express
domain contracts; Layers select implementations and supply dependencies. M006
does not introduce a project runtime wrapper or replace Effect's requirement,
error, or Layer composition machinery.

## Conformance direction

The generated harness checks:

1. a legal request with the capability supplied succeeds and returns the
   realization's state;
2. an illegal request with the capability supplied returns the declared typed
   failure containing the rejected inputs;
3. the generated operation retains `DebitAccount` in its requirement type;
4. a defecting realization is reported as a defect and never counted as the
   declared failure;
5. a successful next state still satisfies the M004 invariant suite.

These checks do not prove that arbitrary TypeScript cannot forge, cast, or
bypass an Effect service requirement.

## Acceptance evidence

- valid capability and operation-realization declarations decode and validate;
- unknown state machines, operations, and capabilities are rejected with
  realization-level diagnostics;
- duplicate capability requirements are rejected;
- binding an initializer instead of a transition is rejected for M006;
- generated Effect source is deterministic and matches a committed snapshot;
- the generated service method retains typed success, error, and requirement
  channels under TypeScript checking;
- an independent Layer-backed realization type-checks against the generated
  port;
- legal withdrawal from `10` by `4` succeeds with balance `6` only after the
  capability Layer is selected;
- withdrawal from `10` by `11` returns `WithdrawalRejected` with the rejected
  values;
- a defecting realization produces a conformance failure classified as defect;
- the successful realization passes the existing invariant-preservation suite;
- evidence distinguishes structural typing, scenario observations, property
  testing, typed runtime failure, defects, assumptions, and target weakening;
- M000–M005A demonstrations remain green;
- `just verify` passes from a clean checkout and the hosted run is green.

## Primary uncertainty

Can one small realization-binding construct connect a checked state transition
to Effect's success, error, and requirement channels without making Effect's
host types normative Core semantics?

## Non-goals

- a general algebra of effects or handlers;
- capability delegation, attenuation, revocation, transfer, or persistence;
- actor identity, roles, access-control lists, policy evaluation, or security
  principals;
- cryptographic or unforgeable authority in TypeScript;
- multiple alternative failures or a general error hierarchy;
- retries, schedules, transactions, concurrency, streams, scopes, or resource
  acquisition;
- realization synthesis or business-logic generation;
- changing the M004 transition predicate or invariant semantics;
- target-independent Layer semantics;
- Rust or Java capability projection.

## Result

Record the checked binding, the exact Effect type channels, observed legal and
illegal scenarios, defect distinction, target weakening, and the next concrete
pressure on effects or capabilities.
