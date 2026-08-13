# BANG

BANG specifies software systems as networks of related theories and projects their accumulated contracts into executable conformance boundaries.

The first completed vertical missions are [M000 executable specification spine](design-specs/M000-executable-specification-spine.md), [M001 refined domain value](design-specs/M001-refined-domain-value.md), and [M002 one theory and one finite model](design-specs/M002-one-theory-one-model.md). [M003 generated algebraic law suite](design-specs/M003-generated-law-suite.md) is active. The [capability dependency map](CAPABILITIES.md) records the current route without treating unexercised architecture as settled.

This is the monorepo for the whole BANG project: specification language, Core, compilers, target projections, conformance tools, build system, theory and realization registry, documentation, and any future implementation language. See the [repository map](docs/repository-map.md). Subsystems become packages only under pressure from an active mission.

## Experience the current capability

```sh
just install
just preview
```

The current demonstrations decode a Core service, a refined `Balance`, a finite Account Lifecycle model, and an integer-addition law; reject invalid declarations; generate Effect boundaries and an Effect Vitest property suite; return finite and shrunk property counterexamples; and write scoped evidence manifests under `.bang/evidence/`.

The install prepares the pinned `@effect/tsgo` language server. VS Code-family editors use the repository settings under `.vscode/`; other editors should invoke the executable reported by `bunx effect-tsgo get-exe-path`. Run `bun run check:effect-lsp` to observe both the clean project and a deliberately floating Effect counterexample.

Run `just` to list the repository task surface. `just verify` is the same readiness contract used by GitHub Actions. Native Git hooks apply safe fixes and static checks before commits, enforce Conventional Commits, and run tests before pushes.

Read [BANG-PROJECT-DIRECTION.md](BANG-PROJECT-DIRECTION.md) for the project constitution. The three previous attempts remain external historical references; they are not merged into this repository.

## Repository identity

This project is published as [`phibkro/bang-project`](https://github.com/phibkro/bang-project). The existing `phibkro/bang`, `phibkro/bang-lang`, and `phibkro/semantic-systems` repositories remain attached to earlier attempts and serve only as historical references.
