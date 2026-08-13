# BANG monorepo map

This repository is the product boundary for all BANG work. Separate repositories may exist only for independently governed upstream dependencies, not to split BANG subsystems by convenience.

```text
bang/
├── BANG-PROJECT-DIRECTION.md   product constitution
├── spec/                       future normative Core and interchange specifications
├── packages/                   reusable BANG capabilities
│   ├── core/                   executable Core representation and validation
│   └── target-effect/          Effect TypeScript projection
├── apps/                       user-facing executables when missions require them
├── tools/                      repository/build/release tooling packages
├── examples/                   cumulative systems and conformance implementations
├── design-specs/               frozen mission and tooling contracts
├── decisions/                  accepted choices and activation conditions
└── references/                 non-authoritative prior art and historical attempts
```

## Future capability ownership

The following are expected capability zones, not pre-authorized packages:

| Capability                            | Likely home                               | Creation pressure                                          |
| ------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| BANG surface/specification language   | `packages/surface`                        | a mission needs source beyond Core JSON                    |
| elaborator and compiler orchestration | `packages/compiler`                       | more than one transformation must compose                  |
| obligation model and dispatch         | `packages/obligations`                    | the first law creates an obligation                        |
| Effect/Rust/Java targets              | `packages/target-*`                       | a mission projects to that host                            |
| BANG source LSP                       | `packages/lsp`                            | source syntax and diagnostics exist                        |
| build system                          | `packages/build` or `tools/build`         | reproducible multi-artifact builds require it              |
| theory and realization registry       | `packages/registry` plus an app if needed | reusable theory identity and retrieval are exercised       |
| BANG implementation language          | its own `packages/*` graph                | conformance kits cannot meet a demonstrated execution need |
| CLI and interactive tools             | `apps/*`                                  | a user journey requires a shipped executable               |

Dependencies point from derived capabilities toward their semantic sources. Targets depend on Core; Core never depends on targets, editor tooling, build tooling, or registries. The build system may orchestrate packages but does not own their meaning.

Do not create empty packages to reserve names. Add a boundary when one mission supplies its contract, fixtures, and executable evidence.
