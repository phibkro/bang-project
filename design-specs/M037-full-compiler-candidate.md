---
id: M037
title: Full compiler candidate
status: active
timebox: 5 focused sessions
vision_claims:
  - clean-checkout-full-candidate
  - public-executor-reproducibility
  - honest-six-family-scorecard
  - accumulated-source-bound-report
depends_on:
  - M012
  - M016
  - M017
  - M018
  - M024
  - M030
  - M031
  - M032
  - M033
  - M034
  - M035
  - M036
---

# Revision record

The former M036 contract proposed a full compiler candidate in a new Clinic domain. Preflight found that its realization path required unsupported producer changes.

M036 tested that missing boundary first. It carried the checked Clinic operation through qualification, planning, assembly, audit, and external consumption.

M036 is complete at protected revision `5e45b1242c74c6a5306b0817ddd08814b68292a9`. Therefore, M037 can test the full-candidate path.

This contract does not copy the former contract with a new mission number. It changes three claims.

1. Clinic is not a newly authored domain for M037. The project created the Clinic inputs during M036.
2. Independent means that an executor can follow public instructions without compiler internals. It does not mean author-independent domain design.
3. The six-family matrix is an evidence scorecard. It is not proof that one model unifies all six semantic families.

# Mission

BANG runs one full compiler candidate from a clean checkout through one documented command.

The command uses the committed Clinic source and the existing exact-one theory package. It qualifies two targets and selects the Gleam realization.

The command assembles and runs one artifact-only escript. It then audits the closure and publishes the current public schemas.

An external process consumes the publication outside the workspace. The command writes one accumulated report with typed source references and unsupported claims.

The command repeats the complete run in a second clean worktree. It publishes output only after both clean runs are equal.

# User claim

> From a clean checkout, I can install BANG and run one documented command on committed Clinic inputs. I receive one standalone escript and one accumulated report. The report states what the run warrants and what remains unsupported.

# Primary uncertainty

M001 through M036 proved separate vertical capabilities. They did not prove that one public command can compose the current Clinic path without hidden inputs or semantic inflation.

M037 tests this uncertainty:

1. One public command can resolve and run the complete input chain.
2. One report can bind current source records without copying or combining their evidence grades.
3. One recoverable batch can publish an enumerated closure after all observations pass.
4. An executor can repeat the path without reading compiler internals.

A failed item is a mission failure. The implementation must not hide the failure with a new semantic construct or stronger evidence label.

# Stable boundary

M037 composes shipped capability. It adds mission-local orchestration and one mission-local report schema.

M037 does not add a new BANG CLI verb. The public command is a root Bun script that calls current typed APIs in-process.

M037 does not add a new Core construct, surface form, theory, provider, target, evidence class, or deployment boundary.

The following producer trees stay unchanged:

```text
apps/bang/src/
packages/
```

If the mission requires a producer change, revise this contract before implementation continues.

The implementation can add only these executable boundaries:

```text
scripts/m037-full-compiler-candidate.ts
examples/clinic/full-candidate.json
examples/clinic/external-consumer/consumer.mjs
tests/m037-full-compiler-candidate.test.ts
```

The only existing executor file M037 may edit is `.github/workflows/quality.yml`. It must set the pinned `extractions/setup-just` step's `with.just-version` input to `1.58.0`. It may add the direct M036 parity and focused M037 test commands to the existing merge-blocking `verify` job.

The root `package.json`, `bun.lock`, and existing package scripts remain byte-identical. M037 adds no root dependency.

The clean host must provide Nix with flake support. The mission script provisions Node from one immutable Nixpkgs revision and does not accept ambient Node.

The candidate execution platform is `x86_64-linux`, matching the merge-blocking workflow. Cross-platform candidate execution is not part of M037.

M037 reuses the current Clinic source and selections. It does not modify their semantic content.

M036 output remains a compatibility boundary. Existing Clinic, TinyBank, Inventory, schema, and evidence bytes must not change because M037 orchestrates them.

# Public one-command boundary

From a clean checkout, run these commands:

```sh
just install
bun run scripts/m037-full-compiler-candidate.ts examples/clinic/full-candidate.json
```

The second command is the only candidate command. An executor does not run a child BANG CLI command.

On success, standard output is exactly:

```text
.bang/evidence/M037.json
```

The success path writes no standard error.

On failure, standard output is empty. Standard error contains one canonical `M037CandidateFailure` JSON document.

The command rejects a dirty tracked worktree before it creates a temporary worktree. Ignored generated output does not make the tracked worktree dirty.

## Public report decode

After a successful candidate run, a reviewer can run this command:

```sh
bun run scripts/m037-full-compiler-candidate.ts --decode .bang/evidence/M037.json
```

The same mission-local module handles `--decode` mode and exports `M037FullCompilerCandidateReportSchema`.

Decode mode derives the repository root from the running mission module and canonicalizes that root before reading the report. It accepts only the exact report path above. The report, fixed `bun.lock`, and every source path below must resolve from that canonical root without any symbolic-link path component; the decoder never follows a source symlink, even when its target remains inside the root.

After strict report decoding, the decoder resolves and hashes the fixed `bun.lock` through the decode `Crypto` digest builder and requires exact equality with `dependencyLock.sha256`. It then resolves and hashes the seven fixed input paths in resolved-input order and the 21 fixed producer paths in closure order. It compares every live byte digest to the corresponding exact report field or row. Report-provided paths never select a file.

The decoder strictly decodes the live Gleam evidence producer. It compares the complete canonical `observations` value with E02, including every boolean, success and rejection count, state trace, remaining-use trace, and actor-restart field. Identity-only agreement is insufficient.

The decoder also strictly consumes the live semantic-artifact producer for the fixed requirement and compares the complete canonical `Applicable` result with E07. The tag, artifact fields, theory fields, requirement, evidence, premises, obligations, limitations, and invalidators are all exact; `entriesMatchAssembly` remains exactly `true`.

The decoder rejects every excess property. On success, standard output is exactly:

```text
.bang/evidence/M037.json: valid
```

The decode success path writes no standard error. Schema, path-policy, filesystem, report-local consistency, and live-source mismatches return `decode/report-invalid`; a SHA-256 `Crypto` failure returns `decode/digest-failed` with its exact typed `PlatformError` cause. Every failure is canonical `M037CandidateFailure` JSON.

# Public host contract

M037 supports one `x86_64-linux` host profile. The root rejects every other operating system or architecture before it creates a worktree.

The public host must provide these tools and capabilities:

| Tool | Required contract                                                             | Project-host observation     |
| ---- | ----------------------------------------------------------------------------- | ---------------------------- |
| Git  | `git worktree add --detach --no-checkout` and cleanup support                 | `git version 2.55.0`         |
| Bash | `-euo pipefail` support for the shell configured by the `Justfile`            | GNU Bash `5.3.15(1)-release` |
| Just | exactly `just 1.58.0`, and the root `Justfile` must parse                     | `just 1.58.0`                |
| Bun  | exactly `1.3.13`                                                              | `1.3.13`                     |
| Nix  | `nix-command`, flakes, the public Nix cache, and refreshed network resolution | `nix (Nix) 2.34.8`           |

Nix must reach GitHub and `https://cache.nixos.org/`. A warm local store does not remove this public-host prerequisite.

The mission root runs these preflights once, in this order:

1. Check that `process.platform` is `linux`, `process.arch` is `x64`, and `Bun.version` is `1.3.13`.
2. Resolve absolute real paths for `git`, `bash`, `just`, and `nix`.
3. Run `git --version` and require one normalized `git version` line.
4. Add and remove one detached no-checkout worktree at `HEAD`.
5. Run `bash --version` and retain only the normalized first line.
6. Run `bash -euo pipefail -c 'printf "m037-bash-ok\n"'` and require the exact token.
7. Run `just --version` and require exactly `just 1.58.0`.
8. Run `just --summary` in the mission root and require success.
9. Run `nix --version` and require one normalized `nix (Nix)` line.
10. Run `nix config show experimental-features` and require `nix-command` and `flakes`.
11. Run `nix config show substituters` and require `https://cache.nixos.org/`.
12. Run the refreshed pinned Node build in the Node section and require Node `v24.7.0`.

Every preflight child uses the mission root as its working directory. Each child receives this complete replacement environment:

```text
HOME=<host-preflight-temp>
LANG=C.UTF-8
PATH=<directories of the resolved host tools>
```

The root records normalized version strings and the narrow capability results. It does not record host paths, temporary paths, or cache paths.

# Public input schema

The file `examples/clinic/full-candidate.json` has this exact content:

```json
{
  "bangFullCompilerCandidate": 1,
  "id": "clinic-full-compiler-candidate",
  "assemblySelection": "examples/clinic/assemblies/supervised-exact-one.json",
  "externalConsumer": "examples/clinic/external-consumer/consumer.mjs"
}
```

The decoder is strict. It rejects unknown fields and unsafe paths.

The assembly selection is the single semantic root. The orchestrator resolves the remaining inputs through existing references.

| Role                     | Resolved committed input                                      |
| ------------------------ | ------------------------------------------------------------- |
| Domain source            | `examples/clinic/clinic.bang`                                 |
| Theory selection         | `examples/clinic/theories/packaged-exact-one.json`            |
| Classification selection | `examples/clinic/realizations/two-qualified-exact-one.json`   |
| Plan selection           | `examples/clinic/plans/supervised-exact-one.json`             |
| Assembly selection       | `examples/clinic/assemblies/supervised-exact-one.json`        |
| Theory package           | `packages/theories/theory-packages/exact-one-capability.json` |
| External consumer        | `examples/clinic/external-consumer/consumer.mjs`              |

The orchestrator fails if any resolved reference disagrees with this chain. The public input does not duplicate a checked identity.

# Clean-run model

The command records `HEAD` and the SHA-256 digest of `bun.lock`. It rejects a dirty tracked worktree before the public-host preflights.

After all preflights pass, the command creates two detached clean worktrees at the recorded revision.

The temporary-parent precheck rejects only a canonical parent that equals or is inside a checkout or run root. A canonical ancestor of a workspace is allowed. After the scoped child is created, the runner canonicalizes that child and requires it to be disjoint from every checkout and run root. The focused fixture places its checkout below `/tmp`, sets `TMPDIR` to a directory inside that checkout, and observes all candidate worktrees in an external sibling child below `/tmp`.

Each worktree runs these setup commands as typed child processes:

```sh
just install
bun run build
```

The candidate uses one Effect composition root for each worktree path. It does not start a child BANG CLI process.

Each run independently produces exactly 21 producer files. Temporary paths, times, process identities, and cache paths do not enter those files.

The command removes both run worktrees and the preflight worktree on success and failure. A cleanup failure stops the command before final publication.

# Ordered journey

Each clean run records these ten observations in this order. This is the report projection order, not a child-process trace.

| Stage                | Current typed boundary                                                                                   | Required observation                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `checkout`           | detached worktree acquisition                                                                            | recorded revision and lock digest match                                                     |
| `setup`              | `ChildProcessSpawner` with explicit arguments                                                            | `just install` and `bun run build` exit with zero                                           |
| `explain`            | one direct `compileSelectedExplanationStaged` result                                                     | exact-one result is `Applicable` and its artifact and lock bytes match the assembly closure |
| `classify`           | mission-local strict `M037CollectedClassificationReportSchema` consumer decode                           | Effect and Gleam are ordered `Qualified` results                                            |
| `plan`               | strict `PlanningReportSchema` decode of the collected entry                                              | the explicit objective selects `gleam-beam`                                                 |
| `assemble`           | `compileSelectedAssembly` with its existing `publish` collector and strict `AssemblyReportSchema` decode | 15 producer entries bind the qualified Gleam bytes                                          |
| `artifact`           | copied escript execution                                                                                 | the isolated observation equals Gleam qualification                                         |
| `audit`              | `runAudit` over the materialized 15-file run root                                                        | no material changed and no record retires                                                   |
| `schema-publication` | `generateSchemaPublication`                                                                              | six typed publication entries have version 2                                                |
| `external-consumer`  | published M035 consumer under the Node isolation loader                                                  | the exact valid verdict and module log pass                                                 |

`M037CollectedClassificationReportSchema` is a root-owned consumer projection. It is not a new M031 producer schema.

```ts
const M037CollectedTheoryIdentitySchema = Schema.Struct({
  id: Schema.Literal("ExactOneCapabilityExecution"),
  version: Schema.Literal(1),
}).annotate({ parseOptions: { onExcessProperty: "error" } });

const M037CollectedClassificationReportSchema = Schema.Struct({
  bangClassificationReport: Schema.Literal(2),
  selectionId: Schema.String,
  artifactId: Schema.String,
  artifactFormat: Schema.Literal("bangSemanticArtifact:1"),
  theory: M037CollectedTheoryIdentitySchema,
  requirementAddress: Schema.String,
  results: Schema.NonEmptyArray(M023ClassificationResultSchema),
  evidence: Schema.NonEmptyArray(M031TargetQualificationEvidenceSchema),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
```

The root decodes it with `Schema.decodeUnknownEffect` and excess-property rejection. A semantic validator then checks all identity fields against the candidate and resolved artifact.

The validator requires two results and two evidence rows in selection order. The target order is `effect-typescript`, then `gleam-beam`, and each result has `_tag: "Qualified"`.

The root calls `compileSelectedExplanationStaged` once for the explicit applicability observation. It calls `compileSelectedAssembly` once per run for the qualification, planning, and assembly path.

The nested assembly call repeats pure source and theory evaluation. Only that call executes fresh target probes.

The assembly API returns only `{ report, text }` and collected publication entries. M037 does not claim access to nested return values.

The injected assembly publisher collects the complete 15-file entry set. It does not write to the command checkout.

The root strictly decodes the collected classification, planning, and assembly records. It checks that the direct explanation bytes equal the corresponding assembly entries.

A nested explanation, classification, or planning failure reaches M037 as the current `AssemblyFailure`. M037 does not reconstruct a lost nested error.

The root materializes those 15 entries only inside the detached run root through the house `publishAtomically` helper. Then `runAudit` reads that root.

`generateSchemaPublication` returns six entries without publication. The root materializes them only inside the detached run root for external consumption.

The root validates discriminated typed results and strict records. It does not parse prose output.

# Artifact-only execution

The runner copies only this file into a new temporary artifact directory:

```text
.bang/assemblies/clinic-supervised-exact-one/bin/exact_one
```

The runner obtains the pinned toolchain output with this exact command:

```text
nix build --file <worktree>/nix/gleam.nix --no-link --print-out-paths
```

The command must return one absolute Nix store path. The root resolves `<toolchain>/bin/escript` through `FileSystem.realPath`.

The resolved path must be an absolute `<erlang-store>/bin/escript` path. The root hashes the executable bytes and records the digest.

The root derives `<erlang-store>/lib/erlang` from that real path and requires the directory to exist.

The artifact child receives this exact argument vector:

```text
<absolute-erlang-store>/bin/escript
exact_one
```

Its working directory is `<artifact-only-temp>`. This directory contains only the copied `exact_one` file.

The child receives this complete replacement environment:

```text
HOME=<artifact-only-temp>
LANG=C.UTF-8
PATH=<absolute-erlang-store>/bin
ERL_ROOTDIR=<absolute-erlang-store>/lib/erlang
ERL_CRASH_DUMP_SECONDS=0
```

The `PATH` value is the Erlang-store bin directory. It is not the combined output path from `nix/gleam.nix`.

Before execution, the root checks these repository-relative sentinels from the artifact working directory:

```text
apps/bang/src
packages
examples/clinic/clinic.bang
.bang/assemblies/clinic-supervised-exact-one/report.json
```

None can resolve from the artifact working directory or its `PATH`. The root also checks that `gleam` cannot resolve from the Erlang-only `PATH`.

The artifact must emit one decodable M031 exact-one observation. The observation must contain these identities:

| Role        | Identity                                                              |
| ----------- | --------------------------------------------------------------------- |
| Realization | `BookAppointmentOnce`                                                 |
| Entity      | `appointment-book-1`                                                  |
| Requirement | `operationRealization:BookAppointmentOnce.requirement:ConfirmBooking` |
| Target      | `gleam-beam`                                                          |

The observation must equal the selected qualification observation. This equality is a bounded runtime check, not implementation equivalence.

This boundary restricts the argument vector, working directory, and environment. It does not provide filesystem sandboxing or deny absolute host paths.

The artifact execution failure fixture copies the real producer escript and flips only its first byte before it invokes the real pinned `escript` process.

# Outside-workspace consumer

The runner creates a temporary consumer sandbox outside the checkout. It copies only these inputs:

```text
consumer.mjs
isolation-loader.mjs
publication/
  manifest.json
  schemas/bang-semantic-artifact-1.schema.json
  schemas/bang-theory-lock-1.schema.json
  schemas/bang-target-evidence-1.schema.json
  types/consumer.d.ts
  types/consumer.js
inputs/
  clinic.lock.json
  effect-typescript.evidence.json
  materials/
    examples/clinic/clinic.bang
    .bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/boundary.ts
```

The root writes `isolation-loader.mjs` only inside the sandbox. Its source follows the tested M036 `resolve` and `load` hook pattern.

The public-host preflight provisions Node with this exact command. The Nixpkgs commit introduces `nodejs_24` at version `24.7.0`.

```text
nix build --refresh --no-link --print-out-paths --extra-experimental-features "nix-command flakes" github:NixOS/nixpkgs/adf428a7cfbb66e9b5cb5cdd2df8a659c2df1052#nodejs_24
```

The runner accepts one absolute Nix store path on standard output. It requires `v24.7.0` from `<nix-result>/bin/node` and hashes the executable bytes.

Nix can write fetch progress to standard error. The root does not parse or record that untyped success output.

The exact external-consumer child argument vector uses absolute paths:

```text
<nix-result>/bin/node
--no-warnings
--experimental-loader
<absolute-sandbox>/isolation-loader.mjs
<absolute-sandbox>/consumer.mjs
```

The environment contains only these mission values:

```text
HOME=<sandbox>
LANG=C.UTF-8
PATH=<directory of the pinned Node executable>
BANG_M037_SANDBOX_ROOT=<sandbox>
BANG_M037_MODULE_LOG=<sandbox>/module-loads.jsonl
```

The loader permits `node:` built-ins. Every other resolved URL must be a `file:` URL with a canonical real path inside the sandbox.

The loader rejects bare packages, foreign protocols, symlink escapes, and every outside file during both resolution and load.

The outside-import fixture gives the outside module an evaluation sentinel write. It requires the loader to reject before evaluation, observes that the sentinel is absent, and requires the module log to contain no outside-module row.

The positive run observes these exact sorted sets:

| Observation            | Modules                                         |
| ---------------------- | ----------------------------------------------- |
| loaded sandbox files   | `consumer.mjs`, `publication/types/consumer.js` |
| resolved sandbox files | `consumer.mjs`, `publication/types/consumer.js` |
| resolved built-ins     | `node:crypto`, `node:fs/promises`, `node:path`  |

The consumer strictly decodes the lock and Effect evidence. It verifies each supplied material digest and checks record agreement.

The valid verdict embeds these two full material tuples in evidence order:

```ts
readonly [
  {
    readonly role: "core-source";
    readonly path: "examples/clinic/clinic.bang";
    readonly sha256: M037RawSha256;
  },
  {
    readonly role: "generated-effect-boundary";
    readonly path: ".bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/boundary.ts";
    readonly sha256: M037RawSha256;
  },
]
```

Each material digest is 64 lowercase hexadecimal characters without a `sha256:` prefix. A valid verdict proves custody and decodability only.

The report embeds the strict verdict, loader digest, module-log digest, and normalized hook observations. The loader and log are not producer files.

# Persistent output closure

Each clean run produces exactly 21 producer files. The existing Clinic closure contributes these 15 files:

```text
.bang/artifacts/clinic-packaged-exact-one.json
.bang/theory-locks/clinic-packaged-exact-one.json
.bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/boundary.ts
.bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/evidence.json
.bang/qualifications/clinic-two-qualified-exact-one/gleam-beam/src/bang/appointment_book_entity.gleam
.bang/qualifications/clinic-two-qualified-exact-one/gleam-beam/evidence.json
.bang/qualifications/clinic-two-qualified-exact-one/report.json
.bang/plans/clinic-supervised-exact-one/report.json
.bang/assemblies/clinic-supervised-exact-one/gleam.toml
.bang/assemblies/clinic-supervised-exact-one/manifest.toml
.bang/assemblies/clinic-supervised-exact-one/canonicalize_escript.escript
.bang/assemblies/clinic-supervised-exact-one/src/bang/appointment_book_entity.gleam
.bang/assemblies/clinic-supervised-exact-one/src/main.gleam
.bang/assemblies/clinic-supervised-exact-one/bin/exact_one
.bang/assemblies/clinic-supervised-exact-one/report.json
```

The schema publication contributes these six files:

```text
dist/schemas/2/manifest.json
dist/schemas/2/schemas/bang-semantic-artifact-1.schema.json
dist/schemas/2/schemas/bang-theory-lock-1.schema.json
dist/schemas/2/schemas/bang-target-evidence-1.schema.json
dist/schemas/2/types/consumer.d.ts
dist/schemas/2/types/consumer.js
```

The runner compares the two ordered 21-file producer inventories and the five ordered per-run observation values. Each corresponding path, byte digest, and observation value must be equal. The first run supplies the 21 entries and embedded values for final publication.

The inventory-divergence fixture clones the real ordered 21-row inventory, changes only the digest of the real second-run `.bang/assemblies/clinic-supervised-exact-one/src/main.gleam` row from bit-flipped real bytes, and asserts the typed path plus both real byte digests.

Only after that comparison, the runner creates this final report:

```text
.bang/evidence/M037.json
```

The final enumerated publication contains the 21 equal producer files and the one report. Thus, it contains exactly 22 files.

The report inventories all 22 intended paths. It does not include a `publication/passed` stage observation.

The report scans these owned directories for unlisted members:

```text
.bang/qualifications/clinic-two-qualified-exact-one/
.bang/plans/clinic-supervised-exact-one/
.bang/assemblies/clinic-supervised-exact-one/
dist/schemas/2/
```

The report records extra paths as one sorted `staleMembers` array. These paths stay outside the enumerated closure and do not affect equality.

The command passes all 22 entries once to the existing `publishAtomically` helper. This is a recoverable enumerated batch, not one physical transaction.

The helper replaces paths through ordered individual renames. It provides no concurrent-reader isolation across the 22 paths.

If a commit fails and rollback succeeds, the helper restores prior bytes for every committed enumerated path. A handled injected test must observe this result.

The recoverable publication fixture stages the real current bytes for all 22 enumerated M037 paths over distinct prior byte snapshots, fails the last ordered rename, and compares the complete before and after bytes for every path. The rollback-failure fixture uses the same real 22-path batch but makes no restoration claim.

If rollback fails, the command returns `publication/rollback-failed`. It does not claim that every prior enumerated byte survived.

Unlisted files stay unchanged. Process termination during replacement and rollback failure remain explicit limitations.

Successful command exit plus presence of the final strict report is the publication observation. The report never claims to observe its later publication.

# Accumulated report schema

`M037FullCompilerCandidateReportSchema` is a strict, exported, mission-local Effect Schema. It is not a Core construct or an evidence class.

The encoded boundary has these principal types:

```ts
type M037Sha256 = `sha256:${string}`;
type M037RawSha256 = string;

type M037Stage =
  | "selection"
  | "preflight"
  | "checkout"
  | "setup"
  | "explain"
  | "classify"
  | "plan"
  | "assemble"
  | "artifact"
  | "audit"
  | "schema-publication"
  | "external-consumer"
  | "comparison"
  | "accumulation";

type M037SourceRecordPath =
  | ".bang/theory-locks/clinic-packaged-exact-one.json"
  | ".bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/evidence.json"
  | ".bang/qualifications/clinic-two-qualified-exact-one/gleam-beam/evidence.json"
  | ".bang/qualifications/clinic-two-qualified-exact-one/report.json"
  | ".bang/plans/clinic-supervised-exact-one/report.json"
  | ".bang/assemblies/clinic-supervised-exact-one/report.json"
  | "dist/schemas/2/manifest.json"
  | "embedded/public-host-preflight.json"
  | "embedded/input-resolution.json"
  | "embedded/artifact-isolation.json"
  | "embedded/audit.json"
  | "embedded/schema-custody.json"
  | "embedded/external-consumer-isolation.json"
  | "embedded/producer-inventory-comparison.json"
  | "embedded/theory-applicability.json";

type M037SourceSelector =
  | "theory:ExactOneCapabilityExecution@1"
  | "target:effect-typescript/BookAppointmentOnce"
  | "target:gleam-beam/BookAppointmentOnce"
  | "qualification:clinic-two-qualified-exact-one"
  | "plan:clinic-supervised-exact-one/gleam-beam"
  | "assembly:clinic-supervised-exact-one/gleam-beam"
  | "schema-publication:2"
  | "observation:public-host-preflight"
  | "observation:input-resolution"
  | "observation:artifact-isolation"
  | "observation:audit"
  | "observation:schema-custody"
  | "observation:external-consumer-isolation"
  | "observation:producer-inventory-comparison"
  | "observation:theory-applicability";

interface M037ClaimSourceReference {
  readonly path: M037SourceRecordPath;
  readonly sha256: M037Sha256;
  readonly selector: M037SourceSelector;
  readonly target?: "effect-typescript" | "gleam-beam";
  readonly obligation?: "operationRealization:BookAppointmentOnce.requirement:ConfirmBooking";
}

interface M037EmbeddedRecord<Path extends M037SourceRecordPath, Value> {
  readonly path: Path;
  readonly sha256: M037Sha256;
  readonly value: Value;
}

interface M037ClaimDisposition {
  readonly id: string;
  readonly claim: string;
  readonly disposition: "warranted" | "unsupported";
  readonly sourceReferences: ReadonlyArray<M037ClaimSourceReference>;
}

type M037ScoreLabel =
  | "historical-mission-observation-citation"
  | "current-digest-bound-evidence-with-historical-citations";

interface M037HistoricalCitation {
  readonly mission: string;
  readonly label: "historical-mission-observation-citation";
}

interface M037FamilyScore {
  readonly family:
    | "refined-data-algebra"
    | "state-and-coeffects"
    | "capability-and-quantity"
    | "actor-and-channel-behavior"
    | "laws-and-providers"
    | "graded-evidence";
  readonly scoreLabel: M037ScoreLabel;
  readonly historicalCitations: ReadonlyArray<M037HistoricalCitation>;
  readonly currentSourceReferences: ReadonlyArray<M037ClaimSourceReference>;
  readonly currentObservation: string | null;
  readonly limit: string;
}
```

The report has this exact top-level shape:

```ts
interface M037FullCompilerCandidateReport {
  readonly bangFullCompilerCandidate: 1;
  readonly id: "clinic-full-compiler-candidate";
  readonly revision: string;
  readonly dependencyLock: {
    readonly path: "bun.lock";
    readonly sha256: M037Sha256;
  };
  readonly command: "bun run scripts/m037-full-compiler-candidate.ts examples/clinic/full-candidate.json";
  readonly executionPlatform: "x86_64-linux";
  readonly inputs: ReadonlyArray<{
    readonly role:
      | "domain-source"
      | "theory-selection"
      | "classification-selection"
      | "plan-selection"
      | "assembly-selection"
      | "theory-package"
      | "external-consumer";
    readonly path: string;
    readonly sha256: M037Sha256;
  }>;
  readonly stages: ReadonlyArray<{
    readonly stage: M037Stage;
    readonly run?: 1 | 2;
    readonly result: "passed";
  }>;
  readonly producerInventory: ReadonlyArray<{
    readonly path: string;
    readonly sha256: M037Sha256;
  }>;
  readonly embeddedRecords: {
    readonly publicHostPreflight: M037EmbeddedRecord<
      "embedded/public-host-preflight.json",
      {
        readonly executionPlatform: "x86_64-linux";
        readonly bunVersion: "1.3.13";
        readonly gitVersion: `git version ${string}`;
        readonly gitDetachedWorktreeProbe: true;
        readonly bashVersion: `GNU bash, version ${string}`;
        readonly bashStrictModeProbe: true;
        readonly justVersion: "just 1.58.0";
        readonly justfileParsed: true;
        readonly nixVersion: `nix (Nix) ${string}`;
        readonly nixCommandEnabled: true;
        readonly nixFlakesEnabled: true;
        readonly nixPublicCacheConfigured: true;
        readonly nixRefreshedNetworkResolution: true;
        readonly pinnedNodeClosureResolved: true;
      }
    >;
    readonly inputResolution: M037EmbeddedRecord<
      "embedded/input-resolution.json",
      {
        readonly referencesAgree: true;
        readonly inputs: ReadonlyArray<{
          readonly role: string;
          readonly path: string;
          readonly sha256: M037Sha256;
        }>;
      }
    >;
    readonly theoryApplicability: M037EmbeddedRecord<
      "embedded/theory-applicability.json",
      {
        readonly result: Extract<
          ExactOneCapabilityExecutionResult,
          { readonly _tag: "Applicable" }
        >;
        readonly entriesMatchAssembly: true;
      }
    >;
    readonly artifactIsolation: M037EmbeddedRecord<
      "embedded/artifact-isolation.json",
      {
        readonly target: "gleam-beam";
        readonly realization: "BookAppointmentOnce";
        readonly entity: "appointment-book-1";
        readonly requirementAddress: "operationRealization:BookAppointmentOnce.requirement:ConfirmBooking";
        readonly observation: M031TargetQualificationObservations;
        readonly qualificationMatch: true;
        readonly escriptRealPath: `/nix/store/${string}/bin/escript`;
        readonly escriptSha256: M037Sha256;
        readonly arguments: readonly ["exact_one"];
        readonly cwd: "artifact-only-temp";
        readonly environment: {
          readonly HOME: "artifact-only-temp";
          readonly LANG: "C.UTF-8";
          readonly PATH: "erlang-store/bin";
          readonly ERL_ROOTDIR: "erlang-store/lib/erlang";
          readonly ERL_CRASH_DUMP_SECONDS: "0";
        };
        readonly workspaceSentinels: readonly [
          "apps/bang/src",
          "packages",
          "examples/clinic/clinic.bang",
          ".bang/assemblies/clinic-supervised-exact-one/report.json",
        ];
        readonly workspaceResolvableFromCwdOrPath: false;
        readonly gleamResolvableFromPath: false;
      }
    >;
    readonly audit: M037EmbeddedRecord<"embedded/audit.json", AuditSummary>;
    readonly schemaCustody: M037EmbeddedRecord<
      "embedded/schema-custody.json",
      {
        readonly version: 2;
        readonly manifestSha256: M037Sha256;
        readonly manifestDigestedPayloads: ReadonlyArray<{
          readonly path: string;
          readonly sha256: M037Sha256;
        }>;
        readonly inventoryDigestedFiles: ReadonlyArray<{
          readonly path: string;
          readonly sha256: M037Sha256;
        }>;
      }
    >;
    readonly externalConsumerIsolation: M037EmbeddedRecord<
      "embedded/external-consumer-isolation.json",
      {
        readonly nodeProvisioner: "nix";
        readonly nixpkgsRevision: "adf428a7cfbb66e9b5cb5cdd2df8a659c2df1052";
        readonly nixAttribute: "nodejs_24";
        readonly nodeVersion: "v24.7.0";
        readonly nodeExecutable: "nix-result/bin/node";
        readonly nodeExecutableSha256: M037Sha256;
        readonly arguments: readonly [
          "--no-warnings",
          "--experimental-loader",
          "isolation-loader.mjs",
          "consumer.mjs",
        ];
        readonly environmentKeys: readonly [
          "BANG_M037_MODULE_LOG",
          "BANG_M037_SANDBOX_ROOT",
          "HOME",
          "LANG",
          "PATH",
        ];
        readonly loaderSha256: M037Sha256;
        readonly moduleLogSha256: M037Sha256;
        readonly loadedFiles: readonly ["consumer.mjs", "publication/types/consumer.js"];
        readonly resolvedFiles: readonly ["consumer.mjs", "publication/types/consumer.js"];
        readonly resolvedBuiltins: readonly ["node:crypto", "node:fs/promises", "node:path"];
        readonly verdict: {
          readonly verdict: "valid";
          readonly verifiedMaterials: readonly [
            {
              readonly role: "core-source";
              readonly path: "examples/clinic/clinic.bang";
              readonly sha256: M037RawSha256;
            },
            {
              readonly role: "generated-effect-boundary";
              readonly path: ".bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/boundary.ts";
              readonly sha256: M037RawSha256;
            },
          ];
        };
      }
    >;
    readonly producerInventoryComparison: M037EmbeddedRecord<
      "embedded/producer-inventory-comparison.json",
      {
        readonly filesPerRun: 21;
        readonly firstInventorySha256: M037Sha256;
        readonly secondInventorySha256: M037Sha256;
        readonly result: "equal";
        readonly observationRecordsPerRun: 5;
        readonly firstObservationsSha256: M037Sha256;
        readonly secondObservationsSha256: M037Sha256;
        readonly observationsResult: "equal";
      }
    >;
  };
  readonly schemaPublication: {
    readonly version: 2;
    readonly files: 6;
    readonly manifestSha256: M037Sha256;
    readonly manifestDigestedPayloads: 4;
    readonly inventoryDigestedFiles: 6;
    readonly declarationIsManifestDigested: false;
    readonly manifestIsSelfDigested: false;
  };
  readonly publicationPlan: {
    readonly helper: "publishAtomically";
    readonly enumeratedFiles: 22;
    readonly concurrentReaderIsolation: false;
    readonly staleMembers: ReadonlyArray<string>;
  };
  readonly scorecard: ReadonlyArray<M037FamilyScore>;
  readonly claims: ReadonlyArray<M037ClaimDisposition>;
  readonly cleanRun: {
    readonly runs: 2;
    readonly producerFilesPerRun: 21;
    readonly firstInventorySha256: M037Sha256;
    readonly secondInventorySha256: M037Sha256;
    readonly result: "equal";
  };
  readonly outputInventory: ReadonlyArray<
    | {
        readonly path: string;
        readonly sha256: M037Sha256;
      }
    | {
        readonly path: ".bang/evidence/M037.json";
        readonly sha256: null;
        readonly digestDisposition: "self-digest-not-recorded";
      }
  >;
}
```

The revision is exactly 40 lowercase hexadecimal characters. Each M037 wrapper digest has the `sha256:` prefix and 64 lowercase hexadecimal characters. `M037RawSha256` has exactly 64 lowercase hexadecimal characters without a prefix.

The input array has seven rows in the resolved-input order. Each input digest covers the committed file bytes. The producer inventory has the exact 21 first-run paths in the closure section, and each digest covers the corresponding producer bytes.
Each inventory digest covers the canonical JSON encoding of its ordered `{ path, sha256 }` rows. No report byte participates in either producer inventory digest.

Each embedded-record digest covers only the canonical JSON bytes of its `value`. An embedded path is report-local and is not a persistent file.

Report-local digest consistency does not establish source custody. Public decode separately hashes the live fixed `bun.lock`, seven live inputs, and 21 live producers through the `Crypto` service. It compares the lock digest to `dependencyLock.sha256` and every other digest to its fixed report row. It then binds E02 to the strictly decoded live Gleam evidence and E07 to the strictly consumed live semantic artifact. Recomputing embedded-record, inventory, observation, claim-reference, or scorecard-reference digests cannot make a changed E02 or E07 observation authoritative.
The runner compares five per-run embedded values in this order: theory applicability, artifact isolation, audit, schema custody, and external-consumer isolation. Each observation digest covers the canonical JSON encoding of those ordered values. The report embeds the first-run values only after both observation digests are equal.

The dependency-lock digest binds the M036 dependency graph only while public decode confirms it against live `bun.lock`. The external-consumer record separately binds the immutable Nixpkgs revision, package attribute, installed executable bytes, and observed Node version.

The output inventory has the exact 21 producer rows followed by the report row. The report row has `sha256: null` because a report cannot contain its own byte digest. `staleMembers` is sorted and has no path from the output inventory.

The stage array has exactly 24 rows. It contains `selection`, `preflight`, ten ordered stages for run 1, ten ordered stages for run 2, `comparison`, and `accumulation`.

`run` appears only on the 20 per-run rows. The report has no success stage named `publication`.

The report decoder validates every path, digest, selector, target, obligation, order, count, and cross-reference. It rejects all excess properties and requires the sole null digest on its own report row.

The report does not copy evidence class, scope, producer, materials, assumptions, weakenings, limitations, lifetime, or invalidators into a claim.

The digest-bound source record remains the single authority for those fields.

## Schema custody

The M035 publication contains exactly six files.

The manifest digest-binds these four payloads:

```text
schemas/bang-semantic-artifact-1.schema.json
schemas/bang-theory-lock-1.schema.json
schemas/bang-target-evidence-1.schema.json
types/consumer.js
```

The manifest does not digest `types/consumer.d.ts`. It cannot digest itself.

The M037 report binds `manifest.json` with `manifestSha256`. The 21-file producer inventory independently binds all six publication files.

M037 does not change the M035 manifest, publication format, or consumer.

# Evidence provenance and claim disposition

A claim disposition contains only the claim, its disposition, and ordered source references. It contains no copied evidence metadata.

In the tables below, `Q` means this exact obligation identity:

```text
operationRealization:BookAppointmentOnce.requirement:ConfirmBooking
```

The source-reference catalog is exact:

| Ref   | Path                                                                                  | Selector                                          | Target              | Obligation | Digest source      |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------- | ---------- | ------------------ |
| `R01` | `.bang/theory-locks/clinic-packaged-exact-one.json`                                   | `theory:ExactOneCapabilityExecution@1`            | —                   | —          | producer inventory |
| `R02` | `.bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/evidence.json` | `target:effect-typescript/BookAppointmentOnce`    | `effect-typescript` | `Q`        | producer inventory |
| `R03` | `.bang/qualifications/clinic-two-qualified-exact-one/gleam-beam/evidence.json`        | `target:gleam-beam/BookAppointmentOnce`           | `gleam-beam`        | `Q`        | producer inventory |
| `R04` | `.bang/qualifications/clinic-two-qualified-exact-one/report.json`                     | `qualification:clinic-two-qualified-exact-one`    | —                   | `Q`        | producer inventory |
| `R05` | `.bang/plans/clinic-supervised-exact-one/report.json`                                 | `plan:clinic-supervised-exact-one/gleam-beam`     | `gleam-beam`        | `Q`        | producer inventory |
| `R06` | `.bang/assemblies/clinic-supervised-exact-one/report.json`                            | `assembly:clinic-supervised-exact-one/gleam-beam` | `gleam-beam`        | `Q`        | producer inventory |
| `R07` | `dist/schemas/2/manifest.json`                                                        | `schema-publication:2`                            | —                   | —          | producer inventory |
| `E01` | `embedded/input-resolution.json`                                                      | `observation:input-resolution`                    | —                   | `Q`        | embedded record    |
| `E02` | `embedded/artifact-isolation.json`                                                    | `observation:artifact-isolation`                  | `gleam-beam`        | `Q`        | embedded record    |
| `E03` | `embedded/audit.json`                                                                 | `observation:audit`                               | `gleam-beam`        | `Q`        | embedded record    |
| `E04` | `embedded/schema-custody.json`                                                        | `observation:schema-custody`                      | —                   | —          | embedded record    |
| `E05` | `embedded/external-consumer-isolation.json`                                           | `observation:external-consumer-isolation`         | `effect-typescript` | `Q`        | embedded record    |
| `E06` | `embedded/producer-inventory-comparison.json`                                         | `observation:producer-inventory-comparison`       | —                   | —          | embedded record    |
| `E07` | `embedded/theory-applicability.json`                                                  | `observation:theory-applicability`                | —                   | `Q`        | embedded record    |
| `E08` | `embedded/public-host-preflight.json`                                                 | `observation:public-host-preflight`               | —                   | —          | embedded record    |

For an `R` reference, `sha256` equals the digest for its exact path in `producerInventory`.

For an `E` reference, `sha256` equals the digest on its exact embedded record. The Schema rejects every other field or value.

The 11 warranted claim projections are exact and ordered:

| Claim | Exact statement                                                                                    | Ordered source references                                                                               |
| ----- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `C01` | one supported public host ran one command and resolved the committed Clinic input chain            | `E08`, `E01`                                                                                            |
| `C02` | the current exact-one theory remained applicable                                                   | `E07`                                                                                                   |
| `C03` | two fresh targets qualified from separate bounded evidence                                         | `R04`, `R02`, `R03`                                                                                     |
| `C04` | the explicit supervised objective selected Gleam                                                   | `R05`, `R03`                                                                                            |
| `C05` | assembly retained the selected qualified bytes                                                     | `R03`, `R06`                                                                                            |
| `C06` | one copied escript ran from the artifact-only working directory with the Erlang-only `PATH`        | `R06`, `E02`                                                                                            |
| `C07` | one clean audit found no changed material or retired record                                        | `R06`, `E03`                                                                                            |
| `C08` | schema major 2 produced six files with exact bounded custody                                       | `R07`, `E04`                                                                                            |
| `C09` | one isolated external process returned the strict valid verdict                                    | `R02`, `E05`                                                                                            |
| `C10` | one report linked every current source without copying its evidence grades                         | `R01`, `R02`, `R03`, `R04`, `R05`, `R06`, `R07`, `E01`, `E02`, `E03`, `E04`, `E05`, `E06`, `E07`, `E08` |
| `C11` | two clean runs produced equal 21-file producer inventories and five-record observation projections | `E06`                                                                                                   |

The report decoder checks the source-reference order and values against this table. It does not accept an equivalent reordering.

# Six-family evidence scorecard

The scorecard has exactly six rows. Historical missions are citations, not evidence that M037 revalidates or reuses.

Every historical item has the label `historical-mission-observation-citation`.

Only the current digest-bound `R` and `E` references count as report evidence.

| Family                     | Score label                                               | Historical citations                                 | Current source references                                                                 | Current observation                                                   | Limit                                                 |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| Refined data algebra       | `historical-mission-observation-citation`                 | M001, M002, M003                                     | none                                                                                      | none                                                                  | Clinic has no refinement or algebraic law declaration |
| State and coeffects        | `current-digest-bound-evidence-with-historical-citations` | M004, M015, M036                                     | `R03`, `R06`, `E02`, `E03`                                                                | checked Clinic state, requirements, invariant, artifact, and audit    | no Core state-update law                              |
| Capability and quantity    | `current-digest-bound-evidence-with-historical-citations` | M006, M018, M030, M036                               | `R04`, `R02`, `R03`                                                                       | two current Qualified dispositions and their separate target evidence | no durable or distributed quantity claim              |
| Actor and channel behavior | `current-digest-bound-evidence-with-historical-citations` | M017, M024, M036                                     | `R03`, `R06`, `E02`                                                                       | selected supervised Gleam artifact and restart profile                | Clinic has no M024 channel input                      |
| Laws and providers         | `current-digest-bound-evidence-with-historical-citations` | M005, M011, M016, M030                               | `R01`, `E07`                                                                              | current package custody and Applicable theory result                  | no Clinic solver or kernel-provider run               |
| Graded evidence            | `current-digest-bound-evidence-with-historical-citations` | M007, M010, M012, M031, M032, M033, M034, M035, M036 | `R01`, `R02`, `R03`, `R04`, `R05`, `R06`, `R07`, `E03`, `E04`, `E05`, `E06`, `E07`, `E08` | current records, host preflight, audit, custody, and comparison       | no evidence-grade upgrade                             |

The scorecard does not establish a universal semantic family model. It does not claim that Clinic exercises every historical citation.

# Unsupported claims

The report must include these exact unsupported claims after the 11 warranted rows:

12. The Clinic domain was authored independently from compiler implementation knowledge.
13. Core specifies the decrement `available := available - count`.
14. The candidate proves clinical booking correctness.
15. Clinic composes a refinement, an algebraic law suite, a bounded channel trace, and a solver or kernel provider.
16. Exact-one execution is durable or distributed.
17. Delivery is fair, live, productive, or recoverable.
18. The external consumer proves implementation conformance or evidence truth.
19. The six-family scorecard proves universal semantic unification.
20. The candidate generalizes to an unseen domain, target, provider, or realization shape.
21. The candidate is production-ready, secure, fast, deployable, or operationally suitable.
22. The final publication provides concurrent-reader isolation across all paths.
23. The final publication is one physical filesystem transaction.
24. Rollback cannot fail or always restores every prior byte.
25. Unlisted stale members are absent, removed, or part of the enumerated closure.
26. The final replacement survives process termination at every instruction boundary.
27. Artifact execution provides filesystem sandboxing or denies absolute host paths.

Claims `C12` through `C27` have `disposition: "unsupported"` and an empty `sourceReferences` array.

The claims array has exactly 27 rows in numeric order.

# Typed failures

M037 adds one mission-local orchestration error. It does not change an existing producer error.

```ts
type M037FailureStage =
  | "selection"
  | "preflight"
  | "checkout"
  | "setup"
  | "explain"
  | "classify"
  | "plan"
  | "assemble"
  | "artifact"
  | "audit"
  | "schema-publication"
  | "external-consumer"
  | "comparison"
  | "accumulation"
  | "publication"
  | "decode";
type M037FailureReason =
  | "invalid-selection"
  | "unsafe-path"
  | "reference-disagreement"
  | "unsupported-platform"
  | "bun-version-unsupported"
  | "git-worktree-unavailable"
  | "bash-unavailable"
  | "just-version-unsupported"
  | "nix-unavailable"
  | "dirty-worktree"
  | "revision-unavailable"
  | "cleanup-failed"
  | "process-failed"
  | "producer-failed"
  | "result-mismatch"
  | "digest-failed"
  | "material-missing"
  | "execution-failed"
  | "observation-mismatch"
  | "runtime-boundary-violated"
  | "platform-failed"
  | "consumer-rejected"
  | "isolation-violated"
  | "producer-inventory-diverged"
  | "report-invalid"
  | "source-reference-invalid"
  | "unsupported-claim-upgraded"
  | "publication-failed"
  | "rollback-failed";
type M037SystemErrorTag =
  | "AlreadyExists"
  | "BadResource"
  | "Busy"
  | "InvalidData"
  | "NotFound"
  | "PermissionDenied"
  | "TimedOut"
  | "UnexpectedEof"
  | "Unknown"
  | "WouldBlock"
  | "WriteZero";

type M037PlatformReason =
  | {
      readonly _tag: "BadArgument";
      readonly module: string;
      readonly method: string;
      readonly description?: string;
    }
  | {
      readonly _tag: M037SystemErrorTag;
      readonly module: string;
      readonly method: string;
      readonly description?: string;
      readonly syscall?: string;
      readonly pathOrDescriptor?: string | number;
    };

type ExplanationFailureCause = {
  readonly _tag: "ExplanationFailure";
  readonly stage: string;
  readonly path: string;
  readonly message: string;
  readonly reason?: string;
  readonly address?: string;
};
type ClassificationFailureCause = {
  readonly _tag: "ClassificationFailure";
  readonly stage: string;
  readonly path: string;
  readonly message: string;
  readonly reason?: string;
  readonly address?: string;
};
type PlanFailureCause = {
  readonly _tag: "PlanFailure";
  readonly stage: string;
  readonly path: string;
  readonly reason: string;
  readonly message: string;
  readonly address?: string;
};
type AssemblyFailureCause = {
  readonly _tag: "AssemblyFailure";
  readonly stage: string;
  readonly path: string;
  readonly reason: string;
  readonly message: string;
  readonly address?: string;
};
type AuditFailureCause = {
  readonly _tag: "AuditFailure";
  readonly stage: string;
  readonly path: string;
  readonly reason: string;
  readonly message: string;
  readonly address?: string;
};
type BangSchemaPublicationFailureCause = {
  readonly _tag: "BangSchemaPublicationFailure";
  readonly stage: string;
  readonly path: string;
  readonly reason: string;
  readonly message: string;
};
type PublicationFailureReason =
  | "invalid-entry"
  | "duplicate-entry"
  | "staging-failed"
  | "custody-failed"
  | "publication-failed"
  | "rollback-failed";
type PublicationFailureCause<Reason extends PublicationFailureReason = PublicationFailureReason> = {
  readonly _tag: "PublicationFailure";
  readonly stage: "publication";
  readonly path: string;
  readonly reason: Reason;
  readonly message: string;
};
type PlatformErrorCause = {
  readonly _tag: "PlatformError";
  readonly message: string;
  readonly reason: M037PlatformReason;
};
type M035RejectedVerdictCause = {
  readonly _tag: "M035RejectedVerdict";
  readonly stage: string;
  readonly reason: string;
  readonly message: string;
  readonly path?: string;
  readonly identity?: string;
  readonly expected?: string;
  readonly observed?: string;
};

interface M037FailureBase {
  readonly bangFullCompilerCandidateFailure: 1;
  readonly path?: string;
  readonly command?: string;
  readonly message: string;
}
type M037Failure<
  Stage extends M037FailureStage,
  Reason extends M037FailureReason,
> = M037FailureBase & {
  readonly stage: Stage;
  readonly reason: Reason;
  readonly cause?: never;
};
type M037FailureWithOptionalCause<
  Stage extends M037FailureStage,
  Reason extends M037FailureReason,
  Cause,
> = M037FailureBase & {
  readonly stage: Stage;
  readonly reason: Reason;
  readonly cause?: Cause;
};
type M037FailureWithCause<
  Stage extends M037FailureStage,
  Reason extends M037FailureReason,
  Cause,
> = M037FailureBase & {
  readonly stage: Stage;
  readonly reason: Reason;
  readonly cause: Cause;
};

type M037CandidateFailure =
  | M037FailureWithOptionalCause<
      "selection",
      "invalid-selection" | "unsafe-path" | "reference-disagreement",
      PlatformErrorCause
    >
  | M037FailureWithOptionalCause<
      "preflight",
      | "unsupported-platform"
      | "bun-version-unsupported"
      | "git-worktree-unavailable"
      | "bash-unavailable"
      | "just-version-unsupported"
      | "nix-unavailable",
      PlatformErrorCause
    >
  | M037FailureWithOptionalCause<
      "checkout",
      "dirty-worktree" | "revision-unavailable" | "cleanup-failed",
      PlatformErrorCause
    >
  | M037Failure<"setup", "process-failed">
  | M037FailureWithCause<"explain", "producer-failed", ExplanationFailureCause>
  | M037FailureWithCause<"classify", "producer-failed", ClassificationFailureCause>
  | M037FailureWithCause<"plan", "producer-failed", PlanFailureCause>
  | M037FailureWithCause<"assemble", "producer-failed", AssemblyFailureCause>
  | M037FailureWithCause<"audit", "producer-failed", AuditFailureCause>
  | M037FailureWithCause<"schema-publication", "producer-failed", BangSchemaPublicationFailureCause>
  | M037Failure<
      "explain" | "classify" | "plan" | "assemble" | "audit" | "schema-publication" | "comparison",
      "result-mismatch"
    >
  | M037FailureWithCause<
      | "selection"
      | "preflight"
      | "checkout"
      | "assemble"
      | "artifact"
      | "schema-publication"
      | "external-consumer"
      | "comparison"
      | "accumulation"
      | "decode",
      "digest-failed",
      PlatformErrorCause
    >
  | M037FailureWithCause<
      "assemble" | "schema-publication",
      "platform-failed",
      PublicationFailureCause | PlatformErrorCause
    >
  | M037FailureWithOptionalCause<
      "artifact",
      | "material-missing"
      | "execution-failed"
      | "observation-mismatch"
      | "runtime-boundary-violated",
      PlatformErrorCause
    >
  | M037Failure<"external-consumer", "process-failed">
  | M037FailureWithOptionalCause<"external-consumer", "consumer-rejected", M035RejectedVerdictCause>
  | M037FailureWithOptionalCause<"external-consumer", "isolation-violated", PlatformErrorCause>
  | (M037Failure<"comparison", "producer-inventory-diverged"> & {
      readonly firstDifferingPath: string;
      readonly firstSha256: `sha256:${string}`;
      readonly secondSha256: `sha256:${string}`;
    })
  | M037FailureWithOptionalCause<
      "accumulation",
      "report-invalid" | "source-reference-invalid" | "unsupported-claim-upgraded",
      PlatformErrorCause
    >
  | M037FailureWithCause<
      "publication",
      "publication-failed",
      PublicationFailureCause<Exclude<PublicationFailureReason, "rollback-failed">>
    >
  | M037FailureWithCause<
      "publication",
      "rollback-failed",
      PublicationFailureCause<"rollback-failed">
    >
  | M037FailureWithOptionalCause<"decode", "report-invalid", PlatformErrorCause>;
```

The cause is a strict mission-local projection of the current discriminated error. The root reads fields from the typed value and never parses text.

The cause Schema uses `_tag` to enforce the stable copied fields:

| Cause tag                      | Required copied fields                                                               | Optional copied fields                                            |
| ------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `ExplanationFailure`           | `stage`, `path`, `message`                                                           | `reason`, `address`                                               |
| `ClassificationFailure`        | `stage`, `path`, `message`                                                           | `reason`, `address`                                               |
| `PlanFailure`                  | `stage`, `path`, `reason`, `message`                                                 | `address`                                                         |
| `AssemblyFailure`              | `stage`, `path`, `reason`, `message`                                                 | `address`                                                         |
| `AuditFailure`                 | `stage`, `path`, `reason`, `message`                                                 | `address`                                                         |
| `BangSchemaPublicationFailure` | `stage`, `path`, `reason`, `message`                                                 | none                                                              |
| `PublicationFailure`           | literal stage `publication`, `path`, one exact `PublicationFailureReason`, `message` | none                                                              |
| `PlatformError`                | `message`, `reason._tag`, `reason.module`, `reason.method`                           | `reason.description`, `reason.syscall`, `reason.pathOrDescriptor` |
| `M035RejectedVerdict`          | original `stage`, `reason`, `message`                                                | original `path`, `identity`, `expected`, `observed`               |

M037 does not create a producer reason when the source reason is absent.

The outer stage and reason pairs are exact:

| Stage                | Reasons                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selection`          | `invalid-selection`, `unsafe-path`, `reference-disagreement`, `digest-failed`                                                                                     |
| `preflight`          | `unsupported-platform`, `bun-version-unsupported`, `git-worktree-unavailable`, `bash-unavailable`, `just-version-unsupported`, `nix-unavailable`, `digest-failed` |
| `checkout`           | `dirty-worktree`, `revision-unavailable`, `cleanup-failed`, `digest-failed`                                                                                       |
| `setup`              | `process-failed`                                                                                                                                                  |
| `explain`            | `producer-failed`, `result-mismatch`                                                                                                                              |
| `classify`           | `producer-failed`, `result-mismatch`                                                                                                                              |
| `plan`               | `producer-failed`, `result-mismatch`                                                                                                                              |
| `assemble`           | `producer-failed`, `result-mismatch`, `digest-failed`, `platform-failed`                                                                                          |
| `artifact`           | `material-missing`, `execution-failed`, `observation-mismatch`, `runtime-boundary-violated`, `digest-failed`                                                      |
| `audit`              | `producer-failed`, `result-mismatch`                                                                                                                              |
| `schema-publication` | `producer-failed`, `result-mismatch`, `digest-failed`, `platform-failed`                                                                                          |
| `external-consumer`  | `process-failed`, `consumer-rejected`, `isolation-violated`, `digest-failed`                                                                                      |
| `comparison`         | `producer-inventory-diverged`, `result-mismatch`, `digest-failed`                                                                                                 |
| `accumulation`       | `report-invalid`, `source-reference-invalid`, `unsupported-claim-upgraded`, `digest-failed`                                                                       |
| `publication`        | `publication-failed`, `rollback-failed`                                                                                                                           |
| `decode`             | `report-invalid`, `digest-failed`                                                                                                                                 |

The exact outer-to-cause mapping is:

| Outer stage/reason                                                                                                                | Cause contract                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `explain/producer-failed`                                                                                                         | required `ExplanationFailure`                                                                                                      |
| `classify/producer-failed`                                                                                                        | required `ClassificationFailure`                                                                                                   |
| `plan/producer-failed`                                                                                                            | required `PlanFailure`                                                                                                             |
| `assemble/producer-failed`                                                                                                        | required `AssemblyFailure`                                                                                                         |
| `audit/producer-failed`                                                                                                           | required `AuditFailure`                                                                                                            |
| `schema-publication/producer-failed`                                                                                              | required `BangSchemaPublicationFailure`                                                                                            |
| every `digest-failed` pair in the exact stage table                                                                               | required `PlatformError`                                                                                                           |
| `assemble/platform-failed`, `schema-publication/platform-failed`                                                                  | required `PublicationFailure` or `PlatformError` from mission-owned I/O                                                            |
| `publication/publication-failed`                                                                                                  | required `PublicationFailure` with `invalid-entry`, `duplicate-entry`, `staging-failed`, `custody-failed`, or `publication-failed` |
| `publication/rollback-failed`                                                                                                     | required `PublicationFailure` with `rollback-failed`                                                                               |
| `external-consumer/consumer-rejected`                                                                                             | optional exact `M035RejectedVerdict`                                                                                               |
| ordinary `selection`, `preflight`, `checkout`, `artifact`, `accumulation`, and `decode` reasons                                   | optional `PlatformError`                                                                                                           |
| `external-consumer/isolation-violated`                                                                                            | optional `PlatformError`                                                                                                           |
| every `result-mismatch`, `setup/process-failed`, `external-consumer/process-failed`, and `comparison/producer-inventory-diverged` | no cause                                                                                                                           |

No `producer-failed` value can decode without its owning producer cause. A cause for another producer tag cannot decode at that stage. Genuine producer errors keep `producer-failed`. Mission post-success checks use `result-mismatch`. Applicability, classification, plan selection, assembly binding, audit cleanliness, schema custody, and comparison checks are mission postconditions.

The positive candidate can emit `explain/producer-failed` for its direct applicability call. A nested producer failure from the assembly call emits `assemble/producer-failed` with `AssemblyFailure`.

The `classify` and `plan` stages are reserved for focused single-call negative projections. They are not extra positive-path probes.

An M035 rejected verdict uses `consumer-rejected`. Its cause retains the exact verdict stage, reason, and all present diagnostic fields.

A final `PublicationFailure` cause has literal stage `publication` and retains one exact source reason: `invalid-entry`, `duplicate-entry`, `staging-failed`, `custody-failed`, `publication-failed`, or `rollback-failed`. M037 maps the first five to outer `publication-failed` and the last to outer `rollback-failed`. The strict decoder rejects every other nested stage or reason and both outer-to-cause cross-mappings.

Every SHA-256 or canonical digest call goes through the named operation for its owning stage. The operation binds its private stage failure mapping. A Crypto failure maps to that stage with `digest-failed`. This failure includes the exact `PlatformError` cause. Mission filesystem materialization maps to `assemble/platform-failed` or `schema-publication/platform-failed`. Producer execution does not use `platform-failed`.

`explain`, `classify`, `plan`, and `audit` own no digest call. They are not applicable to the digest-failure assertion and have no digest seam.

Failure JSON uses canonical encoding. Mission-owned outer paths are repository-relative or sandbox-relative. The root path is `.`. M037 normalizes final-publication paths against the repository root. It normalizes schema-publication paths against the detached sandbox root. The nested typed `PublicationFailure.path` retains its original value, including an absolute value. Only an allowed nested typed cause can contain another original absolute path. An outer mission path cannot contain an absolute path. Producer messages stay unchanged and can contain host paths. The projection omits an untyped `PlatformError.reason.cause`. Thus, it does not claim lossless errors. Failures contain no stack or untyped child output.

# Negative outcomes

The authoritative negative contract contains exactly 23 named rows. The `Assertion` column maps every row to its focused assertion; grouped assertions inside one test do not add negative rows.

| ID  | Case                                                          | Expected M037 result                                   | Exact cause or observation                                                                                                                                                             | Assertion                              |
| --- | ------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| N01 | Reject a non-`x86_64-linux` injected host fact                | `preflight/unsupported-platform`                       | no worktree exists                                                                                                                                                                     | `hostileHostIsExternal`                |
| N02 | Report injected Bun version `1.3.12`                          | `preflight/bun-version-unsupported`                    | exact `1.3.13` requirement                                                                                                                                                             | `unsupportedBunVersion`                |
| N03 | Fail the detached no-checkout worktree probe                  | `preflight/git-worktree-unavailable`                   | Git probe command and cleanup                                                                                                                                                          | `failedDetachedWorktreeProbe`          |
| N04 | Fail the Bash strict-mode token probe                         | `preflight/bash-unavailable`                           | Bash is the configured `Justfile` shell                                                                                                                                                | `failedBashStrictModeProbe`            |
| N05 | Report injected Just version `just 1.57.0`                    | `preflight/just-version-unsupported`                   | exact `just 1.58.0` requirement                                                                                                                                                        | `unsupportedJustVersion`               |
| N06 | Fail Nix version, feature, cache, or refreshed build checks   | `preflight/nix-unavailable`                            | exact failed Nix preflight command                                                                                                                                                     | `failedNixVersionProbe`                |
| N07 | Resolve `escript` to the combined toolchain path              | `artifact/runtime-boundary-violated`                   | path is not the absolute real Erlang-store executable                                                                                                                                  | `combinedToolchainPath`                |
| N08 | Change artifact argv, working directory, or environment       | `artifact/runtime-boundary-violated`                   | exact command boundary disagreement                                                                                                                                                    | `changedArtifactInvocation`            |
| N09 | Resolve one workspace sentinel or `gleam`                     | `artifact/runtime-boundary-violated`                   | narrow working-directory or `PATH` observation                                                                                                                                         | `artifactWorkspaceSentinel`            |
| N10 | Candidate copy adds `"unexpected": true`                      | `selection/invalid-selection`                          | strict candidate decoder                                                                                                                                                               | `strictCandidateExcess`                |
| N11 | Classify `foreign-realization.json` in-process                | `classify/producer-failed`                             | `ClassificationFailure`, `target`, optional reason value `missing-declaration`                                                                                                         | `foreignClassificationCause`           |
| N12 | Classify `unsupported-two-state-fields.json` in-process       | `classify/producer-failed`                             | `ClassificationFailure`, `target`, optional reason value `unsupported-target`                                                                                                          | `unsupportedTargetClassificationCause` |
| N13 | Flip the first copied escript byte                            | `artifact/execution-failed`                            | failed `escript` process                                                                                                                                                               | `damagedArtifactExecution`             |
| N14 | Append a newline to the copied Effect boundary                | `external-consumer/consumer-rejected`                  | `custody/digest-mismatch` verdict fields                                                                                                                                               | `consumerCustodyRejection`             |
| N15 | Add an excess Effect evidence property                        | `external-consumer/consumer-rejected`                  | `decode/decode-failed` verdict fields                                                                                                                                                  | `consumerEvidenceDecodeRejection`      |
| N16 | Make the consumer import a canonical file outside the sandbox | `external-consumer/process-failed`                     | loader rejects before any outside module loads                                                                                                                                         | `outsideConsumerImport`                |
| N17 | Mark claim `C12` as warranted                                 | `accumulation/unsupported-claim-upgraded`              | no source reference exists                                                                                                                                                             | `unsupportedClaimUpgrade`              |
| N18 | Change the second run `src/main.gleam` byte                   | `comparison/producer-inventory-diverged`               | path and both digests                                                                                                                                                                  | `runComparisonInventoryDivergence`     |
| N19 | Fail injected SHA-256 at each owning-stage digest seam        | exact owning stage with `digest-failed`                | required exact `PlatformError` for `selection`, `preflight`, `checkout`, `assemble`, `artifact`, `schema-publication`, `external-consumer`, `comparison`, `accumulation`, and `decode` | `strictStageReasonDigestOwners`        |
| N20 | Decode each exact, missing, or wrong producer cause           | strict decoder accepts exact and rejects invalid forms | six exact stage-specific tags accept; missing and wrong tags reject                                                                                                                    | `strictProducerCauseUnions`            |
| N21 | Fail mission publication with an absolute root source path    | owning platform or publication reason                  | outer path is `.`, nested `PublicationFailure.path` retains the original                                                                                                               | `publicationAbsoluteSourcePath`        |
| N22 | Fail one final commit rename, then complete rollback          | `publication/publication-failed`                       | exact `PublicationFailure` and restored enumerated bytes                                                                                                                               | `publicationCommitRollback`            |
| N23 | Fail one final commit rename and one rollback restore         | `publication/rollback-failed`                          | exact `PublicationFailure`; no restoration claim                                                                                                                                       | `publicationRollbackFailure`           |

The strict public-decode case first asserts exact success standard output and empty standard error. It then changes one non-identity E02 observation field and one non-identity E07 obligation field in separate report copies. Each copy recomputes every report-local embedded, inventory, observation, claim-reference, and scorecard-reference digest and passes report-local digest validation; public decode still rejects it because the canonical value differs from its live checked producer source.

The same case replaces the exact candidate selection and exact public report with repository-relative symbolic links whose targets are outside the root. Each CLI invocation exits `1`, writes empty standard output, writes the exact canonical typed failure bytes to standard error, and strictly decodes those same bytes. The source resolver rejects the link component before it reads the target.

One additional stale-member case places an extra file in an owned directory. The command reports the sorted path, ignores it, and leaves it unchanged.

Cases that do not inject a final commit or rollback failure do not change a prior enumerated byte. The successful-rollback case restores every prior enumerated byte.

The rollback-failure case runs only in a temporary root. It checks the typed limitation and does not assert byte equality.

Each failure writes no report path to standard output.

For each process failure, the focused fixture first compares standard-error bytes with `encodeCanonicalJson(failure) + "\n"`. Then it strictly decodes the same bytes. Both M035 rejection cases assert the complete nested `M035RejectedVerdict`. This assertion includes its exact `message` and every present `path`, `identity`, `expected`, and `observed` field.

The focused suite may contain more top-level test cases than the authoritative negative table. It exercises every named row, and grouped assertions do not add rows.

The focused test calls mission-local functions with temporary copies and test Layers. It adds no production environment flag or CLI option.

# Evidence statement

M037 can establish these claims:

1. one supported public host ran one command and resolved the committed Clinic input chain;
2. the current exact-one theory remained applicable;
3. two fresh targets qualified from separate bounded evidence;
4. the explicit supervised objective selected Gleam;
5. assembly retained the selected qualified bytes;
6. one copied escript ran from the artifact-only working directory with the Erlang-only `PATH`;
7. one clean audit found no changed material or retired record;
8. schema major 2 produced six files with exact bounded custody;
9. one isolated external process returned the strict valid verdict;
10. one report linked every current source without copying its evidence grades; and
11. two clean runs produced equal 21-file producer inventories and five-record observation projections.

The command strictly decodes the staged report before publication. Successful command exit plus final report presence observe that the 22-file enumerated publication succeeded.

The report does not contain a claim that it observed its later publication. The public decode command validates the reloaded bytes separately.

Each claim has only its source references. Evidence classes, scopes, materials, assumptions, weakenings, limitations, lifetime, and invalidators remain in the digest-bound source records.

M037 cannot establish any claim in the unsupported section.

## Recorded local and independent acceptance

M037 remains active. Local acceptance is complete, and protected delivery is pending. No hosted CI result or final protected revision is recorded.

A read-only evidence audit returned `PASS` at `feb322e23a11ffa5bc7fe06a2b6693b5f15a46de`. A comprehensive review then found one medium N20 cross-owner cause gap. Head `c8eb5550dca73f55b009efddff56dd7a3fcc17a2` fixed that gap, passed 23 focused tests with 300 assertions, and passed `just verify`. The current pre-push documentation review found only evidence-wording corrections.

At `8ee4e31b06105a54635410d973595ce47042cc49`, an independent public executor created a fresh detached clean worktree. The executor read only `AGENTS.md`, `README.md`, and the generated report.

The executor ran `just install`, one candidate command, strict decode, the verbatim standalone escript sequence, and a second candidate command. All commands exited zero. Both candidate commands, strict decode, and standalone execution wrote no standard error.

At `8ee4e31b06105a54635410d973595ce47042cc49`, both candidate-run reports had SHA-256 `5e952284236721ccda52a6334b47500f201cbd305af9df3c42352493c13e91b4`.

The report contains 7 inputs, 24 stages, 8 embedded records, 21 producer files per run, 22 outputs, 27 claims, and 6 scorecard families. The claims contain 11 warranted rows and 16 unsupported rows.

Both clean producer inventories and all five observation projections are equal. The standalone observation identifies `BookAppointmentOnce` and `appointment-book-1`, and `qualificationMatch` is `true`.

The external consumer returned `valid`. Its loader observed only the driver, published `consumer.js`, and the three required Node built-ins.

Audit classified 18 materials as 10 unchanged and 8 deferred, with no retired records. Publication had no stale members and reported concurrent-reader isolation as `false`.

Schema major 2 published six custody files. The manifest digest-binds four payloads, does not digest `consumer.d.ts`, and cannot digest itself.

The N01–N23 focused gate covers exact failure causes, rollback, stale paths, loader isolation, source paths, and digest failures. The protected M036 parity check reobserved all 15 files without change.

The generated `.bang/evidence/M037.json`, focused test, and this contract remain the evidence roots. This summary does not copy the 22-file inventory or create a second digest authority.

Independent Clinic authorship remains unsupported. The report retains every unsupported claim.

M037 does not establish universal family unification, production clinical correctness, distributed or durable behavior, fairness, filesystem sandboxing, or concurrent-reader isolation. It also does not establish successful recovery from rollback failure, rollback under process termination, deployment, security, or performance claims.

# Falsifiers

M037 fails if:

1. the executor needs any command, file, or instruction absent from the public README;
2. a mission-root preflight is absent or accepts an unsupported host, tool version, or capability;
3. the public-host record omits or changes a normalized version or narrow capability result;
4. the root command does not resolve to one exact committed input;
5. an M030 through M036 producer changes;
6. the root parses child BANG CLI prose or invokes a BANG CLI child command;
7. the report contains a successful `publication` stage observation;
8. the second clean run compares a report, compares 22 files, omits a producer file, or omits a per-run observation;
9. a claim copies or combines source evidence metadata;
10. a warranted claim lacks its exact ordered source references;
11. a historical citation is labeled as current evidence;
12. the scorecard claims universal family coverage;
13. planning selects Gleam without the public objective values;
14. assembly regenerates or replaces the qualified Gleam bytes;
15. artifact execution uses a non-real escript path, a different argument vector, a different working directory, or an inherited environment;
16. an artifact workspace sentinel or `gleam` resolves through the working directory or Erlang-only `PATH`;
17. the artifact report uses broad availability fields or claims filesystem sandboxing;
18. a clean audit changes or retires a record;
19. the schema report claims that all six files are manifest-digested;
20. the external consumer accepts an outside import or wrong material-role string;
21. the public report decoder is unavailable or accepts an excess property;
22. the publication claims concurrent-reader isolation or one physical filesystem transaction;
23. the command removes, owns, or claims absence of an unlisted stale member;
24. a rollback failure is reported as restored or unchanged;
25. an enumerated byte differs after any failure whose rollback succeeded;
26. any protected M036 parity byte changes; or
27. implementation adds a new Core construct, provider, target, evidence class, deployment, or CLI verb.

# Non-goals

M037 does not provide:

- author-independent Clinic design;
- universal synthesis, semantic unification, proof of soundness, or production readiness;
- a new theory, provider, target, evidence class, Core construct, deployment, or CLI verb;
- a generic pipeline, workflow engine, or provider plug-in system;
- HTTP, authentication, a browser, a registry, signing, upload, or attestation;
- concurrent-reader isolation for the 22-file publication;
- one physical filesystem transaction across 22 paths;
- an indirection pointer, generation directory, or manifest switch-over protocol;
- cleanup or ownership of unlisted stale members;
- infallible rollback or process-termination durability;
- filesystem sandboxing for artifact execution;
- cross-platform candidate execution; or
- implementation conformance inferred from custody or decode validity.

# Smallest implementation sequence

1. Add the strict candidate input, external consumer, and root script entry.
2. Declare the strict candidate, accumulated report, source-reference, claim, scorecard, failure, and decode Schemas in the root script.
3. Compose the collected M031 report consumer from its existing exported component Schemas.
4. Add pure inventory, digest, source-projection, closure-comparison, stale-scan, and claim-validation functions.
5. Add one Effect composition root with current Bun `FileSystem`, `Path`, `Crypto`, and `ChildProcessSpawner` services.
6. Add the ordered mission-root host preflights and the strict public-host embedded record.
7. Run one direct staged explanation, one staged assembly call, strict collected-record decodes, audit, and schema publication in-process.
8. Inject one assembly collector into `compileSelectedAssembly`. Use its complete entries for the single final publication.
9. Resolve the real Erlang-store escript and run the copied artifact with the frozen argument vector, working directory, and replacement environment.
10. Reuse the M036 loader and import-log pattern. Freeze and decode the exact Node invocation.
11. Compare the two 21-file producer inventories and five-record observation projections. Build 15 source references, validate 27 claims, and decode the report.
12. Scan owned directories for unlisted members. Add only the report to the 21 producer entries and call the house atomic publisher once.
13. Add the positive journey, the named negative rows, one stale-member case, and M036 byte parity. Pin the workflow's `setup-just` input to `1.58.0` and add the merge-blocking steps.

No implementation step changes an M030 through M036 producer.

# Size

M037 has these maximum counts:

| Item                                                                                                    | Count |
| ------------------------------------------------------------------------------------------------------- | ----: |
| New candidate input files                                                                               |     1 |
| New external consumer files                                                                             |     1 |
| New mission-local orchestration scripts                                                                 |     1 |
| New public decode commands                                                                              |     1 |
| New focused test files                                                                                  |     1 |
| New package scripts                                                                                     |     0 |
| New immutable Nix toolchain references                                                                  |     1 |
| Modified merge-blocking workflow files                                                                  |     1 |
| Detached clean runs                                                                                     |     2 |
| Producer files per clean run                                                                            |    21 |
| Final enumerated files                                                                                  |    22 |
| Mission-root public-host records                                                                        |     1 |
| Detached no-checkout capability probes                                                                  |     1 |
| Report stage observations                                                                               |    24 |
| Source references                                                                                       |    15 |
| Warranted claim rows                                                                                    |    11 |
| Unsupported claim rows                                                                                  |    16 |
| Total claim rows                                                                                        |    27 |
| Scorecard rows                                                                                          |     6 |
| Qualified targets                                                                                       |     2 |
| Negative failure rows (authoritative table)                                                             |    23 |
| Changes to M030 through M036 producers                                                                  |     0 |
| New schema-publication files                                                                            |     0 |
| New domains, theories, providers, targets, evidence classes, Core constructs, CLI verbs, or deployments |     0 |

# Acceptance

1. Start from a clean `x86_64-linux` checkout of the M037 candidate revision.
2. Follow only the public README and committed input.
3. Observe exact Bun `1.3.13`, Just `1.58.0`, and `x86_64-linux` preflight results.
4. Observe normalized Git, Bash, and Nix versions and every frozen capability result.
5. Run `just install`.
6. Run `bun run scripts/m037-full-compiler-candidate.ts examples/clinic/full-candidate.json`.
7. Observe only `.bang/evidence/M037.json` on standard output.
8. Strictly decode the staged report inside the command before publication.
9. Run `bun run scripts/m037-full-compiler-candidate.ts --decode .bang/evidence/M037.json` and observe one canonical `valid` result.
10. Observe the exact seven committed input paths and their digests.
11. Observe exactly 24 report stages in the specified order and no `publication` stage.
12. Observe one direct explanation call, one assembly call, strict collected-record decodes, and no child BANG CLI invocation.
13. Observe one `Applicable` exact-one theory result.
14. Observe two ordered fresh `Qualified` target records.
15. Observe one selected Gleam plan with the exact public objective.
16. Observe one assembly that binds the qualified Gleam bytes by digest.
17. Resolve the real Erlang-store `escript` path and record its executable digest.
18. Run the copied artifact with the exact argument vector, artifact-only working directory, and replacement environment.
19. Observe false workspace and Gleam resolution facts without a filesystem-sandboxing claim.
20. Observe a clean audit with zero changed and zero retired records.
21. Observe schema major 2 with exactly six files.
22. Observe manifest digests for exactly four schema payloads.
23. Observe that the declaration and manifest are each bound by the six-file producer inventory.
24. Observe the manifest digest in `manifestSha256`.
25. Observe the Nixpkgs revision, `nodejs_24`, Node `v24.7.0`, executable digest, and frozen M036 loader invocation.
26. Observe only the exact consumer-sandbox import set in the decoded module log.
27. Observe one `valid` verdict with exact material-role strings.
28. Observe exactly 15 source references with the specified paths, selectors, identities, and digests.
29. Observe exactly 27 ordered claims with exact source-reference projections.
30. Observe six scorecard rows that distinguish historical citations from current evidence.
31. Observe equality of the two ordered 21-file producer inventories and five-record observation projections.
32. Observe a final ordered 22-file output inventory whose last path is `.bang/evidence/M037.json`.
33. Exercise the stale-member case and observe the sorted path, ignored status, and unchanged byte.
34. Treat successful command exit plus strict report presence as the publication observation.
35. Exercise all 23 named negative rows and decode each exact stage and reason, plus the cause when present.
36. Observe unchanged enumerated bytes after every failure whose rollback succeeds.
37. Observe a typed limitation, and no restoration claim, when rollback fails.
38. Run `bun run evidence:m036` and observe all 15 protected files unchanged byte for byte.
39. Run `bun test tests/m037-full-compiler-candidate.test.ts`.
40. Confirm that `.github/workflows/quality.yml` sets `with.just-version` to `1.58.0`. Run `just verify` and retain the existing merge-blocking quality job.

Acceptance requires all items.

# Sources

- `BANG-PROJECT-DIRECTION.md`.
- `CAPABILITIES.md`.
- `README.md`.
- `decisions/0007-modular-propositions-providers-and-realizations.md`.
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`.
- `decisions/0012-semantic-process-architecture-and-reuse-boundary.md`.
- `design-specs/M012-accumulated-system-report.md`.
- `design-specs/M016-kernel-proof-provider.md`.
- `design-specs/M017-gleam-beam-actor-realization.md`.
- `design-specs/M018-single-use-capability.md`.
- `design-specs/M024-bounded-channel-trace.md`.
- `design-specs/M030-local-theory-package-consumption.md`.
- `design-specs/M031-two-target-exact-one-qualification.md`.
- `design-specs/M032-objective-relative-realization-planning.md`.
- `design-specs/M033-selected-realization-assembly.md`.
- `design-specs/M034-evidence-invalidation.md`.
- `design-specs/M035-external-extension-boundary.md`.
- `design-specs/M036-second-domain-realization-boundary-portability.md`.
- protected historical reference `f2673c1b:design-specs/M036-full-compiler-candidate.md`.
- `package.json`.
- `bun.lock`.
- `Justfile`.
- `nix/gleam.nix`.
- `.github/workflows/quality.yml`.
- `apps/bang/src/explain.ts`.
- `apps/bang/src/classify.ts`.
- `apps/bang/src/plan.ts`.
- `apps/bang/src/assemble.ts`.
- `apps/bang/src/audit.ts`.
- `apps/bang/src/export-schemas.ts`.
- `apps/bang/src/publication.ts`.
- `packages/evidence/src/index.ts`.
- `packages/planning/src/index.ts`.
- `packages/theories/src/index.ts`.
- `tests/m035-consumer.test.ts`.
- `tests/m035-export.test.ts`.
- `tests/m036-portability.test.ts`.
- Nixpkgs commit [`adf428a7cfbb66e9b5cb5cdd2df8a659c2df1052`](https://github.com/NixOS/nixpkgs/commit/adf428a7cfbb66e9b5cb5cdd2df8a659c2df1052), which introduces `nodejs_24` version `24.7.0`.
- `examples/clinic/clinic.bang`.
- `examples/clinic/theories/packaged-exact-one.json`.
- `examples/clinic/realizations/two-qualified-exact-one.json`.
- `examples/clinic/plans/supervised-exact-one.json`.
- `examples/clinic/assemblies/supervised-exact-one.json`.
