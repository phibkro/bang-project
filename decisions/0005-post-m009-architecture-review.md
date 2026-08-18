# 0005 — Post-M009 architecture review

- **Status:** accepted
- **Date:** 2026-08-13
- **Scope:** M000 through M009, including the live M007-M009 working tree
- **Supersedes:** decision 0004

## Decision

BANG keeps its present four package boundaries:

```text
                    normative meaning
                          |
                          v
                     @bang/core
                    /          \
                   v            v
       @bang/target-effect   @bang/target-rust
                   \            /
                    v          v
                  conformance observations
                          |
                          v
                    @bang/evidence
```

`@bang/core` remains the only implemented semantic authority. Target packages consume checked Core or target-independent declarations. They must report unsupported contracts before they emit invalid source.

`@bang/evidence` remains separate from Core. Core owns obligations. Evidence owns observations, scope, provenance, assumptions, trust, lifetime, and invalidators.

BANG does not split the large Core or Effect target modules now. File size alone does not establish a capability boundary.

The next mission will make one evidence manifest independently loadable, byte-bound, and replayable. BANG will complete this work before it adds a solver provider or broad surface syntax.

## Architecture that has earned its place

### Checked Core boundary

`packages/core/src/index.ts` defines these phases:

```text
JSON text
  → decoded CoreDocument
  → semantic validation
  → CheckedCoreDocument brand
  → derived obligations and target projections
```

The checked brand is nominal. Semantic validation warrants the brand. The brand does not add a second runtime check or rebuild the declaration tree.

This boundary has executable positive and negative fixtures for identities, references, finite models, recursive data, state transitions, capabilities, and typed failures. It has positive ordinary theory-term examples and negative typed state-predicate cases; it does not yet have a general negative theory-term typing suite.

### Stable obligation identity

`deriveStateInvariantObligations` and `stateInvariantObligationId` derive one state obligation from checked Core components. M007 and M008 retain the same identity:

```text
Account.withdraw.preserves.nonnegativeBalance
```

The state machine, operation, relation, and invariant fields remain separate. The identifier is a deterministic projection of those fields.

### Target independence

M009 projected the unchanged M001 `Balance` declaration to Rust. No Rust or Effect concept entered Core.

The Effect target uses arbitrary-precision `bigint`. The Rust target uses fixed-width `i128` and declares that weakening as a constant target limitation. It does not detect an actual out-of-range value. This supports target independence; it does not prove target parity.

Core `Integer` needs an arbitrary-precision integer representation for exact Rust parity. It does not need a decimal representation. BANG will use a maintained Rust arbitrary-precision integer dependency if a future mission requires exact parity. BANG will not write a project-owned integer implementation without separate evidence that maintained libraries are unsuitable.

### Package ownership

These boundaries now have independent contracts and executable consumers:

| Package               | Earned ownership                                                        |
| --------------------- | ----------------------------------------------------------------------- |
| `@bang/core`          | encoded Core, semantic checking, derived obligations, finite evaluation |
| `@bang/evidence`      | checked observation records and readable reports                        |
| `@bang/target-effect` | Effect TypeScript conformance projection                                |
| `@bang/target-rust`   | Rust conformance projection                                             |

No `apps`, `tools`, general compiler framework, provider registry, or target plugin framework has earned a package boundary. The root manifest reserves `apps/*` and `tools/*` workspace globs for directories that do not exist; that reservation is not evidence of an earned boundary.

### Effect architecture

Effect is justified for Schema boundaries, typed semantic failures, file and process orchestration, services, Layers, and runtime composition.

These functions must remain direct and total:

- obligation identity and derivation;
- theory graph construction over checked values;
- deterministic term and source projection helpers;
- evidence report formatting;
- pure example implementations;
- the Rust source generator after target capability checking.

A Service would not improve those functions. It would hide their lack of dependencies.

## Findings

No P0 semantic-authority failure was found. The following findings block stronger claims.

### P1 — Evidence is checked as a report, not independently warranted

`packages/evidence/src/index.ts` checks record shape and obligation references. It does not establish that the producer ran the reported observation.

`scripts/demo-m008.ts` constructs the violating trace and `firstViolation` text directly. No reusable monitor evaluates the checked Core invariant and derives that result.

The recorded trace withdraws `0` from balance `0` and reports post-state `-1`. No realization produces that transition. The checker accepts it because the state and input payloads are `Schema.Unknown`.

`scripts/demo-m009.ts` writes an ad hoc JSON object. It does not use a public evidence Schema or read the manifest back.

The current manifests are honest about producer trust. They are not replayable evidence packages.

**Decision:** Preserve the trust warning. Add independent manifest loading and replay before adding more evidence producers.

### P1 — Provenance names files but does not bind their bytes

M007 and M008 record path strings for Core, generated code, and realizations, and free prose for the evaluator. No field is typed as a path. None records a content digest or source revision.

A path can keep the same name while its content changes. The manifest cannot detect that invalidation.

**Decision:** The next evidence envelope will record the selected producer's material input closure and a deterministic digest for every entry. The first closure includes the Core source of the generated kit and every realization module that the producer loads. A loader will reject changed or missing recorded inputs before replay. Automatic proof that a producer declared every dependency remains unsupported.

### P1 — Some target APIs bypass the checked phase

Several public Effect projectors accept raw declaration values. `projectRustRefinement` also accepts a raw `RefinementDeclaration`.

The M009 script validates Core before it calls the Rust projector. The public API does not enforce that sequence.

`projectType` in `packages/target-effect/src/index.ts` maps an unknown type to `never`. This mapping can hide unsupported target input instead of rejecting it.

**Decision:** Public target entry points will consume checked Core plus an identity selector, matching the existing `projectEffectData` shape. Pure source emitters can remain internal direct functions. Complete this cutover before the next target projection adds a caller.

### P1 — Core decoding silently removes unknown fields

The current Schema decode uses Effect's default excess-property behavior. A direct review experiment showed that the following input loses `extra` without an error:

```json
{ "bangCore": 1, "declarations": [], "extra": "lost" }
```

The decoded value was:

```json
{ "bangCore": 1, "declarations": [] }
```

This behavior is unsafe for a canonical machine interchange. An older tool must not destroy extension data that it does not understand.

**Decision:** Core JSON decoding and encoding preserve unknown properties recursively. Recognized fields remain authoritative and receive Core validation. Preserved properties are opaque and unwarranted: preservation does not validate, interpret, project, or support their meaning. A later Core version or explicit feature transition is required before a preserved field gains normative semantics. Unknown declaration or term variants remain unsupported because their structure cannot be checked as known Core.

### P2 — The Effect target package is not isolated

`packages/target-effect/src/index.ts` imports `effect`. Its package manifest declares only `@bang/core`.

Root workspace hoisting masks the missing direct dependency.

**Decision:** Add `effect` as a direct package dependency before `@bang/target-effect` has an isolated consumer or publication path. Add an isolated package consumer check only when package delivery becomes an active acceptance path.

### P2 — Runtime evidence does not bind every identity

`checkRuntimeTraceEvidenceRecord` checks the obligation fields and trace-local identities. It does not require `observation.operationId` to equal `obligation.operation`.

The state and input payloads use `Schema.Unknown`. The checker does not validate those values against the selected Core operation.

**Decision:** Bind `observation.operationId` to `obligation.operation` before the next runtime-trace evidence producer. Typed state evaluation stays limited to the selected tracer until a second runtime protocol requires a general form.

### P1 — Rust capability failure happens after source emission

Core decimal-integer strings have no fixed width. The Rust projector appends `i128` to every literal without a range check.

A checked Core threshold above `i128::MAX` produces invalid Rust. A Core identifier such as `type` also produces an invalid Rust declaration. Similar keyword and collision risks exist in the Effect target.

**Decision:** Targets must separate capability checking from source emission. Unsupported range and identifier cases return structured target results. Core must not adopt target keyword rules. Complete the Rust check before accepting a Rust projection beyond the current exact fixture.

### P2 — Evidence schemas have begun to drift

M007 and M008 use two parallel record schemas with duplicated obligation, provenance, producer, environment, and qualification fields. M009 uses a third unrelated object shape.

One observation type does not justify a universal evidence hierarchy. Three private copies do justify one small shared envelope.

**Decision:** Share only the stable envelope in the next mission. Keep property and runtime observation payloads distinct.

### P2 — Decision 0004 has no implementation evidence

Decision 0004 selected `@typeonce/effect-machine` before a target journey used it. M008 used a direct generated Effect boundary and did not install the package.

The direct path was sufficient for one finite operation trace. The repository has no evidence for effect-machine integration, exploration, lifecycle, or runtime probes.

**Decision:** Decision 0004 is superseded. Effect-machine returns to candidate status. A future state-machine mission can select it after a clean compatibility and product-path evaluation.

### P2 — Mission scripts repeat application orchestration

M005 through M009 repeat checked-Core loading, projection, generated-file custody, snapshot comparison, child-process execution, and evidence output.

This repetition now supports one narrow compiler application boundary. It does not support a general plugin framework.

**Decision:** The next mission can extract only the reusable pipeline that its replay journey needs. Scripts remain thin `BunRuntime` composition roots.

### P3 — Deferred resource bounds remain explicit

Finite-model evaluation materializes Cartesian products. It has no declared memory or assignment bound.

This is not a regression in the completed finite fixtures. It blocks claims about large finite models.

**Decision:** Add resource semantics only when a bounded provider mission exercises them.

## Claims that remain unsupported

M000-M009 do not demonstrate:

- formal soundness of Core semantics;
- universal target equivalence;
- truthful or complete evidence producers;
- stale-evidence detection;
- a solver-neutral obligation language;
- arbitrary-precision Rust projection;
- target-safe naming for all valid Core identifiers;
- effect-machine integration;
- general temporal, resource, concurrency, lifetime, or termination semantics;
- unforgeable capability authority.

## Superseded architecture

This review supersedes the accepted adapter selection in decision 0004. It does not reject the library. It rejects an architecture claim that has no repository execution evidence.

The following ideas remain unearned:

- a universal evidence AST;
- a target plugin registry;
- a general compiler Service graph;
- a project-owned Rust integer or decimal implementation;
- broad Surface syntax before the obligation and evidence path stabilizes.

## Next mission recommendation

### M010 — Replayable evidence manifest

**User-feelable claim:** A contributor can load one saved evidence manifest on a clean tree, verify every recorded material input, replay the recorded observation, and reject a stale or mismatched result.

Use the M007 property observation because its fixed seed and case count define an existing bounded replay recipe. The manifest does not currently contain self-sufficient replay data; digest verification must bind that recipe to its material inputs.

**Primary uncertainty:** Can one explicit input closure capture enough of the selected M007 producer to make replay deterministic and detect changed recorded inputs? Current provenance is hand-written and omits material files.

The vertical path is:

```text
versioned manifest
  → lossless Core Schema decode
  → recorded-input digest verification
  → checked Core decode
  → obligation derivation
  → fixed-seed property replay
  → observed/result comparison
  → accepted evidence or exact stale/replay mismatch
```

The mission must include:

1. one versioned public evidence envelope;
2. one explicit input closure with deterministic digests, including the generated kit's Core source, generated kit, and every loaded realization module;
3. lossless preservation of unknown Core properties and strict decoding of the evidence envelope's own privileged fields;
4. obligation derivation from checked Core, not a caller-supplied obligation array—the loader therefore has a runtime dependency on `@bang/core`;
5. fixed-seed replay of the M007 observation;
6. changed-byte, missing-input, and replay-result-mismatch fixtures;
7. a deterministic manifest and readable rejection report;
8. explicit producer-truth, input-closure-completeness, and unsafe-boundary limitations;
9. an explicit disposition for `Observation.replayPath`: it remains a counterexample-artifact pointer, not the evidence-manifest replay entry point.

The mission must not include:

- cryptographic attestation;
- automatic proof that the recorded input closure is complete;
- migration of every historical manifest;
- a universal evidence payload type;
- solver dispatch;
- runtime-trace or Rust-build replay;
- public target API migration or Rust capability work;
- broad compiler framework construction.

**Clean-checkout demonstration:** `bun run demo:m010`, included in `preview` and green under `just verify`.

M010 precedes a solver provider because `solver-reported` evidence inherits the envelope's trust properties, and because current manifests declare invalidators that no loader can evaluate. After M010, the next semantic pressure remains a solver-neutral obligation IR with one bounded relational provider. Exact Rust integer parity remains a target mission only if a product path requires it.

## Evidence used for this review

The review used:

- the completed M000-M009 contracts and fixtures;
- the live Core, evidence, Effect target, and Rust target packages;
- the M007, M008, and M009 manifests;
- `bun run demo:m009`;
- the official sibling Effect `LLMS.md`, Schema guide, and tests;
- direct experiments for excess Core fields and unsupported Rust identifiers/ranges;
- the previous `just verify` result after M009.

The review is an engineering decision based on those observations. It is not a formal proof of the repository architecture.
