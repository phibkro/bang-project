---
id: M037
title: Full compiler candidate
status: active
timebox: 5 focused sessions
vision_claims:
  - clean-checkout-full-candidate
  - public-executor-reproducibility
  - honest-six-family-scorecard
  - accumulated-qualified-report
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

An external process consumes the publication outside the workspace. The command writes one accumulated report with qualified evidence and unsupported claims.

The command repeats the complete run in a second clean worktree. It publishes output only after both clean runs are equal.

# User claim

> From a clean checkout, I can install BANG and run one documented command on committed Clinic inputs. I receive one standalone escript and one accumulated report. The report states what the run warrants and what remains unsupported.

# Primary uncertainty

M001 through M036 proved separate vertical capabilities. They did not prove that one public command can compose the current Clinic path without hidden inputs or semantic inflation.

M037 tests this uncertainty:

1. One public command can resolve and run the complete input chain.
2. One report can preserve every evidence grade and source mission.
3. One transaction can publish a deterministic closure after all stages pass.
4. An executor can repeat the path without reading compiler internals.

A failed item is a mission failure. The implementation must not hide the failure with a new semantic construct or stronger evidence label.

# Stable boundary

M037 composes shipped capability. It adds mission-local orchestration and one mission-local report schema.

M037 does not add a new BANG CLI verb. The public command is a root Bun script that calls existing commands.

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

The root `package.json` adds the `candidate:m037` script and the focused `test:m037` script. Existing scripts keep their behavior.

M037 reuses the current Clinic source and selections. It does not modify their semantic content.

M036 output remains a compatibility boundary. Existing Clinic, TinyBank, Inventory, schema, and evidence bytes must not change because M037 orchestrates them.

# Public one-command boundary

From a clean checkout, run these commands:

```sh
just install
bun run candidate:m037 examples/clinic/full-candidate.json
```

The second command is the only candidate command. An executor does not run the child commands manually.

On success, standard output is exactly:

```text
.bang/evidence/M037.json
```

The success path writes no standard error.

On failure, standard output is empty. Standard error contains one canonical `M037CandidateFailure` JSON document.

The command rejects a dirty tracked worktree before it creates a temporary worktree. Ignored generated output does not make the tracked worktree dirty.

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

The command records `HEAD` and the SHA-256 digest of `bun.lock`. It then creates two detached clean worktrees at that revision.

Each worktree runs these setup commands:

```sh
just install
bun run build
```

Each worktree runs the same ordered journey. Temporary paths, times, process identities, and cache paths do not enter any report.

The command removes both worktrees on success and failure. A failed cleanup makes the command fail before publication.

# Ordered journey

Each clean worktree runs these existing commands in order:

```sh
bun run bang explain examples/clinic/theories/packaged-exact-one.json
bun run bang classify examples/clinic/realizations/two-qualified-exact-one.json
bun run bang plan examples/clinic/plans/supervised-exact-one.json
bun run bang assemble examples/clinic/assemblies/supervised-exact-one.json
bun run bang audit clinic-supervised-exact-one
bun run bang export-schemas
```

The `explain` result must be `Applicable`. It must retain the existing package identity, version, semantic digest, premises, and obligations.

The `classify` result must contain two ordered, fresh, independent `Qualified` records. The target order remains `effect-typescript`, then `gleam-beam`.

The `plan` result must select `gleam-beam` for the existing supervised objective. No hidden score or default can select the target.

The `assemble` result must bind the qualified Gleam bytes by digest. Assembly must not regenerate the selected boundary.

The `audit` result must report all records as `valid`. It must request zero requalifications for the clean closure.

The schema command must publish major 2. Its six files must match the manifest digests.

# Artifact-only execution

The runner copies only this file into a new temporary artifact directory:

```text
.bang/assemblies/clinic-supervised-exact-one/bin/exact_one
```

The runner executes the copy with the pinned Erlang `escript` runtime. The artifact directory contains no BANG source, package, build output, or Gleam compiler.

The subprocess cannot resolve the BANG workspace through its working directory or `PATH`. It must emit one decodable M031 exact-one observation.

The observation must contain these identities:

| Role        | Identity                                                              |
| ----------- | --------------------------------------------------------------------- |
| Realization | `BookAppointmentOnce`                                                 |
| Entity      | `appointment-book-1`                                                  |
| Requirement | `operationRealization:BookAppointmentOnce.requirement:ConfirmBooking` |
| Target      | `gleam-beam`                                                          |

The observation must equal the selected qualification observation. This equality is a bounded runtime check, not implementation equivalence.

# Outside-workspace consumer

The runner creates a temporary consumer directory outside the checkout. It copies only these inputs:

```text
consumer.mjs
publication/
  manifest.json
  schemas/bang-semantic-artifact-1.schema.json
  schemas/bang-theory-lock-1.schema.json
  schemas/bang-target-evidence-1.schema.json
  types/consumer.d.ts
  types/consumer.js
records/
  theory-lock.json
  effect-evidence.json
materials/
  examples/clinic/clinic.bang
  .bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/boundary.ts
```

The process runs this command from the temporary directory:

```sh
bun consumer.mjs publication records/theory-lock.json records/effect-evidence.json materials
```

The consumer imports only `publication/types/consumer.js` and required Node built-ins. It does not import a BANG package or workspace file.

The bounded import list is exact and ordered:

```text
./publication/types/consumer.js
node:crypto
node:fs/promises
node:path
```

The runner rejects any other static or dynamic import before it starts the consumer.

The consumer strictly decodes the lock and evidence. It verifies each supplied material digest and checks record agreement.

The valid path writes one canonical `valid` verdict. A valid verdict proves custody and decodability only.

# Persistent output closure

A successful run publishes 22 files. The accumulated report contains the ordered inventory for the other 21 files.

The existing Clinic closure contributes these 15 files:

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

The final file is:

```text
.bang/evidence/M037.json
```

The command stages all output outside the persistent roots. It compares both staged closures before it publishes either closure.

A handled failure restores every prior persistent byte. A failed command leaves no partial report, schema publication, qualification, plan, assembly, or artifact.

Process termination during the final file replacement is outside this mission. The report lists this limitation.

# Accumulated report schema

`M037FullCompilerCandidateReportSchema` is a strict, mission-local Effect Schema. It is not a Core construct or an evidence class.

The encoded report has this shape:

```ts
type M037Stage =
  | "selection"
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
  | "accumulation"
  | "comparison"
  | "publication";

type M037Family =
  | "refined-data-algebra"
  | "state-and-coeffects"
  | "capability-and-quantity"
  | "actor-and-channel-behavior"
  | "laws-and-providers"
  | "graded-evidence";

type M037ScoreLabel =
  "reused-mission-evidence" | "new-end-to-end-observation" | "mixed-reused-and-new";

type M037InputRole =
  | "domain-source"
  | "theory-selection"
  | "classification-selection"
  | "plan-selection"
  | "assembly-selection"
  | "theory-package"
  | "external-consumer";

interface M037FamilyScore {
  readonly family: M037Family;
  readonly scoreLabel: M037ScoreLabel;
  readonly reusedMissions: ReadonlyArray<string>;
  readonly newObservation: string | null;
  readonly limit: string;
}

interface M037FullCompilerCandidateReport {
  readonly bangFullCompilerCandidate: 1;
  readonly id: "clinic-full-compiler-candidate";
  readonly revision: string;
  readonly dependencyLock: {
    readonly path: "bun.lock";
    readonly sha256: `sha256:${string}`;
  };
  readonly command: "bun run candidate:m037 examples/clinic/full-candidate.json";
  readonly inputs: ReadonlyArray<{
    readonly role: M037InputRole;
    readonly path: string;
    readonly sha256: `sha256:${string}`;
  }>;
  readonly stages: ReadonlyArray<{
    readonly stage: M037Stage;
    readonly run?: 1 | 2;
    readonly result: "passed";
    readonly commands?: ReadonlyArray<string>;
    readonly record?: string;
    readonly sha256?: `sha256:${string}`;
  }>;
  readonly theory: {
    readonly result: "Applicable";
    readonly package: {
      readonly id: "ExactOneCapabilityExecution";
      readonly version: 1;
      readonly semanticDigest: "sha256:f5688125437b19929b78f813b74a6595e09d92fdfd8ac6005066ff1cb3557071";
    };
    readonly requirementAddress: "operationRealization:BookAppointmentOnce.requirement:ConfirmBooking";
    readonly lockPath: ".bang/theory-locks/clinic-packaged-exact-one.json";
    readonly lockSha256: `sha256:${string}`;
  };
  readonly qualification: {
    readonly selectionId: "clinic-two-qualified-exact-one";
    readonly result: "qualified";
    readonly evidence: readonly [M031TargetQualificationEvidence, M031TargetQualificationEvidence];
    readonly reportSha256: `sha256:${string}`;
  };
  readonly planning: {
    readonly selectionId: "clinic-supervised-exact-one";
    readonly result: "selected";
    readonly target: "gleam-beam";
    readonly requirementAddress: "operationRealization:BookAppointmentOnce.requirement:ConfirmBooking";
    readonly reportSha256: `sha256:${string}`;
  };
  readonly assembly: {
    readonly assemblyId: "clinic-supervised-exact-one";
    readonly target: "gleam-beam";
    readonly qualifiedBoundarySha256: `sha256:${string}`;
    readonly reportSha256: `sha256:${string}`;
  };
  readonly artifact: {
    readonly source: ".bang/assemblies/clinic-supervised-exact-one/bin/exact_one";
    readonly sha256: `sha256:${string}`;
    readonly runtime: "pinned-escript";
    readonly workspaceAvailable: false;
    readonly gleamCompilerAvailable: false;
    readonly observation: M031TargetQualificationObservations;
    readonly qualificationMatch: true;
  };
  readonly audit: {
    readonly assemblyId: "clinic-supervised-exact-one";
    readonly verdict: "valid";
    readonly changed: 0;
    readonly retired: 0;
    readonly requalifications: 0;
  };
  readonly schemaPublication: {
    readonly major: 2;
    readonly directory: "dist/schemas/2";
    readonly manifestSha256: `sha256:${string}`;
    readonly files: 6;
  };
  readonly externalConsumer: {
    readonly location: "outside-workspace";
    readonly verdict: "valid";
    readonly verifiedMaterials: ReadonlyArray<"core-source" | "generated-effect-boundary">;
    readonly observedImports: ReadonlyArray<string>;
  };
  readonly scorecard: ReadonlyArray<M037FamilyScore>;
  readonly claims: ReadonlyArray<M037ClaimDisposition>;
  readonly outputInventory: ReadonlyArray<{
    readonly path: string;
    readonly sha256: `sha256:${string}`;
  }>;
  readonly cleanRun: {
    readonly runs: 2;
    readonly filesPerRun: 22;
    readonly firstInventorySha256: `sha256:${string}`;
    readonly secondInventorySha256: `sha256:${string}`;
    readonly result: "equal";
  };
}
```

The 21 inventory paths use the exact order in the persistent output section. The report cannot contain its own digest.

The revision is exactly 40 lowercase hexadecimal characters. Each digest is `sha256:` plus 64 lowercase hexadecimal characters.

The input roles use the `M037InputRole` order. Their paths use the matching order in the resolved-input table.

Each inventory digest covers the 21 canonical ordered path-and-digest records for one run.

The runner compares those 21 outputs first. It then writes one identical report into each staged closure and compares all 22 files.

The stage array has exactly 24 rows. It contains `selection`, the ten per-run stages for run 1, the same ten stages for run 2, `accumulation`, `comparison`, and `publication`.

The ten per-run stages use this order: `checkout`, `setup`, `explain`, `classify`, `plan`, `assemble`, `artifact`, `audit`, `schema-publication`, and `external-consumer`.

`run` appears only on the 20 per-run rows. The report decoder rejects excess fields and every stage order, count, identity, or digest conflict.

The qualification field embeds both original M031 evidence records without change. The tuple order is `effect-typescript`, then `gleam-beam`.

The theory, planning, and assembly fields bind their producer reports by digest. The report does not relabel or flatten their results.

The artifact observation equals the Gleam evidence observation. The qualified boundary digest equals the selected Gleam material digest.

The six scorecard rows and 22 claim rows use their specified orders. No ordered collection contains a duplicate identity or path.

# Evidence provenance and claim disposition

Every report claim has these fields:

```ts
interface M037ClaimDisposition {
  readonly claim: string;
  readonly status: "warranted" | "unsupported";
  readonly observationKind:
    | "reused-mission-evidence"
    | "new-end-to-end-observation"
    | "mixed-reused-and-new"
    | "not-exercised";
  readonly sourceMissions: ReadonlyArray<string>;
  readonly evidenceClass?: string;
  readonly scope?: string;
  readonly lifetime?: string;
  readonly materials: ReadonlyArray<string>;
  readonly assumptions: ReadonlyArray<string>;
  readonly weakenings: ReadonlyArray<string>;
  readonly limitations: ReadonlyArray<string>;
  readonly invalidators: ReadonlyArray<string>;
}
```

`status` and `observationKind` are report labels. They are not evidence classes.

If a source record names an evidence class or scope, the report copies it without change. The report omits absent labels and never combines grades.

If no current record warrants a claim, its status is `unsupported`. The report does not treat missing evidence as refutation.

# Six-family evidence scorecard

The scorecard has exactly six rows. Each row names reused mission evidence and new M037 observations separately.

| Family                     | Score label               | Reused evidence                                      | New M037 observation                                           | Limit                                                 |
| -------------------------- | ------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| Refined data algebra       | `reused-mission-evidence` | M001, M002, M003                                     | none                                                           | Clinic has no refinement or algebraic law declaration |
| State and coeffects        | `mixed-reused-and-new`    | M004, M015, M036                                     | checked Clinic state, requirements, invariant, and observation | no Core state-update law                              |
| Capability and quantity    | `mixed-reused-and-new`    | M006, M018, M030, M036                               | fresh exact-one target evidence                                | no durable or distributed quantity claim              |
| Actor and channel behavior | `mixed-reused-and-new`    | M017, M024                                           | selected supervised Gleam artifact and restart profile         | Clinic has no M024 channel input                      |
| Laws and providers         | `mixed-reused-and-new`    | M005, M011, M016, M030                               | exact-one theory applicability                                 | no Clinic solver or kernel-provider run               |
| Graded evidence            | `mixed-reused-and-new`    | M007, M010, M012, M031, M032, M033, M034, M035, M036 | fresh records, audit, custody verdict, and accumulated report  | no evidence-grade upgrade                             |

This scorecard does not establish a universal semantic family model. It does not claim that Clinic exercises every reused row.

# Unsupported claims

The report must include these exact unsupported claims:

1. The Clinic domain was authored independently from compiler implementation knowledge.
2. Core specifies the decrement `available := available - count`.
3. The candidate proves clinical booking correctness.
4. Clinic composes a refinement, an algebraic law suite, a bounded channel trace, and a solver or kernel provider.
5. Exact-one execution is durable or distributed.
6. Delivery is fair, live, productive, or recoverable.
7. The external consumer proves implementation conformance or evidence truth.
8. The six-family scorecard proves universal semantic unification.
9. The candidate generalizes to an unseen domain, target, provider, or realization shape.
10. The candidate is production-ready, secure, fast, deployable, or operationally suitable.
11. The final multi-root replacement survives process termination at every instruction boundary.

The claims array has exactly 22 rows. The 11 warranted statements from the Evidence statement section come first, in their listed order.

The 11 unsupported claims follow in their listed order. An unsupported row uses `not-exercised`.

`sourceMissions` and all evidence arrays are empty. The row omits `evidenceClass`, `scope`, and `lifetime`.

# Typed failures

M037 adds one mission-local orchestration error. It does not change an existing command error.

```ts
type M037FailureStage = M037Stage;

type M037FailureReason =
  | "invalid-selection"
  | "unsafe-path"
  | "reference-disagreement"
  | "dirty-worktree"
  | "revision-unavailable"
  | "cleanup-failed"
  | "install-failed"
  | "build-failed"
  | "child-command-failed"
  | "result-mismatch"
  | "material-mismatch"
  | "material-missing"
  | "execution-failed"
  | "observation-mismatch"
  | "runtime-boundary-violated"
  | "version-mismatch"
  | "manifest-mismatch"
  | "consumer-failed"
  | "rejected"
  | "import-boundary-violated"
  | "report-invalid"
  | "unsupported-claim-upgraded"
  | "evidence-flattened"
  | "closure-diverged"
  | "observation-diverged"
  | "publication-failed";

interface M037CandidateFailure {
  readonly bangFullCompilerCandidateFailure: 1;
  readonly stage: M037FailureStage;
  readonly reason: M037FailureReason;
  readonly path?: string;
  readonly command?: string;
  readonly cause?: {
    readonly stage: string;
    readonly reason: string;
    readonly identity?: string;
    readonly address?: string;
  };
  readonly message: string;
}
```

The stage and reason vocabulary is exact:

| Stage                | Reasons                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `selection`          | `invalid-selection`, `unsafe-path`, `reference-disagreement`                                |
| `checkout`           | `dirty-worktree`, `revision-unavailable`, `cleanup-failed`                                  |
| `setup`              | `install-failed`, `build-failed`                                                            |
| `explain`            | `child-command-failed`, `result-mismatch`                                                   |
| `classify`           | `child-command-failed`, `result-mismatch`                                                   |
| `plan`               | `child-command-failed`, `result-mismatch`                                                   |
| `assemble`           | `child-command-failed`, `material-mismatch`                                                 |
| `artifact`           | `material-missing`, `execution-failed`, `observation-mismatch`, `runtime-boundary-violated` |
| `audit`              | `child-command-failed`, `result-mismatch`                                                   |
| `schema-publication` | `child-command-failed`, `version-mismatch`, `manifest-mismatch`                             |
| `external-consumer`  | `consumer-failed`, `rejected`, `import-boundary-violated`                                   |
| `accumulation`       | `report-invalid`, `unsupported-claim-upgraded`, `evidence-flattened`                        |
| `comparison`         | `closure-diverged`, `observation-diverged`                                                  |
| `publication`        | `publication-failed`                                                                        |

A child command keeps its existing typed stage and reason in `cause`. The orchestrator does not translate it into a stronger result.

The strict failure Schema also checks each stage and reason pair against the table.

Failure JSON uses canonical encoding. Paths are repository-relative, commands are exact, and messages are deterministic.

No failure contains a temporary path, time, process identity, stack, or untyped child output.

# Negative outcomes

The focused journey must exercise these failures in temporary copies:

| Case                                | Expected M037 result                      | Existing cause                    |
| ----------------------------------- | ----------------------------------------- | --------------------------------- |
| Unknown candidate field             | `selection/invalid-selection`             | strict candidate decoder          |
| `foreign-realization.json`          | `classify/child-command-failed`           | `target/missing-declaration`      |
| `unsupported-two-state-fields.json` | `classify/child-command-failed`           | `target/unsupported-target`       |
| Corrupted artifact copy             | `artifact/execution-failed`               | failed `escript` process          |
| Changed consumer material           | `external-consumer/rejected`              | `custody/digest-mismatch`         |
| Excess evidence property            | `external-consumer/rejected`              | `decode/decode-failed`            |
| Unsupported claim marked warranted  | `accumulation/unsupported-claim-upgraded` | no stronger evidence exists       |
| Different second-run byte           | `comparison/closure-diverged`             | path and both digests are present |
| Late persistent write failure       | `publication/publication-failed`          | prior bytes are restored          |

The first case adds `"unexpected": true` to a candidate copy. The next two cases call the classification stage with the existing negative selection paths.

The artifact case flips the first copied escript byte. The custody case appends one newline to the copied Effect boundary.

The decode case adds `"unexpected": true` to the copied Effect evidence. The accumulation case changes unsupported claim 1 to `warranted`.

The comparison case changes the second staged `src/main.gleam` byte. The publication case uses a test `FileSystem` Layer that fails the final replacement.

Each failure writes no report to standard output. Each failure leaves every prior persistent byte unchanged.

The focused test calls mission-local stage functions with temporary material copies. It does not add an environment flag or CLI option to production behavior.

# Evidence statement

M037 can establish these claims:

- one public command resolved the committed Clinic input chain.
- the current exact-one theory remained applicable.
- two fresh targets qualified from separate bounded evidence.
- the explicit supervised objective selected Gleam.
- assembly retained the selected qualified bytes.
- one escript ran without BANG or the Gleam compiler.
- one clean audit requested zero requalifications.
- schema major 2 published six manifest-bound files.
- one external process returned a strict custody and decode verdict.
- one accumulated report preserved evidence source, class, scope, lifetime, assumptions, weakenings, limitations, and invalidators.
- two clean runs produced equal 22-file closures.

The warranted rows use this exact provenance:

| Row | Claim                            | Observation kind             | Source missions                                            |
| --: | -------------------------------- | ---------------------------- | ---------------------------------------------------------- |
|   1 | input-chain resolution           | `new-end-to-end-observation` | M037                                                       |
|   2 | theory applicability             | `mixed-reused-and-new`       | M030, M036, M037                                           |
|   3 | two target qualifications        | `mixed-reused-and-new`       | M031, M036, M037                                           |
|   4 | objective-relative selection     | `mixed-reused-and-new`       | M032, M036, M037                                           |
|   5 | qualified-byte assembly          | `mixed-reused-and-new`       | M033, M036, M037                                           |
|   6 | isolated artifact execution      | `mixed-reused-and-new`       | M033, M037                                                 |
|   7 | clean audit                      | `mixed-reused-and-new`       | M034, M036, M037                                           |
|   8 | schema publication               | `mixed-reused-and-new`       | M035, M036, M037                                           |
|   9 | external custody verdict         | `mixed-reused-and-new`       | M035, M036, M037                                           |
|  10 | evidence-preserving accumulation | `mixed-reused-and-new`       | M007, M010, M012, M031, M032, M033, M034, M035, M036, M037 |
|  11 | two-run closure equality         | `new-end-to-end-observation` | M037                                                       |

M037 cannot establish any claim in the unsupported-claims section.

# Falsifiers

M037 fails if:

1. An executor must read `apps/`, `packages/`, or compiler source to run the documented path.
2. The candidate needs more than `just install` and the one public candidate command.
3. The implementation changes a producer without a prior contract revision.
4. The report claims author-independent Clinic design.
5. The report labels reused evidence as a new Clinic observation.
6. The scorecard flattens evidence grades or claims universal unification.
7. A new domain, theory, provider, target, evidence class, Core construct, or BANG CLI verb appears.
8. Planning selects a target without the existing explicit objective and fresh evidence.
9. Assembly regenerates the selected Gleam boundary.
10. The artifact needs BANG, the workspace, or the Gleam compiler.
11. Audit changes clean evidence or requests a clean requalification.
12. The external consumer imports compiler internals or accepts an invalid record.
13. The report omits a required unsupported claim.
14. The report upgrades custody or decode validity to implementation conformance.
15. Two clean runs differ in one observation or output byte.
16. A failed run changes one prior persistent byte.
17. Any existing M036 Clinic or TinyBank compatibility byte changes.

# Non-goals

M037 does not provide:

- author-independent domain design.
- a new domain or a usable clinical application.
- a generic compiler driver, plugin system, or workflow engine.
- a new BANG command.
- a new Core construct, source form, theory, provider, target, or evidence class.
- a Clinic refinement, bridge, bounded channel input, solver run, or kernel proof.
- an Effect assembly.
- a database or deployment.
- HTTP, authentication, a browser, a registry, signing, upload, or attestation.
- universal synthesis, semantic unification, proof of soundness, or production readiness.

# Smallest implementation sequence

1. Add the strict candidate input, external consumer, and root script entry.
2. Declare the report and failure Schemas in the root script. Decode every public and child record with `Schema.decodeUnknownEffect`.
3. Keep path, digest, ordering, scorecard, and claim validation as pure functions. Do not create a Service for pure computation.
4. Implement the workflow with `Effect.fn`, `Effect.scoped`, and `Effect.acquireRelease`. Acquire and release worktrees, temporary directories, and staged files.
5. Use `ChildProcessSpawner` with explicit argument arrays. Do not parse prose output or run a shell command string.
6. Use `FileSystem`, `Path`, and `Crypto` for all platform work. Provide `BunServices.layer` only at `BunRuntime.runMain`.
7. Compare both staged closures, then call the existing `publishAtomically` once with all 22 entries. Do not add a second publication convention.
8. Run the positive command before adding focused negative tests. Then add the nine temporary-copy cases and the M036 parity check.

No step changes `apps/bang/src/` or `packages/`. A required producer edit stops implementation and reopens this contract.

# Size

M037 has these maximum counts:

| Item                                                                                                    | Count |
| ------------------------------------------------------------------------------------------------------- | ----: |
| Existing Clinic domain sources changed                                                                  |     0 |
| New candidate selection files                                                                           |     1 |
| New public consumer files                                                                               |     1 |
| New mission-local orchestration scripts                                                                 |     1 |
| New focused test files                                                                                  |     1 |
| New report schemas                                                                                      |     1 |
| Clean runs per command                                                                                  |     2 |
| Qualification targets                                                                                   |     2 |
| Selected plans                                                                                          |     1 |
| Assembled artifacts                                                                                     |     1 |
| External consumers                                                                                      |     1 |
| Scorecard rows                                                                                          |     6 |
| Persistent files per successful run                                                                     |    22 |
| Negative outcomes                                                                                       |     9 |
| New domains, theories, providers, targets, evidence classes, Core constructs, CLI verbs, or deployments |     0 |
| Producer source changes under `apps/bang/src/` or `packages/`                                           |     0 |

# Acceptance

1. Start from a clean checkout of the M037 candidate revision.
2. Follow only the public README and committed input.
3. Do not inspect `apps/`, `packages/`, or compiler source.
4. Run `just install`.
5. Run `bun run candidate:m037 examples/clinic/full-candidate.json`.
6. Observe only `.bang/evidence/M037.json` on standard output.
7. Strictly decode the report with `M037FullCompilerCandidateReportSchema`.
8. Observe the exact seven committed input paths and their digests.
9. Observe `Applicable` for the existing exact-one package.
10. Observe two ordered, fresh, independent `Qualified` target records.
11. Observe selection of `gleam-beam` for the supervised objective.
12. Observe assembly binding the qualified Gleam bytes by digest.
13. Run the copied escript without BANG, the workspace, or the Gleam compiler.
14. Observe the exact Clinic identities and a qualification-matching observation.
15. Observe a clean audit with zero changes, retirements, and requalifications.
16. Observe schema major 2 with the exact six files and valid manifest digests.
17. Run the committed consumer outside the workspace.
18. Observe one `valid` custody and decode verdict with the exact import list.
19. Observe exactly six scorecard rows with separate reused and new evidence labels.
20. Observe exactly 22 claim rows, including 11 unsupported claims, with no upgraded evidence class.
21. Observe two equal clean-run inventory digests and 22 equal files.
22. Strictly decode every existing M031 through M035 record that the report cites.
23. Exercise all nine negative outcomes and observe their exact stage and reason.
24. Compare persistent bytes before and after each failure. Observe no change.
25. Run `bun run evidence:m036` and observe 15 of 15 TinyBank files equal.
26. Run `bun run test:m037`.
27. Run `just verify`.

Acceptance requires all items. A successful artifact without the report, external verdict, unsupported claims, or second clean run is a failure.

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
- `examples/clinic/clinic.bang`.
- `examples/clinic/theories/packaged-exact-one.json`.
- `examples/clinic/realizations/two-qualified-exact-one.json`.
- `examples/clinic/plans/supervised-exact-one.json`.
- `examples/clinic/assemblies/supervised-exact-one.json`.
