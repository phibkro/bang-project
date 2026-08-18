# 0007 — Modular propositions, evidence providers, and realizations

- **Status:** accepted
- **Date:** 2026-08-15
- **Scope:** architecture after M015
- **Extends:** decisions 0003, 0005, and 0006

## Decision

BANG keeps checked Core as the target-independent semantic boundary. Core can contain multiple proposition families when their judgments differ. A proposition family owns its sentence structure, well-formedness rules, normalized obligations, satisfaction meaning, and stable identities.

Evidence providers and target adapters consume checked or normalized Core. They do not define Core semantics.

```text
BANG source and libraries
          |
          v
      checked Core
          |
          +-----------------------+
          |                       |
          v                       v
normalized obligations      realization profile
          |                       |
          v                       v
evidence providers          target adapters
          |                       |
          +-----------+-----------+
                      v
            qualified evidence report
```

The stable boundary makes three forms of substitution explicit:

1. More than one evidence provider can evaluate the same normalized obligation.
2. More than one target adapter can project the same selected Core contract.
3. More than one independent implementation can satisfy one projected conformance kit.

Substitution does not make results equivalent. A kernel-checked proof, bounded solver result, property test, runtime observation, and assumption have different meanings. Reports retain each evidence class, scope, assumptions, producer, material inputs, target weakening, lifetime, and invalidators.

The governing relation remains:

```text
implementation + target adapter + qualified evidence
  satisfies? selected Core contract
```

The question remains open unless the collected evidence warrants satisfaction. A report can instead conclude that an obligation is bounded, sampled, observed, assumed, inconclusive, or unsupported.

## Proposition families

BANG does not introduce one untyped or universal proposition node. Each family earns a Core or normalized-obligation representation through a vertical mission.

Current families include:

- equational theory laws;
- state-transition invariants;
- cross-theory bridge laws;
- the M011 relational transfer obligation.

Candidate families include temporal, quantitative, lifetime, termination, productivity, and resource propositions. They remain separate until an explicit translation or composition law relates them.

A family defines only the structure needed to state and check its judgments. Provider configuration and target syntax remain outside the family.

## Evidence providers

A provider consumes one supported normalized obligation plus explicit configuration and material inputs. It returns typed provider output or a typed unsupported/failure result.

A provider owns:

- translation into its native input;
- concrete tool execution;
- output decoding or certificate checking;
- provider version discovery;
- provider-specific bounds and assumptions;
- material artifact custody;
- provider diagnostics.

Portable obligation derivation remains independent of providers. Pure deterministic projection helpers remain direct functions. External process execution belongs in Effect Services and Layers.

Lean is first evaluated as a kernel-proof provider for a BANG-owned relational obligation. This does not make Lean or Mathlib the semantic authority for Core. A later mission may import an external theory only through an explicit typed translation that records identity, provenance, assumptions, and weakening.

Alloy and TLA+ can have two different roles:

- provider, when BANG already owns the normalized sentence;
- imported institution, when their logic supplies meaning that BANG cannot yet state.

A mission must name which role applies.

## Realization profiles and target adapters

A realization profile selects checked declarations and obligations and states requested target dispositions. Candidate dispositions include proof, certificate checking, static checking, runtime checking, property testing, model checking, monitoring, assumption, and unsupported.

A requested disposition is not evidence. Evidence records what a provider or target actually produced.

Target adapters own host representations, generated conformance boundaries, target capability checks, and declared weakening. Target-specific types never enter Core.

The current `operationRealization` declarations and M012 system selection are profile-like evidence. BANG will not add a general realization-profile construct until a mission needs one profile to drive more than one target or evidence route.

## Rejected alternatives

BANG does not now adopt:

- Lean or Mathlib as the universal theory source;
- one generic proposition AST;
- one universal evidence payload;
- a global provider or target plugin registry;
- provider-specific types in Core;
- target-specific types in Core;
- evidence flattening to one passed or failed value;
- historical `bang-lang` as an authorized future target;
- a claim that an abstract proof proves an independent host implementation.

## First tracer

M016 applies the existing `AccountLedger.transferPreservesTotal` obligation to two providers:

- the existing bounded Z3 provider;
- a new unbounded Lean kernel-proof provider.

The report keeps `solver-reported` and `kernel-proven` evidence separate. The Lean proof establishes the normalized mathematical obligation. It does not establish conformance of an Effect or Rust implementation.

BANG will review the provider boundary after M016. It will extract only the common contract that two live providers demonstrate.
