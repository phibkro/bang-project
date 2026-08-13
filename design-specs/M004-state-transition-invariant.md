---
id: M004
title: State transition and invariant preservation
status: complete
timebox: 5 focused sessions
vision_claims:
  - coalgebraic-state
  - legal-transition-relation
  - invariant-preservation
depends_on:
  - M001
  - M003
---

# Mission

BANG can define Account state, initialization, withdrawal, and a nonnegative-balance invariant; project their obligations into an Effect conformance harness; and return a domain-level counterexample for an implementation that violates preservation.

## User journey

```text
Account state-machine contract
  → Core decode and semantic validation
  → legal initialization and transition obligations
  → deterministic Effect model port and property harness
  → lawful realization passes sampled preservation checks
  → overdraft input is rejected from the legal transition relation
  → broken realization returns a minimized negative-balance counterexample
  → evidence records scope, seed, skips, shrink path, assumptions, and target weakening
```

Run `just preview`, inspect `generated/effect/AccountStateMachine.ts`, and inspect `.bang/evidence/M004.json`.

## Semantic inventory

| Object                              | Role                     | Authority                              |
| ----------------------------------- | ------------------------ | -------------------------------------- |
| state-machine Core declaration      | specification assertion  | Core fixture after semantic validation |
| `AccountState.balance`              | owned state observation  | current realization value              |
| `initialize(initialBalance)`        | construction             | independent realization                |
| `withdraw(state, amount)`           | state transition         | independent realization                |
| initializer/transition requirements | legal-input relation     | Core declaration                       |
| `nonnegativeBalance`                | state invariant          | Core declaration                       |
| generated Effect kit                | deterministic projection | derived from validated Core            |
| property outcomes                   | test observations        | exact run configuration only           |
| M004 manifest                       | evidence record          | derived from conformance run           |

No effects or external capabilities are permitted by this mission. M006 introduces those boundaries. M004 evaluates a pure transition relation.

## Core extension

M004 adds a state-machine declaration:

```text
state AccountState {
  balance : Integer
}

initialize(initialBalance : Integer) requires
  initialBalance >= 0

transition withdraw(amount : Integer) requires
  amount >= 0
  state.balance >= amount

invariant nonnegativeBalance
  state.balance >= 0
```

The canonical JSON shape contains:

- one state record with named built-in fields;
- initializers whose implementation returns state;
- transitions whose implementation receives current state and returns next state;
- a conjunction of comparison requirements on each operation;
- state invariants expressed with the same comparison propositions.

M004 needs only three integer value terms: parameter reference, state-field observation, and integer literal. Its only proposition is `greaterThanOrEqual`. Conjunction is represented structurally by an array of requirements or invariants rather than by a general Boolean language.

## Judgments and obligations

For a state machine `S`:

```text
ΓS = { state fields }
Γop = ΓS ∪ { operation parameters }

Γop ⊢ parameter(name) : declared parameter type
Γop ⊢ stateField(name) : declared field type
Γop ⊢ integerLiteral(value) : Integer

Γop ⊢ left : Integer    Γop ⊢ right : Integer
───────────────────────────────────────────────────
Γop ⊢ greaterThanOrEqual(left, right) proposition
```

The generated conformance obligations are:

```text
initializer requirements(input)
  ⇒ every invariant(initializer(input))

every invariant(state) ∧ transition requirements(state, input)
  ⇒ every invariant(transition(state, input))
```

Inputs outside an operation's requirements are outside the legal transition relation. M004 exposes that decision as a generated guard; it does not yet require an implementation to return a typed rejection. Typed failure belongs to M006.

## Account transition table

| Current state     | Input            | Legal? | Required observation                                              |
| ----------------- | ---------------- | :----: | ----------------------------------------------------------------- |
| —                 | `initialize(10)` |  yes   | resulting balance is nonnegative                                  |
| `{ balance: 10 }` | `withdraw(4)`    |  yes   | resulting balance is nonnegative                                  |
| `{ balance: 10 }` | `withdraw(11)`   |   no   | guard rejects input; realization is not invoked by the obligation |
| `{ balance: 0 }`  | `withdraw(0)`    |  yes   | resulting balance remains nonnegative                             |

The contract deliberately does not yet state the stronger postcondition `next.balance = state.balance - amount`. M004 proves only the preservation mechanism. That relational postcondition requires a later mission rather than entering Core implicitly.

## Effect projection

The generated kit contains:

- `AccountState` as an Effect Schema record;
- an `AccountStateMachineModel` interface for independent implementations;
- guards for initializer and transition requirements;
- shared invariant predicates;
- `@effect/vitest` property registrations using Schema-derived FastCheck arbitraries;
- structured diagnostic checks that retain seed, runs, skips, shrinks, replay path, and counterexample values.

TypeScript cannot statically express `amount <= state.balance` for arbitrary bigint values. The projection therefore reports the precondition as runtime-checked and target-weakened rather than pretending illegal calls are unrepresentable.

## Acceptance evidence

- a valid Account state-machine fixture decodes and validates;
- a positive fixture exercises parameter, state-field, and integer-literal terms;
- unknown state fields, initializer pre-state observations, and ill-typed comparisons are rejected with declaration-level diagnostics;
- generated Effect output matches a committed snapshot;
- the generated port type-checks an independent lawful and broken realization;
- a lawful initializer establishes the invariant across deterministic generated cases;
- lawful withdrawal preserves the invariant across deterministic generated legal transitions;
- the generated guard rejects `withdraw({ balance: 10n }, 11n)`;
- the broken withdrawal produces a minimized domain counterexample with invariant identity, pre-state, input, next state, seed, and replay path;
- evidence distinguishes `property-tested`, `scenario-tested`, and `unsupported-by-target` claims;
- M000–M003 evidence remains unchanged;
- `just verify` passes from a clean checkout and protected GitHub run.

## Primary uncertainty

Can one small state-machine Core construct make construction, observation, legal transition, and invariant preservation explicit without prematurely introducing a general temporal logic or generating business behavior?

## Non-goals

- mutable runtime state, actors, repositories, persistence, or concurrency;
- effects, capabilities, typed failures, retries, or transactionality;
- temporal ordering across more than one transition;
- reachability, liveness, productivity, or fairness;
- the postcondition that withdrawal subtracts exactly the requested amount;
- arbitrary Boolean logic, quantifiers, or user-defined predicates;
- proof or exhaustive evaluation over unbounded integers;
- static enforcement of dependent bigint preconditions in TypeScript.

## Result

Completed on 2026-08-13. One state-machine Core declaration now separates owned state, initializer requirements, transition requirements, and invariants. Semantic validation rejects unknown observations, ill-typed comparisons, and initializer attempts to observe unavailable pre-state.

The generated Effect kit exposes the state Schema, independent realization port, invariant predicates, and legal-operation guards. A transition is legal only when the current state satisfies every invariant and its input satisfies every declared requirement. TypeScript cannot encode the dependent bigint relation statically, so the kit reports a runtime guard and `unsupported-by-target` evidence instead.

At seed `20260813`, the lawful initializer and withdrawal each passed 100 generated cases. The generated guard rejected the overdraft scenario `{ balance: 10n }, amount = 11n`. The broken realization shrank to `{ balance: 0n }, amount = 0n` and produced `{ balance: -1n }`, violating `nonnegativeBalance`; the full 140-step replay path is retained in the manifest.

The clean-checkout gate exposed and corrected a hidden generated-file dependency in the development tree. The exact committed artifact now succeeds after a frozen install without relying on prior demo output.

Hosted acceptance: [GitHub Actions run 31733476156](https://github.com/phibkro/bang-project/actions/runs/31733476156).
