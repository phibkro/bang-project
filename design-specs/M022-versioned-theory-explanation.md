---
id: M022
title: Versioned exact-one theory explanation
status: complete
timebox: 5 focused sessions
vision_claims:
  - versioned-semantic-artifact
  - external-core-consumer
  - reusable-theory-applicability
  - premise-and-conclusion-explanation
depends_on:
  - M018
  - M019
  - M021
---

# Mission

BANG builds one deterministic TinyBank semantic artifact and gives it to an independent reusable-theory consumer.

The consumer explains why the exact-one capability theory applies to one requirement. It also explains why the theory does not apply to an unbounded requirement.

# User claim

> I can ask why a reusable theory applies to my domain construct. BANG shows each premise, derived obligation, limitation, and invalidator.

# User journey

The shipped journey runs:

```sh
bang explain examples/tiny-bank/theories/exact-one-capability.json
```

The command writes a deterministic artifact under `.bang/artifacts/`. It then passes the encoded artifact to a consumer outside the CLI package.

The report includes:

- the artifact format and identity;
- the theory identity and version;
- the stable requirement address;
- each satisfied or failed premise;
- the provenance class of each premise;
- each theory-derived implementation obligation;
- unresolved evidence status;
- material provenance and invalidators;
- claims that the quantity does not establish.

# Stable domain boundary

M022 uses the existing TinyBank Account machine and operation realizations.

The positive subject is:

```text
operationRealization:WithdrawAccountOnce.requirement:DebitAccount
```

The negative subject is:

```text
operationRealization:WithdrawAccount.requirement:DebitAccount
```

M022 does not change M018 quantity semantics, target behavior, or evidence. It does not move M020 journal semantics into Core.

# Versioned semantic artifact

The public artifact is an Effect Schema boundary. Version 1 contains:

- `bangSemanticArtifact: 1`;
- one artifact identity;
- decoded Core;
- normalized Core;
- normalization provenance.

The producer normalizes checked Core before encoding. The consumer performs these checks:

1. Decode the artifact with strict excess-property handling.
2. Check the embedded Core.
3. Normalize the checked Core from the embedded provenance.
4. Compare the embedded normalization with the clean normalization.
5. Reject any mismatch before theory evaluation.

The encoded JSON uses canonical object-key order. Array order remains semantic.

# Independent consumer

The theory consumer is a separate workspace package. It can import public `@bang/core` APIs. It must not import `apps/bang` or compiler orchestration internals.

The consumer accepts encoded artifact JSON and a stable requirement address. It returns a Schema-encoded typed result or a typed error.

# Exact-one capability execution theory

The theory identity is `ExactOneCapabilityExecution` version 1.

Its premises are:

1. Checked Core contains the selected operation realization.
2. The realization binds a checked operation.
3. Checked Core contains the required capability.
4. The selected requirement has quantity `exactly 1`.

Premises 1 through 3 are structurally derived. Premise 4 is authored.

If all premises hold, the theory derives these implementation obligations:

- check the destination and transition before consumption;
- consume one use atomically before operation execution;
- reject reuse before operation execution;
- do not restore a use after an execution attempt starts.

These are obligations. They are not implementation evidence.

If premise 4 fails, the result is `not-applicable`. The result contains no derived obligations.

# Boundedness and productivity

M022 bounds capability use only. Exact-one use does not establish:

- computation termination;
- computation productivity;
- memory or work bounds;
- capability lifetime;
- fairness;
- message delivery;
- distributed exactly-once execution.

A computation can be nonterminating and productive. Game loops, server loops, streams, and persistent actors can produce observations without returning.

Termination, productivity, quantity, lifetime, resources, and evidence scope remain separate axes.

# Provenance and evidence

The result uses these derivation classes:

- `authored`;
- `structurally-derived`;
- `theory-derived`.

Theory-derived obligations have evidence status `unresolved` in this artifact. Existing M018 runtime evidence remains separate.

# Positive fixtures

1. `WithdrawAccountOnce` satisfies all four premises.
2. The report contains the four derived obligations.
3. Repeated artifact production produces identical bytes.
4. The external consumer returns the same typed result for the same artifact.

# Negative fixtures

1. `WithdrawAccount` fails the exact-one premise because its quantity is unbounded.
2. A version other than `bangSemanticArtifact: 1` fails Schema decoding.
3. A changed embedded normalization fails clean parity.
4. An unknown requirement address returns a typed consumer error.
5. An unsafe selection or artifact path fails before file access.

# Failure contract

The CLI preserves these stages:

- `selection`;
- `source-read`;
- `source-decode`;
- `core-validation`;
- `artifact-build`;
- `artifact-consume`;
- `artifact-write`;
- `theory`.

A failed command prints no partial report. It writes one typed diagnostic to standard error and exits nonzero.

# Falsifiers

M022 fails if:

1. The consumer imports application internals.
2. The consumer trusts embedded normalized data without clean recomputation.
3. Property order changes artifact bytes.
4. An unbounded requirement receives exact-one conclusions.
5. A failed premise still produces conclusions.
6. A theory-derived obligation is reported as implementation evidence.
7. Exact-one use is reported as a lifetime, termination, productivity, memory, delivery, or distributed guarantee.
8. Stable premise and conclusion identities are absent.
9. Generated output changes without an input change.

# Evidence classification

The command produces runtime-checked evidence that the exercised artifact crossed the public encoded boundary and produced the reported explanation.

It does not prove implementation conformance, theory soundness for unknown future constructs, artifact authenticity, or compatibility with future artifact versions.

# Non-goals

- no registry or remote publication;
- no general theorem language;
- no automatic theory search;
- no persistent incremental cache;
- no target selection;
- no new capability quantity;
- no termination or productivity checker;
- no machine-capability or flow model;
- no accounting change;
- no surface syntax change.

# Acceptance path

1. Run the applicable `bang explain` journey.
2. Observe every satisfied premise and four derived obligations.
3. Observe unresolved evidence and boundedness limitations.
4. Run the unbounded requirement journey.
5. Observe one failed premise and no conclusions.
6. Decode the generated artifact from the independent package.
7. Reject incompatible version and parity-drift fixtures.
8. Run focused Core, theory, and CLI checks.
9. Run `just verify`.

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0007-modular-propositions-providers-and-realizations.md`;
- `decisions/0009-single-use-capability-quantity-boundary.md`;
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`;
- `design-specs/M018-single-use-capability.md`;
- `design-specs/M019-real-bang-self-check.md`;
- `design-specs/M021-construct-addressed-normalization.md`;
- `examples/tiny-bank/account.bang`.
