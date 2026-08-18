# 0006 — Semantic tower and composition frontier

- **Status:** accepted
- **Date:** 2026-08-14
- **Scope:** architecture after M011
- **Extends:** decision 0005

## Decision

BANG models software systems as networks of related theories. The mathematical lenses form a tower of increasing system commitments:

```text
logic
  constrains algebra, coalgebra, processes, and system claims

algebra
  constructs and composes values and syntax

coalgebra
  observes state, evolution, streams, and protocols

state machines
  make selected states and legal transitions explicit

actors and process theories
  add state ownership, messages, concurrency, and lifecycle

cybernetic systems
  compose observation, control, effects, and feedback

complex adaptive systems
  add adaptation and macro-level observations of emergent behavior
```

This tower is not a strict implication hierarchy. The lenses remain separate until an explicit law relates them.

Category theory is the connective metatheory. It is not an additional surface layer. Institutions relate signatures, sentences, models, translations, and satisfaction. Selected functors, natural transformations, and distributive laws can describe composition and projection.

BANG will not treat every theory relation as one generic morphism. Import, refinement, sharing, synchronization, observation, ownership, realization, and target projection have different meanings.

## Semantic boundary

BANG will target native semantic expression through actor-level components. This target does not authorize an `actor` Core declaration or surface keyword.

A mission must first exercise actor meaning through existing theories, transitions, capabilities, relations, and normalized obligations. BANG will add a Core construct only if these forms cannot preserve the required judgment.

Cybernetics, complex adaptive systems, emergence, and intelligence remain composed theories and evidence claims. A later mission can change this decision if it supplies precise judgments and executable fixtures.

## Quantitative boundary

Quantitative Type Theory and graded modal types define a cross-cutting research direction. Quantity remains separate from these axes:

- effect;
- capability;
- lifetime;
- resource;
- termination;
- productivity.

A usage grade can constrain the use of a value or capability. It does not prove elapsed time, heap size, termination, or distributed exactly-once behavior.

The first quantitative mission must exercise one bounded user claim. A single-use capability is the preferred tracer.

## Composition laws under pressure

Future missions can exercise these laws without adding category-theory terms to the surface language.

### Stable identity

A declaration keeps one identity through normalization, obligations, target projection, runtime observation, and evidence.

### Satisfaction under translation

A supported translation preserves whether a selected model satisfies a translated claim. An unsupported translation reports an explicit weakening.

### Algebra and coalgebra compatibility

A selected behavior must respect the constructors and relations that define its state. BANG can express this as one mission-specific compatibility obligation.

### Evidence preservation

Composition must retain each evidence class, scope, assumption, producer, and invalidator. An accumulated report must not flatten observations into one truth value.

## Immediate frontier

M012 will compose the capabilities that BANG demonstrated through M011. It will not add actor, temporal, quantitative, cybernetic, or adaptive-system primitives.

The user claim is:

> A contributor can select one Account and Ledger system model and receive one accumulated contract report without losing identity, weakening, or evidence class.

The report will include these concerns:

- refined value contracts;
- state-transition obligations;
- capability and effect requirements;
- the Account and Ledger bridge law;
- the bounded relational solver result;
- target limitations;
- evidence scope and trust.

A negative journey will reject one incoherent system selection with a typed reason.

## Later activation order

The following order is a hypothesis. Mission evidence can change it.

1. Compose the existing system contract.
2. Add minimal source notation after repeated Core JSON use proves the need.
3. Add one cohesive command-line journey.
4. Exercise actor ownership and message semantics.
5. Exercise one quantitative capability.
6. Check one bounded temporal protocol.
7. Compose one bounded feedback controller.
8. Model adaptation only after a real system changes its policy or topology.

## Sources

- `BANG-PROJECT-DIRECTION.md`
- `CAPABILITIES.md`
- `design-specs/M011-solver-backed-relational-obligation.md`
- Goguen and Burstall, _Institutions: Abstract Model Theory for Specification and Programming_
- Turi and Plotkin, _Towards a Mathematical Operational Semantics_
- Rutten, _Universal Coalgebra: A Theory of Systems_
- Atkey, _Syntax and Semantics of Quantitative Type Theory_
- Orchard, Liepelt, and Eades, _Quantitative Program Reasoning with Graded Modal Types_
- Hewitt, Bishop, and Steiger, _A Universal Modular ACTOR Formalism for Artificial Intelligence_
- Holland, _Complex Adaptive Systems_
