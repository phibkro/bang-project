# 0008 — Heterogeneous target portfolio and Gleam/BEAM

- **Status:** accepted
- **Date:** 2026-08-16
- **Scope:** target selection after M016
- **Extends:** decisions 0005, 0006, and 0007

## Decision

BANG selects target languages by the semantic pressure of one mission. BANG does not seek one universal implementation target.

Each target remains a target adapter. No target defines Core semantics.

The current target roles are:

| Target            | Role                               | Distinct pressure                                                                  |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| Effect TypeScript | primary product target             | Schema boundaries, typed effects, services, and runtime observation                |
| Rust              | representation stress target       | fixed-width arithmetic, privacy, ownership, and native compilation                 |
| Gleam/BEAM        | actor runtime target               | typed messages, mailboxes, process identity, links, and supervision                |
| Haskell           | deferred semantic reference target | pure transitions, algebraic data, non-strict evaluation, and mathematical integers |
| Lean              | evidence provider                  | kernel checking of normalized mathematical obligations                             |

A host language with mathematical roots does not prove a BANG contract. Host types can enforce selected shapes and boundaries. Qualified evidence establishes only the recorded observations.

## M017 selection

M017 selects Gleam on the BEAM runtime. The mission projects the checked M015 Account behavior into a real actor boundary.

Gleam is selected instead of Elixir for the generated boundary. Gleam provides checked custom types, exhaustive matching, opaque constructors, and typed process subjects.

Elixir remains a possible interoperability or runtime fixture. Its typespecs do not define a compiler-enforced conformance boundary.

M017 creates `@bang/target-gleam`. The package boundary is earned by one checked target projection, one independent consumer, and one executable evidence journey.

## Authority boundary

Checked Core owns:

- Account state and operation identities;
- the withdrawal requirement;
- the nonnegative balance invariant;
- the capability and typed failure identities.

The Gleam target adapter owns:

- Gleam type and function representations;
- the actor message envelope;
- the process and mailbox realization;
- the supervisor and restart policy;
- target diagnostics and unsupported mappings.

The BEAM runtime owns process scheduling, signal delivery, links, monitors, and restart execution.

The evidence boundary records each authority separately.

## Required target limitations

M017 must report these limits:

- message send does not acknowledge handling;
- ordering is limited to signals from one sender to one destination;
- selective receive and priority messages can change mailbox processing order;
- distributed signals can be lost;
- a supervisor restart does not imply durable state;
- raw BEAM terms and foreign functions can bypass Gleam types;
- process, mailbox, atom, and memory resources are finite.

The report must not claim global ordering, durable delivery, distributed exactly-once behavior, or implementation proof.

## Rejected alternatives

M017 does not:

- replace Rust or delete M009 evidence;
- select Java as the next portability target;
- use Elixir as the generated static boundary;
- make Haskell linear types a capability proof;
- add an `actor` Core declaration;
- add a universal target registry;
- add a universal process or message abstraction to Core.

## Deferred targets

Haskell remains the preferred candidate for a later semantic reference tracer. A quantitative or richer algebraic mission can activate it.

OCaml remains a valid target candidate. No current mission needs its module or strict functional semantics.

Java remains available for a product integration need. It is no longer the default next target.

## Activation rule

A new target requires one user-visible claim that can fail because of that target's semantics. Similar syntax or implementation popularity is not sufficient.
