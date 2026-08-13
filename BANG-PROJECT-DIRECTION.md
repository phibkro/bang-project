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
BANG source
  → normative Core JSON
  → normalized theory graph
  → obligations
  → target projection
  → conformance kit
  → independent implementation
  → conformance evaluation
  → evidence manifest
```

Core JSON is the canonical machine interchange. Surface syntax elaborates into Core. Libraries contain reusable theories and patterns. Programs select and compose theories and models. Generated target kits are derived artifacts.

Effect TypeScript is the first target. Rust is the first portability test; Java follows. No target defines Core semantics, and every projection reports unsupported or weakened contracts.

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
7. M006 — typed effect, failure, and capability boundary.
8. M007 — graded evidence report.
9. M008 — runtime trace observation.
10. M009 — Rust projection from unchanged Core.

The sequence is a hypothesis. Mission evidence may reveal a better architecture or order. Change it explicitly; do not drift implicitly.

## First-product non-goals

BANG does not initially generate complete business implementations, prove every law, decide every logic, require totality, ban effects or infinite services, promise soundness across unsafe host code, equate bounded exploration with proof, define a universal ontology, optimize all physical layouts, or place polished surface syntax, Wasm, native code generation, a general solver framework, or verified synthesis on the critical path.

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
