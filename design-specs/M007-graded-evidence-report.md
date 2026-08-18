---
id: M007
title: Graded evidence report
status: complete
timebox: 4 focused sessions
vision_claims:
  - obligation-identity
  - graded-evidence
  - evidence-scope
  - trust-boundaries
depends_on:
  - M003
  - M004
  - M006
---

# Mission

BANG can give one normalized Core obligation a stable identity. BANG can then report the exact strength and scope of observed evidence for that obligation.

The first obligation is the preservation of `Account.nonnegativeBalance` by `Account.withdraw`. M007 does not add this claim to Core JSON. It derives the obligation from the checked state machine, transition, and invariant.

# User journey

```text
checked Account state machine
  → normalized invariant-preservation obligation
  → stable obligation identity
  → generated property observation
  → checked evidence record
  → deterministic manifest and readable report
```

Run `bun run demo:m007`. Inspect `.bang/evidence/M007.json`.

# Felt capability

A user can select `Account.withdraw.preserves.nonnegativeBalance` and see:

- the `property-tested` evidence class;
- the sampled scope with the case count and seed;
- the replay path, when a counterexample exists;
- the source declarations and realization;
- the producer and its explicit trust boundary;
- the tool and target versions;
- the assumptions and target limitations;
- the lifetime and invalidating dependencies.

The report must not present sampled evidence as proof over all integers.

# Normative obligation

M007 derives normalized obligations from checked Core. It does not store observed evidence in Core.

For each state-machine operation `op` and invariant `inv`, normalization creates one obligation:

```text
operation relation
────────────────────────
initializer  establishes
transition   preserves
```

The canonical identity is:

```text
<machine>.<operation>.<relation>.<invariant>
```

The M007 identity is:

```text
Account.withdraw.preserves.nonnegativeBalance
```

The normalized obligation retains these source identities separately:

```text
state machine: Account
operation:     withdraw
relation:      preserves
invariant:     nonnegativeBalance
```

The component fields are authoritative. The canonical identity is a deterministic projection of those fields.

# Evidence record

The evidence record is a checked domain boundary outside normative Core. It references a normalized Core obligation.

The M007 record contains:

```text
obligation
  identity and source components

observation
  class: property-tested
  result: passed | failed
  scope: sampled
  requested cases
  executed cases
  seed
  shrink count
  optional counterexample and replay path

provenance
  Core source
  generated kit
  independent realization
  evaluator identity

producer
  producer identity
  trust: assumed-truthful

environment
  tool versions
  target name and version

qualification
  assumptions
  unsupported claims and reasons
  lifetime
  invalidating dependencies and boundaries
```

Schema decoding checks the record shape. Semantic checking confirms that the referenced obligation exists and that its source components match the normalized obligation.

The `property-tested` class permits only sampled scope. A record that combines `property-tested` with unbounded scope is invalid.

Schema and semantic checking cannot establish that a producer reported a real observation. The producer remains an explicit trust boundary.

# Evidence judgment

Let `O` be the normalized obligation set and `r` be a decoded evidence record.

```text
r.obligation.id ∈ ids(O)
r.obligation components = components(O[r.obligation.id])
r.observation.class = property-tested
r.observation.scope = sampled
executed cases ≤ requested cases
───────────────────────────────────────────────
O ⊢ r checked evidence
```

A checked record means that the record is well-formed and references the correct obligation. It does not mean that the producer is truthful.

# Orthogonality contract

- Core and normalization own obligation meaning and identity.
- The generated property suite produces an observation.
- The evidence model owns observation classes, scope, provenance, and qualification.
- The Effect target reports target details and weakening.
- A green result does not remove assumptions or unsupported claims.
- An invalidating dependency records when evidence becomes stale. M007 does not detect staleness automatically.

# Effect implementation direction

Use Effect Schema for the evidence boundary and staged checking. Use a typed error for an unknown or inconsistent obligation reference.

Keep obligation derivation and report formatting as total direct functions. They have no external dependencies or expected failure channel.

Use Effect `FileSystem`, `Path`, and scoped process services in the demonstration. Select `BunServices.layer` only at the composition root.

# Vertical acceptance path

1. Decode and check the M006 Core fixture.
2. Derive normalized state invariant obligations.
3. Select `Account.withdraw.preserves.nonnegativeBalance`.
4. Generate the existing Effect state-machine kit.
5. Run the independent withdrawal realization with a fixed seed and 100 cases.
6. Decode the observation through a Schema boundary.
7. Build and check the M007 evidence record.
8. Reject an unknown obligation reference.
9. Reject a structurally overstated `property-tested` record with unbounded scope.
10. Write one deterministic JSON manifest.
11. Print one readable report that keeps evidence, assumptions, and target limitations separate.

# Acceptance evidence

- obligation derivation is deterministic;
- the M007 obligation identity comes from normalized Core, not target string construction;
- the target projection uses the canonical obligation identity function;
- the checked record references the exact normalized obligation;
- the record reports 100 requested and executed cases with seed `20260813`;
- the record identifies sampled scope and does not claim universal proof;
- the record includes source provenance, evaluator identity, and tool and target versions;
- the record identifies its producer as an assumed-truthful boundary;
- the record includes assumptions, unsupported claims, lifetime, and invalidators;
- an unknown obligation reference fails semantic checking;
- unbounded scope fails Schema decoding for `property-tested` evidence;
- generated output and the manifest are deterministic;
- M000 through M006 demonstrations remain green;
- `just verify` passes from a clean checkout.

# Primary uncertainty

Can one small checked evidence model preserve obligation identity, evidence strength, scope, and trust without making observations normative Core semantics?

# Non-goals

- kernel proofs, proof certificates, or solver dispatch;
- a general proposition or obligation language;
- runtime checks or runtime monitors;
- automatic stale-evidence detection;
- cryptographic attestation or a truthful-producer proof;
- new state, effect, capability, quantity, lifetime, resource, or termination semantics;
- changes to the `Account.withdraw` transition or invariant;
- migration of every historical evidence manifest;
- packaging or generated-import cleanup;
- Rust or Java projection;
- a polished CLI or surface syntax.
