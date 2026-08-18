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
│   ├── evidence/               checked observations, replay envelopes, accumulated reports, and M018 trace checks
│   ├── target-effect/          Effect TypeScript projection, including the M018 single-use boundary
│   ├── target-gleam/           Gleam/BEAM actor projection
│   ├── target-rust/            Rust projection
│   └── theories/               reusable Schema-backed theory consumers
├── apps/                       user-facing executables
│   └── bang/                   shipped report, check, ledger, normalize, explain, classify, trace, project, and database commands
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

[Decision 0011](../decisions/0011-semantic-data-service-exploration.md) defines the current exploration. [M026](../design-specs/M026-semantic-database.md) completes its first persistent reactive tracer. [M027](../design-specs/M027-cross-entity-transfer.md) completes its cross-entity tracer.

`bang database` derives a SQLite schema and typed Effect boundary from a checked project. M027 adds explicit composition links, a reusable transfer obligation, one atomic transaction, and reactive Account and TotalFunds observations.

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
