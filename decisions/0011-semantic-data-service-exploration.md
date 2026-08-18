# 0011 — Semantic data-service exploration

- **Status:** accepted
- **Date:** 2026-08-16
- **Scope:** exploratory product direction after M025
- **Extends:** decisions 0006, 0007, and 0010

## Decision

BANG will test a semantic data service as its next product direction. This direction remains exploratory until a mission supplies executable evidence.

A semantic data service is a database-backed service derived from a checked domain model. The service exposes domain commands, queries, and subscriptions.

Users declare the domain facts that BANG cannot derive. These facts include:

- values, identities, and relations;
- states, operations, and legal transitions;
- observations and business events;
- laws, invariants, failures, and capabilities;
- public operations and persistence choices;
- required consistency, order, and lifetime properties.

BANG checks the model and derives all warranted artifacts. One target can produce:

- a logical data model;
- database schemas and constraints;
- provider ports and client bindings;
- typed commands, queries, and subscriptions;
- transaction and runtime checks;
- typed holes for behavior that the model does not determine;
- a disposition report for each law and assumption.

BANG will use an existing database and runtime. It will not build a new storage engine for this exploration.

## Product boundary

The database resemblance is intentional. A database is one realization of a stateful domain model.

BANG remains the semantic authority. The database target owns storage, transactions, indexes, and its runtime guarantees.

```text
semantic domain model
  -> checked and normalized Core
  -> applicable theories and obligations
  -> logical data model + interaction contract
  -> database schema + provider and client bindings
  -> independent handlers + target runtime
  -> qualified disposition and evidence report
```

The interaction contract separates three client operations:

| Operation    | Meaning                                                         |
| ------------ | --------------------------------------------------------------- |
| command      | Request a state change and receive a typed result or failure.   |
| query        | Read one declared observation of committed state.               |
| subscription | Observe declared snapshots, deltas, or events through a stream. |

Clients do not receive mutable implementation state. A public state snapshot exists only when the model declares that observation.

A subscription is not automatically a durable event stream. The contract must state snapshot, order, replay, duplicate, lifetime, and failure semantics.

## Authored facts and derived artifacts

BANG does not infer a domain choice when several choices remain valid.

| Concern                 | Authority                                                                   |
| ----------------------- | --------------------------------------------------------------------------- |
| domain meaning          | checked Core and reusable theories                                          |
| public operation choice | an explicit project or interface selection                                  |
| persistence choice      | an explicit realization selection                                           |
| logical schema          | a checked derivation under the selected data mapping                        |
| physical layout         | the target plan and explicit operational choices                            |
| business handler        | an independent implementation or a complete executable domain term          |
| client and provider API | a target derivation from the checked interaction contract                   |
| database enforcement    | a target claim with exact assumptions and evidence                          |
| runtime reactivity      | a target observation with clean-recomputation parity                        |
| implementation evidence | a named provider result with scope, versions, assumptions, and invalidators |

The semantic model does not select one physical layout by itself. Indexes, normalization, event logs, replication, and partitions can require explicit objectives.

## Reusable laws

Reusable theories can accept typed sorts, terms, operations, observations, and laws as parameters. An interpretation maps domain constructs to those parameters.

This mechanism can express reusable relations such as:

- one operation preserves one invariant;
- one operation consumes one capability exactly once;
- one observation is monotone;
- two operations commute;
- one key is unique;
- one query factors through a selected partition.

Theory parameters remain typed symbols. BANG does not add unrestricted compiler reflection or an unrestricted higher-order logic for this exploration.

## Consistency results

BANG will not claim that it can decide every logical theory. General consistency becomes undecidable when the logic is sufficiently expressive.

A consistency report must distinguish these results:

| Result                  | Meaning                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `well-formed`           | References, types, phases, and interpretations are valid.                    |
| `model-found`           | A model satisfies the encoded laws under the reported scope and assumptions. |
| `inconsistent`          | A sound proof or complete procedure establishes that no model exists.        |
| `no-model-within-bound` | A bounded search found no model. This result is not a global proof.          |
| `unknown`               | Current providers cannot decide the question.                                |
| `unsupported`           | The selected logic or target cannot encode the question faithfully.          |

An inconsistent contract cannot have a conforming implementation. A found model does not establish implementation correctness or operational quality.

## Law disposition

BANG places each law at the strongest sound boundary that a selected target supports. One law can use more than one boundary.

Possible dispositions include:

- enforced by a constructor or type;
- established by a checked proof;
- enforced by a database constraint;
- enforced by an atomic transaction;
- checked before or after a handler call;
- monitored during execution;
- evaluated by model checking or tests;
- assumed, unresolved, or unsupported.

The report preserves the scope of each disposition. It does not equate a database rejection, a property test, and a proof.

Generated code has no semantic privilege. The target adapter must preserve the law or report a weakening.

## Reactive observations

A query is a declared observation. A target can derive or record the data dependencies of that observation.

A successful command can invalidate affected queries. The runtime then recomputes those queries and publishes new observations.

The required parity law is:

```text
incremental observation after a command trace
  = observation recomputed from canonical committed state
```

The compile-time construct graph and the runtime query graph remain different relations. They can share stable construct identities.

Convex supplies useful runtime prior art. It tracks query read sets, reruns affected queries after commits, and updates subscriptions from consistent snapshots.

Convex does not define BANG semantics. A Convex adapter remains one qualified target realization.

## First tracer candidate

No successor mission is active at the time of this decision. The next mission contract can test one persistent reactive TinyBank service.

The candidate journey has these observations:

1. One TinyBank source produces one real database schema.
2. The same source produces one typed Effect provider port and client binding.
3. A client creates an Account and reads one declared Account observation.
4. The client subscribes to that observation.
5. A typed withdrawal commits one new revision and updates the subscription.
6. A rejected withdrawal does not change state or publish a new revision.
7. An exact-one capability is consumed atomically.
8. A report explains each static, database, transaction, runtime, and unresolved disposition.

The mission must use an existing database runtime. Effect and SQLite are the conservative first candidates because M020 already exercises them.

The first tracer does not require HTTP, a browser, authentication, replication, sharding, general migration planning, or generated business logic.

## Ecosystem horizon

This exploration does not reduce BANG to one database target. It gives the existing compiler architecture one usable product path.

Later missions can activate independent ecosystem branches:

- programming-language compilers and host-language targets;
- a reproducible build graph for generated artifacts;
- package distribution for Core, theories, realizations, and evidence;
- database and reactive-runtime target portfolios;
- objective-relative planning for storage, execution, and distribution;
- continuous evidence invalidation across package and target changes.

Each branch remains provisional. A branch enters the product only when one mission demonstrates a user-visible need.

## Consequences

1. The near-term roadmap prioritizes a semantic data-service tracer after project composition.
2. Query and subscription constructs enter Core only when the tracer requires precise new judgments.
3. Database schemas and API bindings remain target artifacts.
4. Persistence, publication, and operational choices remain explicit.
5. Underdetermined behavior remains an independent handler with checked obligations.
6. The evidence report records where generation stops and human implementation begins.
7. Theory distribution, build systems, and programming-language work remain valid ecosystem branches.

## Rejected alternatives

BANG does not:

- build a new general database engine before one tracer requires it;
- expose every Core state field as a public API;
- generate unrestricted CRUD operations that bypass domain commands;
- treat one database schema as the only valid realization;
- infer business events from state differences;
- report bounded solver failure as global inconsistency;
- generate arbitrary business or coordination logic;
- treat Convex, SQL, Effect, or another target as semantic authority;
- remove programming-language, build, or package-distribution work from the long-term ecosystem.

## Sources

- `BANG-PROJECT-DIRECTION.md`;
- [decision 0006](0006-semantic-tower-and-composition-frontier.md);
- [decision 0007](0007-modular-propositions-providers-and-realizations.md);
- [decision 0010](0010-surface-inference-and-full-compiler-horizon.md);
- `design-specs/M015-entity-ownership-and-messages.md`;
- `design-specs/M020-family-ledger-prototype.md`;
- `design-specs/M021-construct-addressed-normalization.md`;
- `design-specs/M025-single-authority-project.md`;
- [Convex realtime documentation](https://docs.convex.dev/realtime);
- [How Convex Works](https://stack.convex.dev/how-convex-works);
- [Keeping CALM](https://arxiv.org/abs/1901.01930);
- [Conflict-Free Replicated Data Types](https://arxiv.org/abs/1805.06358);
- [Coordination Avoidance in Database Systems](https://arxiv.org/abs/1402.2237).
