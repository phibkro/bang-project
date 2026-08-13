# 0004 — Keep state-machine runtimes behind target projection

- **Status:** accepted
- **Date:** 2026-08-13

## Decision

BANG Core owns state declarations, enabled transition relations, invariants, and
their obligations. It does not adopt a TypeScript state-machine runtime as Core
semantics. Effect target adapters may project those contracts into a runtime
when an active mission requires runtime state observation, entry and exit
behavior, event processing, cancellation, hierarchy, or persistence.

M006 continues with direct Effect service, error, requirement, and Layer
projection. Its `Account.withdraw` journey is a checked operation over explicit
state, not yet a persistent actor lifecycle.

```text
BANG state relation (normative)
          |
          v
Effect target contract
          |
          v
optional runtime adapter (derived)
```

## Effstate evaluation

[`@handfish/effstate-v4`](https://github.com/Handfish/effstate) was evaluated as
the first external candidate. Its schema-first tagged states and events, Effect
requirements and failures, entry and exit effects, run streams, and automatic
cancellation are directionally aligned with later BANG runtime projection.

It is not added now:

- package version `0.0.6` declares `effect: ^3.0.0` and is developed against
  Effect `3.19.12`, while BANG targets Effect v4 RC;
- the `v4` suffix refers to Effstate's API package and does not establish Effect
  v4 compatibility;
- Effstate's own README recommends Effect's proposed native Machine for
  greenfield work, but the referenced
  [Effect PR 6429](https://github.com/Effect-TS/effect/pull/6429) is closed and
  unmerged, and the current official Effect repository exposes no
  `effect/unstable/machine` module;
- M006 does not exercise the runtime features that would justify accepting the
  dependency and adapter surface.

This is a compatibility and scope decision, not a rejection of Effstate's model
or implementation quality.

## Activation condition

Re-evaluate a runtime adapter when an active mission requires at least one of:

- a long-lived event-driven machine with observable snapshots;
- entry, exit, or state-scoped streaming behavior;
- cancellation when leaving a state;
- hierarchical or parallel states;
- persisted or distributed machine execution.

M008 runtime trace observation is the earliest planned pressure point. At that
time compare the live official Effect surface, an Effect-v4-compatible Effstate
release, and other maintained candidates. The adapter must remain a projection
of checked Core, with target weakening and extra runtime assumptions recorded as
evidence.

## Sources checked

- Effstate README and source at repository head `849de3e`;
- `@handfish/effstate-v4@0.0.6` registry metadata and package manifest;
- Effect PR 6429 status through the GitHub API;
- the official sibling Effect checkout and current remote tree for a native
  Machine module.
