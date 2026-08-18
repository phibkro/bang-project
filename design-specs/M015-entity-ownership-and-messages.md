---
id: M015
title: Entity ownership and typed messages
status: complete
timebox: 5 focused sessions
vision_claims:
  - stable-entity-identity
  - exclusive-state-ownership
  - typed-message-dispatch
  - sequential-state-evolution
depends_on:
  - M004
  - M006
  - M008
---

# Mission

BANG can project one checked Account behavior into a named in-process entity boundary.

The entity owns its current state. A caller sends a typed message without a state argument. Two accepted messages use the state from the preceding result.

This mission exercises entity meaning before actor concurrency. It adds no `entity` or `actor` declaration to Core.

# User claim

A contributor can create `account-1` with balance `10`. The contributor can send two typed withdrawals without supplying state.

The first withdrawal of `4` returns balance `6`. The second withdrawal of `2` returns balance `4`.

```text
create account-1 at balance 10
  → send Withdraw(4) to account-1
  → Succeeded(balance 6)
  → send Withdraw(2) to account-1
  → Succeeded(balance 4)
```

# Falsifiers

The mission fails if one of these observations occurs:

1. A message can supply or replace the current state.
2. A message for another entity changes `account-1`.
3. An unknown message changes the owned state.
4. The second withdrawal starts from balance `10` instead of balance `6`.
5. A rejected withdrawal changes the owned state.
6. An accepted message can reset the entity to its initial state.
7. A reply loses the entity identity or message identity.

# Semantic boundary

M015 separates four relations:

| Relation                | M015 meaning                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `sameIdentity`          | The entity identifier stays `account-1` across all replies.                           |
| state equality          | Two state values contain equal field values. This does not establish entity identity. |
| interface compatibility | The boundary accepts the generated Account message union.                             |
| bounded behavior        | The observed two-message journey follows the selected checked Account behavior.       |

M015 does not claim that two implementations are equivalent. It does not claim bisimilarity beyond the recorded scenarios.

# Authority and derivation

Checked Core remains authoritative for these facts:

- the `Account` state shape;
- the `initialize` and `withdraw` operation identities;
- the withdrawal requirement;
- the `nonnegativeBalance` invariant;
- the `WithdrawAccount` realization binding;
- the `DebitAccount` capability requirement;
- the `WithdrawalRejected` failure identity.

The M015 target projection adds these target-local facts:

- one entity instance has a caller-supplied nominal identity;
- the entity closure owns the current state;
- the dispatch method accepts messages and does not accept state;
- dispatch routes `Withdraw` to the checked `WithdrawAccount` realization;
- a successful reply replaces the owned state;
- a typed rejection preserves the owned state.

These target-local facts are scenario-tested. They are not new Core laws.

# Message protocol

The public message boundary is an Effect Schema tagged union.

```text
Withdraw {
  destination: EntityId
  messageId: MessageId
  amount: Integer
}
```

The generated dispatch function accepts only the message. It does not accept an Account state.

The result is one of these tagged observations:

```text
Succeeded {
  entityId
  messageId
  messageType: Withdraw
  state
}

TypedFailure {
  entityId
  messageId
  messageType: Withdraw
  failureId: WithdrawalRejected
  state
}

WrongDestination {
  entityId
  messageId
  destination
  state
}
```

`WrongDestination` is a dispatch failure. It is not a failure declared by `WithdrawAccount`.

Unknown encoded messages fail Schema decoding at the external boundary. Internal dispatch remains exhaustive over the decoded message union.

# Ownership realization

The projected factory creates one entity with these inputs:

```text
makeAccountEntity(entityId, initialBalance)
```

The factory initializes the state once. It returns an entity handle with a read-only identity and a dispatch method.

```text
AccountEntity {
  entityId
  dispatch(message)
}
```

The handle does not expose a state setter. The handle does not expose the owned `Ref`.

The realization uses an Effect state primitive inside the factory closure. The state update and the effectful withdrawal form one serialized operation.

M015 uses no mailbox or worker fiber. It uses no detached fiber, persistence, retry, supervision, or cluster entity runtime.

# Sequential judgments

Let `E[id, s]` be one entity with identity `id` and owned state `s`.

```text
message.destination = id
message = Withdraw(messageId, amount)
WithdrawAccount(s, amount) = success(s′)
────────────────────────────────────────────────────
E[id, s] ⊢ message ⇓ E[id, s′], Succeeded(id, messageId, s′)
```

```text
message.destination = id
message = Withdraw(messageId, amount)
WithdrawAccount(s, amount) = WithdrawalRejected
──────────────────────────────────────────────────────────
E[id, s] ⊢ message ⇓ E[id, s], TypedFailure(id, messageId, s)
```

```text
message.destination ≠ id
──────────────────────────────────────────────────
E[id, s] ⊢ message ⇓ E[id, s], WrongDestination(id, s)
```

A decoded unknown message does not enter the typed dispatch function. The external decoder reports it without access to the entity state.

# Evidence contract

`EntityMessageEvidenceRecord` is a public Schema boundary. It records:

- the checked Core declaration identities;
- the entity identity;
- the initial state;
- the ordered message and reply observations;
- the state before and after each dispatch;
- the result classification;
- the evidence class `scenario-tested`;
- the scope `single-entity-sequential-dispatch`;
- the target and tool versions;
- the producer and its trust classification;
- assumptions, unsupported claims, lifetime, and invalidators.

The checker rejects these inconsistent records:

- a reply with a different entity identity;
- duplicate message identities in one record;
- a success whose next pre-state differs from the preceding post-state;
- a failure that changes state;
- an unknown Core declaration identity;
- a successful record that omits either accepted withdrawal.

The evidence producer remains `assumed-truthful`. The checker cannot prove that an arbitrary producer recorded every dispatch.

# Vertical acceptance path

1. Parse and check `examples/tiny-bank/account.bang`.
2. Select `Account`, `WithdrawAccount`, and `DebitAccount` by stable identity.
3. Project the Account entity boundary from checked Core.
4. Compile the generated boundary with the independent withdrawal realization.
5. Create `account-1` with balance `10`.
6. Send `withdraw-1` with amount `4` and no state argument.
7. Observe `Succeeded` with balance `6`.
8. Send `withdraw-2` with amount `2` and no state argument.
9. Observe `Succeeded` with balance `4`.
10. Send an overdraft and observe `WithdrawalRejected` with unchanged state.
11. Reject a wrong destination without a state change.
12. Reject an unknown encoded message before dispatch.
13. Prove by TypeScript checking that typed dispatch has no state parameter.
14. Emit deterministic M015 evidence and a readable report.
15. Keep M000 through M014 demonstrations unchanged.
16. Pass `just verify`.

# Acceptance evidence

- the message and evidence unions are strict public Schema boundaries;
- generated source is deterministic and matches a committed snapshot;
- the entity factory keeps the state primitive private;
- the dispatch type has one message parameter and no state parameter;
- two accepted messages produce balances `6` and `4` in order;
- both accepted replies retain `account-1` and their message identities;
- an overdraft returns `WithdrawalRejected` and preserves balance `4`;
- a wrong destination preserves balance `4`;
- an unknown encoded message does not reach dispatch;
- duplicate or reset message behavior fails the evidence checker;
- the M015 manifest states the target-local ownership assumption;
- `just verify` passes.

# Non-goals

- an `entity`, `actor`, or `message` Core declaration;
- surface syntax for entities or messages;
- asynchronous mailboxes or concurrent delivery;
- fairness, scheduling, ordering across entities, or distributed delivery;
- persistence, recovery, supervision, retry, timeout, or cancellation;
- entity creation policy or registry discovery;
- capability delegation, revocation, quantity, or lifetime rules;
- general process calculus or temporal logic;
- full bisimulation or implementation equivalence;
- cluster sharding or remote procedure calls;
- Rust projection;
- M014 CLI integration;
- automatic proof that the evidence producer is complete or truthful.

# Primary uncertainty

Can a target-local entity boundary demonstrate stable identity and private sequential state without prematurely adding actor semantics to Core?
