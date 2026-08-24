---
id: M032
title: Objective-relative realization planning
status: complete
timebox: 5 focused sessions
vision_claims:
  - explicit-implementation-objective
  - warranted-realization-plan
  - explicit-incomparable-plans
  - typed-no-plan-result
  - atomic-plan-publication
depends_on:
  - M023
  - M025
  - M030
  - M031
---

# Mission

BANG plans one TinyBank withdrawal service from an explicit objective.

The command runs the fresh M031 qualification journey. It compares the two qualified candidates with structured target-owned contributions.

The result is one selected plan, explicit incomparable plans, or a typed no-plan result.

# User claim

> I can state what matters for one withdrawal service. BANG returns only the plans that current evidence warrants.

# Activation condition

M031 supplies two independently qualified candidates for the same checked requirement.

This satisfies the planning activation condition in decision 0012. Decision 0010 requires one plan or explicit incomparable plans.

# Shipped journey

The canonical command is:

```sh
bang plan examples/tiny-bank/plans/supervised-exact-one.json
```

The canonical objective requires these operational properties:

- a supervised actor runtime;
- an observed supervised restart;
- invalidation of an old grant after restart.

The command selects the Gleam/BEAM realization. It explains each satisfied demand with structured evidence references.

# Planning selections

A planning selection has `bangPlanning: 1` and these fields:

- a safe selection identity;
- one M031 version-two qualification selection path;
- one checked exact-one requirement address;
- an ordered list of objective demands.

The input is strict JSON. Unknown fields fail.

The first mission supports these demand families:

| Demand family   | Values                                       |
| --------------- | -------------------------------------------- |
| `runtime-model` | `in-process`, `supervised-actor`             |
| `restart`       | `supervised-restart`                         |
| `grant-restart` | `invalidated-on-restart`, `survives-restart` |

A selection cannot contain two demands from one family. Duplicate demand families fail before qualification.

The exact-one requirement is the planning basis. It is not another objective demand.

# Planning contributions

A contribution is a target-owned interpretation of checked qualification evidence.

Each contribution names:

- the target and realization;
- the checked artifact, theory package, and requirement;
- the M023 qualification result;
- one fixed entry for each supported demand family;
- evidence references for established claims;
- assumptions, weakenings, limitations, lifetime, and invalidators.

Each demand-family entry is one of:

- `Established(value, evidenceReferences)`;
- `Unresolved(reason, evidenceReferences)`.

The planner does not parse prose fields. Prose remains an opaque report value.

The planner does not infer target behavior from a target name alone. A target adapter maps checked target evidence into a contribution.

# Effect contribution

The Effect adapter reports:

- `runtime-model = in-process` as established;
- `restart` as unresolved because the probe does not observe restart;
- `grant-restart` as unresolved because the probe does not observe restart.

The contribution references the checked Effect evidence, generated boundary, and producer.

# Gleam contribution

The Gleam adapter reports:

- `runtime-model = supervised-actor` as established;
- `restart = supervised-restart` as established;
- `grant-restart = invalidated-on-restart` as established.

These claims require the structured M031 actor-restart observations. The contribution does not contain a process identifier.

# Matching rules

A candidate first requires a `Qualified` M023 result. Every exact-one obligation must remain supported.

For each objective demand, the planner produces one disposition:

| Contribution                | Objective       | Disposition    |
| --------------------------- | --------------- | -------------- |
| established same value      | same value      | `satisfied`    |
| established different value | requested value | `contradicted` |
| unresolved                  | requested value | `unresolved`   |

A candidate is feasible only when every objective demand is satisfied.

The planner does not use scores. The planner does not select a default target.

# Result algebra

The plan report is a tagged result with one of these states:

- `Selected` contains exactly one feasible plan;
- `Incomparable` contains two or more feasible plans in target order;
- `NoPlan` contains no feasible plan and every candidate evaluation.

`NoPlan` is a successful planning result. Malformed input, invalid evidence, and execution failures are command failures.

Every candidate evaluation retains:

- the objective and candidate identities;
- each demand disposition;
- the expected and established values;
- evidence references or an unresolved reason;
- premises and exact-one obligations;
- assumptions and weakenings;
- limitations, lifetime, and invalidators;
- target artifact references.

# Required outcomes

M032 includes four planning selections:

| Selection                            | Expected result                       |
| ------------------------------------ | ------------------------------------- |
| supervised exact-one                 | `Selected` with Gleam/BEAM            |
| in-process exact-one                 | `Selected` with Effect TypeScript     |
| exact-one with no operational demand | `Incomparable` with Effect then Gleam |
| grant survives restart               | `NoPlan`                              |

For the no-plan result:

- Effect is unresolved because restart was not observed;
- Gleam is contradicted because the old grant is rejected after restart.

# Fresh qualification

The planning command runs the M031 qualification pipeline in memory.

It must not:

- parse classification stdout;
- parse a prose classification report;
- trust an old qualification directory;
- publish M031 output before planning succeeds.

The qualification stage checks the ordered M031 evidence set before planning. Both target results must be `Qualified` for this mission.

# Publication closure

A successful run publishes one deterministic closure:

```text
.bang/artifacts/tiny-bank-packaged-exact-one.json
.bang/theory-locks/tiny-bank-packaged-exact-one.json
.bang/qualifications/tiny-bank-two-qualified-exact-one/
  effect-typescript/boundary.ts
  effect-typescript/evidence.json
  gleam-beam/src/bang/account_entity.gleam
  gleam-beam/evidence.json
  report.json
.bang/plans/<planning-selection-id>/report.json
```

The plan report uses a strict encoded schema. It contains no temporary path or process identifier.

The command stages all bytes before publication. A publication failure restores all previous bytes and removes newly created outputs.

The M031 classification command reuses the corrected transaction boundary. Its observable successful output does not change.

# Determinism

Repeated clean runs produce identical bytes for:

- the semantic artifact;
- the theory lock;
- both target projections;
- both target evidence records;
- the qualification report;
- the plan report.

These orders are stable:

- demand families use `runtime-model`, `restart`, `grant-restart` order;
- candidates use Effect TypeScript, then Gleam/BEAM order;
- exact-one obligations keep M023 order;
- evidence and material references use canonical path order.

# Typed failures

A failure contains one stage, path, reason, message, and optional semantic address.

The stages are:

- `selection`;
- `qualification`;
- `objective`;
- `contribution`;
- `planning`;
- `publication`.

Required typed failures include:

- an unsafe selection identity;
- a non-M031 qualification selection;
- a requirement mismatch;
- duplicate demand families;
- an unknown demand or value;
- a non-qualified candidate;
- an invalid or shared M031 evidence set;
- a contribution identity mismatch;
- a contribution claim without required structured evidence;
- changed package or material bytes;
- target execution failure;
- publication failure.

Failures emit no stdout plan. Failures preserve every persistent byte that existed before the command.

# Evidence statement

The report can establish:

- both candidates satisfy the same checked exact-one requirement;
- one candidate matches the explicit objective;
- several candidates remain feasible without a distinguishing objective;
- no candidate satisfies one unsupported objective;
- each result follows from current structured evidence and adapter mappings.

The report does not establish:

- universal target correctness;
- durable or distributed exactly-once execution;
- target performance or cost;
- termination, fairness, delivery, memory, or work bounds;
- that an unresolved property is false;
- that one realization is best without an explicit objective.

# Semantic ownership

Core owns the exact-one requirement and obligation meaning.

Theories own derivation of the exact-one obligations.

Evidence providers own observations and their scope.

Target adapters own target-to-planning contribution mappings.

The planner owns objective matching, result construction, and explanations.

The CLI owns orchestration and publication. It does not define planning semantics.

# Falsifiers

M032 fails if:

1. The planner selects a target when the objective does not distinguish the candidates.
2. The planner uses a score or hidden target preference.
3. The planner parses assumptions, limitations, lifetime, or invalidators as semantic facts.
4. The planner treats unresolved evidence as a contradiction.
5. The planner treats a contradiction as unresolved.
6. The supervised objective selects Effect.
7. The in-process objective selects Gleam.
8. The grant-survival objective returns a feasible plan.
9. A Gleam restart claim lacks the structured M031 restart observations.
10. The planner accepts stale, shared, or wrong-target evidence.
11. A plan report drops premises, weakenings, lifetime, or invalidators.
12. A failed run changes an artifact, lock, qualification, evidence, projection, or plan byte.
13. A successful repeated run changes any published byte.
14. M017, M023, M030, or M031 behavior changes.
15. Target lifecycle policy enters Core.

# Non-goals

- no implementation generation or assembly;
- no general optimizer or scoring system;
- no cost or performance model;
- no package registry;
- no general dependency solver;
- no new target language;
- no general provider protocol;
- no new Core construct;
- no source syntax change;
- no remote execution;
- no continuous evidence invalidation.

# Acceptance path

1. Run the canonical `bang plan` command.
2. Observe fresh Effect and Gleam qualification.
3. Observe one selected Gleam plan.
4. Check every demand disposition and evidence reference.
5. Run the in-process selection and observe one Effect plan.
6. Run the exact-one-only selection and observe two incomparable plans.
7. Run the grant-survival selection and observe a typed no-plan result.
8. Run malformed and integrity fixtures.
9. Inject a publication failure and check that all prior bytes remain unchanged.
10. Repeat each successful selection and compare the full publication closure.
11. Run the legacy M017, M023, M030, and M031 journeys.
12. Run focused planning, target, evidence, CLI, and project tests.
13. Run `just verify`.

# Sources

- `BANG-PROJECT-DIRECTION.md`.
- `decisions/0007-modular-propositions-providers-and-realizations.md`.
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`.
- `decisions/0012-semantic-process-architecture-and-reuse-boundary.md`.
- `design-specs/M023-realization-classification.md`.
- `design-specs/M025-single-authority-project.md`.
- `design-specs/M030-local-theory-package-consumption.md`.
- `design-specs/M031-two-target-exact-one-qualification.md`.
- `packages/evidence/src/index.ts`.
- `packages/theories/src/index.ts`.
- `packages/target-effect/src/index.ts`.
- `packages/target-gleam/src/index.ts`.
- `apps/bang/src/classify.ts`.
