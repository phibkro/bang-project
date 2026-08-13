# 0004 — Select effect-machine for Effect state-machine projection

- **Status:** accepted
- **Date:** 2026-08-13

## Decision

[`@typeonce/effect-machine`](https://github.com/typeonce-dev/effect-machine) is
the preferred runtime and model-testing adapter for BANG state machines projected
to Effect. It remains a target projection: BANG Core owns state vocabulary,
event vocabulary, transition relations, invariants, and evidence obligations.
The library does not define normative Core semantics.

Install and integrate the package only when an active vertical mission executes
the projection. M006 continues with a direct Effect service, typed failure,
requirement, and Layer boundary because it exercises one effectful operation,
not a long-lived event-driven machine. M008 runtime trace observation is the
earliest planned full runtime integration.

```text
BANG state contract (normative)
          |
          v
effect-machine definition + tests (derived Effect projection)
          |
          +--> pure planning and bounded exploration
          +--> managed MachineRef runtime and causal probes
          +--> Atom / cluster adapters when separately required
```

## Why this adapter

Release `0.7.0` has an exact `effect@4.0.0-rc.108` peer dependency, matching
BANG's pinned Effect version. Its architecture maps closely to BANG's existing
semantic boundaries:

| BANG concern                   | effect-machine surface                 |
| ------------------------------ | -------------------------------------- |
| encoded states and events      | Effect Schema protocols                |
| state topology                 | `Machine.defineStates`                 |
| pure transition interpretation | synchronous planner                    |
| executable state evolution     | managed `MachineRef` runtime           |
| generated scenarios            | Schema-derived `MachineTest.scenarios` |
| invariant evaluation           | planner trace invariants               |
| bounded model exploration      | breadth-first `MachineTest.explore`    |
| graph output                   | Effect `Graph` exploration result      |
| causal runtime observation     | probes and acknowledged commands       |
| persistence                    | encoded logical snapshots              |
| host-specific realization      | runtime, Atom, and cluster entrypoints |

Bounded exploration explicitly reports whether it is complete or truncated by
depth, state, or transition limits and retains a frontier. This matches BANG's
requirement that bounded model checking never be presented as universal proof.

The planner keeps transition, entry, exit, choice, and initialization callbacks
synchronous. Effects become explicit runtime commands or invoked processes.
That separation is compatible with BANG's distinction between a state relation
and its effectful realization.

## Projection boundary

The first adapter must derive from checked Core and preserve stable Core source
identities. It must not require Core to adopt effect-machine-specific concepts
unless an active mission demonstrates that the underlying semantic concept is
target-independent.

Target-only concepts and limitations must be recorded in evidence. In
particular:

- ordinary TypeScript conditions used by handlers are not automatically BANG
  propositions;
- generated exploration is `model-checked(scope)` only when its declared state
  key and event enumeration make the explored domain finite and complete;
- truncated exploration records its exact limits and frontier;
- runtime probes observe executions and do not prove every trace;
- Atom and cluster behavior introduce additional target assumptions;
- unsafe TypeScript can bypass generated Schema and protocol boundaries.

## Activation plan

M006 may generate an adapter-compatible event and state shape only if doing so
does not complicate its direct success/error/requirement journey. It does not
add an unused dependency.

M008 should start with one BANG protocol projected to:

1. Schema states and public/internal events;
2. an effect-machine pure planner;
3. bounded exploration with explicit completeness metadata;
4. a managed runtime observed through a causal probe;
5. BANG evidence records that distinguish planner exploration from runtime
   observation.

Re-evaluate the exact package and Effect versions at integration time because
the library declares an exact peer dependency and describes itself as
early-release software.

## Sources checked

- `@typeonce/effect-machine@0.7.0` registry manifest and provenance release;
- repository README, public `Machine` and `MachineTest` entrypoints;
- planner, bounded exploration, finite-model, invariant, and runtime-probe
  implementations at release `0.7.0`;
- the official sibling Effect checkout for the corresponding Effect v4 APIs.
