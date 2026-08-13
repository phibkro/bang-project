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

## Compatibility update

On 2026-08-13, plugin source commit `a6a4903b2665154c986001ea4f11b2e3194ff03b` declared exact review of Effect `4.0.0-rc.108`, TypeScript `7.0.2`, Oxlint `1.77.0`, Oxfmt `0.61.0`, and `@effect/tsgo@0.36.4`. The source commit is on the public `main` branch.

The npm registry still serves `@phibkro/oxlint-effect-plugin@0.1.0` with the older exact Effect `4.0.0-beta.102` and Oxlint `1.76.0` contract. Installing the registry package would therefore violate this decision. A clean Bun Git consumer probe also showed that installing the Git commit directly is invalid: `dist/` is intentionally untracked and the package has no Git-dependency preparation lifecycle, so its exported entrypoint is absent.

Adoption remains blocked only on publishing a clean RC-compatible distribution. Do not substitute a local file dependency or a vendored build that GitHub Actions cannot reproduce.
