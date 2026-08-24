---
id: M031
title: Fresh two-target exact-one qualification
status: complete
timebox: 5 focused sessions
vision_claims:
  - independent-target-evidence
  - supervised-exact-one-realization
  - two-qualified-realization-candidates
  - atomic-qualification-publication
depends_on:
  - M017
  - M018
  - M022
  - M023
  - M030
---

# Mission

BANG runs the same checked `WithdrawAccountOnce` requirement through independent Effect TypeScript and supervised Gleam/BEAM realizations.

Both targets consume `ExactOneCapabilityExecution@1`. Each target produces fresh runtime evidence. BANG classifies each target from only its own evidence.

# User claim

> I can run two heterogeneous implementations of the same packaged exact-one withdrawal and see why each qualifies, including their different lifecycle and evidence limits.

# Shipped journey

The canonical command is:

```sh
bang classify examples/tiny-bank/realizations/two-qualified-exact-one.json
```

The command performs this journey:

```text
load one strict version-two classification selection
  -> compile the packaged TinyBank explanation without publishing files
  -> confirm ExactOneCapabilityExecution@1 identity and digest
  -> project one disposable Effect exact-one boundary
  -> execute one fresh Effect probe
  -> project one disposable Gleam exact-one actor
  -> compile and execute it under a real BEAM supervisor
  -> validate each target's evidence independently
  -> classify both realization profiles
  -> publish deterministic artifacts and evidence atomically
  -> print one deterministic two-target report
```

A repeated run with unchanged inputs emits byte-identical persistent artifacts, evidence, and report text.

# Stable semantic boundary

M031 uses the existing checked declarations:

- `Account`;
- `DebitAccount`;
- `WithdrawAccountOnce`;
- `WithdrawalRejectedOnce`;
- the exact quantity `1`;
- the four `ExactOneCapabilityExecution@1` obligations.

M031 adds no Core construct and no source syntax.

The exact-use quantity remains Core-owned. Grant representation, actor incarnation, mailbox behavior, process restart, runtime execution, and target evidence remain target-owned.

The package declaration remains authoritative for the theory identity, premises, obligations, limitations, and evaluator agreement. Neither target can change package meaning.

# Classification input

M031 adds a strict version-two classification selection. Version one remains the completed M023 boundary.

```text
bangClassification: 2
id: one stable selection identity
explanationSelection: one repository-relative packaged explanation selection
targets: exactly two ordered target probes
  - target: effect-typescript
    realization: WithdrawAccountOnce
    probe: fresh
  - target: gleam-beam
    realization: WithdrawAccountOnce
    probe: fresh
```

The target order is Effect TypeScript followed by Gleam/BEAM. Both targets must select the realization named by the applicable theory requirement.

Version two does not accept a shared evidence path. The command owns fresh target execution and returns one evidence record per target.

# Target-neutral evidence boundary

Each probe returns a strict encoded evidence record with:

```text
bangTargetQualificationEvidence: 1
selectionId
targetId
realizationId
artifactId
artifactFormat
theory identity and version
package semantic digest
requirement address
producer identity and version
observations
material references and SHA-256 digests
assumptions
weakenings
limitations
lifetime
invalidators
```

The common observations record:

1. one valid call succeeds and consumes the grant;
2. reuse is rejected before the operation handler runs;
3. two competing calls with one grant produce one success and one rejection;
4. a wrong destination does not consume the grant;
5. a disabled transition does not consume the grant;
6. a defect after execution starts does not make the same grant usable again;
7. state and remaining-use observations before and after each attempt.

The evidence checker rejects missing, duplicate, contradictory, or target-mismatched observations. It checks Core identities and the package result. It does not infer universal behavior from the bounded probe.

# Effect realization

The Effect target uses the existing generated exact-one capability boundary.

The probe uses an independent withdrawal handler. It observes the lawful call, reuse, competing calls, wrong destination, disabled transition, and defect journeys through the generated API.

The Effect evidence lifetime is the lifetime reported by the target probe. M031 does not infer process, persistence, termination, or resource guarantees.

# Gleam/BEAM realization

The existing M017 unbounded actor journey remains unchanged.

For `WithdrawAccountOnce`, the Gleam target projects a distinct exact-one actor boundary:

- the actor owns balance state and one-use availability;
- a grant contains the actor-incarnation identity;
- destination and transition checks occur before consumption;
- accepted execution consumes the grant before the balance transition;
- reuse returns a target-owned capability-use rejection before the operation transition;
- wrong-destination and disabled-transition results preserve the grant;
- an execution defect cannot make the same grant usable again;
- supervisor restart creates a new actor incarnation;
- a grant from the old incarnation is rejected by the replacement actor;
- a newly issued grant for the replacement incarnation is distinct.

Actor incarnation is target state. It is not a new domain identity or Core capability quantity.

The target may use the live actor process identity as the incarnation identity. Reports and persistent artifacts must not encode machine-specific process identifiers.

# Qualification

Both target results are expected to be `qualified`, not `admissible`.

Each of the four theory obligations retains:

- structurally derived target-projection evidence where applicable;
- runtime-checked evidence from that target's probe;
- the concrete producer identity;
- exact material references;
- explicit assumptions and weakenings.

Effect evidence must not support Gleam. Gleam evidence must not support Effect.

The report preserves separate target lifetimes, assumptions, weakenings, limitations, producers, and materials.

If a target probe or evidence record does not support an obligation, the result is `unknown` or `rejected` according to the existing M023 lattice. BANG does not force two qualified results.

# Generated output

On success, BANG publishes deterministic files under:

```text
.bang/qualifications/tiny-bank-two-qualified-exact-one/
  effect-typescript/
    boundary.ts
    evidence.json
  gleam-beam/
    src/bang/account_entity.gleam
    evidence.json
  report.json
```

The existing semantic artifact and theory lock use their stable M030 locations.

Generated files contain no absolute paths, timestamps, random values, BEAM process identifiers, or temporary-directory names.

# Atomic publication

The command performs source compilation, package verification, target projection, target execution, evidence validation, and classification before it changes any persistent generated file.

It builds and runs targets in scoped temporary directories. After every check succeeds, it atomically publishes the complete qualification directory, semantic artifact, and theory lock.

A failure leaves any previous artifact, lock, qualification directory, and evidence bytes unchanged. It emits no partial report to standard output.

# Failure contract

Typed failures retain:

- `stage`: `selection`, `artifact`, `package`, `target`, `execution`, `evidence`, `profile`, `classification`, or `publication`;
- the selection or material path;
- a stable reason;
- an optional semantic address;
- one concise message.

Required negative journeys include:

1. duplicate or reordered targets;
2. target realization mismatch;
3. unsupported package or digest mismatch;
4. a target projection failure;
5. malformed target output;
6. evidence whose target or producer identity is wrong;
7. both competing calls succeeding;
8. reuse reaching the operation handler;
9. wrong destination consuming the grant;
10. disabled transition consuming the grant;
11. a defect restoring the grant;
12. an old Gleam grant accepted after actor restart;
13. a missing or changed material digest;
14. publication failure without partial replacement.

# Evidence classification

M031 supplies runtime-checked evidence for:

- two real target executions;
- the listed bounded exact-one observations;
- supervised Gleam actor replacement;
- old-incarnation grant rejection;
- strict target-specific evidence decoding;
- material-digest verification;
- deterministic report and artifact generation;
- typed rejection of exercised failures.

It supplies structurally derived evidence for the generated check and consumption order where the target projection makes that order explicit.

M031 does not prove:

- universal exact-one behavior;
- termination or productivity;
- bounded time, memory, mailbox, or work;
- fair scheduling or message delivery;
- durable grant state across host or node failure;
- distributed exactly-once execution;
- package authenticity;
- implementation correctness beyond exercised and structurally checked claims.

# Falsifiers

M031 fails if:

1. both competing calls execute with one grant;
2. reuse reaches the operation handler;
3. a wrong destination or disabled transition consumes the grant;
4. a defect restores the same grant;
5. an old grant is accepted after actor restart;
6. the Gleam implementation is qualified with Effect evidence;
7. BEAM supervision evidence is reported as a proof;
8. actor lifecycle policy enters Core or the theory package;
9. M017's unbounded actor behavior changes;
10. target-specific assumptions or lifetimes are flattened;
11. a failed run changes any persistent output;
12. unchanged inputs produce different persistent bytes or report text;
13. existing M023 or M030 journeys regress.

# Non-goals

- no objective-relative planner;
- no automatic target ranking;
- no persistent or distributed Gleam grant store;
- no remote package registry;
- no general plugin framework;
- no general provider protocol beyond this exact-one target evidence boundary;
- no new target language;
- no Core or surface syntax change.

# Acceptance path

1. Run the canonical version-two `bang classify` command.
2. Observe fresh Effect and Gleam target execution.
3. Observe two `qualified` classifications.
4. Observe all four obligations supported for each target.
5. Confirm target-specific producers, materials, lifetimes, assumptions, and weakenings.
6. Confirm the same artifact identity, theory package identity, semantic digest, and requirement address.
7. Repeat the command and compare report, artifact, lock, projection, evidence, and report-artifact bytes.
8. Run the repeated, competing, wrong-destination, disabled-transition, defect, and restart journeys.
9. Run every required negative fixture.
10. Confirm each failure emits typed diagnostics, no stdout report, and no persistent byte change.
11. Run the legacy M017, M018, M023, and M030 journeys.
12. Run focused Core, target, evidence, theory, CLI, and project tests.
13. Run `just verify`.

# Sources

- `BANG-PROJECT-DIRECTION.md`.
- `decisions/0007-modular-propositions-providers-and-realizations.md`.
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`.
- `decisions/0012-semantic-process-architecture-and-reuse-boundary.md`.
- `design-specs/M017-gleam-beam-actor-realization.md`.
- `design-specs/M018-single-use-capability.md`.
- `design-specs/M022-versioned-theory-explanation.md`.
- `design-specs/M023-realization-classification.md`.
- `design-specs/M030-local-theory-package-consumption.md`.
- `packages/target-effect/src/index.ts`.
- `packages/target-gleam/src/index.ts`.
- `packages/evidence/src/index.ts`.
- `packages/theories/src/index.ts`.
- `apps/bang/src/classify.ts`.
