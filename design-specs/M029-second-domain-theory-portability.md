---
id: M029
title: Second-domain reusable theory portability
status: complete
timebox: 3 focused sessions
vision_claims:
  - second-domain-portability
  - reusable-theory-package
  - domain-neutral-semantic-artifact
  - premise-and-obligation-reuse
depends_on:
  - M021
  - M022
  - M028
---

# Mission

BANG applies one existing reusable theory to TinyBank and Inventory domains through the shipped `bang explain` command.

The Inventory journey uses the existing BANG surface, checked Core, normalized artifact, and `ExactOneCapabilityExecution` theory. It does not add a Core construct or a second theory implementation.

# User claim

> I can use one reusable BANG theory in a non-financial domain. BANG derives the same warranted obligations from the same semantic premises without compiler code that names my domain.

# User journey

The primary journey runs:

```sh
bang explain examples/inventory/theories/exact-one-reservation.json
```

The command reads one Inventory source, builds one deterministic semantic artifact, and applies `ExactOneCapabilityExecution` version 1.

The report identifies:

- the Inventory artifact and source.
- the `ReserveStockOnce` realization.
- the `ReserveStock` capability requirement.
- four satisfied theory premises.
- four theory-derived implementation obligations.
- unresolved implementation evidence.
- limitations and semantic invalidators.

The negative journey runs:

```sh
bang explain examples/inventory/theories/unbounded-reservation.json
```

It selects `ReserveStockMany`. The authored quantity premise fails because the capability is unbounded. The result is `NotApplicable` and contains no derived obligations.

# Stable domain boundary

The new domain is warehouse inventory reservation.

```text
Inventory
  state: availableUnits, reservedUnits
  initializer: initialize
  transition: reserve
  invariants: nonnegativeAvailable, nonnegativeReserved

ReserveStock capability
  ReserveStockOnce requires exactly 1
  ReserveStockMany requires unbounded
```

All quantities use the existing integer and capability-quantity semantics.

The mission does not claim that BANG implements stock movement. It does not claim that one capability use makes a distributed reservation exactly once.

# Reused theory boundary

M029 reuses `ExactOneCapabilityExecution` version 1 without a domain-specific branch.

The following theory facts remain unchanged:

1. The selected operation realization exists.
2. The realization binds a checked operation.
3. The required capability exists.
4. The selected requirement has quantity `exactly 1`.
5. An applicable result contains the existing four obligations.
6. A failed authored quantity premise produces no obligations.
7. Evidence remains unresolved until an implementation supplies it.
8. Existing limitations and invalidator semantics remain unchanged.

The requirement address stays construct-addressed:

```text
operationRealization:<realization>.requirement:<capability>
```

# Portability boundary

Domain identifiers belong only to domain sources, selections, expected fixture output, and user-facing evidence.

The following reusable processes must not test for Inventory identifiers:

- surface parsing and lowering.
- Core validation.
- semantic artifact production and consumption.
- normalization and clean-run parity.
- exact-one theory applicability.
- explanation report formatting.

Existing TinyBank-specific target and evidence adapters remain unchanged. M029 does not use them for Inventory.

# Positive fixtures

1. The Inventory source lowers to checked Core.
2. `ReserveStockOnce` binds `Inventory.reserve`.
3. `ReserveStockOnce` requires `ReserveStock exactly 1`.
4. The theory result is `Applicable`.
5. All four premises are satisfied.
6. The existing four obligation identities are present.
7. Repeated compilation produces identical semantic artifact bytes.
8. Source and normalized-address provenance identify Inventory constructs.

# Negative fixtures

1. `ReserveStockMany` requires `ReserveStock unbounded`.
2. Its theory result is `NotApplicable`.
3. Its authored exact-one premise is failed.
4. It receives no theory-derived obligations.
5. An unknown Inventory requirement address produces a typed failure.
6. A failed command emits no partial explanation report.

# Evidence classification

The journey supplies runtime-checked evidence for these observations:

- the Inventory source crosses the BANG surface and checked-Core boundaries.
- the public semantic artifact crosses its encoded boundary.
- one unchanged theory evaluator accepts both domain-neutral artifacts.
- exact-one and unbounded requirements receive different results.
- repeated Inventory artifact production is deterministic.

The journey does not prove:

- the soundness of the theory for all future Core constructs.
- implementation conformance.
- stock reservation durability or atomicity.
- distributed exactly-once execution.
- package registry compatibility.
- automatic theory discovery.

# Falsifiers

M029 fails if:

1. Reusable compiler or theory code tests an Inventory identifier.
2. Inventory requires a duplicate exact-one theory implementation.
3. TinyBank and Inventory use different theory identities or obligation identities.
4. An unbounded requirement receives exact-one obligations.
5. A failed premise still produces obligations.
6. The result reports unresolved obligations as implementation evidence.
7. Repeated Inventory artifact production changes bytes.
8. The journey uses a TinyBank-specific target or M018 evidence adapter.
9. A failure writes a partial report.

# Non-goals

- no new Core construct.
- no new surface syntax.
- no target adapter for Inventory.
- no Inventory runtime or database.
- no package registry or remote publication.
- no language-neutral package resolver.
- no general theory-search engine.
- no objective-relative realization planner.
- no general provider protocol.
- no change to TinyBank behavior.

# Acceptance path

1. Run the primary Inventory explanation command.
2. Observe four satisfied premises and four obligations.
3. Observe unresolved evidence, limitations, and Inventory provenance.
4. Run the unbounded Inventory explanation command.
5. Observe one failed authored premise and no obligations.
6. Run the unknown-address fixture.
7. Observe a typed failure and no partial report.
8. Repeat the primary journey and compare artifact bytes.
9. Run focused surface, theory, explanation, and CLI tests.
10. Run `just verify`.

# Sources

- `BANG-PROJECT-DIRECTION.md`.
- `decisions/0007-modular-propositions-providers-and-realizations.md`.
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`.
- `decisions/0012-semantic-process-architecture-and-reuse-boundary.md`.
- `design-specs/M021-construct-addressed-normalization.md`.
- `design-specs/M022-versioned-theory-explanation.md`.
- `design-specs/M028-versioned-semantic-evolution.md`.
- `examples/tiny-bank/account.bang`.
- `packages/core/src/semantic-artifact.ts`.
- `packages/theories/src/index.ts`.
- `apps/bang/src/explain.ts`.
