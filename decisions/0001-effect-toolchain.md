# 0001 — Start on Effect v4 RC; gate plugin adoption on published compatibility

- **Status:** accepted
- **Date:** 2026-08-13

## Decision

M000 uses Effect `4.0.0-rc.108`, TypeScript `7.0.2`, Bun, Oxfmt, and Oxlint.

`@phibkro/oxlint-effect-plugin` and its `effx` coordinator are not yet authoritative repository gates. Adopt them when a published package:

1. declares a reviewed compatibility contract covering the exact selected Effect release;
2. exposes the intended plugin or `effx check` consumer surface;
3. passes its packed isolated consumer journey;
4. can be installed without depending on a dirty local worktree.

## Evidence

On 2026-08-13 the npm registry exposed only plugin version `0.1.0`. Its installed package metadata declared:

```json
{
  "reviewed": "4.0.0-beta.102",
  "reviewPolicy": "exact"
}
```

The selected BANG runtime is `4.0.0-rc.108`; therefore the published compatibility claim does not cover this project.

During scaffolding the plugin did execute against the RC and rejected untyped throws in Core. BANG changed semantic validation to use `Effect<CoreDocument, SemanticError>`. This is useful test observation, not compatibility evidence.

## Consequence

BANG starts on the current RC without silently weakening the plugin's support policy. Plain Oxlint remains active. The richer Effect gate becomes a small dependency transition once its activation conditions hold.
