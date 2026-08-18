---
id: M024
title: Bounded two-owner channel trace
status: complete
timebox: 5 focused sessions
vision_claims:
  - nondeterministic-channel-trace
  - logical-message-delivery-identity
  - causal-delivery-obligation
  - coordination-observation
  - honest-loss-classification
depends_on:
  - M015
  - M017
  - M021
  - M022
  - M023
---

# Mission

BANG runs one bounded two-owner protocol under explicit delivery schedules.

One shipped command distinguishes logical messages from delivery attempts and reports order, duplication, loss, causality, and coordination conclusions without claiming distributed exactly-once delivery, recovery, fairness, or liveness.

# User claim

> I can run one two-owner exchange under reordered, duplicated, and dropped deliveries. BANG explains which protocol obligations are satisfied, violated, or unresolved and why.

# User journey

```sh
bang trace examples/tiny-bank/channels/two-owner.json
```

The command:

1. loads a strict, versioned, repository-relative selection;
2. validates one protocol and its bounded schedules;
3. executes every schedule through one deterministic Effect scheduler;
4. evaluates the resulting observations through one mission-local channel theory;
5. prints one deterministic report with stable obligation identities and explicit limitations.

# Primary uncertainty

Can BANG derive and classify channel obligations while keeping transport order, logical message identity, delivery-attempt identity, causal dependency, delivery observation, and peer coordination as separate relations?

# Frozen protocol

The protocol has two owners, `owner-a` and `owner-b`, and transaction `t1`.

It has three logical messages:

```text
prepare-t1  Prepare(t1, 4)  owner-a -> owner-b
commit-t1   Commit(t1)      owner-a -> owner-b  after prepare-t1
ack-t1      Ack(t1)         owner-b -> owner-a  after commit-t1
```

Owner B moves through:

```text
idle -> prepared -> committed
```

Owner A moves through:

```text
waiting -> complete
```

A logical message identity denotes protocol intent. A delivery-attempt identity denotes one attempted transport occurrence. Several delivery attempts may refer to one logical message.

# Observation model

The deterministic scheduler records these tagged observations:

- `Sent`: a logical message became available to transport;
- `Delivered`: one delivery attempt reached its destination;
- `Handled`: the destination accepted the logical message and may change state;
- `Rejected`: handling was refused with a typed reason;
- `Dropped`: one delivery attempt did not reach its destination;
- `DuplicateIgnored`: a previously handled logical message was delivered again without another state mutation.
- `ForcedCompletion`: the adversarial schedule moves one coordinator to `complete` without a message so the theory can expose an explicit coordination counterexample.

An observation sequence reports runtime order. It does not itself establish a causal relation. Causality comes from the checked logical-message declaration and is evaluated against handled-message history.

# Stable obligations

The mission-local `BoundedChannelProtocol` theory derives these obligations:

```text
BoundedChannelProtocol.obligation.logical-message-identity
BoundedChannelProtocol.obligation.handle-after-causal-parent
BoundedChannelProtocol.obligation.at-most-once-state-mutation
BoundedChannelProtocol.obligation.acknowledged-coordination
BoundedChannelProtocol.obligation.loss-remains-unresolved
```

Meanings:

1. Every observation refers to one declared logical message and every delivery uses a unique attempt identity.
2. A message with a causal parent is handled only after that parent was handled.
3. Repeated attempts for one logical message cause at most one state mutation.
4. Owner A reaches `complete` only after handling `ack-t1`, while owner B reaches `committed` only after handling `commit-t1`.
5. If an acknowledgement is dropped, Owner A remains waiting; the trace does not infer peer failure, recovery, or safe retry.

# Result classes

Each schedule produces one tagged result:

| Class        | Meaning                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `Satisfied`  | Every obligation selected for the schedule is observed within the finite run.                   |
| `Violated`   | At least one obligation has an explicit counterexample observation.                             |
| `Unresolved` | No counterexample is observed, but loss or the finite boundary prevents a warranted conclusion. |

Precedence is:

```text
Violated > Unresolved > Satisfied
```

A dropped acknowledgement is `Unresolved`, not `Violated`, unless the coordinator nevertheless completes. Absence of an observation is not evidence that the peer failed.

# Required schedules

The positive fixture includes six deterministic schedules:

1. `ordered`: prepare, commit, and acknowledgement are handled once; result `Satisfied`.
2. `duplicate-prepare`: two attempts deliver `prepare-t1`; the second is ignored; result `Satisfied`.
3. `duplicate-commit`: two attempts deliver `commit-t1`; the second is ignored; result `Satisfied`.
4. `commit-before-prepare`: commit handling is rejected until its causal parent is handled; result `Violated` with the causal obligation.
5. `drop-ack`: Owner B commits, the acknowledgement attempt is dropped, and Owner A remains waiting; result `Unresolved` with the loss obligation.
6. `complete-without-ack`: the schedule attempts to force Owner A complete without handling the acknowledgement; result `Violated` with the coordination obligation.

# Encoded boundaries

The selection, protocol, schedule, trace, and report use strict versioned Schemas.

The selection records:

- protocol identity and version;
- exactly two distinct owner identities;
- logical messages with distinct identities, sender, receiver, operation, transaction, amount where applicable, and optional causal parent;
- non-empty schedules with distinct identities;
- schedule steps whose attempt identities are globally unique within that schedule;
- report limitations.

The compiler rejects before execution:

- duplicate owner, logical-message, schedule, or attempt identities;
- unknown sender, receiver, message, or causal-parent references;
- self-causality or an operation-invalid causal parent;
- sender equal to receiver;
- an acknowledgement or commit without its required parent;
- absolute paths, traversal segments, backslashes, or NUL in the selection path.

No partial report is emitted after any decode, validation, execution, or evaluation failure.

# Evidence boundary

M024 produces bounded `runtime-checked` observations from a deterministic in-process Effect scheduler. It establishes only the recorded finite schedules for the unchanged protocol, scheduler, source, and tool versions.

The report retains these limitations:

- no distributed exactly-once guarantee;
- no durable delivery or mailbox;
- no retry-safety or recovery guarantee;
- no scheduler or network fairness guarantee;
- no bounded latency, work, memory, or mailbox guarantee;
- no liveness or productivity guarantee;
- no behavior claim for unenumerated schedules;
- the deterministic scheduler is not a real network.

M017 remains evidence about one BEAM actor and same-sender delivery. It is not evidence for this two-owner protocol. M018 remains evidence about one process-local capability grant. It is not evidence for distributed delivery.

# Determinism

- Schedules run in encoded order.
- Observations retain schedule-step order.
- Obligation results retain the stable obligation order above.
- Paths and identity lists are sorted where order has no semantic meaning.
- Repeated runs over unchanged inputs emit byte-identical output.
- Generated traces are disposable and rebuilt by the command.

# Negative fixtures

1. Duplicate delivery-attempt identity: reject before execution.
2. Unknown logical-message identity: reject before execution.
3. Unknown causal parent: reject before execution.
4. Operation-invalid causal parent: reject before execution.
5. Unsafe selection path: reject before file access.
6. Malformed step for a declared message: return a typed decode or validation failure.
7. Coordinator completion without acknowledgement: emit `Violated`, never `Satisfied`.
8. Dropped acknowledgement: emit `Unresolved`, never `Violated` solely because no acknowledgement was observed.

# Acceptance

1. Run the shipped command.
2. Observe all six schedule identities in deterministic order.
3. Observe `ordered`, `duplicate-prepare`, and `duplicate-commit` as `Satisfied`.
4. Observe `commit-before-prepare` and `complete-without-ack` as `Violated` with their exact obligation identities and counterexamples.
5. Observe `drop-ack` as `Unresolved`, with Owner B committed and Owner A waiting.
6. Observe separate logical-message and delivery-attempt identities in the report.
7. Observe send, delivery, handling, duplicate, rejection, and drop events.
8. Run every negative fixture and observe typed failure with no partial report.
9. Run focused theory, scheduler, CLI, and determinism checks.
10. Run `just verify`.

# Non-goals

M024 does not:

- add owner, actor, channel, or temporal constructs to Core;
- define a universal protocol or process-calculus language;
- use sequence position as proof of causality;
- claim distributed execution or network realism;
- claim exactly-once delivery;
- add retries, recovery, persistence, durable mailboxes, or supervision;
- claim fairness, termination, productivity, latency, work, or memory bounds;
- add another target language;
- create a registry or generic project manifest.

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0006-semantic-tower-and-composition-frontier.md`;
- `decisions/0007-modular-propositions-providers-and-realizations.md`;
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`;
- `design-specs/M015-entity-ownership-and-messages.md`;
- `design-specs/M017-gleam-beam-actor-realization.md`;
- `design-specs/M021-construct-addressed-normalization.md`;
- `design-specs/M022-versioned-theory-explanation.md`;
- `design-specs/M023-realization-classification.md`.
