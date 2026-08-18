---
id: M011
title: Solver-backed relational obligation
status: complete
timebox: 2 focused sessions
vision_claims:
  - solver-neutral-obligation
  - bounded-counterexample
  - relational-reasoning
  - explicit-resource-bounds
depends_on:
  - M005
  - M010
---

# Mission

BANG can derive one solver-neutral transfer-conservation obligation from checked Core. One bounded Z3 provider can then find and explain a faulty transfer.

The first question is `AccountLedger.transferPreservesTotal`. It compares a lawful transfer with a transfer that credits one extra unit.

This mission does not add transfer semantics to normative Core. The checked Core source supplies stable theories, shared sorts, and bridge identity. The normalized obligation supplies one mission-local relational formula.

# User journey

```text
checked Account/Ledger Core
  → normalized relational obligation
  → explicit integer bounds and timeout
  → Z3 SMT-LIB projection
  → bounded provider run
  → decoded status and model
  → solver-reported evidence and readable result
```

Run `bun run demo:m011`. Inspect `.bang/evidence/M011.json`.

# Felt capability

A contributor can ask whether one transfer preserves the total balance in the configured domain.

The report includes:

- the stable obligation and source identities;
- every variable bound;
- the timeout and Z3 version;
- the generated SMT-LIB digest;
- one model for a faulty transfer;
- one bounded no-counterexample result for a lawful transfer;
- the exact meaning and limits of each result.

# Solver-neutral obligation

M011 earns a narrow `@bang/obligations` package. Core remains the semantic authority. This package owns a checked derived representation that providers and evidence can share.

The normalized obligation is:

```text
kind: relational
id: AccountLedger.transferPreservesTotal
source:
  core: examples/tiny-bank/core/account-ledger-bridge.json
  bridge: AccountLedger
  relation: transferPreservesTotal
variables:
  sourceBefore: Integer in [1, 10]
  targetBefore: Integer in [0, 10]
  amount: Integer in [1, 10]
  sourceAfter: Integer in [0, 10]
  targetAfter: Integer in [0, 21]
assumptions:
  amount <= sourceBefore
  sourceAfter = sourceBefore - amount
  targetAfter = targetBefore + amount [+ injectedFault]
claim:
  sourceBefore + targetBefore = sourceAfter + targetAfter
```

The lawful variant fixes `injectedFault` to `0`. The faulty variant fixes it to `1`.

The IR contains integer variables, literals, addition, subtraction, equality, and less-than-or-equal predicates. It contains no SMT-LIB text or Z3 types.

The constructor checks:

- one unique variable identity;
- every variable has an inclusive finite bound;
- each lower bound is not more than its upper bound;
- every expression reference resolves to a declared variable;
- the source bridge exists in checked Core;
- shared `Balance` has an `Integer` representation for both participants.

# Judgments

Let `B` be the finite assignment set defined by the variable bounds. Let `A(x)` be the conjunction of the assumptions. Let `C(x)` be the conservation claim.

```text
x ∈ B    A(x)    ¬C(x)
──────────────────────
BANG ⊢ x bounded-counterexample

¬∃ x ∈ B. A(x) ∧ ¬C(x)
────────────────────────
BANG ⊢ bounded-no-counterexample
```

A counterexample disproves the claim for the selected formula. A bounded no-counterexample result is not a proof outside the declared bounds.

# Provider boundary

`@bang/obligations` defines a `RelationalProvider` Effect service. The portable program depends only on this service.

The Z3 Layer owns:

- deterministic SMT-LIB projection;
- scoped child-process execution;
- provider timeout handling;
- output decoding;
- Z3 version discovery;
- provider-specific diagnostics.

The composition root selects Bun services and the Z3 Layer.

The first provider invocation uses the Nix package `z3` version `4.16.0`. It invokes `z3 -in -smt2` and sets a 2000 ms SMT query timeout. The Effect program also applies a 5 second process timeout.

The provider reads only the first standalone `sat`, `unsat`, or `unknown` status. It reads named values after `sat`. It does not infer success from process exit code alone.

# Result classification

- `sat` with a complete checked model means `bounded-counterexample`.
- `unsat` means `bounded-no-counterexample`.
- `unknown` means `inconclusive`.
- a timeout means `provider-timeout`.
- a nonzero exit, missing status, malformed model, or extra model identity means `provider-failed`.
- unsupported obligation constructs mean `unsupported-provider` before process execution.

The evidence class is `solver-reported`. BANG checks the output shape and model identity. BANG does not check an independent proof certificate.

# Vertical acceptance path

1. Load and check `examples/tiny-bank/core/account-ledger-bridge.json`.
2. Derive the normalized `AccountLedger.transferPreservesTotal` obligation.
3. Reject one invalid obligation with an unknown variable.
4. Project the lawful formula to deterministic SMT-LIB.
5. Run the bounded Z3 provider.
6. Report `bounded-no-counterexample` for the lawful formula.
7. Project the faulty formula from the same normalized shape.
8. Run the bounded Z3 provider.
9. Report one bounded counterexample.
10. Check the counterexample against the normalized formula in BANG.
11. Emit one strict, versioned evidence manifest.
12. Run the journey twice and get byte-identical SMT-LIB and evidence.
13. Classify malformed, unknown, and timed-out provider outcomes without conflating them.

# Acceptance evidence

- checked Core supplies the stable `AccountLedger` identity;
- one normalized obligation is independent of Z3 and SMT-LIB;
- positive and negative obligation fixtures check the IR boundary;
- all integer bounds and both timeouts appear in the report;
- lawful transfer returns `bounded-no-counterexample`;
- faulty transfer returns a complete model;
- the smallest observed faulty model is `sourceBefore=1`, `targetBefore=0`, `amount=1`, `sourceAfter=0`, `targetAfter=2`;
- BANG evaluates the returned model and observes a total change from `1` to `2`;
- an unknown variable fails before provider execution;
- an unsupported expression is rejected by the strict obligation Schema before provider execution;
- malformed status and `unknown` are distinct failure/result classes;
- the process-timeout branch maps interruption to `provider-timeout`; the demo checks this typed boundary without forcing a live timeout;
- the evidence manifest is strict and deterministic;
- reports call both results bounded and solver-reported;
- `bun run demo:m011` is included in `preview`;
- `just verify` passes.

# Primary uncertainty

Can one small relational IR preserve stable domain identity while one bounded provider returns a useful counterexample without making solver syntax part of Core?

# Non-goals

- a general solver registry or dispatch framework;
- unbounded theorem proving;
- proof certificates or certificate checking;
- automatic solver selection;
- nonlinear arithmetic, quantifiers, arrays, bit-vectors, or uninterpreted functions;
- transfer, arithmetic, or transition semantics in normative Core;
- general temporal, concurrency, lifetime, termination, or resource semantics;
- model optimization as a semantic guarantee;
- provider output trust beyond checked shape and independent model evaluation;
- migration of M000-M010 evidence;
- a surface language, compiler framework, plugin system, or CLI application;
- a Nix flake or repository-wide dependency pinning system.

# Explicit limitations

- the bounds are part of the question, not an optimization detail;
- `unsat` applies only to the generated finite integer domain and asserted formula;
- Z3 reports the solver result and remains a trusted external producer;
- the repository records the observed Z3 version but does not pin the Nix package revision;
- process and solver timeouts can differ;
- the faulty formula is a mission fixture, not a discovered implementation defect;
- Core does not yet define transfer state or arithmetic expressions.
