---
id: M010
title: Replayable evidence manifest
status: complete
timebox: 2 focused sessions
vision_claims:
  - replayable-evidence
  - stale-input-detection
  - obligation-identity
  - explicit-trust-boundaries
depends_on:
  - M007
---

# Mission

BANG can load one saved property-test evidence manifest, verify every recorded material input, replay the recorded observation, and reject stale or mismatched evidence before acceptance.

The first replay is `Account.withdraw.preserves.nonnegativeBalance` from M007. M010 strengthens evidence custody. It does not strengthen sampled property evidence into proof.

# User journey

```text
saved M010 manifest
  → strict envelope decode
  → recorded-input SHA-256 verification
  → canonical Account source parse, lowering, and Core validation
  → normalized obligation derivation
  → fixed-seed property replay
  → recorded/result comparison
  → accepted evidence or exact rejection
```

Run `bun run demo:m010`. Inspect `.bang/evidence/M010.json`.

# Felt capability

A contributor can replay a saved manifest and see:

- every recorded input path and digest;
- whether each recorded byte sequence is unchanged;
- the exact normalized Core obligation;
- the replayed case count, seed, shrink count, result, and counterexample;
- a readable accepted, stale-input, missing-input, or replay-mismatch result;
- explicit producer-truth, input-closure-completeness, and unsafe-boundary limitations.

# Frozen public envelope

The M010 manifest is a versioned property-test evidence envelope:

```text
bangEvidence: 1
kind: property-test-replay
inputs:
  nonempty array of { role, path, sha256 }
coreInput:
  path naming exactly one inputs entry
record:
  PropertyTestEvidenceRecord
replay:
  command argv
  obligation identity
  requested cases
  seed
qualification:
  inputClosure: declared-not-proven-complete
  producerTruth: assumed-truthful
  unsafeBoundary: bypassable
```

Input roles are descriptive strings. Paths are repository-relative file paths. `sha256` is 64 lowercase hexadecimal characters over the exact file bytes. The manifest itself is not an input to its own digest closure.

The first closure records every file directly loaded to prepare or execute the selected observation:

1. `examples/tiny-bank/account.bang` — account-source Core input;
2. `generated/effect/AccountStateMachine.ts` — generated kit;
3. `examples/tiny-bank/implementation/account-state-machine.ts` — realization;
4. `examples/tiny-bank/state/state-diagnostics.ts` — evaluator.

The loader verifies recorded entries only. It does not prove that the producer declared every transitive dependency.

# Boundary policy

The evidence envelope is closed: unknown envelope fields fail decoding. Embedded Core uses the lossless Core boundary and preserves opaque unknown properties recursively.

Recognized Core fields alone receive semantic validation. Preserved extensions remain opaque and unwarranted.

# Replay judgment

Let `m` be a decoded manifest, `D(p)` the SHA-256 digest of file `p`, `O(c)` the obligations derived from checked Core input `c`, and `run(m.replay)` the decoded property observation.

```text
all input paths exist
∀ i ∈ m.inputs. D(i.path) = i.sha256
m.replay.obligationId ∈ ids(O(m.coreInput))
replayed observation = recorded observation
────────────────────────────────────────────
repository ⊢ m replay-accepted
```

Comparison covers result, requested and executed cases, seed, shrink count, counterexample, and counterexample-artifact pointer. `Observation.replayPath` remains a pointer to a counterexample artifact. It is not the manifest replay entry point.

# Typed failures

The loader and replay program distinguish:

- `invalid-manifest` — envelope Schema or recorded-source rejection;
- `stale-input` — observed digest differs from the manifest;
- `unknown-obligation` — checked Core does not derive the replay identity;
- `replay-failed` — the declared command fails or emits invalid output;
- `replay-mismatch` — replayed observation differs from the record.

Failures retain the relevant path or obligation identity and a readable diagnostic.

# Effect implementation direction

Use Effect Schema for the public envelope and replay output. Use `FileSystem`, `Path`, `Crypto`, scoped `ChildProcess`, and typed tagged errors for external operations. Keep digest-entry comparison, observation comparison, obligation selection, and report formatting as total direct functions.

`@bang/evidence` owns the envelope, source validation, and readable result. Its dependencies on `@bang/core` and `@bang/surface` are runtime dependencies because the loader parses the recorded source, validates lowered Core, and derives obligations. Bun services remain selected only in the M010 composition root.

# Vertical acceptance path

1. Prepare the existing M004 generated state-machine kit.
2. Run the M007 observation with seed `20260813` and 100 cases.
3. Record the four-file material input closure and SHA-256 digests.
4. Write one deterministic M010 manifest.
5. Load the manifest from disk through the strict envelope Schema.
6. Verify every recorded input digest.
7. Parse, lower, and validate the recorded Account source.
8. Derive and select `Account.withdraw.preserves.nonnegativeBalance`.
9. Replay the declared observation command.
10. Compare the replayed observation with the recorded property observation.
11. Print an accepted report.
12. Reject one changed-byte input in an isolated temporary copy.
13. Reject one missing input.
14. Reject one replay-result mismatch.
15. Run the same manifest twice and confirm byte-identical output.

# Acceptance evidence

- the clean M010 manifest replays successfully;
- all four material inputs have exact-byte SHA-256 entries;
- changing one recorded byte returns `stale-input` before replay;
- removing one recorded input returns `missing-input` before replay;
- changing the recorded observation returns `replay-mismatch`;
- an unknown envelope property fails Schema decoding;
- opaque Core extension properties survive the checked Core boundary;
- obligation identity is derived from checked Core, not accepted from the manifest alone;
- the replay uses 100 requested cases and seed `20260813`;
- reports retain sampled scope and assumed producer truth;
- the manifest is byte-identical across consecutive clean runs;
- `bun run demo:m010` is included in `preview`;
- `just verify` passes.

# Primary uncertainty

Can one explicit four-file closure capture enough of the selected M007 producer to make replay deterministic and detect changes to every recorded material input? Closure completeness remains a declared assumption, not a proven property.

# Non-goals

- cryptographic signatures or attestation;
- proof that the producer is truthful;
- automatic discovery or proof of a complete dependency closure;
- migration of M000-M009 evidence manifests;
- a universal evidence payload hierarchy;
- runtime-trace or Rust-build replay;
- solver dispatch or proof evidence;
- public target API migration or Rust capability work;
- a general compiler, plugin, or build framework;
- stronger state, effect, resource, lifetime, or termination semantics.
