---
id: M023
title: Explained realization classification
status: complete
timebox: 5 focused sessions
vision_claims:
  - realization-classification
  - obligation-evidence-matching
  - target-adapter-disposition
  - explained-admissibility
depends_on:
  - M018
  - M022
---

# Mission

BANG classifies the existing TinyBank Effect and Gleam realizations against the exact-one execution obligations derived by M022.

One shipped command reports the judgment for each realization. It also reports the evidence, assumptions, weakenings, unresolved claims, and invalidators that warrant that judgment.

# User claim

> I can ask BANG which available realization can implement an exact-one capability contract. BANG distinguishes supported, rejected, and unresolved obligations and explains every classification.

# User journey

```sh
bang classify examples/tiny-bank/realizations/exact-one.json
```

The command:

1. loads the M022 semantic artifact selection;
2. derives the `ExactOneCapabilityExecution` obligations through `@bang/theories`;
3. loads the checked M018 Effect evidence manifest;
4. checks the Effect material closure;
5. asks the real Effect and Gleam target adapters to project the selected exact-one realization;
6. classifies both candidates;
7. prints one deterministic report.

# Frozen semantic boundary

M023 does not change checked Core or the M022 theory.

The selected contract remains:

```text
operationRealization:WithdrawAccountOnce.requirement:DebitAccount
quantity exactly 1
```

The applicable theory derives these stable obligations:

```text
ExactOneCapabilityExecution.obligation.check-before-consumption
ExactOneCapabilityExecution.obligation.consume-atomically-before-execution
ExactOneCapabilityExecution.obligation.reject-reuse-before-execution
ExactOneCapabilityExecution.obligation.no-restore-after-start
```

A realization assessment relates one derived obligation to one target disposition and zero or more evidence references. It does not redefine the obligation.

# Classification lattice

M023 uses four result classes:

| Class        | Meaning                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `admissible` | Every required obligation has evidence that meets the selected policy without an additional realization assumption.                              |
| `qualified`  | Every required obligation is supported, but the result depends on explicit assumptions, weakenings, bounded observations, or a trusted producer. |
| `rejected`   | A target adapter reports an incompatible or unsupported realization condition for at least one required obligation.                              |
| `unknown`    | No contradiction is known, but one or more required obligations lack sufficient evidence.                                                        |

Precedence is:

```text
rejected > unknown > qualified > admissible
```

A missing observation is `unknown`, not `rejected`. A target incompatibility is `rejected`, not `unknown`.

# Effect judgment

The Effect target adapter must successfully project `WithdrawAccountOnce`.

The checked M018 manifest supplies bounded runtime observations for grant consumption, reuse rejection, and non-restoration after a defect. The generated boundary and target adapter supply a structurally derived ordering claim for destination and transition checks before consumption.

The Effect result is `qualified`, not an unbounded proof. It retains:

- the `single-grant-two-call-trace` scope;
- the `assumed-truthful` producer boundary;
- every M018 weakening;
- the material digests and lifetime;
- unresolved termination, productivity, memory, lifetime, fairness, delivery, and distributed exactly-once claims.

# Gleam judgment

The real Gleam target adapter must reject the selected exact-one realization because its current actor projection accepts only an unbounded `DebitAccount` requirement.

The Gleam result is `rejected`. The report must include the adapter address and reason.

M017 actor evidence does not establish any exact-one obligation and must not be reused as exact-one evidence.

# Public encoded boundaries

The realization-classification input and output use strict versioned Schemas.

The input records:

- artifact identity and theory result identity;
- realization and target identity;
- one assessment per required obligation;
- evidence class, scope, producer, and material references;
- assumptions, weakenings, limitations, lifetime, and invalidators;
- target rejection details when present.

The output is a tagged result whose shape makes illegal combinations unrepresentable:

- `Admissible` and `Qualified` contain only supported obligation assessments;
- `Rejected` contains at least one rejected assessment;
- `Unknown` contains at least one unresolved assessment;
- every result covers each derived obligation exactly once;
- no unknown or extra obligation identity is accepted.

# Evidence authority

The classifier consumes evidence; it does not produce stronger evidence.

Evidence classes remain distinct:

- `structurally-derived` target projection;
- `runtime-checked` bounded observation;
- `assumed-truthful` producer trust;
- `unsupported-by-target` adapter rejection;
- `unresolved` missing evidence.

The classifier must not convert a test observation, generated source, or runtime trace into proof.

# Determinism and safety

- Selection and evidence paths are repository-relative and reject traversal, absolute paths, backslashes, and NUL.
- Output order follows the M022 obligation order and then target identity.
- Material paths and invalidators are sorted.
- The command emits no partial report on failure.
- Repeated runs over unchanged materials emit byte-identical output.

# Positive fixture

`examples/tiny-bank/realizations/exact-one.json` selects:

- the M022 exact-one theory selection;
- the checked M018 evidence manifest;
- Effect `WithdrawAccountOnce`;
- Gleam `WithdrawAccountOnce`.

Expected results:

```text
effect-typescript -> qualified
gleam-beam -> rejected
```

# Negative fixtures

1. Unknown obligation identity: reject the encoded profile.
2. Missing obligation assessment: reject the encoded profile.
3. Duplicate obligation assessment: reject the encoded profile.
4. Effect material digest drift: return a typed stale-evidence failure and no report.
5. Unsafe evidence path: reject before file access.
6. Inapplicable M022 theory result: return a typed classification failure.
7. Gleam result mislabeled as `unknown`: reject because the adapter supplied an explicit target rejection.
8. Effect result mislabeled as `admissible`: reject because bounded runtime evidence and producer trust require qualification.

# Acceptance

1. Run the shipped command.
2. Observe all four stable obligation identities for both targets.
3. Observe `effect-typescript` as `qualified` with M018 scope, assumptions, weakenings, material references, and invalidators.
4. Observe `gleam-beam` as `rejected` with the real target-adapter address and reason.
5. Observe that M017 actor evidence is not claimed as exact-one evidence.
6. Run every negative fixture.
7. Run focused Core, theory, evidence, target, and CLI checks.
8. Run `just verify`.

# Non-goals

M023 does not:

- add a Core realization-profile construct;
- create a global provider or target registry;
- generate a new business implementation;
- change M018 or M022 semantics;
- claim implementation equivalence;
- claim distributed exactly-once execution;
- infer termination, productivity, memory, lifetime, fairness, or delivery guarantees;
- add another target.

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0007-modular-propositions-providers-and-realizations.md`;
- `design-specs/M018-single-use-capability.md`;
- `design-specs/M022-versioned-theory-explanation.md`;
- `packages/evidence/src/index.ts`;
- `packages/target-effect/src/index.ts`;
- `packages/target-gleam/src/index.ts`.
