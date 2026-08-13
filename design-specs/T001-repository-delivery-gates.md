---
id: T001
title: Public repository delivery gates
status: complete
timebox: 3 focused sessions
vision_claims:
  - durable-public-history
  - repository-quality-gates
---

# Contract

BANG has one public GitHub repository whose local and remote transitions reject malformed commits and unverified code.

## Developer journey

```text
just install
  → hooks become active
  → commit safely fixes staged source, then checks static analysis
  → malformed commit message is rejected
  → push runs tests locally
  → GitHub verifies check + tests + M000 + build
  → main requires the GitHub verification context
```

## Acceptance evidence

- `Justfile` declares install, build, check, fix, test, verify, dev, and preview;
- pre-commit refuses partially staged files, fixes only fully staged paths, restages exactly those paths, then runs `just check`;
- commit-msg accepts a valid Conventional Commit and rejects an invalid message;
- pre-push runs `just test`;
- GitHub Actions runs `just verify` on pull requests and pushes to main;
- GitHub main-branch protection requires the `verify` status check;
- a clean checkout passes `just verify` with install lifecycle scripts disabled;
- the repository is public at `phibkro/bang-project`.

## Evidence scope

Hooks are advisory because Git permits bypassing them. GitHub branch protection and the required Actions check are the authoritative merge boundary. Actions verify the checked revision; they do not prove BANG semantics.

## Provenance

The task facade, conventional-commit hook, pre-push test, and GitHub quality structure adapt the live Reef foundry at local Reef commit `8ca2d33a6fa205c689d3d2b9f4168b9830c072b8`. The foundry files are uncommitted there, so BANG owns these local adaptations until an exact foundry export becomes addressable.

Effect coding guidance comes from the official sibling checkout `../effect` at `2e1ddbebd9dd5cf0738ea08b2e832a7c39ae990f`, especially `LLMS.md`, `packages/effect/SCHEMA.md`, and the linked `ai-docs` examples.

## Non-goals

- deployment or preview infrastructure;
- package publication;
- automated releases;
- adopting unpublished Reef exports;
- beginning the next BANG semantic mission.

## Result

- Public repository: <https://github.com/phibkro/bang-project>
- Clean-run evidence: <https://github.com/phibkro/bang-project/actions/runs/31728798187>
- Required check: `verify`, supplied by GitHub Actions and required on up-to-date `main`
- Local positive evidence: `just verify`, valid Conventional Commit, and pre-push tests passed
- Local negative evidence: malformed commit input and a partially staged pre-commit file were both rejected
- Corrected assumption: root type-checking initially depended on an ignored generated M000 port; the independent implementation now has a dedicated generated-artifact type-check boundary
