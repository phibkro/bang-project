---
id: M017
title: Gleam and BEAM actor realization
status: complete
timebox: 5 focused sessions
vision_claims:
  - heterogeneous-target-portability
  - typed-actor-messages
  - real-mailbox-execution
  - explicit-supervision-semantics
depends_on:
  - M007
  - M015
---

# Mission

BANG can project one checked Account behavior into a real Gleam actor on the BEAM runtime.

The actor owns its current state. A caller sends typed withdrawal messages without a state argument.

The target report separates checked Account behavior from BEAM process, mailbox, and supervisor behavior.

# User claim

A contributor can start `account-1` with balance `10` under a supervisor.

The contributor can send three typed messages from one caller:

```text
Withdraw(withdraw-1, 4) -> Succeeded(balance 6)
Withdraw(withdraw-2, 2) -> Succeeded(balance 4)
Withdraw(withdraw-3, 9) -> WithdrawalRejected(balance 4)
```

An invalid external term fails before typed actor dispatch.

A forced actor failure triggers the configured supervisor. The report states the observed post-restart state.

# Falsifiers

The mission fails if one of these observations occurs:

1. The generated Gleam source does not derive from checked Core.
2. A caller supplies or replaces Account state.
3. The second withdrawal starts from balance `10`.
4. A rejected withdrawal changes the balance.
5. An invalid external term reaches typed dispatch.
6. A reply loses the entity identity or message identity.
7. The actor does not execute in a BEAM process.
8. The configured supervisor does not observe and restart the failed actor.
9. The report claims that restart preserves durable state without evidence.
10. The report claims global order or acknowledged delivery.
11. The report treats Gleam, Erlang, or OTP as Core semantic authority.
12. Generated output or evidence changes without an input change.

# Semantic boundary

M017 adds no Core declaration, term, predicate, or judgment.

Checked Core remains authoritative for:

- the `Account` state declaration;
- the `initialize` and `withdraw` operation identities;
- the withdrawal requirement;
- the `nonnegativeBalance` invariant;
- the `WithdrawAccount` realization identity;
- the `DebitAccount` capability identity;
- the `WithdrawalRejected` failure identity.

The Gleam projection adds target-local representations:

- an opaque actor handle;
- a typed actor message union;
- a typed reply union;
- a BEAM process and mailbox;
- one supervisor policy;
- one external-term decoder;
- one controlled failure operation for the restart fixture.

The controlled failure operation is test control. It is not a Core Account operation.

# Ordering and delivery boundary

The accepted journey uses one caller and one actor.

M017 relies only on same-sender-to-same-destination signal ordering. It makes no global ordering claim.

Message send does not prove handling. The request and reply journey observes handling for the recorded calls.

M017 does not claim:

- distributed delivery;
- durable mailboxes;
- exactly-once processing;
- fairness;
- bounded response time;
- state persistence across restart;
- message order across multiple senders.

# Supervision boundary

The independent consumer starts the actor through one configured supervisor.

The journey forces one actor failure after the three withdrawal messages. It then observes one supervisor restart.

The actor uses in-memory state only. If the restarted actor returns to its configured initial state, the report records that reset.

The mission does not add persistence, event sourcing, or recovery state.

# Target package

`@bang/target-gleam` consumes checked Core. It emits deterministic Gleam source or a typed projection failure.

The package remains a pure target projector. It does not run Gleam, Erlang, or OTP.

The projector must reject:

- a missing state machine;
- a missing initializer or operation;
- an unsupported state field type;
- an unsupported operation shape;
- an unsupported requirement or predicate;
- an invalid Gleam identifier;
- an identifier collision.

# Generated and independent artifacts

The mission uses these artifact classes:

```text
examples/tiny-bank/account.bang
  checked source

generated/gleam/account-entity/
  disposable deterministic target package

examples/tiny-bank/gleam-account/
  independent actor consumer and runtime fixture

.bang/evidence/M017.json
  checked target evidence
```

The independent consumer imports the generated package. It must not copy the withdrawal predicate or state transition.

# Toolchain boundary

The repository pins the Gleam compiler and Erlang/OTP runtime used by M017.

The independent project locks all Gleam package dependencies.

The evidence records:

- the compiler version observed from the pinned Gleam executable;
- the Erlang/OTP package version from the pinned Nix derivation and the release observed from the live runtime;
- each direct Gleam package version and checksum;
- the generated source, generated package config, and generated lockfile digests;
- the independent consumer source, config, and lockfile digests;
- the pinned Nix toolchain definition digest;
- the exact build and run command identities.

# Evidence contract

The M017 manifest uses the evidence class `runtime-checked`.

It records:

- stable Core declaration identities;
- entity and message identities;
- ordered request and reply observations;
- state before and after each handled message;
- the invalid external term rejection;
- termination of the actor process observed before failure;
- observation of a replacement actor process;
- the result of comparing the old and replacement process identities;
- the observed restart state;
- source and toolchain provenance;
- assumptions, target limitations, lifetime, and invalidators.

The checker rejects:

- unknown Core identities;
- duplicate message identities;
- a broken state chain;
- a typed failure that changes state;
- a restart that does not terminate the old process and produce a different live process;
- missing invalid-input evidence;
- missing target limitations;
- stale material digests.

The report must list these target limitations:

- same-sender ordering only;
- asynchronous send without handling acknowledgement;
- selective receive and priority messages can change mailbox processing order;
- distributed signal loss;
- restart without durable state;
- raw BEAM or foreign-function type bypass;
- finite process, mailbox, atom, and memory resources.

The manifest does not persist raw BEAM process identifiers. Those identifiers vary between runs. It persists the observed termination, replacement, liveness, and identity-comparison results.

# Vertical acceptance path

1. Parse and check `examples/tiny-bank/account.bang`.
2. Select the checked Account behavior by stable identity.
3. Project one deterministic Gleam actor package.
4. Compare the generated package with a committed snapshot.
5. Compile the independent Gleam consumer.
6. Start the real supervised actor on BEAM.
7. Observe balances `10 -> 6 -> 4`.
8. Observe a rejected withdrawal that preserves balance `4`.
9. Reject one invalid external term before typed dispatch.
10. Force one actor failure.
11. Observe one supervisor restart and a different process identity.
12. Record the post-restart state without claiming persistence.
13. Write and strictly reload deterministic M017 evidence.
14. Reject identity, state-chain, restart, limitation, and material drift.
15. Keep all completed missions green.
16. Pass `just verify`.

# Non-goals

- a new Core actor construct;
- distributed actors;
- persistence or recovery;
- more than one actor instance;
- more than one caller;
- mailbox backpressure;
- retry or delivery guarantees;
- timeout, fairness, or liveness proof;
- Elixir source generation;
- a universal BEAM adapter;
- a universal target registry;
- implementation equivalence with Effect or Rust;
- proof of the Gleam implementation;
- publishing a Gleam package.

# Primary uncertainty

Can unchanged checked Account behavior survive a real actor runtime without hiding BEAM ordering, failure, or restart semantics?
