---
id: M026
title: Persistent reactive semantic database
status: complete
timebox: 5 focused sessions
vision_claims:
  - semantic-data-service
  - derived-logical-schema
  - typed-interaction-binding
  - reactive-observation-parity
  - law-disposition
depends_on:
  - M015
  - M018
  - M020
  - M021
  - M022
  - M025
---

# Mission

BANG derives one persistent reactive TinyBank service from one checked project and one explicit data-service selection.

The service uses SQLite for storage and Effect TypeScript for its provider and client boundary. An independent handler supplies withdrawal arithmetic.

# User claim

> I can derive a real database schema and typed command, query, and subscription API from one checked TinyBank model. I can run the API and see where each law is enforced.

# Shipped journey

The canonical command is:

```sh
bang database examples/tiny-bank/database/account.json
```

The command performs this journey:

```text
compile the selected M025 project
  -> derive one logical Account table
  -> derive one Effect TypeScript binding
  -> create account-1 with balance 10 and one debit grant
  -> subscribe to AccountSummary(account-1)
  -> observe revision 0, balance 10, grant available
  -> dispatch WithdrawAccountOnce(account-1, 4)
  -> commit revision 1
  -> observe revision 1, balance 6, grant unavailable
  -> dispatch WithdrawAccountOnce(account-1, 1)
  -> receive WithdrawalRejectedOnce
  -> observe no revision 2 and no new subscription value
  -> reopen the SQLite service
  -> query revision 1 from persisted state
  -> compare the last incremental observation with the clean query
  -> emit one qualified disposition report
```

The command writes deterministic generated artifacts under:

```text
.bang/semantic-database/tiny-bank-account/
  schema.sql
  bindings.ts
  report.json
```

The command uses a scoped scratch SQLite file for the executable journey. It reopens that file before the scope ends.

The command emits deterministic text for unchanged input. A failure emits no partial report to standard output.

The product command reads the project's declared inputs. It does not run development demos or regenerate project evidence.

`bun run demo:m026` prepares the declared M018 evidence before it invokes the canonical command.

# Product boundary

M026 is a semantic database tracer. It is not a new database engine.

Checked Core and reusable theories own domain meaning. The SQLite target owns storage representation and transaction execution.

The Effect target owns host-language representation. The independent handler owns withdrawal arithmetic.

The project selection owns its semantic source list. The M026 selection refers to that project and does not repeat the source list.

# Input selection

The strict version-one selection contains:

```text
bangSemanticDatabase: 1
id: one project-local service identity
project: one repository-relative M025 project path
entity:
  id: one public entity identity
  stateMachine: one checked state-machine identity
  initializer: one checked initializer identity
  identityField: one public identity field
command:
  id: one public command identity
  realization: one checked operation-realization identity
query:
  id: one public query identity
  stateFields: one nonempty list of checked state fields
  capabilityAvailability: one checked capability identity
subscription:
  id: one public subscription identity
  query: the selected query identity
  mode: snapshots
  initialSnapshot: true
target:
  database: sqlite
  api: effect-typescript
scenario:
  accountId: one identifier
  initialBalance: one nonnegative decimal integer
  withdrawAmount: one nonnegative decimal integer
```

The strict decoder rejects excess properties, unsafe paths, duplicate public identities, empty field lists, and malformed decimal integers.

# Reference checks

The selection must satisfy all checks before target generation:

1. The project compiles and its evidence policy accepts the selected composition.
2. The state machine exists in the checked project artifact.
3. The initializer belongs to that state machine.
4. The query selects the Account `balance` field and no other state field in this tracer.
5. The operation realization exists and binds an operation on the selected state machine.
6. The realization has one exact-one requirement for the selected capability.
7. The realization names one disabled failure.
8. The subscription refers to the selected query.
9. The scenario initial balance satisfies the initializer requirements.
10. The first scenario command satisfies the transition requirements.

A failed check returns one typed failure. It does not write target artifacts or a partial report.

At runtime, the provider checks every command against the checked transition requirements before it invokes the independent handler.

# Interaction contract

M026 separates four boundaries:

| Boundary     | Public meaning                                                                  |
| ------------ | ------------------------------------------------------------------------------- |
| create       | Create one persistent entity with one initial exact-one grant.                  |
| command      | Request one checked state transition through one selected realization.          |
| query        | Read one declared observation from one committed entity revision.               |
| subscription | Receive an initial query snapshot and later snapshots after successful commits. |

Clients cannot supply or replace the current state. The client receives only the selected observation fields and target metadata.

The public Account summary contains:

```text
accountId
revision
balance
withdrawalAvailable
```

`accountId` and `revision` are target protocol fields. `balance` is a selected state observation.

`withdrawalAvailable` observes whether the exact-one capability has an unconsumed target grant. It does not change Core capability meaning.

# Command semantics

For state `s`, amount `a`, grant `g`, and independent handler `h`:

```text
validState(s)
transitionRequirements(s, a)
g.remainingUses = 1
h(s, a) = next
validState(next)
-------------------------------------------------------------
dispatch(s, g, a) commits (next, g.remainingUses = 0, revision + 1)
```

The target consumes the grant in the same SQLite transaction that commits the next state.

The handler receives decoded state and input. It cannot write the database or consume the grant directly.

If no grant use remains, dispatch returns the checked disabled failure before it invokes the handler.

A rejected command does not change persisted state, increment the revision, or publish a subscription snapshot.

# Independent handler

The canonical independent handler computes:

```text
next.balance = current.balance - amount
```

Current Core does not state this postcondition. Generated code and reports must not describe the arithmetic as Core-derived.

The target checks the handler result against the state invariant before commit.

# Logical SQLite schema

The target derives one strict SQLite table from the selected state machine and exact-one requirement.

The table contains:

```text
account_id                      TEXT primary key
balance                         TEXT canonical decimal integer
revision                        INTEGER nonnegative
DebitAccount_remaining_uses     INTEGER in {0, 1}
```

The exact SQL identifiers are deterministic functions of checked identities. They are not copied from a second handwritten schema.

The target stores `balance` as canonical decimal text. This preserves Core arbitrary-precision integer values without a 64-bit SQLite weakening.

The generated `CHECK` constraint rejects negative and noncanonical balance text. The runtime also decodes every stored balance through an Effect Schema.

The database constraint supports runtime enforcement. It does not prove that an independent handler preserves the invariant.

# Generated Effect binding

The generated `bindings.ts` module compiles against the pinned Effect v4 packages.

It contains:

- Schemas for the entity identity and selected integer values;
- an `AccountSummary` Schema;
- a tagged command Schema;
- tagged errors for missing, duplicate, disabled, and unavailable cases;
- one provider/client Service boundary;
- `create`, `query`, `dispatch`, and `subscribe` method types;
- an Effect Stream result for the subscription.

The provider implementation remains outside the generated module. The SQLite runtime supplies one Layer for the executable journey.

Generated bindings receive no semantic privilege. The canonical command type-checks the generated module before it emits the report. Successful type-checking is static target evidence only.

# Reactive semantics

The canonical subscription has this bounded meaning:

1. Subscription starts before the first command.
2. It emits the current query snapshot as revision `0`.
3. A successful commit publishes its committed snapshot as revision `1`.
4. The expected disabled failure publishes no snapshot.
5. The journey consumes exactly two snapshots.

The runtime publishes only after SQLite commits. A process failure between commit and publication can lose an update.

M026 does not claim durable subscription delivery, recovery, fairness, liveness, backpressure, network delivery, or concurrent-client behavior.

The parity judgment is:

```text
lastIncrementalObservation(trace) = cleanQuery(reopenedDatabase)
```

This equality compares decoded Account summaries. It does not compare SQLite file bytes or in-memory queue state.

# Persistence semantics

The command creates the entity, commits one withdrawal, releases the first SQLite runtime, and opens a second runtime on the same scratch file.

The reopened query must return revision `1`, balance `6`, and an unavailable grant.

This is scenario evidence for persistence across runtime reopen. It does not establish crash recovery, durability under hardware failure, or multi-process serializability.

# Law disposition report

The strict report contains:

- project and data-service identities;
- checked semantic-artifact identity and digest;
- selected state-machine, realization, capability, query, and subscription identities;
- generated SQL and binding paths with material digests;
- the initial, committed, rejected, emitted, and reopened observations;
- the parity result;
- ordered law dispositions;
- ordered limitations.

Each disposition contains:

```text
subject: stable semantic or target address
law: one law identity
source: authored | structurally-derived | theory-derived
mechanism: type | database-constraint | atomic-transaction | runtime-check | scenario
qualification: static-checked | runtime-checked | scenario-tested | unsupported-by-target | unresolved
claim: one bounded statement
invalidators: one nonempty list
```

The canonical report includes these concerns:

| Concern                    | Required mechanism                                          |
| -------------------------- | ----------------------------------------------------------- |
| entity identity            | SQLite primary key plus typed client identity               |
| nonnegative balance        | generated SQLite constraint plus post-handler runtime check |
| exact-one capability       | atomic conditional update in the command transaction        |
| typed interaction boundary | generated Effect Schemas and Service method types           |
| withdrawal arithmetic      | independent handler plus scenario evidence                  |
| reactive observation       | post-commit in-process publication plus clean-query parity  |
| persistence                | SQLite reopen scenario                                      |

The report must not flatten these mechanisms into one proof or one passed value.

# Generated artifact provenance

`schema.sql` and `bindings.ts` are pure functions of:

- the checked semantic artifact;
- the strict M026 selection;
- the target adapter version.

Their report entries contain SHA-256 material digests. The report preserves the source artifact digest and selected construct identities.

The SQLite file is an execution artifact. Its bytes are not deterministic and do not receive a material digest claim.

# Typed failures

M026 uses one top-level tagged failure with these stages:

```text
selection
project
reference
artifact
projection
filesystem
runtime
report
```

A failure can include a reason, identity, and source span when available.

The canonical negative fixtures cover:

- an unsafe project path;
- an unknown state machine;
- an unknown query state field;
- an unknown capability;
- a realization without the required exact-one capability;
- a subscription that refers to another query;
- malformed selection data.

Each fixture returns a nonzero exit status, one typed diagnostic on standard error, and empty standard output.

# Determinism

For unchanged input:

- generated SQL bytes are equal;
- generated binding bytes are equal;
- report JSON bytes are equal;
- command text bytes are equal;
- disposition and limitation order is stable.

The scoped database file and temporary path are outside the deterministic comparison.

# No Core change by default

M026 first represents public query and subscription choices in the strict data-service selection and target report.

A query or subscription construct enters Core only if the executable path requires a new cross-target semantic judgment. The mission contract must change before that Core extension.

# Falsifiers

M026 fails if any observation occurs:

1. The selection repeats the M025 semantic source list.
2. A handwritten schema duplicates the checked state shape.
3. The public client can replace current state.
4. The target generates withdrawal arithmetic from the current Core contract.
5. The capability is consumed outside the state transaction.
6. A rejected command increments the revision or emits a snapshot.
7. The first snapshot is not revision `0`.
8. The committed and reopened summaries differ.
9. Incremental and clean observations differ.
10. Generated bindings do not compile against pinned Effect v4.
11. The report describes runtime or scenario evidence as proof.
12. A failure writes a partial success report to standard output.
13. The command depends on a hidden generated artifact from an earlier run.

# Non-goals

M026 does not provide:

- a general database engine;
- a general query language;
- arbitrary SQL generation;
- automatic schema migration;
- a durable event log or changefeed;
- HTTP, WebSocket, RPC, or browser bindings;
- authentication or row-level security;
- multiple entities, commands, queries, or subscribers;
- concurrent command execution;
- replication, sharding, CRDT selection, or consensus;
- generated business handler bodies;
- general logical consistency checking;
- production performance, recovery, security, or durability claims;
- a package registry, build system, or new programming language.

# Acceptance

1. Run `bun run demo:m026` from a clean checkout and observe its canonical command journey.
2. Observe the project, construct, and generated artifact identities.
3. Inspect the generated SQLite schema and Effect binding.
4. Observe revision `0` with balance `10` and an available grant.
5. Observe revision `1` with balance `6` and an unavailable grant.
6. Observe `WithdrawalRejectedOnce` for the second command.
7. Observe no revision `2` and exactly two subscription snapshots.
8. Observe the reopened SQLite summary at revision `1`.
9. Observe incremental and clean query parity.
10. Inspect each qualified law disposition and limitation.
11. Run the command twice and compare deterministic output and generated artifacts.
12. Exercise every negative fixture and observe empty standard output.
13. Type-check the generated Effect binding.
14. Run focused Core, target, runtime, CLI, and report tests.
15. Run `just verify`.

# Primary uncertainty

Can one checked BANG model derive a useful persistent reactive data service without giving the database, API, or runtime independent semantic authority?

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0011-semantic-data-service-exploration.md`;
- `design-specs/M004-state-transition-invariant.md`;
- `design-specs/M015-entity-ownership-and-messages.md`;
- `design-specs/M018-single-use-capability.md`;
- `design-specs/M020-family-ledger-prototype.md`;
- `design-specs/M021-construct-addressed-normalization.md`;
- `design-specs/M022-versioned-theory-explanation.md`;
- `design-specs/M025-single-authority-project.md`;
- `examples/tiny-bank/account.bang`;
- `examples/tiny-bank/project.json`;
- `../effect/LLMS.md`;
- `../effect/packages/sql/`;
- `../effect/packages/sql/sqlite-bun/src/SqliteClient.ts`;
- `../effect/packages/effect/src/Stream.ts`;
- `../effect/packages/effect/src/unstable/reactivity/Reactivity.ts`.
