---
id: M005A
title: First useful Core dogfood
status: active
timebox: 5 focused sessions
vision_claims:
  - algebraic-data-modeling
  - recursive-data
  - self-conformance
  - bootstrap-boundary
depends_on:
  - M005
---

# Mission

BANG can specify the recursive algebraic shape of its own `BridgeTerm`, project
that specification into an Effect conformance kit, and evaluate the existing
hand-written `@bang/core` decoder against the generated contract.

This is the first useful dogfood slice. It is not self-hosting: the current
compiler remains the bootstrap implementation, while a BANG declaration becomes
an independently inspectable contract over one part of that implementation.

## User journey

```text
BANG BridgeTerm data declaration
  → Core decode and semantic validation
  → recursive data normalization
  → Effect Schema + decoder-port projection
  → bind the existing @bang/core BridgeTerm decoder
  → conforming recursive terms pass
  → a deliberately drifted decoder fails with a minimized shape counterexample
  → evidence distinguishes structural checks, sampled recursion, and assumptions
```

Run `bang demo M005A` through the current script-backed command surface. Inspect
the generated `BridgeTerm` kit and `.bang/evidence/M005A.json`.

## Felt capability

A BANG contributor changes the compiler's hand-written `BridgeTerm`
representation. The generated conformance suite either confirms that the
implementation still accepts and preserves the BANG-declared recursive shape or
reports the smallest constructor path where it differs.

The diagnostic must use domain paths such as:

```text
BridgeTerm.Application.arguments[0].Variable.id
```

It must not report only a TypeScript assignment error or an anonymous Schema
parse tree.

## Core fragment

Explanatory notation:

```text
data BridgeTerm tagged by kind =
  | variable {
      id: Identifier
    }
  | application {
      operation: {
        participant: Identifier,
        operation: Identifier
      },
      arguments: List<BridgeTerm>
    }
```

The canonical Core JSON adds one `data` declaration with:

- a stable declaration identity;
- one discriminator field;
- two or more constructors with unique literal tags;
- constructor fields represented as ordered named products;
- type expressions for `Identifier`, nested records, lists, and named
  declaration references;
- a recursive `BridgeTerm` reference beneath `List`.

`Identifier` is the existing Core lexical contract, not a new user-defined
refinement system. M005A makes it addressable from data fields only because the
dogfood structure already depends on it.

## Semantic judgments

Let `Δ` contain declared data identities and the Core prelude type
`Identifier`.

```text
Identifier ∈ Prelude
────────────────────
Δ ⊢ Identifier type

T ∈ Δ
────────────
Δ ⊢ Ref(T) type

Δ ⊢ T type
────────────────
Δ ⊢ List(T) type

Δ ⊢ T₁ type ... Δ ⊢ Tₙ type    field names unique
───────────────────────────────────────────────────
Δ ⊢ Record({ f₁: T₁, ... fₙ: Tₙ }) type

constructors nonempty     constructor tags unique
fields well-typed         fields distinct from discriminator
──────────────────────────────────────────────────
Δ ⊢ data D well-formed
```

Every recursive value remains a finite encoded tree. M005A does not add cyclic
runtime objects, coinductive values, infinite observations, or recursive type
aliases without a constructor boundary. The Core grammar has no alias node and
permits named references only within constructor fields, so unguarded recursion
is unrepresentable rather than diagnosed after decoding.

## Projection contract

The Effect kit contains:

- a recursive `BridgeTerm` type;
- an Effect Schema using `Schema.suspend` at the self-reference;
- the exact Core `Identifier` Schema at identifier fields;
- a decoder port implemented independently by `@bang/core`;
- deterministic valid and invalid recursive term generators;
- a conformance suite and structured diagnostic adapter;
- source identities linking every constructor and field to the data declaration.

The projector must use official Effect abstractions discovered through
`../effect`. It must not hand-roll recursion, parsing, arbitrary generation, or
runtime execution where Schema, `Schema.toArbitrary`, `@effect/vitest`, and the
platform Runtime already provide the capability. Core string decoding composes
through `Schema.fromJsonString` and `Schema.decodeTo` (the Effect v4 value-level
constructor whose result has the `Schema.compose` type). Generated tagged sums
use exhaustive Effect `Match` patterns.

## Conformance direction

M005A checks both directions over the declared bounded corpus:

1. every generated valid term is accepted by the implementation decoder and
   preserves constructor, field, and recursive child values;
2. every generated invalid mutation is rejected by the implementation decoder.

This is bounded conformance evidence, not proof that the two decoders accept
identical languages for every finite tree.

The deliberately drifted implementation rejects the terminal `variable`
constructor when it occurs inside `arguments`. The suite must minimize to one
application containing one variable child and identify the rejected path.

## Acceptance evidence

- the valid `BridgeTerm` data declaration decodes and validates;
- duplicate constructor tags, duplicate field names, and unknown references are
  rejected with declaration-level diagnostics;
- constructor fields cannot collide with the data discriminator;
- a constructor-less declaration and recursive alias are structurally
  unrepresentable in Core;
- generated Effect source is deterministic and matches a committed snapshot;
- the generated recursive Schema decodes nested application/variable terms;
- the existing `@bang/core` decoder is connected through the generated port,
  not copied into the suite;
- the existing decoder passes 100 deterministic generated valid terms and 100
  invalid mutations;
- the drifted decoder fails and minimizes to one recursive child with a
  domain-level constructor path;
- evidence records seed, cases, shrink path, maximum observed depth, tool
  versions, assumptions, and target weakening;
- evidence is classified as `property-tested`, not exhaustive or proven;
- M000–M005 demonstrations remain green;
- `just verify` passes from a clean checkout and the protected GitHub run is
  green.

## Primary uncertainty

What is the smallest recursive algebraic-data representation that can specify a
real part of BANG Core without prematurely committing to a general kind system,
polymorphism, higher-kinded types, or a complete module calculus?

## Non-goals

- a surface parser;
- replacing the bootstrap Core decoder with generated code;
- claiming that BANG is self-hosted;
- arbitrary record declarations outside constructor fields;
- type parameters, generic data, higher-kinded types, or variance;
- recursive functions, folds, induction principles, or termination checking;
- coinduction, streams, cyclic object graphs, or infinite values;
- representation layout, memory optimization, or code generation beyond the
  Effect conformance kit;
- Rust or Java projection;
- proving language equivalence between generated and hand-written decoders;
- general JSON Schema generation for every Core declaration.

## Result

Record the demonstrated bootstrap boundary, the exact checked conformance
direction, the minimized drift counterexample, and which later data-modeling
capability is now under concrete pressure.
