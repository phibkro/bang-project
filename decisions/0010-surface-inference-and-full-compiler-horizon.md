# 0010 — Surface inference and full compiler horizon

- **Status:** accepted
- **Date:** 2026-08-14
- **Scope:** product direction after M018
- **Extends:** decisions 0006, 0007, and 0009

## Decision

BANG will own a complete semantic compiler pipeline. The pipeline will connect a small domain surface to checked implementations and qualified evidence.

Users will state domain facts that BANG cannot derive. BANG will derive all other warranted properties through checked Core and reusable theories.

The future product serves agents, software engineers, and product leads. These users will not need to write the mathematical metatheory for each domain.

```text
small domain specification
  -> checked and normalized Core
  -> derived properties and obligations
  -> applicable reusable theories
  -> admissible realization plans
  -> target projection
  -> generated or independent implementation
  -> qualified evidence
```

The first product remains narrower. It checks independent implementations against explicit Core contracts and reports the available evidence.

## Semantic authority

BANG separates five kinds of vocabulary:

1. Core primitives state irreducible semantic judgments.
2. Reusable theories compose Core judgments and derive consequences.
3. Surface forms provide short notation for stable Core compositions.
4. Target adapters project selected judgments into host boundaries.
5. Evidence providers evaluate normalized obligations.

A common software pattern does not become a Core primitive by default. Actors, CRDTs, workflows, and realization strategies remain reusable theories unless a mission proves that Core lacks a required judgment.

External tools can consume versioned checked or normalized Core. An external theory requires the explicit typed translation from [decision 0007](0007-modular-propositions-providers-and-realizations.md).

External tools can supply reasoning, realizations, target adapters, and evidence. They cannot redefine Core semantics or erase result qualifications.

## Inference discipline

BANG records derivation provenance separately from evidence class:

| Provenance class     | Meaning                                                     |
| -------------------- | ----------------------------------------------------------- |
| authored             | A user or library states the fact.                          |
| structurally derived | The checked declaration shape entails the fact.             |
| theory-derived       | A reusable theory derives the fact after its premises hold. |
| provider-reported    | A named provider reports evidence for the fact.             |
| unresolved           | No current derivation or evidence establishes the fact.     |

The `provider-reported` class retains its concrete evidence class. Kernel proof, bounded solver output, property checks, and runtime observations remain different results.

The `assumed` and `unsupported-by-target` evidence classes remain unchanged. Provenance never upgrades either class.

BANG must not guess an unspoken domain choice. If more than one realization remains valid, BANG reports the alternatives or uses an explicit objective.

The term `best implementation` always depends on declared constraints and objectives. These inputs can include latency, consistency, availability, durability, cost, memory, and operational complexity.

## Development strategy

BANG will use short vertical missions to discover the required compiler architecture. It will not pause for one horizontal Core hardening phase.

Each mission contains:

- one user-visible claim.
- one real input and implementation boundary.
- one negative journey.
- one evidence result.
- one primary uncertainty.
- explicit non-goals.

A mission can add specialized implementation code. It cannot add duplicate semantic authority or hide unsupported claims.

After the journey works, the architecture review classifies each addition as Core, theory, surface, target, provider, or mission-local code.

The roadmap is a hypothesis. Mission evidence can split, merge, reorder, replace, or remove every future node.

## Provisional full compiler horizon

```text
M019 real BANG self-check
  -> construct-addressed normalization
  -> incremental derivation with clean-run parity
  -> versioned checked-Core extension boundary
  -> reusable theory applicability and explanation
  -> realization classification from domain laws
  -> nondeterministic channel and distributed realization tracer
  -> surface compression of repeated Core patterns
  -> project and library composition
  -> objective-relative realization planning
  -> generated or assembled implementation
  -> continuous conformance and evidence invalidation
  -> full compiler candidate
```

Every arrow is provisional. A later mission can bypass an intermediate node when the vertical journey does not require it.

Decision 0006 retains three optional semantic branches:

```text
nondeterministic channel and distributed realization tracer
  -> bounded temporal protocol
  -> bounded feedback controller
  -> adaptation after a real policy or topology change
```

These branches are not prerequisites for a full compiler candidate. Each branch requires its own mission activation condition.

### Real BANG self-check

A shipped command checks one real BANG component against one canonical Core contract. The command runs the implementation and produces fresh evidence.

### Construct-addressed normalization

Each semantic construct keeps a stable address, semantic fingerprint, typed dependency closure, and material provenance.

### Incremental derivation

An unrelated edit reuses unaffected results. A referenced edit invalidates its dependent closure. Incremental output equals clean output.

### Checked-Core extension boundary

One external consumer reads a versioned checked or normalized Core value. One provider returns a typed result without importing compiler internals.

### Reusable theory applicability

BANG checks the premises of one named theory. It explains each derived property and each failed premise.

### Realization classification

BANG accepts and rejects implementation families from checked laws, required guarantees, and explicit environment assumptions.

### Nondeterministic channel and distributed realization tracer

One two-owner system includes nondeterministic delivery. BANG distinguishes order, duplication, loss, causality, and coordination requirements.

### Surface compression

One short surface form lowers to a repeated and stable Core composition. The diagnostic maps every derived result to the source form.

### Project composition

A project selects source modules, theories, realization profiles, targets, and evidence policy without a second hidden source list.

### Realization planning

BANG returns one plan for an explicit objective, or it returns multiple incomparable plans. Each plan includes its premises and weakenings.

### Implementation production

BANG generates or assembles one functioning implementation behind its generated conformance boundary. Generated code receives no semantic privilege.

### Continuous evidence

A source, theory, target, provider, or implementation change invalidates only the evidence that depends on the changed material.

### Full compiler candidate

A full compiler candidate demonstrates this complete path from a clean checkout:

```text
small BANG project
  -> parsed source and libraries
  -> checked and normalized Core
  -> derived theories and obligations
  -> selected realization plan
  -> target artifacts
  -> functioning implementation
  -> conformance execution
  -> qualified evidence report
```

The candidate also provides a versioned Core boundary and one external extension. It reports unsupported properties and does not claim universal synthesis.

## Readiness gates

Core IR becomes an MVP when vertical missions demonstrate these properties:

- versioned Schema-backed interchange.
- explicit decoded, checked, and normalized phases.
- stable construct identity and provenance.
- deterministic normalization.
- typed obligations and unsupported results.
- one real BANG self-check.
- one external Core consumer or provider.
- reproducible artifacts and evidence.

Production readiness remains a product claim. Later missions must exercise compatibility, migration, diagnostics, performance, security, and recovery through real user journeys.

## Rejected alternatives

BANG does not adopt these plans:

- freeze the complete Core before more vertical use.
- design the full surface language before repeated Core patterns exist.
- require domain authors to state every algebraic or behavioral consequence.
- infer domain choices without explicit authority.
- equate one implementation strategy with a Core construct.
- let an external provider redefine Core semantics.
- call one realization best without an objective.
- equate generated code with conformance evidence.
- treat this roadmap as a fixed delivery promise.

## Immediate activation

M019 activates the real BANG self-check node. Later nodes remain hypotheses until a mission contract activates one user-visible claim.
