---
id: M018
title: Single-use capability
status: complete
timebox: 5 focused sessions
vision_claims:
  - explicit-capability-quantity
  - single-use-authority
  - atomic-grant-consumption
  - qualified-runtime-evidence
depends_on:
  - M006
  - M007
  - M015
---

# Mission

BANG can declare a capability-use quantity for one operation realization.

An Effect target can issue one grant for the quantified requirement. The target consumes that grant before one operation execution.

The evidence records one accepted use and one rejected reuse. The report keeps quantity separate from lifetime and physical resources.

# User claim

A contributor selects `WithdrawAccountOnce`. This realization requires one use of `DebitAccount`.

The contributor creates `account-1` with balance `10` and receives one grant. A withdrawal of `4` consumes the grant and returns balance `6`.

A second withdrawal with the same grant fails before the withdrawal implementation runs. The balance remains `6`.

```text
grant DebitAccount with quantity 1
  -> withdraw 4
  -> Succeeded(balance 6, remaining uses 0)
  -> withdraw 1 with the same grant
  -> CapabilityUseRejected(balance 6, remaining uses 0)
```

# Falsifiers

The mission fails for these observations:

1. The quantity is target metadata and is absent from checked Core.
2. A requirement omits its quantity.
3. The checker accepts zero or a negative bounded quantity.
4. The target silently treats an unsupported quantity as unbounded.
5. The second call reaches the withdrawal implementation.
6. The second call changes the Account balance.
7. Two concurrent calls can both consume the same single-use grant.
8. A typed failure or defect restores a consumed grant.
9. A wrong destination or disabled transition consumes the grant.
10. The report equates one use with a lifetime, memory, time, or delivery guarantee.
11. Generated output or evidence changes without an input change.

# Core representation

Each operation-realization requirement has one capability identity and one quantity.

```text
CapabilityRequirement {
  capability: Identifier
  quantity: CapabilityQuantity
}

CapabilityQuantity =
  | Unbounded
  | Exactly { uses: PositiveDecimalInteger }
```

The canonical JSON representation uses tagged quantity values.

```json
{
  "capability": "DebitAccount",
  "quantity": { "kind": "exactly", "uses": "1" }
}
```

The existing `WithdrawAccount` realization uses `{ "kind": "unbounded" }`. Existing reusable journeys keep their current meaning.

The new `WithdrawAccountOnce` realization binds the same checked transition. It uses an exact quantity of `1`.

# Source notation

The Account source uses explicit quantity words.

```text
realization WithdrawAccount binds Account.withdraw {
  requires DebitAccount unbounded
  when disabled fail WithdrawalRejected
}

realization WithdrawAccountOnce binds Account.withdraw {
  requires DebitAccount exactly 1
  when disabled fail WithdrawalRejectedOnce
}
```

`WithdrawalRejectedOnce` is distinct because realization failure identities are globally unique in checked Core.

The parser does not supply a default quantity.

# Core judgments

Let `K` be a checked capability. Let `q` be a checked quantity.

```text
K in Capabilities
--------------------------------
K requires unbounded capability use
```

```text
K in Capabilities    n > 0
--------------------------------
K requires exactly n capability uses
```

For a grant `g` with one remaining use:

```text
remaining(g) = 1    destination is valid    transition is enabled
-----------------------------------------------------------------
consume(g); run operation; remaining(g) = 0
```

```text
remaining(g) = 0
------------------------------------------
reject reuse before operation execution
```

A wrong destination or disabled transition does not authorize an operation execution. These rejections do not consume the grant.

After consumption, a typed implementation failure or defect does not restore the grant. Consumption authorizes one execution attempt, not one successful result.

# Semantic boundary

Checked Core owns these facts:

- the capability identity;
- the operation-realization identity;
- the quantity kind;
- the positive exact-use count;
- the relation between the realization and its capability requirement.

The Effect target owns these facts:

- the grant representation;
- atomic grant state;
- grant issuance;
- the runtime order of checks, consumption, and implementation execution;
- the target error for reuse.

The evidence provider owns the recorded observations. Evidence does not define the Core quantity judgment.

# Effect projection

`@bang/target-effect` projects `WithdrawAccountOnce` into a mission-specific generated boundary.

The generated boundary contains:

- the existing checked Account state and withdrawal types;
- a `DebitAccount` issuer service;
- an opaque `DebitAccountGrant` value;
- private atomic state with `available` and `consumed` cases;
- `DebitAccountGrantAlreadyConsumed` as a typed target error;
- a quantified withdrawal function that receives the grant explicitly;
- a result classifier that keeps success, domain rejection, reuse rejection, and defect separate.

The target supports only `exactly 1` in this mission. It rejects other exact quantities with `unsupported-target`.

The grant uses an atomic state transition. The target does not use a read-then-write sequence.

# Runtime order

The generated quantified boundary uses this order:

1. Check the destination.
2. Check the Core transition requirement.
3. Consume the grant atomically.
4. Run the independent withdrawal implementation.
5. Record the result and remaining-use observation.

Steps 1 and 2 cannot consume the grant. Step 3 commits before the implementation starts.

# Evidence contract

The M018 manifest uses `runtime-checked` evidence with scope `single-grant-two-call-trace`.

The manifest records:

- stable Core identities;
- the declared quantity;
- the grant identity inside the bounded trace;
- the use count before and after each call;
- the implementation invocation count;
- the Account state before and after each call;
- success and reuse-rejection outcomes;
- source, generated boundary, realization, and evaluator digests;
- assumptions, target weakenings, lifetime, and invalidators.

The checker rejects:

- unknown Core identities;
- a quantity that differs from checked Core;
- a first call that does not consume one use;
- a second call that invokes the implementation;
- a reuse rejection that changes Account state;
- a use count that increases;
- duplicate call identities;
- missing target weakenings;
- stale material digests.

# Negative runtime fixture

A spy implementation increments an invocation counter before it returns.

The accepted first call increments the counter to `1`. The rejected second call keeps the counter at `1`.

A defect fixture consumes a fresh grant and then defects. A second call with that grant fails as already consumed.

This fixture makes restoration after a defect observable.

# Target weakening

TypeScript and Effect cannot make the grant universally unforgeable. Unsafe casts, foreign JavaScript, or direct implementation calls can bypass the boundary.

The target proves no lifetime, elapsed-time, memory, termination, fairness, delivery, or distributed exactly-once property.

The runtime journey observes one grant in one process. It does not prove all implementations conform.

# Vertical acceptance path

1. Parse and check explicit capability quantities.
2. Reject missing, zero, negative, duplicate, and unknown capability requirements.
3. Select `WithdrawAccountOnce` by stable identity.
4. Generate one deterministic Effect boundary.
5. Compile the generated boundary with an independent realization.
6. Issue one single-use grant.
7. Withdraw `4` from balance `10` and observe balance `6`.
8. Reuse the grant and reject the call before implementation execution.
9. Observe balance `6`, zero remaining uses, and one implementation call.
10. Observe that a defect does not restore a consumed grant.
11. Write and strictly reload deterministic M018 evidence.
12. Reject identity, quantity, trace, and material drift.
13. Keep all completed missions green.
14. Pass `just verify`.

# Non-goals

M018 does not add:

- general linear types;
- affine or relevant type checking;
- fractional permissions;
- capability delegation;
- revocation;
- lifetime tracking;
- physical resource accounting;
- persistence;
- distributed grants;
- exactly-once delivery;
- temporal logic;
- a provider or target registry.

# One-command journey

```sh
bun run demo:m018
```
