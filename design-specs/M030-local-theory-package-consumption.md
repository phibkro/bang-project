---
id: M030
title: Local versioned theory package consumption
status: complete
timebox: 4 focused sessions
vision_claims:
  - language-neutral-theory-package
  - local-package-resolution
  - semantic-package-digest
  - deterministic-theory-lock
depends_on:
  - M022
  - M029
---

# Mission

BANG resolves one local versioned theory package and applies it to TinyBank and Inventory through `bang explain`.

The package supplies the canonical public declaration for `ExactOneCapabilityExecution` version 1. The existing Effect evaluator implements that declaration.

# User claim

> I can reference one versioned theory package from two domains. BANG verifies its identity and semantic digest, locks the resolved package, and explains each derived result.

# User journey

The primary journey runs:

```sh
bang explain examples/inventory/theories/packaged-exact-one.json
```

The selection names:

- a repository-relative package path.
- the expected package identity and version.
- the expected semantic SHA-256 digest.
- the Inventory source and exact-one requirement address.

The report contains:

- package identity and version.
- package source path.
- verified semantic digest.
- evaluator identity and version.
- deterministic lock path.
- the existing premises, obligations, evidence scope, limitations, and invalidators.

A TinyBank selection resolves the same package identity and semantic digest.

# Canonical package boundary

The canonical package is strict language-neutral JSON owned by `@bang/theories`.

Version 1 contains:

- `bangTheoryPackage: 1`.
- package identity and version.
- evaluator identity and version.
- one subject shape.
- the exact capability quantity required for applicability.
- ordered premise identities and derivation classes.
- ordered obligations with identities, statements, and derivation classes.
- the initial evidence status and scope.
- explicit limitations.
- the invalidation rule.

The package JSON is the canonical public declaration. The evaluator imports and decodes that declaration. BANG does not maintain a second hand-written manifest in TypeScript.

The semantic digest is SHA-256 over the canonical encoding of the strictly decoded package. JSON object-property order and formatting do not affect the digest. Array order remains semantic.

# Selection boundary

An M030 selection adds this required package reference:

```text
theory
  path
  id
  version
  semanticDigest
```

Legacy M022 and M029 selections without a package reference remain valid. They use the same built-in canonical package declaration and evaluator.

The expected identity, version, and digest are caller intent. BANG does not guess them from a path or transport package version.

# Evaluator agreement

The package binds `ExactOneCapabilityExecutionEvaluator` version 1.

Before evaluation, BANG checks:

1. Package format version 1 is valid.
2. Package identity matches the selection.
3. Package version matches the selection.
4. Canonical semantic digest matches the selection.
5. The evaluator identity and version are supported.
6. The evaluator result uses the package theory identity.
7. The evaluator result uses exactly the package premise identities and derivation classes.
8. An applicable result uses exactly the package obligation declarations.
9. A not-applicable result has no obligations.
10. Evidence and limitations match the package declaration.

An agreement failure is a typed package failure. It is not an applicability result.

# Theory lock

A successful packaged explanation writes:

```text
.bang/theory-locks/<selection-id>.json
```

The strict deterministic lock contains:

- `bangTheoryLock: 1`.
- selection identity.
- repository-relative package path.
- package identity and version.
- verified semantic digest.
- evaluator identity and version.

The lock contains no time, machine, or absolute-path field.

Repeated resolution of unchanged inputs produces identical lock bytes.

# Positive fixtures

1. TinyBank and Inventory resolve the same package identity, version, and digest.
2. Both applicable results contain the same premise and obligation identities.
3. Inventory retains its own construct provenance and invalidators.
4. The package semantic digest is deterministic.
5. JSON object-property reordering does not change the semantic digest.
6. The generated lock is strict and deterministic.
7. Legacy unpackaged explanation selections retain their behavior.

# Negative fixtures

1. A wrong expected digest fails before theory evaluation.
2. An unsupported package version fails strict decoding or identity validation.
3. A missing package returns a typed resolution failure.
4. A package with an unsupported evaluator returns a typed failure.
5. A package declaration that disagrees with evaluator output returns a typed agreement failure.
6. A package or integrity failure prints no partial report.
7. A package or integrity failure writes no new semantic artifact or theory lock.
8. An unbounded Inventory requirement remains `NotApplicable` and receives no obligations.

# Failure contract

M030 adds a `package` stage to the explanation failure contract.

Package failures retain:

- the package path.
- a typed reason when available.
- the expected or observed identity when available.
- one concise message.

Package validation and evaluator agreement complete before generated files are written.

# Evidence classification

The journey supplies runtime-checked evidence for:

- strict local package decoding.
- canonical semantic-digest verification.
- package-to-evaluator agreement for exercised results.
- one package consumed by two domain artifacts.
- deterministic theory-lock generation.
- typed rejection of the exercised failures.

The journey does not prove:

- theory soundness.
- evaluator correctness for all future inputs.
- package authenticity or publisher identity.
- remote registry interoperability.
- transitive dependency resolution.
- safe execution of untrusted evaluator code.
- implementation conformance.

# Falsifiers

M030 fails if:

1. npm or filesystem package versions define semantic compatibility implicitly.
2. The package declaration and evaluator metadata can drift without rejection.
3. Different package bytes with the same decoded semantics produce different semantic digests.
4. TinyBank and Inventory resolve different package digests.
5. A digest mismatch reaches theory evaluation.
6. An evaluator disagreement produces an ordinary applicability result.
7. A failed package operation writes a new artifact or lock.
8. The lock contains an absolute path, timestamp, or machine-specific value.
9. Existing unpackaged explanation journeys regress.

# Non-goals

- no remote package registry.
- no package publication or signing.
- no arbitrary plugin loading.
- no untrusted evaluator execution.
- no package dependency solver.
- no automatic theory discovery.
- no general theory language.
- no objective-relative realization planner.
- no target or runtime implementation for Inventory.
- no new Core construct or surface syntax.

# Acceptance path

1. Run the packaged TinyBank explanation.
2. Run the packaged Inventory explanation.
3. Observe one package identity and digest across both domains.
4. Observe the same premise and obligation identities.
5. Repeat the Inventory journey and compare artifact and lock bytes.
6. Run the packaged unbounded Inventory journey and observe no obligations.
7. Run wrong-digest, unsupported-version, missing-package, unsupported-evaluator, and evaluator-disagreement fixtures.
8. Observe typed failures, no partial reports, and no generated outputs for each failure.
9. Run legacy M022 and M029 explanation journeys.
10. Run focused package, theory, and CLI tests.
11. Run `just verify`.

# Sources

- `BANG-PROJECT-DIRECTION.md`.
- `decisions/0007-modular-propositions-providers-and-realizations.md`.
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`.
- `decisions/0012-semantic-process-architecture-and-reuse-boundary.md`.
- `design-specs/M022-versioned-theory-explanation.md`.
- `design-specs/M029-second-domain-theory-portability.md`.
- `packages/core/src/normalization.ts`.
- `packages/theories/src/index.ts`.
- `apps/bang/src/explain.ts`.
