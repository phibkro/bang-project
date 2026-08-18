---
id: M025
title: Single-authority TinyBank project composition
status: complete
timebox: 5 focused sessions
vision_claims:
  - explicit-project-composition
  - single-source-authority
  - heterogeneous-theory-selection
  - authored-evidence-policy
depends_on:
  - M014
  - M018
  - M021
  - M022
  - M023
  - M024
---

# Mission

BANG evaluates one TinyBank project through one shipped command.

The project names its semantic sources, reusable theory applications, realization candidates, target adapters, evidence inputs, bounded channel analysis, and evidence policy once. The command builds one checked semantic artifact from the project-owned source list and passes that artifact to existing theory and realization boundaries. No child selection owns or rediscovers the semantic source list.

# User claim

> I can describe the TinyBank project once and ask BANG which theories apply, which realizations qualify or fail, what the bounded channel schedules establish, and whether those results satisfy my explicit evidence policy.

# User journey

The shipped journey runs:

```sh
bang project examples/tiny-bank/project.json
```

The report contains these distinct conclusions:

- `ExactOneCapabilityExecution@1` is applicable and derives four obligations;
- the Effect TypeScript realization is `Qualified`;
- the Gleam/BEAM realization is `Rejected` with its target-owned reason;
- bounded channel schedules remain individually `Satisfied`, `Violated`, or `Unresolved`;
- assumptions, unsupported target evidence, and unresolved observations are reported under the authored project policy;
- one project-policy decision is reported separately from all semantic and evidence conclusions.

The command emits deterministic text for unchanged inputs. A failed project evaluation emits no partial report.

# Stable semantic boundary

M025 does not add a Core declaration or change Core semantics.

The project is an application composition root over existing boundaries:

```text
project-owned source modules
  -> decoded and checked Core union
  -> normalized semantic artifact
  -> ExactOneCapabilityExecution@1
  -> Effect and Gleam realization classifications

project-owned bounded channel selection
  -> deterministic M024 scheduler
  -> BoundedChannelProtocol@1 report

classification + channel report + authored evidence policy
  -> typed project report
```

The exact-one and bounded-channel theories keep different inputs, judgments, and result vocabularies. Project composition does not collapse them into a generic proposition or one truth grade.

# Project selection

The strict version-one project input contains:

```text
bangProject: 1
id: ProjectIdentity
sources: NonEmptyArray<ProjectSource>
theories: exactly one ExactOneTheoryApplication
targets: Effect and Gleam target identities
realizationProfiles: one profile selection for each target
evidence: exactly one M018 evidence input
channels: exactly one bounded-channel analysis
evidencePolicy: ProjectEvidencePolicy
```

## Source modules

Each source contains:

- a project-local stable identity;
- one repository-relative path;
- `bang-source` or `core-json` format.

Source identities and source paths are unique. Every source path is declared only in this project list. The command reads, decodes, merges, validates, and normalizes these sources once.

A theory, realization profile, or evidence input refers to project identities. It does not carry another source path or child explanation-selection path.

## Theory application

The first theory application contains:

- a project-local application identity;
- theory identity `ExactOneCapabilityExecution`;
- theory version `1`;
- the source-module identity that owns the selected construct;
- the stable exact-one capability requirement address.

The theory consumes the project-built encoded semantic artifact through the existing independent consumer. The project must not call the M022 file-selection loader.

## Targets and realization profiles

The project declares target identities once. Version one supports exactly:

- `effect-typescript`;
- `gleam-beam`.

Each realization-profile selection refers to:

- one theory-application identity;
- one target identity;
- one checked realization identity;
- one evidence-input identity.

There is exactly one profile for each selected target. Both profiles must refer to the realization selected by the exact-one requirement address.

The existing M023 classification judgments remain authoritative for profile classification. The project does not call the M023 file-selection loader and does not synthesize a second classification model.

## Evidence input

Version one supports one evidence input of kind `m018-single-use-capability`.

The input owns one repository-relative material path. Existing M018 Schema validation, checked-Core identity checks, artifact-source matching, and material-digest verification remain required.

## Bounded channel analysis

The project declares one channel-analysis identity with:

- theory identity `BoundedChannelProtocol`;
- theory version `1`;
- one repository-relative M024 selection path.

The channel selection is not a Core source list. It remains the existing versioned protocol-and-schedule input. The project invokes the existing M024 decoder, validator, deterministic scheduler, evaluator, and report boundary.

M024 evidence remains one runtime-checked bounded deterministic in-process observation. Project composition does not turn it into real-network, replayable, durable, fair, live, or distributed evidence.

# Evidence policy

The project author explicitly selects how the composition root treats three evidence conditions:

```text
assumptions: report | reject
unresolved: report | reject
unsupportedByTarget: report | reject
```

The canonical TinyBank project selects `report` for all three conditions. This allows one report to retain the Effect assumptions, Gleam target rejection, and unresolved dropped-acknowledgement schedule.

A policy decision is an authored project acceptance decision. It is not a theorem, Core judgment, target result, or evidence upgrade.

Policy evaluation occurs only after all selected theory, realization, and channel results are available. If a selected condition is `reject`, the command returns a typed `policy-rejected` failure and emits no partial project report.

Policy conditions are detected as follows:

- `assumptions`: any realization classification contains one or more assumptions;
- `unsupportedByTarget`: any realization classification is `Rejected` or carries `unsupported-by-target` assessment evidence;
- `unresolved`: any realization classification is `Unknown`, any assessment is unresolved, or any channel schedule is `Unresolved`.

A channel `Violated` result remains a counterexample for its encoded adversarial schedule. It is not automatically a project-policy rejection in M025.

# Project report

The strict version-one report contains:

- project identity;
- the semantic-artifact identity and source provenance;
- the exact typed theory result;
- every typed M023 classification result;
- the exact typed M024 channel report;
- the authored evidence policy;
- an `Accepted` policy decision;
- each reported policy condition and its stable subject identity.

The report preserves these vocabularies:

| Concern                    | Result vocabulary                                          |
| -------------------------- | ---------------------------------------------------------- |
| theory applicability       | `Applicable` or `NotApplicable`                            |
| realization classification | `Admissible`, `Qualified`, `Rejected`, or `Unknown`        |
| bounded channel obligation | `Satisfied`, `Violated`, or `Unresolved`                   |
| project policy             | `Accepted` after all selected reject conditions are absent |

The report Schema rejects duplicate identities, unresolved project references, a mismatched artifact or theory identity, missing target profiles, and a policy decision inconsistent with its typed contents.

# Composition judgment

Let `P` be a decoded project, `S` its checked source union, `A` its checked semantic artifact, `T` its theory result, `R` its realization classifications, `C` its bounded channel report, and `E` its authored evidence policy.

```text
P owns every input path and every project-local reference resolves
S checks and normalizes with complete source provenance
A consumes with clean-run parity
T is derived from A by the selected versioned theory
R classifies every selected target against T and checked M018 evidence
C evaluates the selected bounded channel schedules
E accepts or reports every detected evidence condition
---------------------------------------------------------------------
BANG |- evaluateProject(P) : AcceptedProjectReport
```

This judgment establishes successful project composition under the authored policy. It does not prove every selected implementation or channel behavior.

# Positive fixture

`examples/tiny-bank/project.json` names:

- `examples/tiny-bank/account.bang` exactly once;
- the exact-one requirement on `WithdrawAccountOnce`;
- Effect TypeScript and Gleam/BEAM targets once each;
- `.bang/evidence/M018.json` once;
- `examples/tiny-bank/channels/two-owner.json` once;
- a report-only evidence policy.

The command reports:

- one applicable exact-one result with four obligations;
- one qualified Effect classification;
- one rejected Gleam classification with target rejection details;
- all six M024 schedules in encoded order;
- three satisfied, two violated, and one unresolved schedule;
- reported assumptions, unsupported-target evidence, and unresolved evidence;
- `Project policy: Accepted`.

# Negative fixtures

1. Duplicate source identity: reject before source loading.
2. Duplicate source path under another identity: reject before source loading.
3. Unknown theory source, target, theory application, evidence, or channel reference: reject before evaluation.
4. Unsafe project or nested input path: reject before file access.
5. Unbounded capability requirement with selected realization profiles: return typed `inapplicable-theory` and no partial report.
6. M018 source mismatch: return typed `evidence-source-mismatch` and no partial report.
7. Stale M018 material: return the existing typed stale-material reason and no partial report.
8. Invalid channel causal parent: reject before channel execution and emit no partial report.
9. Rejecting unsupported-target policy: return typed `policy-rejected` for the Gleam target and no partial report.
10. Malformed project input: return a typed Schema failure and no partial report.

# Determinism

- Project source order is encoded order and remains semantic for the Core declaration union.
- Target classifications use stable Effect-then-Gleam order.
- Channel analyses and schedules retain encoded order.
- Policy-condition output uses `assumptions`, `unsupported-by-target`, then `unresolved` order.
- Identity sets and material lists are sorted where input order has no semantic meaning.
- Unchanged inputs produce byte-identical text and typed report values.

# Failure contract

A project failure retains:

- stage;
- project or nested input path;
- typed reason;
- stable project, Core, theory, target, evidence, or channel identity when available;
- source span for BANG parse failures.

Stages are:

- `project`;
- `source-read`;
- `source-decode`;
- `core-validation`;
- `artifact`;
- `theory`;
- `evidence`;
- `target`;
- `classification`;
- `channel`;
- `policy`;
- `report`.

A failed command writes one diagnostic to standard error, exits nonzero, and writes no successful project report to standard output.

# Architecture ownership

- `@bang/core` retains Core validation, normalization, semantic-artifact production, and clean parity.
- `@bang/surface` retains BANG source parsing and deterministic lowering.
- `@bang/theories` retains exact-one and bounded-channel judgments plus M023 profile classification.
- target packages retain target projection and target-owned rejection.
- `@bang/evidence` retains M018 evidence decoding, checking, and material verification.
- `apps/bang` owns the project selection, authored evidence policy, composition orchestration, report formatting, and CLI command.

No new package is authorized by M025.

# Non-goals

M025 does not:

- add a Core project, module, import, theory, profile, channel, or policy construct;
- create a general module calculus or generic dependency graph;
- unify M012 report roles or M021 baseline/candidate selections;
- create dynamic provider, target, or theory registries;
- discover packages or inputs implicitly;
- publish, download, resolve, or migrate remote libraries;
- rank realization candidates or call one target best;
- add an objective or realization plan;
- generate a business implementation;
- persist or continuously invalidate a project evidence graph;
- claim a real network, durable delivery, recovery, fairness, liveness, productivity, or distributed exactly-once execution;
- upgrade bounded checks, runtime observations, assumptions, or target rejection into proof.

# Falsifiers

M025 fails if:

- a child M022 or M023 selection remains necessary to discover semantic source paths;
- changing an undeclared child source changes the project result;
- the project report collapses applicability, classification, channel, or policy results into one boolean;
- a report-only policy silently accepts evidence by deleting its qualification;
- a reject policy prints a partial successful report;
- project composition changes Core, M022, M023, or M024 semantics;
- a generic registry or new package appears without an independently demonstrated capability;
- the command claims stronger M024 evidence than the bounded in-process run establishes.

# Acceptance

1. Run the canonical project command.
2. Observe one project-owned source path and no child explanation-selection path.
3. Observe the exact-one theory result and four obligation identities.
4. Observe Effect `Qualified` and Gleam `Rejected` with unchanged evidence qualifications.
5. Observe all six channel schedules and their separate result classes.
6. Observe the three policy conditions as reported and the authored `Accepted` decision.
7. Run the canonical command twice and compare identical output bytes.
8. Exercise every negative fixture and observe typed failure with empty standard output.
9. Run focused project, theory, evidence, target, channel, and CLI checks.
10. Run `just verify`.

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `CAPABILITIES.md`;
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`;
- `design-specs/M014-cohesive-system-cli.md`;
- `design-specs/M018-single-use-capability.md`;
- `design-specs/M021-construct-addressed-normalization.md`;
- `design-specs/M022-versioned-theory-explanation.md`;
- `design-specs/M023-realization-classification.md`;
- `design-specs/M024-bounded-channel-trace.md`;
- `examples/tiny-bank/account.bang`;
- `examples/tiny-bank/channels/two-owner.json`.
