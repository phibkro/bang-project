# BANG monorepo map

This repository is the product boundary for all BANG work. Separate repositories may exist only for independently governed upstream dependencies, not to split BANG subsystems by convenience.

```text
bang/
├── BANG-PROJECT-DIRECTION.md   product constitution
├── spec/                       future normative Core and interchange specifications
├── packages/                   reusable BANG capabilities
│   ├── core/                   executable Core representation and validation
│   ├── surface/                spanned BANG source parsing and deterministic Core lowering
│   ├── obligations/            checked solver-neutral relational obligations and providers
│   ├── evidence/               checked observations, target qualification records, replay envelopes, and accumulated reports
│   ├── target-effect/          Effect TypeScript projection and checked-shape exact-one qualification
│   ├── target-gleam/           Gleam/BEAM actor projection and checked-shape exact-one qualification
│   ├── target-rust/            Rust projection
│   ├── planning/               strict objectives, target contributions, and deterministic realization plans
│   └── theories/               reusable Schema-backed theory consumers
├── apps/                       user-facing executables
│   └── bang/                   shipped report, check, ledger, normalize, explain, classify, plan, assemble, audit, trace, project, database, evolve, and export-schemas commands
├── tools/                      repository/build/release tooling packages
├── examples/                   cumulative systems and conformance implementations
├── design-specs/               frozen mission and tooling contracts
├── decisions/                  accepted choices and activation conditions
└── references/                 non-authoritative prior art and historical attempts
```

The TinyBank example includes the completed M015, M017, and M018 fixtures. The M020 fixtures are in `examples/family-ledger/`.

M019 adds one shipped self-check against the real `@bang/core` decoder. M021 provides construct-addressed normalization.

M021 does not move the M020 accounting rules into Core. M022 is complete through `bang explain`.

M023 is complete through `bang classify`. M024 is complete through `bang trace`.

The M024 tracer distinguishes logical messages, delivery attempts, observed order, causality, loss, and coordination. It does not claim real-network delivery or distributed exactly-once delivery.

M025 is complete through `bang project`. One project-owned selection composes the exact-one theory, Effect and Gleam classifications, bounded channel analysis, and authored evidence policy. It does not use a hidden source list.

[Decision 0011](../decisions/0011-semantic-data-service-exploration.md) defines the current exploration. [M026](../design-specs/M026-semantic-database.md) completes its first persistent reactive tracer. [M027](../design-specs/M027-cross-entity-transfer.md) completes its cross-entity tracer. [M028](../design-specs/M028-versioned-semantic-evolution.md) completes its first versioned evolution tracer.

`bang database` derives a SQLite schema and typed Effect boundary from a checked project. M027 adds explicit composition links, a reusable transfer obligation, one atomic transaction, and reactive Account and TotalFunds observations. `bang evolve` compares baseline and candidate normalized Core, classifies dependency-scoped compatibility, preserves or rejects qualified evidence, and updates semantic-version metadata atomically without changing Account rows during cutover.

[Decision 0012](../decisions/0012-semantic-process-architecture-and-reuse-boundary.md) defines the compiler process boundary. Semantic processes stay in BANG packages. External tools connect through typed provider, target, runtime, and artifact adapters.

[M029](../design-specs/M029-second-domain-theory-portability.md) applies the unchanged exact-one theory to a second domain through `bang explain`. Inventory and TinyBank use the same artifact, premise, obligation, and report boundaries. No Inventory identifier enters reusable compiler or theory code.

[M030](../design-specs/M030-local-theory-package-consumption.md) makes that theory a canonical local package under `packages/theories/theory-packages/`. `bang explain` verifies its identity, version, semantic digest, evaluator support, and evaluator agreement before atomically publishing a deterministic lock under `.bang/theory-locks/`.

[M031](../design-specs/M031-two-target-exact-one-qualification.md) adds a version-two `bang classify` journey. It stages M030 package consumption, executes fresh Effect and supervised Gleam/BEAM exact-one probes, validates independent target evidence, and publishes the full qualification closure only after both classifications succeed. M023's version-one classification and M017's unbounded actor projection remain unchanged.

[M032](../design-specs/M032-objective-relative-realization-planning.md) adds `bang plan`. It reruns the fresh M031 qualification pipeline, consumes checked target-owned contributions, and matches explicit operational demands without scoring or hidden defaults. Selected, incomparable, and no-plan results preserve premises, evidence scope, assumptions, weakenings, lifetime, and invalidators. One transaction publishes the qualification and plan closure or restores all prior bytes.

[M033](../design-specs/M033-selected-realization-assembly.md) adds `bang assemble`. It reruns the staged M032 plan, binds the M031-qualified Gleam boundary by SHA-256, exports a canonicalized Erlang escript with pinned toolchain materials, runs it once as a separate process, and compares the observation against M031 evidence. One transaction publishes the qualification, plan, project materials, artifact, and assembly record or restores all prior bytes. The published artifact runs through `escript` without BANG.

[M034](../design-specs/M034-evidence-invalidation.md) adds `bang audit`. It resolves one published assembly record, inventories every recorded material across the closure records — assembly materials, plan report, target evidence records, semantic artifact, theory lock, and the recorded theory package — recomputes each SHA-256 through the Crypto service, and classifies every member by its equality class: decoded materials compare semantically (Core sources by construct-addressed normalization, the theory package by canonical semantic digest), opaque custody bytes compare exactly, and derived members resolve through their owning producer or fail comparison. Retirement closes transitively over recorded citation edges only; requalification reruns only retired producers through the staged M030–M033 journeys while preserving evidence classes; closure parity is verified before any commit and the fresh closure republishes in one atomic transaction.

[M035](../design-specs/M035-external-extension-boundary.md) adds `bang export-schemas`. It generates one versioned publication under `dist/schemas/1/` — a digest-pinned manifest, three JSON Schema documents compiled from the live producer Schemas through Effect's JSON Schema generation, and consumer types with strict JSON decoders — replacing any same-version publication atomically with byte-identical output. The focused consumer journey copies only the publication and real artifact bytes into a temporary directory outside the workspace, runs a script importing solely publication entries plus node built-ins, verifies every recorded SHA-256 custody digest, strictly decodes the theory lock and evidence record, checks their agreement on theory identity, version, and package semantic digest, and prints one typed verdict; eight negative fixtures pin every rejection stage from publication custody through record agreement.

[M036](../design-specs/M036-second-domain-realization-boundary-portability.md) is complete at protected revision `5e45b1242c74c6a5306b0817ddd08814b68292a9`.

Its positive inputs are under `examples/clinic/`. Checked Core supplies the Clinic machine, operation, state, capability, failure, and realization identities.

`target-effect` and `target-gleam` project the same checked shape. Each target owns its decrement cases, lifetime, and runtime policy.

The targets run fresh probes and publish separate evidence. Planning selects Gleam, and assembly binds the qualified Gleam bytes without regenerating them.

The copied escript runs with only an Erlang runtime. Audit checks the unchanged 18-material closure and requests no requalification.

Schema publication major 2 accepts the checked-Core-selected observation identities. All six seeded major-1 files remain unchanged.

The external consumer uses strict decode, custody, and record agreement only. Its loader observes only the sandbox consumer, published consumer module, and required Node built-ins.

No package or CLI verb was added. M036 does not add a generic target plugin protocol or move target-owned decrement behavior into Core.

[M037](../design-specs/M037-full-compiler-candidate.md) is active. It adds one mission-local root script, one strict selection, one public consumer, and one accumulated report.

The command composes existing Clinic explanation, qualification, planning, assembly, audit, schema publication, and external consumption. It adds no BANG CLI verb.

The report separates historical mission citations from current digest-bound sources and new observations. It does not copy or combine evidence grades. Its six-family scorecard does not claim author-independent Clinic design or universal unification.

M018 keeps the quantity judgment in checked Core. The Effect target owns the grant state and its atomic consumption.

## Future capability ownership

The following are expected capability zones, not pre-authorized packages:

| Capability                            | Likely home                               | Creation pressure                                                          |
| ------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| elaborator and compiler orchestration | `packages/compiler`                       | more than one transformation must compose                                  |
| host and programming-language targets | `packages/target-*`                       | a mission projects checked meaning into one host or language               |
| semantic data-service compiler        | `packages/compiler` plus target packages  | one mission derives a real schema and interaction contract                 |
| database target adapters              | `packages/target-*`                       | one mission executes generated constraints against an existing database    |
| reactive client bindings              | a target package or `apps/*`              | one client queries, subscribes, and dispatches through a generated binding |
| BANG source LSP                       | `packages/lsp`                            | source syntax and diagnostics exist                                        |
| build system                          | `packages/build` or `tools/build`         | reproducible multi-artifact builds require it                              |
| theory and artifact distribution      | `packages/registry` plus an app if needed | reusable theory identity, retrieval, and provenance are exercised          |
| BANG implementation language          | its own `packages/*` graph                | conformance kits cannot meet a demonstrated execution need                 |
| CLI and interactive tools             | `apps/*`                                  | a user journey requires a shipped executable; `apps/bang` now owns M014    |

Dependencies point from derived capabilities toward their semantic sources. Targets depend on Core; Core never depends on targets, editor tooling, build tooling, or registries. The build system may orchestrate packages but does not own their meaning.

Do not create empty packages to reserve names. Add a boundary when one mission supplies its contract, fixtures, and executable evidence.
