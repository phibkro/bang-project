---
id: M009
title: Rust portability projection
status: complete
timebox: 5 focused sessions
vision_claims:
  - core-portability
  - target-independent-semantics
  - rust-refinement-boundary
  - target-weakening-evidence
depends_on:
  - M001
  - M007
---

# Mission

BANG can project the unchanged M001 `Balance` Core declaration into a Rust conformance boundary. An independent Rust implementation can consume that boundary without Effect or TypeScript.

The Rust boundary accepts `0` and rejects `-1`. The evidence report compares target behavior without treating either target as semantic authority.

# User journey

```text
unchanged Balance Core JSON
  → existing Core decode and semantic check
  → deterministic Rust projection
  → generated Rust boundary
  → independent Rust consumer
  → cargo compile and runtime checks
  → target-portability evidence
  → deterministic manifest and readable report
```

Run `bun run demo:m009`. Inspect `generated/rust/balance.rs` and `.bang/evidence/M009.json`.

# Felt capability

A contributor uses one checked Core declaration to generate a Rust value boundary. The contributor does not rewrite the domain rule in a second target-specific specification.

```text
Balance = { self ∈ Integer | self ≥ 0 }

Effect target: bigint + Schema brand
Rust target:   i128 + private-field newtype + checked constructor
```

Both targets accept the demonstrated lower boundary and reject the demonstrated negative value. Their host representations and static guarantees differ.

# Semantic boundary

The existing Core JSON remains unchanged and normative for this mission. M009 adds no Core declaration, term, predicate, or judgment.

The Rust projector consumes a checked `RefinementDeclaration`. It does not decode arbitrary Core or define refinement semantics.

# Rust projection

For this tracer, Core `Integer` projects to Rust `i128`.

The generated module contains:

- `Balance(i128)` with a private field;
- `BalanceError` with the rejected `i128` value;
- `Balance::new(value) -> Result<Balance, BalanceError>`;
- `Balance::get(self) -> i128`;
- the Core source identity and target limitation in generated constants;
- no Effect, TypeScript, serialization, runtime framework, or external crate dependency.

The constructor implements the checked Core predicate `self >= 0`.

# Independent consumer

The committed Rust crate imports the generated module by path. Its handwritten code must:

- construct `Balance::new(0)`;
- observe `0` through `get`;
- reject `Balance::new(-1)` and retain the rejected value;
- compile without access to the private field;
- avoid copying the predicate into handwritten business code.

A compile-fail fixture attempts direct tuple construction. The Rust compiler must reject that fixture because the field is private.

# Target comparison

| Property                     | Effect TypeScript            | Rust                                                    |
| ---------------------------- | ---------------------------- | ------------------------------------------------------- |
| demonstrated integer carrier | arbitrary-precision `bigint` | fixed-width `i128`                                      |
| checked construction         | Effect Schema boundary       | `Result` constructor                                    |
| nominal barrier              | Schema brand                 | private newtype field                                   |
| unsafe bypass                | casts or foreign JavaScript  | `unsafe`, generated-module edits, or foreign interfaces |
| overflow limit               | host memory                  | `i128` range                                            |

The Rust projection weakens the Core mathematical integer domain to `i128`. Evidence must report this limitation as `unsupported-by-target` outside the represented range.

# Evidence contract

The M009 manifest records:

- Core source and declaration identity;
- evidence classes `target-static-analysis`, `runtime-checked`, and `unsupported-by-target`;
- accepted and rejected runtime cases;
- the compile-fail private-field observation;
- projector, generated module, and independent consumer provenance;
- Rust compiler and target versions;
- the existing Effect comparison target and versions;
- assumptions, lifetime, and invalidators;
- the `i128` range limitation;
- unsupported universal equivalence and proof claims.

A green Rust build proves only that the recorded crate compiled. Runtime cases are observations over those cases.

# Vertical acceptance path

1. Decode and check the unchanged `examples/tiny-bank/core/balance.json` fixture.
2. Select the checked `Balance` refinement.
3. Generate `generated/rust/balance.rs` deterministically.
4. Compare the generated module with a committed snapshot.
5. Compile the independent Rust conformance crate.
6. Run the crate and observe acceptance of `0`.
7. Observe rejection of `-1` with the rejected value retained.
8. Compile the negative fixture and observe private-field rejection.
9. Confirm that the Rust crate imports no Effect or TypeScript artifact.
10. Emit a deterministic M009 evidence manifest.
11. Report the `i128` target weakening and unsafe boundaries.
12. Keep M000 through M008 demonstrations green.
13. Pass `just verify`.

# Acceptance evidence

- M001 Core bytes remain unchanged;
- the projector accepts the checked M001 refinement without new Core semantics;
- generated Rust source is deterministic;
- the committed snapshot matches generated source;
- the independent Rust crate compiles;
- `Balance::new(0)` returns a value whose getter returns `0`;
- `Balance::new(-1)` returns `BalanceError { rejected: -1 }`;
- direct field construction fails Rust compilation;
- the Rust package has no external crate dependencies;
- evidence records Rust and Effect target differences;
- evidence does not claim arbitrary-precision portability;
- the M009 manifest is deterministic;
- `just verify` passes.

# Primary uncertainty

Can unchanged Core preserve one useful domain boundary across Effect TypeScript and Rust while target limitations remain explicit?

# Non-goals

- porting the BANG compiler to Rust;
- decoding Core JSON in Rust;
- arbitrary-precision Rust integers or a crate dependency;
- projection of theories, state machines, effects, capabilities, traces, or general evidence schemas;
- generated business implementations;
- serialization or an ABI contract;
- proving semantic equivalence between targets;
- Wasm, native packaging, publishing, or deployment;
- Java projection;
- a general target plugin framework;
- a polished CLI.
