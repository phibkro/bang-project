---
id: M033
title: Selected realization assembly
status: complete
timebox: 5 focused sessions
vision_claims:
  - selected-realization-assembly
  - qualified-material-binding
  - independently-runnable-artifact
  - atomic-assembly-publication
depends_on:
  - M017
  - M031
  - M032
---

# Mission

BANG assembles one selected M032 realization into one local runnable artifact.

The artifact contains the exact generated Gleam boundary that M031 qualified. A strict assembly record binds the artifact to its plan, evidence, source, dependencies, and toolchain.

# User claim

> I can state one objective and receive one local artifact that I can run without BANG. The record identifies the qualified bytes and all other assembled bytes.

# Stable boundary

M033 uses the existing exact-one Account declaration, packaged theory, M031 qualification, and M032 plan.

M033 does not add Core constructs, source syntax, theories, obligations, or planning demands. It does not change M017, M023, M030, M031, or M032 outputs.

The first assembly target is the selected Gleam/BEAM realization. The artifact kind is an Erlang escript.

The generated realization contains its actor, supervisor, transitions, and bounded probe. No independent business implementation exists behind this generated boundary.

# User journey

The canonical command is:

```sh
bang assemble examples/tiny-bank/assemblies/supervised-exact-one.json
```

The command:

1. decodes the strict assembly selection;
2. runs the referenced M032 planning journey without publication;
3. requires one `Selected` Gleam/BEAM candidate;
4. checks the generated boundary digest against the selected M031 evidence;
5. creates a Gleam project with pinned dependencies;
6. exports one escript with the pinned Gleam and OTP toolchain;
7. runs the staged escript as a separate process;
8. checks its observation against the selected M031 observation;
9. publishes the qualification, plan, source, escript, and assembly record in one transaction;
10. prints the artifact path, run command, material identities, evidence scope, and limitations.

The user then runs:

```sh
escript .bang/assemblies/tiny-bank-supervised-exact-one/bin/exact_one
```

This command runs without the BANG executable and without the Gleam compiler. The host must provide a compatible Erlang runtime.

# Assembly selection

The input is strict JSON:

```json
{
  "bangAssembly": 1,
  "id": "tiny-bank-supervised-exact-one",
  "planSelection": "examples/tiny-bank/plans/supervised-exact-one.json",
  "artifact": {
    "kind": "escript",
    "entry": "main"
  }
}
```

Rules:

- `id` is a safe non-empty identifier.
- `planSelection` is a repository-relative path without traversal segments.
- `kind` is exactly `escript`.
- `entry` is exactly `main`.
- Unknown fields fail before target execution or publication.
- The selection does not infer a target or hidden preference.

# Selected-plan rule

The referenced M032 result must have tag `Selected`.

The selected candidate must name target `gleam-beam`. An Effect-selected plan fails with `unsupported-selected-target` and names `effect-typescript`.

An `Incomparable` result fails with `incomparable-plan`. A `NoPlan` result fails with `no-plan`.

These failures publish nothing. This rule includes the qualification closure and plan report. A direct `bang plan` command keeps its existing publication behavior.

# Staged planning boundary

M033 adds a staged M032 API. This API returns the checked planning result and all proposed publication entries without changing persistent files.

`bang plan` consumes this API and keeps its current output and publication behavior.

`bang assemble` consumes the same API. It performs one final atomic publication after successful assembly and staged execution.

# Project materials

The staged project contains:

```text
gleam.toml
manifest.toml
src/bang/account_entity.gleam
src/main.gleam
canonicalize_escript.escript
```

`gleam.toml` declares:

- Gleam `>= 1.18.1 and < 2.0.0`;
- `gleam_erlang >= 1.3.0 and < 2.0.0`;
- `gleam_otp >= 1.3.0 and < 2.0.0`;
- `gleam_stdlib >= 1.0.0 and < 2.0.0`.

`manifest.toml` locks:

- `gleam_erlang` 1.3.0 and its outer checksum;
- `gleam_otp` 1.3.0 and its outer checksum;
- `gleam_stdlib` 1.0.5 and its outer checksum.

The target adapter supplies `account_entity.gleam`. The assembly adapter supplies only the `main` entry module and project files.

The entry module calls `bang/account_entity.run_exact_one_probe`. It does not replace or bypass the generated boundary.

# Qualified-material binding

The selected M031 evidence identifies the generated Gleam boundary by path and SHA-256 digest.

M033 recomputes this digest from the bytes used in the staged project. A mismatch fails with `material-mismatch` before compilation and publication.

The assembly record keeps:

- the M032 plan identity and selected candidate identity;
- the exact-one requirement address;
- the M031 evidence path and digest;
- the generated boundary path and digest;
- the entry module path and digest;
- the Gleam configuration and manifest paths and digests;
- the escript path and digest;
- the pinned Nix toolchain path and digest;
- observed Gleam and OTP versions;
- the staged execution observation;
- the artifact lifetime, assumptions, limitations, and invalidators.

# Material roles

Each material has one role:

- `qualified-generated`: the M031-qualified generated boundary;
- `assembled-entry`: the M033 entry module;
- `assembly-configuration`: `gleam.toml`;
- `third-party-lock`: `manifest.toml`;
- `compiled-artifact`: the exported escript;
- `toolchain-definition`: the pinned Nix toolchain.
- `assembly-canonicalizer`: the deterministic escript repackager.

Only `qualified-generated` bytes inherit M031 qualification. Compilation and staged execution do not upgrade the other roles to qualified Core evidence.

# Artifact execution

The assembler runs the staged escript with `escript` as a separate child process.

The process must:

- exit with code zero;
- write no standard error;
- emit exactly one decodable M031 probe observation;
- match the selected M031 observation.

A process failure produces `execution-failed`. An observation mismatch produces `observation-mismatch`.

The assembly record classifies this result as one bounded runtime observation. It is not a proof of general realization behavior.

# Determinism

The source closure and assembly record are deterministic for unchanged inputs and toolchain materials.

The Gleam export does not order ZIP entries deterministically. Compiler options and `SOURCE_DATE_EPOCH` do not correct this order.

The target adapter supplies a canonical escript repackager. It sorts entries, normalizes ZIP timestamps, and retains the exported entry bytes.

Two clean exports produced the same canonical escript digest. The canonical artifact also produced the expected M031 observation.

The assembler publishes and records the canonicalizer digest and the final artifact digest. It never publishes the unordered raw export.

Reports and artifacts exclude temporary paths, timestamps, process identifiers, and machine-specific cache paths.

# Published closure

A successful run publishes:

```text
.bang/assemblies/<assembly-id>/
  gleam.toml
  manifest.toml
  canonicalize_escript.escript
  src/bang/account_entity.gleam
  src/main.gleam
  bin/exact_one
  report.json
```

The same transaction also publishes the staged M031 qualification closure and M032 plan report.

Publication commits all entries or restores every prior byte. A failed run leaves no new assembly file.

The artifact has one fixed output path. M033 does not publish an Erlang shipment directory with a variable file set.

# Typed failures

M033 reports these stages and reasons:

| Stage         | Reason                        |
| ------------- | ----------------------------- |
| `selection`   | `invalid-selection`           |
| `planning`    | `incomparable-plan`           |
| `planning`    | `no-plan`                     |
| `planning`    | `unsupported-selected-target` |
| `material`    | `material-mismatch`           |
| `toolchain`   | `toolchain-unavailable`       |
| `build`       | `export-failed`               |
| `execution`   | `execution-failed`            |
| `execution`   | `observation-mismatch`        |
| `publication` | `publication-failed`          |

Every failure includes the relevant repository-relative path or semantic identity. CLI failures write no report to standard output.

# Evidence statement

The assembly report can establish:

- the plan selected the Gleam/BEAM candidate;
- the assembly used the generated boundary bytes named by M031 evidence;
- the pinned host compiler exported one artifact;
- one separate staged process produced the expected bounded observation;
- the published artifact bytes match the staged artifact bytes.

The report cannot establish:

- an independent business implementation behind the generated boundary;
- universal correctness of the realization or compiler;
- durable exactly-once delivery;
- distributed coordination or restart persistence after host failure;
- portability to a host without compatible OTP;
- deployment readiness, security, performance, or production suitability;
- deterministic output under changed source, dependency, compiler, OTP, or Nix materials.

# Negative fixtures

M033 includes fixtures for:

1. an M032 `Incomparable` result;
2. an M032 `NoPlan` result;
3. an Effect-selected result;
4. an unsafe assembly identity;
5. a path with traversal segments;
6. an unknown selection field;
7. a qualified-boundary digest mismatch;
8. an unavailable or failed export toolchain;
9. a process that exits unsuccessfully;
10. an observation that differs from M031 evidence;
11. a late publication failure that restores every prior byte.

The first six fixtures fail before target compilation. All fixtures leave persistent assembly bytes unchanged.

# Falsifiers

M033 fails if:

1. the assembler picks Gleam without reading the selected plan;
2. a non-selected planning result publishes any staged M031, M032, or M033 file;
3. the assembled boundary digest differs from the selected evidence material;
4. the entry module bypasses the generated exact-one boundary;
5. the recorded artifact digest differs from published bytes;
6. the staged artifact cannot run through `escript` without BANG;
7. execution output differs from the selected M031 observation;
8. a report labels assembled or third-party bytes as M031-qualified;
9. repeated clean deterministic exports produce different bytes;
10. a failed publication leaves mixed old and new bytes;
11. existing M017, M023, M030, M031, or M032 output changes.

# Non-goals

M033 does not add:

- an independent handler seam;
- a general implementation generator;
- a build engine, action graph, scheduler, or cache;
- a second assembly target;
- continuous evidence invalidation;
- a package registry, container image, upload, deployment, or attestation envelope;
- a general plugin protocol;
- a Core, surface, theory, or obligation change.

A later mission can add an authored implementation behind a generated boundary. That mission must expose a real target seam and independent conformance evidence.

# Acceptance

1. Run the canonical `bang assemble` command.
2. Observe one selected `gleam-beam` candidate and one published escript.
3. Run the published artifact with `escript` and no BANG process.
4. Observe the same exact-one result that M031 recorded.
5. Repeat two clean assemblies and compare all published bytes.
6. Run the incomparable, no-plan, and Effect-selected fixtures.
7. Observe typed failures and no changed persistent bytes.
8. Run malformed selection and material-mismatch fixtures.
9. Run execution and late-publication failure fixtures.
10. Observe restoration of every prior byte.
11. Run focused M033 Core, target, assembly, and CLI tests.
12. Run M017, M023, M030, M031, and M032 journeys.
13. Run `just verify`.

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`;
- `decisions/0012-semantic-process-architecture-and-reuse-boundary.md`;
- `design-specs/M017-gleam-beam-actor-realization.md`;
- `design-specs/M031-two-target-exact-one-qualification.md`;
- `design-specs/M032-objective-relative-realization-planning.md`;
- `packages/target-gleam/src/index.ts`;
- `apps/bang/src/classify.ts`;
- `apps/bang/src/plan.ts`;
- `apps/bang/src/publication.ts`;
- `nix/gleam.nix`.
