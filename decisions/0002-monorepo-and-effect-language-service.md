# 0002 — One BANG monorepo with the Effect language service for TypeScript work

- **Status:** accepted
- **Date:** 2026-08-13

## Decision

This repository owns the whole BANG product family: specifications, Core, compiler and target code, conformance tools, LSPs, build system, theory and realization registry, examples, documentation, and any future BANG implementation language.

Bun workspaces express package boundaries. New packages require an active mission and an independently meaningful capability; the repository does not reserve the future architecture with empty directories.

TypeScript work uses exact `@effect/tsgo@0.36.4` as its sole TypeScript language server. The root configuration enables `@effect/language-service`, explicitly makes core correctness diagnostics errors, and directs VS Code-family editors to the patched workspace TypeScript-Go installation.

## Authority boundary

`@effect/tsgo` owns TypeScript and Effect-aware diagnostics, navigation, completions, quick fixes, and refactors. It does not define BANG Core, project BANG source semantics, or substitute for a future BANG language server.

The root workspace owns dependency and verification orchestration. Package-local contracts own their domain behavior. `packages/core` cannot depend on targets, editor tooling, build tooling, or registries.

## Evidence

`bun run check:effect-lsp` invokes the installed provider twice:

1. the root project has no configured Effect diagnostic errors;
2. `fixtures/effect-lsp-invalid` fails with an error-level `floatingEffect` diagnostic.

`bun run check` patches the pinned providers before compiling and includes this counterexample. This is test observation of the installed version, not a proof of every editor integration.
