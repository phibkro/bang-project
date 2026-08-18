---
id: M016
title: Kernel-proof evidence provider
status: complete
timebox: 2 focused sessions
vision_claims:
  - modular-proposition-provider
  - kernel-checked-evidence
  - non-flattened-evidence
  - stable-obligation-identity
depends_on:
  - M010
  - M011
  - M012
  - M014
---

# Mission

BANG can send the existing normalized `AccountLedger.transferPreservesTotal` obligation to both Z3 and Lean. It reports bounded solver evidence and kernel-checked proof evidence separately without changing Core semantics or claiming that either result proves an independent target implementation.

# User journey

```text
checked Account/Ledger Core
  → normalized relational obligation
  → existing bounded Z3 provider
  → new unbounded Lean proof provider
  → strict evidence records with material digests
  → one readable non-flattened report
```

Run `bun run demo:m016`. Inspect `.bang/evidence/M016.json` and the generated Lean source.

# Felt capability

A contributor can inspect one transfer-conservation question and see two distinct answers:

- Z3 found no counterexample inside declared finite bounds;
- Lean kernel-checked the lawful equation over unbounded mathematical integers.

The same report also shows:

- Z3 finds a bounded model for the faulty transfer;
- Lean kernel-checks a refutation of the universal faulty claim;
- the abstract proof does not prove the Effect or Rust implementation;
- the provider versions, source digests, assumptions, and invalidators.

# Semantic boundary

M011 owns the normalized relational obligation. M016 does not add Lean syntax or proof terms to Core or the obligation IR.

The lawful obligation has these assumptions over mathematical integers:

```text
amount <= sourceBefore
sourceAfter = sourceBefore - amount
targetAfter = targetBefore + amount
```

Its claim is:

```text
sourceBefore + targetBefore = sourceAfter + targetAfter
```

M016 drops M011's finite variable bounds only for the Lean theorem. It does not drop the relational assumptions. The stable obligation identity remains `AccountLedger.transferPreservesTotal`.

The faulty variant changes the target update to:

```text
targetAfter = targetBefore + amount + 1
```

Lean must kernel-check a theorem that this faulty universal claim is false. Failure to prove the faulty claim is not enough because provider failure is not evidence of refutation.

# Judgments

Let `O` be the checked normalized obligation. Let `L(O)` be its deterministic Lean translation. Let `K` be the pinned Lean kernel and imported trusted environment.

```text
BANG ⊢ O checked    L(O) contains theorem t    K ⊢ t
──────────────────────────────────────────────────────
BANG ⊢ kernel-proven(O, t, inputs, trust)
```

For the faulty variant `Of`:

```text
BANG ⊢ Of checked    L(Of) contains theorem not_t    K ⊢ not_t
─────────────────────────────────────────────────────────────
BANG ⊢ kernel-refuted(Of, not_t, inputs, trust)
```

`kernel-proven` and `kernel-refuted` classify proof-provider output. They do not prove the Lean kernel, imported axioms, BANG-to-Lean translation, target adapter, or host implementation.

# Provider boundary

`@bang/obligations` owns:

- deterministic projection from the existing relational IR to Lean source;
- a typed Lean provider request and result;
- a project Service for the domain-level proof-provider contract;
- a concrete Layer for pinned Lean process execution;
- version discovery and typed process failures.

The pure source projector remains a direct function. The Service exists because provider selection, external process execution, version discovery, and artifact checking are effects.

The Lean source is disposable and deterministic. The evidence record binds its SHA-256 digest. Concrete runtime imports remain at the Layer and composition root.

# Evidence boundary

The M016 manifest is strict and versioned. It contains the existing M011 solver manifest plus a separate kernel-proof section.

For each Lean observation it records:

- Core obligation identity and variant;
- theorem identity;
- result `kernel-proven` or `kernel-refuted`;
- normalized obligation digest;
- generated Lean source path and digest;
- Lean version;
- imported module or library versions;
- provider command identity;
- assumptions and trust boundary;
- unsupported implementation-conformance claim;
- lifetime and invalidators.

The report does not calculate one combined evidence grade.

# Vertical acceptance path

1. Load and check the existing Account/Ledger Core.
2. Derive lawful and faulty M011 relational obligations.
3. Reuse the existing bounded Z3 provider results.
4. Project both obligations into one deterministic Lean module.
5. Confirm that the Lean theorem contains no M011 finite variable bounds.
6. Kernel-check the lawful universal conservation theorem.
7. Kernel-check a refutation of the faulty universal claim.
8. Reject a changed or malformed theorem module.
9. Reject provider output with the wrong obligation or theorem identity.
10. Bind the normalized obligations and Lean module by SHA-256.
11. Strictly encode, reload, and recheck one M016 manifest.
12. Print Z3 and Lean evidence as separate sections.
13. State that neither section proves the Effect or Rust implementation.
14. Run the journey twice and obtain byte-identical generated source and evidence.
15. Include `bun run demo:m016` in `preview`.
16. Run `just verify`.

# Falsifiers

The mission fails if:

1. a Lean or Mathlib type enters `@bang/core` or the relational obligation IR;
2. finite Z3 bounds constrain the Lean theorem;
3. provider failure is reported as refutation;
4. the faulty universal claim is accepted as lawful;
5. solver and kernel evidence are flattened into one grade;
6. proof evidence omits source, obligation, toolchain, or imported-environment digests;
7. proof evidence attaches to the wrong Core obligation identity;
8. a Lean theorem about the abstract equation is reported as proof of an Effect or Rust implementation;
9. an unsupported translation produces executable Lean source instead of a typed error;
10. generated Lean source or evidence changes between identical runs.

# Acceptance evidence

- existing checked Core and relational obligation identities remain unchanged;
- one pure deterministic Lean source projection consumes `RelationalObligation`;
- one Effect Service and concrete Layer own Lean execution;
- lawful source kernel-checks over unbounded `Int` values;
- faulty source kernel-checks an explicit refutation;
- a broken theorem fails with a typed provider error;
- strict evidence decoding rejects excess properties;
- evidence checking rejects identity or digest mismatch;
- the report preserves `solver-reported`, `kernel-proven`, and `kernel-refuted` distinctions;
- the report states all trust and implementation-conformance limitations;
- generated source and the manifest are deterministic;
- `just verify` passes.

# Primary uncertainty

Can the existing provider-neutral relational obligation state enough meaning for Lean to check an unbounded theorem without importing Lean semantics into Core?

# Non-goals

- Lean or Mathlib as the canonical BANG theory source;
- arbitrary Lean proposition import;
- a general Lean-to-Core or Core-to-Lean compiler;
- a global provider registry;
- a universal evidence AST;
- proof-producing Z3 or proof-certificate translation;
- verified extraction to Effect or Rust;
- proof of target implementation conformance;
- formal soundness of all Core semantics;
- temporal, actor-concurrency, quantitative, lifetime, or resource semantics;
- a BANG implementation language.

# Evidence classification

M016 can demonstrate:

- deterministic translation of one normalized obligation to Lean;
- Lean kernel acceptance of the lawful theorem;
- Lean kernel acceptance of an explicit faulty-claim refutation;
- retention of distinct solver and proof evidence in one report.

M016 assumes:

- the Lean executable and imported environment implement their reported versions;
- the generated Lean proposition faithfully represents the normalized obligation;
- the BANG implementation correctly binds provider output to digests and identities.

M016 does not demonstrate:

- consistency of Lean or imported axioms;
- correctness of the BANG-to-Lean translation;
- that an independent Effect or Rust implementation satisfies the theorem;
- universal soundness of BANG Core or its evidence system.
