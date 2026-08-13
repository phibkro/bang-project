---
id: T000
title: Effect language service and BANG monorepo boundary
status: complete
timebox: 2 focused sessions
vision_claims:
  - developer-feedback-loop
  - repository-ownership
---

# Contract

One checkout owns the complete BANG product family, and Effect TypeScript contributors receive Effect-aware diagnostics and editor behavior from the repository-pinned language server.

## Developer journey

```text
bun install
  → repository patches its pinned TypeScript and Oxlint providers
  → editor selects the workspace TypeScript-Go server
  → Effect diagnostics and quick fixes are available
  → bun run check:effect-lsp observes the real provider
```

The same checkout contains the normative specification work, compiler and target implementations, developer tools, build system, theory/realization registry, LSPs, documentation, examples, and any future BANG implementation language. A package is created only when an active mission needs its boundary.

## Semantic and ownership boundaries

| Component                | Owns                                                                      | Does not own                                 |
| ------------------------ | ------------------------------------------------------------------------- | -------------------------------------------- |
| BANG Core specification  | normative BANG meaning                                                    | Effect or TypeScript behavior                |
| `packages/core`          | current executable Core representation and validation                     | target projection                            |
| `packages/target-effect` | Effect conformance projection                                             | Core semantics                               |
| `@effect/tsgo`           | TypeScript and Effect diagnostics, navigation, quick fixes, and refactors | BANG language semantics or a future BANG LSP |
| root workspace           | dependency graph and repository-wide gates                                | package-local domain meaning                 |

## Acceptance evidence

- root `package.json` declares Bun workspaces for packages, apps, and tools;
- M000 imports Core and the Effect target through workspace package identities;
- `@effect/tsgo` is pinned exactly and configured as the sole TypeScript language server;
- the TypeScript plugin is present in the root configuration;
- VS Code-family editors are pointed at the workspace TypeScript-Go binary;
- a clean Effect project produces no configured Effect diagnostic errors;
- a deliberately floating Effect fixture produces the expected `floatingEffect` diagnostic;
- M000 and Reef checks remain green from a clean checkout.

## Non-goals

- implementing the BANG source-language LSP;
- creating empty packages for speculative subsystems;
- selecting the future BANG implementation language;
- implementing the build system or theory/realization registry;
- adopting the unpublished `effx` coordinator;
- publishing packages or creating a remote repository.

## Falsifiers

This contract fails if the editor uses a global or stock TypeScript server, Effect diagnostics are configured but never observed, the negative fixture is accepted, workspace packages reach across each other by relative path, or the language service becomes a semantic dependency of Core.

## Result

The official `@effect/tsgo@0.36.4` setup generated the TypeScript plugin, patched-provider lifecycle, Oxlint schema, and VS Code workspace settings. The repository gate reapplies the patch idempotently, checks the clean project, and observes an error-level `floatingEffect` diagnostic from a separate negative project.

M000 now crosses explicit `@bang/core` and `@bang/target-effect` workspace dependencies. No speculative build, registry, source-LSP, or implementation-language packages were created.
