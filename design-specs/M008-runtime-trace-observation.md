---
id: M008
title: Runtime trace observation
status: complete
timebox: 5 focused sessions
vision_claims:
  - runtime-observation
  - legal-trace-checking
  - runtime-monitored-evidence
  - observation-boundaries
depends_on:
  - M004
  - M006
  - M007
---

# Mission

BANG can observe one real `Account.withdraw` execution through a generated Effect boundary. BANG can classify its finite trace against checked Core obligations.

The monitor reports the first trace violation in domain terms. Its observation does not become a Core law.

# User journey

```text
checked Account Core and WithdrawAccount realization
  → generated observable Effect boundary
  → independent Layer-backed implementation
  → ordered invocation trace
  → trace-shape and invariant checks
  → conforming result or first indexed violation
  → checked runtime-monitored evidence
  → deterministic manifest and readable report
```

Run `bun run demo:m008`. Inspect `.bang/evidence/M008.json`.

# Felt capability

A contributor runs the real withdrawal implementation through the generated boundary. The boundary returns an ordered trace with stable operation and invocation identities.

The monitor distinguishes these outcomes:

| Trace                                          | Classification        |
| ---------------------------------------------- | --------------------- |
| legal start, then invariant-preserving success | conforming            |
| disabled request, then declared typed failure  | conforming rejection  |
| implementation failure                         | defect observation    |
| legal start, then negative balance             | obligation violation  |
| outcome before start                           | trace-shape violation |
| start without an outcome in a closed trace     | incomplete trace      |

# Semantic boundary

The existing checked Core remains normative for operation identity, legal inputs, invariant obligations, capabilities, and typed failures.

The runtime trace is an observation from one boundary execution. The trace producer is not a semantic authority.

```text
Core assertion
    ↓ projection
observable Effect boundary → finite ordered trace
                                  ↓ monitor
                         runtime evidence record
```

# Event protocol

M008 uses one finite trace for one invocation. Sequence numbers provide order. The demonstration does not use wall-clock timestamps.

```text
Started {
  sequence: 0
  invocationId
  operationId
  preState
  input
}

Succeeded {
  sequence: 1
  invocationId
  postState
}

TypedFailure {
  sequence: 1
  invocationId
  failureId
}

Defect {
  sequence: 1
  invocationId
  defect
}
```

A valid closed trace contains exactly one `Started` event and exactly one terminal event. Both events use the same invocation identity.

# Monitor judgments

Let `O` be the checked operation, `I` its invariant, and `τ` one closed trace.

```text
τ = Started(O, s, a) · Succeeded(s′)    enabled(O, s, a)    I(s′)
──────────────────────────────────────────────────────────────────
O ; I ⊢ τ conforming

τ = Started(O, s, a) · Succeeded(s′)    enabled(O, s, a)    ¬I(s′)
───────────────────────────────────────────────────────────────────
O ; I ⊢ τ violates I at event 1

τ does not match Started · terminal
──────────────────────────────────────
O ; I ⊢ τ malformed at first mismatch
```

A typed rejection and a defect remain observations. Neither outcome proves an invariant claim.

# Projection contract

The generated Effect kit supplies:

- schemas for the four event variants and their tagged union;
- an observable wrapper around `WithdrawAccount`;
- stable invocation and operation identities supplied by the caller and checked Core;
- sequence numbers `0` and `1`;
- success, typed failure, and defect classification from the existing M006 boundary;
- no concrete runtime, clock, tracing vendor, or persistence dependency.

The wrapper must retain the existing `DebitAccount` requirement. It must call the independent realization through the existing service boundary.

# Evidence contract

`RuntimeTraceEvidenceRecord` is a public Schema boundary. It records:

- the normalized Core obligation;
- evidence class `runtime-monitored`;
- result `conforming` or `violated`;
- scope `single-closed-trace`;
- invocation and operation identities;
- the ordered events;
- the first violation index and reason when a violation exists;
- Core, generated-kit, realization, and monitor provenance;
- producer identity and `assumed-truthful` trust;
- tool and target versions;
- assumptions, unsupported claims, lifetime, and invalidators.

Schema checks reject impossible result and violation combinations. Semantic checking rejects unknown or inconsistent obligation references.

# Vertical acceptance path

1. Decode and check the M006 Core fixture.
2. Derive the normalized `Account.withdraw.preserves.nonnegativeBalance` obligation.
3. Generate the observable Effect boundary.
4. Compile the generated boundary with the independent implementation.
5. Observe a legal withdrawal from balance `10` by amount `4`.
6. Classify its two-event trace as conforming.
7. Observe an overdraft rejection and preserve its typed-failure classification.
8. Observe a defect and preserve its defect classification.
9. Monitor a legal request whose returned balance is negative.
10. Report event index `1` and the normalized invariant obligation.
11. Reject an outcome-before-start trace.
12. Reject a start-only closed trace.
13. Emit deterministic runtime evidence and a readable report.
14. Keep M000 through M007 demonstrations green.
15. Pass `just verify`.

# Acceptance evidence

- the generated event union is an external Schema boundary;
- the observable wrapper retains the capability requirement;
- every generated trace uses stable caller-supplied invocation identity;
- the conforming trace has sequence values `0` and `1`;
- typed rejection and defect remain distinct;
- the violating trace identifies event `1` and the normalized obligation;
- malformed and incomplete traces fail with typed monitor errors;
- the checked evidence record references normalized Core;
- the manifest states producer trust and boundary bypass conditions;
- generated output and the M008 manifest are deterministic;
- `just verify` passes.

# Primary uncertainty

Can one small monitor classify real effectful behavior without making observed events normative or adding a general process calculus?

# Non-goals

- general temporal logic or a general protocol language;
- actors, persistent processes, or distributed traces;
- concurrent invocation correlation;
- timestamps, retries, deadlines, fairness, liveness, or productivity;
- OpenTelemetry integration;
- automatic stale-evidence detection;
- cryptographic trace attestation;
- automatic proof that the producer is complete or truthful;
- migration of historical evidence formats;
- Rust projection;
- a polished CLI.
