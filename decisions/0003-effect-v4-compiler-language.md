# 0003 — Use Effect v4 as the BANG compiler implementation language

- **Status:** accepted
- **Date:** 2026-08-13

## Decision

Effect v4 is the primary implementation language and standard library for the BANG compiler and tooling. TypeScript 7 is the substrate on which that language is expressed. Total dependency-free leaf computations remain direct functions; host interop belongs in existing Effect platform services or concrete Layer implementations.

This implementation choice does not make Effect normative BANG semantics. The formal Core specification owns the meaning of theories, terms, laws, models, satisfaction, obligations, and evidence. Effect implements those rules and is also the first realization target.

```text
formal BANG Core semantics
          |
          v
Effect v4 compiler implementation
  Schema -> checked Core -> obligations
          |                   |
          v                   v
  reasoning providers      target adapters
  SMT / Alloy / TLA+       Effect / Rust / Java
```

## Implementation rules

- Use Effect Schema for encoded Core, public artifacts, domain values, staged representation changes, and typed public failures.
- Represent semantic phase changes explicitly. Raw JSON decodes to structural Core; a named Schema transformation runs semantic analysis and produces branded checked Core.
- Make target adapters and reasoning providers consume checked or normalized Core, never arbitrary decoded declarations.
- Use Effect programs for typed failure, orchestration, capabilities, resources, concurrency, and provider dispatch.
- Search Effect's core, platform, and unstable modules before defining a project Service. Reuse an existing service when it already expresses the capability.
- Define a project Service only when it adds a domain contract, policy, or capability that the existing Effect surface does not express. Put concrete runtimes and vendors in Layer implementations.
- Keep Effects open in reusable packages. Select platform Layers and execute them with the platform Runtime only at composition roots.
- Use the sibling official Effect checkout as API and idiom authority.

## Why

BANG needs explicit representation boundaries, typed diagnostics, composable provider effects, resource-safe external tools, deterministic orchestration, and multiple target interpretations. Effect supplies one coherent language for those concerns while Schema can express the encoded-to-checked Core boundary.

The separation between BANG meaning and Effect implementation remains essential. A solver result, Schema decode, generated test, or Effect type cannot silently become a BANG proof rule.

## Evidence and limits

M005 is the first mission to require a branded checked Core document at a target adapter boundary. This statically prevents the new bridge projector from accepting a merely structural decoded document without an explicit unsafe cast.

TypeScript casts and foreign JavaScript can bypass the brand. The compiler therefore still records unsafe host boundaries as assumptions; branding is static phase separation, not a proof of semantic soundness.
