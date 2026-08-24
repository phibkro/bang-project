# BANG Project Direction

- **Status:** Active project constitution
- **Purpose:** Govern product scope, semantics work, and delivery
- **Semantic authority:** The future formal Core specification
- **Delivery unit:** One user-feelable vertical mission

## Mission

BANG is a language for describing software systems as networks of related theories. A theory defines concepts, operations, observations, and laws. Relations between theories define shared concepts, translations, refinements, synchronization, and cross-theory laws.

A BANG specification defines the accumulated contract an implementation must satisfy. BANG projects that contract into target-specific conformance kits—types, schemas, ports, generators, suites, monitors, and evidence requirements—while humans or coding agents implement ordinary host-language software behind those boundaries.

> BANG transforms an interconnected domain theory into an executable conformance boundary for independently written software.

Full business-implementation generation is not the first product. It remains a later research path.

## Product north star

BANG will own a complete semantic compiler pipeline. Users will describe a domain with a small set of high-value facts.

Checked Core and reusable theories will derive all warranted properties, obligations, and realization choices. BANG will explain each result and its authority.

```text
small domain specification
  → checked and normalized Core
  → derived properties and obligations
  → applicable reusable theories
  → admissible realization plans
  → target projection
  → generated or independent implementation
  → qualified evidence
```

Core primitives state irreducible judgments. Reusable theories compose those judgments. Surface forms provide short notation for stable Core compositions.

Target adapters project checked judgments. Evidence providers evaluate normalized obligations.

External tools can consume versioned checked or normalized Core. They cannot redefine Core semantics or erase evidence qualifications.

[Decision 0012](decisions/0012-semantic-process-architecture-and-reuse-boundary.md) defines the process boundary. BANG owns meaning, translation correspondence, realization planning, and evidence qualification. It reuses existing systems for transport, reasoning, compilation, execution, storage, and distribution.

The roadmap toward this product remains provisional. Short vertical missions will test each capability before BANG makes it part of the compiler architecture.

## Exploratory delivery focus

[Decision 0011](decisions/0011-semantic-data-service-exploration.md) selects a semantic data service as the next product exploration.

This exploration compiles a checked domain model into a database-backed reactive service. It uses an existing database and runtime.

Users declare identities, relations, operations, observations, laws, capabilities, publication choices, and persistence choices. BANG derives only warranted artifacts.

```text
semantic domain model
  → checked Core + reusable theories
  → logical data model + interaction contract
  → database schema + provider and client bindings
  → independent handlers + target runtime
  → qualified disposition and evidence report
```

The interaction contract separates commands, queries, and subscriptions. Clients receive declared observations instead of mutable implementation state.

BANG can derive schemas, constraints, ports, codecs, transaction wrappers, and reactive bindings. Underdetermined business behavior remains an independent checked handler.

The disposition report states where each law is enforced. Possible boundaries include types, proofs, database constraints, transactions, runtime checks, monitors, and tests.

General logical consistency is not decidable for sufficiently expressive logics. BANG must distinguish a found model, a proved inconsistency, bounded failure, `unknown`, and `unsupported`.

This focus does not make one database the semantic authority. It supplies one usable path through the general compiler architecture.

## Central separation

```text
description + semantic annotations
                │
                ▼
       accumulated domain contract
                │
        ┌───────┴────────┐
        ▼                ▼
 target projection   obligations
        │                │
        ▼                ▼
 independent code  conformance evidence
```

The historical “everything is a thunk” idea survives as a more general separation: description is distinct from evaluation and optimized execution. This pattern repeats at multiple phases. Core describes meaning; target adapters choose representation; implementations choose execution strategy under the contract. No target or optimizer may silently redefine the contract.

## Product objects

1. **Theory graph** — abstract concepts, operations, observations, laws, and typed relations between theories.
2. **System model** — selected compatible interpretations and representation choices.
3. **Target conformance kit** — projected obligations and host-language ports.
4. **Implementation** — independently written host code.
5. **Evidence manifest** — evidence strength, scope, assumptions, target weakening, and invalidation conditions.

The governing relation is:

```text
implementation + target adapter + evidence ⊨ accumulated system contract
```

## Semantic foundation

BANG is institution-inspired: signatures define vocabulary, sentences state claims, models interpret vocabulary, and satisfaction relates models to claims. This supports heterogeneous reasoning without pretending one logic fits every concern.

Mathematical lenses remain distinct:

| Lens            | Primary capability                                                     |
| --------------- | ---------------------------------------------------------------------- |
| Algebra         | construct, compose, and interpret values and syntax                    |
| Coalgebra       | observe state, evolution, streams, protocols, and persistent processes |
| Logic           | state predicates, relations, laws, invariants, and obligations         |
| Category theory | compose and translate theories and projections                         |
| Process calculi | describe interaction, concurrency, communication, and legal traces     |

These lenses guide Core semantics. They do not need to dominate the surface vocabulary.

## Semantic axes

BANG grows capability by capability and axis by axis:

| Axis         | Question                                                             |
| ------------ | -------------------------------------------------------------------- |
| Value        | What exists?                                                         |
| Construction | How is it built or interpreted?                                      |
| Observation  | How is it observed or evolved?                                       |
| Relation     | What must hold across values, computations, states, or theories?     |
| Effect       | What interaction can occur?                                          |
| Capability   | Which authority permits it?                                          |
| Quantity     | How often may a value or capability be used?                         |
| Lifetime     | How long may it exist and where may it escape?                       |
| Termination  | Does the computation return?                                         |
| Productivity | Does a nonreturning process keep producing observations?             |
| Resource     | How may work, memory, latency, or concurrency grow?                  |
| Phase        | Is information available during specification, checking, or runtime? |
| Evidence     | Why is the claim accepted?                                           |

Axes remain orthogonal until an explicit law relates them. A pure computation may diverge. A total computation may allocate unbounded memory. A refined value may still require authority. A bounded check is not a proof.

## Theory graph, not a generic dependency graph

Different edges carry different meanings. BANG must distinguish import, extension, interpretation, translation, refinement, sharing, alignment, synchronization, bridge law, realization binding, and representation choice as missions require them.

The interaction surface grows combinatorially as independent theories are composed. BANG therefore makes legal transitions and cross-theory laws explicit, so a large system can be understood as smaller state machines and theories whose lawful compositions define valid paths. Invalid transitions should become unrepresentable where the chosen logic and target allow it; otherwise they become explicit obligations with honest evidence.

## Compiler boundary

```text
BANG source and libraries
  → normative Core JSON
  → checked and normalized theory graph
  → derived properties and obligations
  → applicable realization profiles
  → target projection
  → conformance kit
  → generated or independent implementation
  → conformance evaluation
  → qualified evidence manifest
```

Core JSON is the canonical machine interchange. Surface syntax elaborates into Core. Libraries contain reusable theories and patterns. Programs select and compose theories and models. Generated target kits are derived artifacts.

Effect TypeScript is the primary product target. Other targets add distinct semantic pressure. No target defines Core semantics or hides a weakened contract.

## Evidence classes

Evidence is a first-class output and must retain obligation identity, declaration provenance, assumptions, scope, relevant tool and target versions, lifetime, and invalidating boundaries.

At minimum distinguish:

- kernel-proven;
- certificate-checked;
- solver-reported;
- finite-exhaustive;
- model-checked with declared scope;
- property-tested with cases and seed;
- scenario-tested;
- runtime-checked;
- runtime-monitored;
- assumed;
- unsupported-by-target.

A green command may still contain assumptions or unsupported claims. The report must surface them.

## Product layers and authority

```text
Surface → Core → Program → Target kit → Implementation
              ↑
            Library
```

| Artifact                    | Authority                                            |
| --------------------------- | ---------------------------------------------------- |
| `BANG-PROJECT-DIRECTION.md` | product mission, scope, and delivery constitution    |
| Core specification          | normative language semantics                         |
| JSON Schema                 | normative interchange structure                      |
| conformance fixtures        | observable semantic examples                         |
| design-specs                | frozen mission contracts                             |
| decision records            | reasons for accepted choices                         |
| research notes              | non-normative exploration with activation conditions |
| generated kits and evidence | derived artifacts                                    |

Prior attempts never silently override the constitution or Core.

## Delivery constitution

Only one mission is active. A mission states:

- one observable semantic claim;
- one end-to-end vertical path;
- executable acceptance evidence;
- explicit non-goals;
- one primary uncertainty;
- a clean-checkout demonstration.

Every mission crosses the relevant stages instead of completing horizontal compiler layers. Every work session should end with visible executable evidence. Split work that cannot produce evidence within two focused sessions. A Core feature becomes normative only when its judgment and positive and negative fixtures agree.

The repeating loop is:

> State one semantic claim. Carry it through Core, projection, conformance, and evidence. Show the result. Then select the next uncertainty.

## Semantic privilege rule

A construct enters Core only when all conditions hold:

1. The active mission requires it.
2. Existing Core terms cannot express it adequately.
3. Its judgments are precise.
4. Its effect on evidence is defined.
5. Its target behavior or limitation is understood.
6. Positive and negative fixtures exist.
7. It improves checking, composition, diagnostics, or projection.

Otherwise it belongs in Surface, Library, a target adapter, or research.

## Initial capability path

1. M000 — decode one Core service and generate one compiling Effect port.
2. M001 — refined domain value and sealed constructor.
3. M002 — one theory, one finite model, and one law.
4. M003 — generated property suite and minimized failure.
5. M004 — state transition and invariant preservation.
6. M005 — two theories and one bridge law.
7. M005A — first useful Core dogfood against the real `BridgeTerm` decoder.
8. M006 — typed effect, failure, and capability boundary.
9. M007 — graded evidence report.
10. M008 — runtime trace observation.
11. M009 — Rust projection from unchanged Core.
12. M010 — replayable evidence manifest.
13. M011 — bounded solver-backed relational obligation.
14. M012 — accumulated Account/Ledger system report.
15. M013 — Account source notation and deterministic Core lowering.
16. M014 — one shipped `bang report <selection>` journey.
17. M015 — entity ownership and typed messages.
18. M016 — kernel-proof provider for one normalized relational obligation.
19. M017 — Gleam/BEAM actor realization with explicit mailbox and supervision semantics.
20. M018 — one checked exact-one capability quantity with atomic target consumption and qualified reuse evidence.
21. M019 — one shipped command produces fresh conformance evidence against a real BANG compiler component.
22. M020 — one persistent local family ledger with balanced immutable entries and journal-derived balances.
23. M021 — construct-addressed TinyBank normalization with typed dependency closure and clean-run parity.
24. M022 — one versioned semantic artifact with independent exact-one theory applicability and explanation.
25. M023 — classify existing Effect and Gleam realizations against derived exact-one obligations with qualified evidence.
26. M024 — trace one bounded two-owner protocol under ordered, duplicated, reordered, and dropped delivery attempts with explicit causal and coordination conclusions.
27. M025 — evaluate one single-authority TinyBank project across reusable theory, realization classification, bounded channel analysis, and authored evidence policy.
28. M026 — derive one persistent reactive TinyBank service with one SQLite schema, typed Effect bindings, and qualified law dispositions.
29. M027 — compose an Account/AccountLedger transfer relation into one atomic two-row SQLite command with reactive Account and TotalFunds observations.
30. M028 — evolve one persistent transfer service with dependency-scoped compatibility, qualified evidence reuse, atomic semantic-version cutover, and typed rejection.
31. M029 — apply one unchanged reusable exact-one theory to TinyBank and Inventory through domain-neutral semantic artifacts.
32. M030 — resolve one local versioned exact-one theory package by identity and semantic digest, verify evaluator agreement, and write a deterministic lock.
33. M031 — execute the packaged exact-one requirement through fresh Effect and supervised Gleam/BEAM probes, then classify each target from independent evidence.
34. M032 — match explicit operational objectives against fresh qualified Effect and Gleam candidates, then return one plan, incomparable plans, or no plan.
35. M033 — assemble one selected Gleam realization into one standalone escript with a strict qualified-material record.

Completed nodes record evidence, not a fixed architecture. Active and future nodes remain hypotheses until one mission freezes their user-visible claim.

M024 is complete through `bang trace`. M025 is complete through `bang project <selection>`. M026 and M027 are complete through `bang database <selection>`. M028 is complete through `bang evolve <selection>`. M029 and M030 are complete through `bang explain <selection>`. M031 is complete through `bang classify examples/tiny-bank/realizations/two-qualified-exact-one.json`. M032 is complete through `bang plan examples/tiny-bank/plans/supervised-exact-one.json`. M033 is complete through `bang assemble examples/tiny-bank/assemblies/supervised-exact-one.json`.

M030 turns the cross-domain exact-one declaration into a load-bearing local package boundary. TinyBank and Inventory pin the same package identity, version, semantic digest, evaluator identity, premise identities, and obligation identities. Missing, changed, unsupported, or evaluator-disagreeing packages fail before artifacts or locks are published.

M031 turns heterogeneous realization classification into a fresh two-target execution journey. Effect TypeScript and supervised Gleam/BEAM consume the same checked packaged requirement, publish separate target-specific evidence, and qualify independently. Gleam actor-incarnation behavior remains target-owned; Core does not promise restart persistence or distributed exactly-once delivery.

M032 turns fresh qualification into objective-relative planning. It selects Gleam for supervised restart behavior and Effect for in-process execution. Without a distinguishing objective, it returns both candidates as incomparable. A grant-survival objective returns no plan because Effect is unresolved and Gleam contradicts it. Planning policy remains separate from Core and target evidence.

M033 turns one selected plan into a locally runnable artifact. The assembler binds the M031-qualified Gleam boundary by digest, records every other source, dependency, toolchain, and compiled material without upgrading its evidence grade, checks one separate-process observation, and publishes the complete closure atomically. The escript runs without BANG or the Gleam compiler on a compatible OTP host.

## Provisional full-compiler horizon

The current horizon has this order:

```text
real BANG self-check
  → construct-addressed normalization
  → incremental derivation with clean-run parity
  → versioned checked-Core extension boundary
  → reusable theory applicability and explanation
  → realization classification from domain laws
  → nondeterministic channel and distributed realization tracer
  → surface compression of repeated Core patterns
  → project and library composition
  → persistent reactive semantic data-service tracer
  → law disposition across types, databases, transactions, and runtime evidence
  → objective-relative realization planning
  → generated or assembled implementation
  → continuous conformance and evidence invalidation
  → full compiler candidate
```

Mission evidence can split, merge, reorder, replace, or remove each future node. [Decision 0010](decisions/0010-surface-inference-and-full-compiler-horizon.md) defines the compiler acceptance signals. [Decision 0011](decisions/0011-semantic-data-service-exploration.md) defines the new product exploration.

Bounded temporal protocols, feedback controllers, and adaptation remain optional semantic branches. They require separate missions and do not block the product tracer.

## Provisional ecosystem branches

The semantic data service is a near-term product path. It does not close other BANG ecosystem paths.

Future missions can activate:

- programming-language compilers and host-language targets;
- a reproducible build graph for generated artifacts;
- package distribution for Core, theories, realizations, and evidence;
- database and reactive-runtime target portfolios;
- continuous evidence across packages, implementations, and targets.

These branches remain independent hypotheses. A branch enters the product only when one vertical mission demonstrates its need.

## First-product non-goals

BANG does not initially:

- build a new storage engine;
- infer one universal physical database layout;
- expose every Core state field as a public API;
- generate unrestricted CRUD operations;
- generate complete business implementations;
- prove every law or decide every logic;
- require totality or ban effects and infinite services;
- promise soundness across unsafe host code or external writes;
- equate bounded exploration, runtime rejection, testing, and proof;
- synthesize general coordination protocols;
- define a universal ontology;
- place a polished surface, Wasm, native code, or verified synthesis on the critical path.

## Active work rules

1. One active mission.
2. One clean command demonstrates it.
3. Generated output is disposable and reproducible.
4. Every Core primitive has positive and negative fixtures.
5. Assumptions and target weakening remain visible.
6. Research has a mission-bound activation condition.
7. Frameworks appear only under pressure from a demonstrated path.
8. Compiler stages are stations inside missions, never roadmap phases.
9. Review the capability graph after each mission.
10. Optimize for visible learning, not architectural volume.
