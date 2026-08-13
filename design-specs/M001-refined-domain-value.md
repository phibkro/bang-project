---
id: M001
title: Refined domain value
status: complete
timebox: 4 focused sessions
vision_claims:
  - value-modeling
  - refinement-predicates
  - effect-boundary-construction
depends_on:
  - M000
---

# Mission

BANG can define `Balance` as the integers greater than or equal to zero and project a nominal Effect Schema constructor that accepts `0n` and rejects `-1n`.

## User journey

```text
Core JSON refinement
  → runtime decode
  → predicate type-check under self : Integer
  → deterministic Effect Schema + brand
  → valid boundary construction
  → invalid boundary rejection
  → scoped evidence manifest
```

Run `just preview`. The user sees the prior spine and the new `Balance` boundary demonstration, then can inspect `generated/effect/Balance.ts` and `.bang/evidence/M001.json`.

## Core contract

```json
{
  "kind": "refinement",
  "id": "Balance",
  "base": "Integer",
  "predicate": {
    "kind": "greaterThanOrEqual",
    "left": { "kind": "self" },
    "right": { "kind": "integerLiteral", "value": "0" }
  }
}
```

Integer literals use canonical decimal strings in JSON so interchange never loses precision. For M001, the only predicate judgment is:

```text
self : Integer ⊢ self ≥ integerLiteral(n) : Proposition

Balance = { self ∈ Integer | self ≥ 0 }
```

A `greaterThanOrEqual` predicate over any non-`Integer` base is rejected semantically. Unknown bases are rejected as unresolved references.

## Semantic inventory

| Item              | Kind                     | Authority                       | Accepted transition               | Rejection                    |
| ----------------- | ------------------------ | ------------------------------- | --------------------------------- | ---------------------------- |
| Core JSON         | assertion                | source fixture                  | Schema-decoded declaration        | malformed refinement         |
| refinement base   | type reference           | Core declarations and built-ins | resolves to `Integer`             | unknown base                 |
| predicate         | proposition              | Core semantics                  | both operands type as `Integer`   | incompatible base            |
| generated module  | deterministic projection | validated Core declaration      | Effect Schema and nominal brand   | unsupported target mapping   |
| constructor input | runtime observation      | caller                          | `bigint >= 0n` returns `Balance`  | negative or non-bigint input |
| evidence manifest | derived observation      | demo execution                  | records static and runtime checks | never promoted to proof      |

## Effect projection

Core `Integer` projects to JavaScript `bigint`, preserving mathematical integer values instead of silently accepting IEEE-754 precision loss. The generated schema uses the official Effect v4 `Schema.BigInt`, `Order.BigInt`, `Schema.makeIsGreaterThanOrEqualTo`, and `Schema.brand` APIs.

The brand prevents accidental ordinary assignment, and the constructor enforces the predicate at runtime. TypeScript casts and foreign JavaScript remain explicit invalidating assumptions; “sealed” does not mean proof against unsafe host operations.

## Acceptance evidence

- positive Core fixture decodes and validates;
- unknown-base and ill-typed-predicate fixtures are rejected with domain diagnostics;
- generated Effect source matches a committed snapshot;
- a raw `bigint` is not assignable to the generated `Balance` type;
- `makeBalance(0n)` succeeds and `makeBalance(-1n)` rejects;
- M001 evidence distinguishes static analysis, runtime validation, assumptions, and unsupported proof claims;
- `just preview` exposes the complete journey;
- `just verify` passes from a clean checkout in GitHub Actions.

## Primary uncertainty

Is the minimal `self` plus integer-literal predicate representation sufficient to grow toward relational laws without prematurely introducing a general expression language?

## Non-goals

- arbitrary predicate expressions or Boolean connectives;
- refinement inference or solver dispatch;
- refinement over user-defined carriers;
- generated business logic;
- claiming runtime checks or brands as proofs;
- surface syntax beyond canonical Core JSON.

## Result

- GitHub clean-run evidence: <https://github.com/phibkro/bang-project/actions/runs/31729418981>
- Core accepted `Balance` and rejected both an unknown carrier and a proposition whose `self` term had the wrong type.
- The Effect projection produced an exact `bigint` carrier, nominal brand, and runtime-checked constructor.
- The committed negative type fixture showed that ordinary `bigint` assignment is rejected; three runtime cases covered the lower boundary, a negative value, and a foreign number.
- The original `number` mapping for M000's `Integer` was corrected to `bigint`. Canonical decimal strings now keep Core JSON integer literals independent of JSON-number precision.
- The minimal predicate representation is sufficient for this one refinement. It does not yet justify a general expression calculus; M002 may extend it only if finite-model laws require more terms.
