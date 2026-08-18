---
id: M021
title: Construct-addressed TinyBank normalization
status: complete
timebox: 5 focused sessions
vision_claims:
  - construct-addressed-normalization
  - semantic-fingerprint
  - typed-dependency-closure
  - clean-run-parity
depends_on:
  - M013
  - M019
  - M020
---

# Mission

BANG compares two valid TinyBank Core inputs through one shipped command.

The command identifies changed constructs and dependent conclusions. It also identifies results that remain reusable.

# User claim

> I can edit one banking construct and see which semantic conclusions changed, which conclusions remain reusable, and why.

# Stable banking boundary

M021 uses the existing TinyBank Account, capability, realization, and Account/Ledger bridge declarations.

M021 does not move the M020 accounting rules into Core. The local journal, transaction identity, and balance fold remain application-owned.

The M020 accounting behavior does not change.

# User journey

The shipped journey runs this command:

```sh
bang normalize examples/tiny-bank/normalization/selected-realization-change.json
```

The selection names a baseline source set and a candidate source set. Each source has a repository-relative path and a source format.

The command performs these operations:

1. It reads and decodes each named source.
2. It merges and checks each Core document.
3. It normalizes each checked document independently.
4. It compares constructs by stable address.
5. It computes the typed dependent closure for each changed construct.
6. It builds an incremental candidate from changed results and reusable baseline results.
7. It compares the incremental candidate with the clean candidate.
8. It prints one deterministic report.

The report includes these fields for each result:

- stable address;
- semantic fingerprint;
- material provenance;
- typed direct dependencies;
- typed dependency closure;
- status `changed`, `added`, `removed`, or `reused`;
- the changed dependency that invalidated a dependent conclusion.

The report ends with `Clean parity: match`.

# Construct address

A construct address is stable while the construct identity is stable.

Declaration addresses use this form:

```text
<kind>:<declaration-id>
```

Nested addresses extend the declaration address with a typed segment. Examples follow:

```text
stateMachine:Account.transition:withdraw
stateMachine:Account.invariant:nonnegativeBalance
operationRealization:WithdrawAccount
capability:DebitAccount
theoryBridge:AccountLedger.law:balancesAgree
```

Derived state obligations use their current normalized identity:

```text
obligation:Account.withdraw.preserves.nonnegativeBalance
```

Addresses do not use array positions.

# Semantic fingerprint

The semantic fingerprint is a SHA-256 digest of canonical semantic JSON.

Canonical semantic JSON sorts object keys and retains array order. It excludes material paths and comparison status.

An opaque Core extension remains part of the semantic JSON. BANG cannot assume that an unknown extension has no semantic meaning.

# Dependency types

M021 keeps dependency meanings separate.

The normalized graph supports these dependency types:

- `type-reference`;
- `data-reference`;
- `theory-reference`;
- `participant-theory`;
- `shared-sort-member`;
- `state-operation`;
- `capability-requirement`;
- `construct-member`;
- `model-theory`;
- `obligation-machine`;
- `obligation-operation`;
- `obligation-invariant`.

A dependency edge points from a dependent result to its premise.

The dependency closure is deterministic and contains all reachable premises. The reverse closure identifies every result that a changed premise invalidates.

For an operation realization, `construct-member` links the composite to its
separately addressed operation, requirement, and disabled-result constructs.
Its local fingerprint excludes those nested constructs. A nested change
therefore invalidates the realization through the typed edge.

# Material provenance

Each normalized construct records the repository-relative source path that supplied its declaration.

A nested construct inherits the declaration source path. A derived conclusion records every source path from its premise closure.

The source path is material provenance. It does not become semantic authority.

# Comparison rules

A result is `reused` only when all these facts match:

- its address;
- its semantic fingerprint;
- its typed direct dependencies;
- the semantic fingerprints of its dependency closure.

A result is `changed` when its address remains present but its semantic fingerprint changes.

A result is invalidated when one of its premises changes, even if its own local fingerprint remains equal.

The command reports added and removed addresses separately.

# Clean-run parity

The clean candidate normalization is the authority for the candidate result.

The incremental candidate reuses only eligible baseline results. It replaces invalidated, changed, added, and dependent results with clean candidate results.

The incremental candidate must equal the clean candidate exactly. Equality covers addresses, fingerprints, dependency edges, closures, and provenance.

# Positive fixtures

The mission includes these cases:

1. An unrelated realization changes. Selected Account conclusions remain reusable.
2. The selected `WithdrawAccount` realization changes. The realization changes and its dependents are invalidated.
3. The Account withdrawal invariant changes without an identity change. Its fingerprint and derived obligation change.
4. Object property order changes. Semantic fingerprints remain equal.

# Negative fixtures

The mission includes these cases:

1. A source contains an invalid Core reference. The command exits nonzero before comparison.
2. A selection contains an unsafe path. Strict Schema decoding rejects it.
3. A dependency target is absent from normalized checked Core. Normalization returns a typed error.
4. A divergent incremental assembly fails the exported parity verifier. The command maps the same typed failure if its internal assembly ever diverges.

# Failure contract

The application preserves these failure stages:

- `selection`;
- `source-read`;
- `source-decode`;
- `core-validation`;
- `normalization`;
- `clean-parity`.

A failure retains the relevant selection path, source path, or construct address.

A failed command writes no report to standard output. It writes one typed diagnostic to standard error and exits nonzero.

# Falsifiers

M021 fails for any of these observations:

1. A construct loses its address after an unrelated reorder.
2. Object property order changes a fingerprint.
3. A semantic field change keeps the same fingerprint.
4. An unrelated edit invalidates an Account conclusion.
5. A referenced edit reuses a dependent conclusion.
6. Two dependency meanings use one untyped edge.
7. A provenance path changes a semantic fingerprint.
8. Incremental output differs from clean output.
9. The report treats M020 journal rules as checked Core semantics.
10. The report calls comparison evidence a proof.

# Evidence classification

The journey produces `runtime-checked` comparison evidence.

It demonstrates construct identity, fingerprints, closures, reuse, invalidation, and parity for the exercised TinyBank inputs.

It does not demonstrate these claims:

- collision resistance beyond the SHA-256 assumption;
- correctness for unknown future Core declaration kinds;
- persistent incremental caches;
- performance improvement;
- accounting correctness;
- complete source-span provenance;
- continuous file watching;
- proof of semantic equivalence.

# Non-goals

- no change to the M020 ledger behavior;
- no new accounting Core primitive;
- no persistent cache;
- no file watcher;
- no parallel derivation scheduler;
- no surface syntax change;
- no external checked-Core extension API;
- no reusable theory applicability engine;
- no realization planner;
- no occupational-health implementation.

# Primary uncertainty

Can BANG identify semantic change by construct instead of invalidating every result from one changed source file?

# Acceptance path

1. Run the selected-realization journey through the shipped `bang normalize` command.
2. Observe the changed realization and its dependent invalidation.
3. Run the unrelated-realization fixture.
4. Observe that the selected Account conclusions remain reusable.
5. Run the invariant-change fixture.
6. Observe that the stable obligation address remains and its fingerprint changes.
7. Run the invalid-reference fixture.
8. Observe a typed failure and no partial report.
9. Run the focused Core and CLI tests.
10. Run `just verify`.

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`;
- `design-specs/M012-accumulated-system-report.md`;
- `design-specs/M013-account-source-notation.md`;
- `design-specs/M019-real-bang-self-check.md`;
- `design-specs/M020-family-ledger-prototype.md`;
- `examples/tiny-bank/account.bang`;
- `examples/tiny-bank/core/account-ledger-bridge.json`.
