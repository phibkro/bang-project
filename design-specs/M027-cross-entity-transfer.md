---
id: M027
title: Cross-entity atomic transfer
status: complete
timebox: 5 focused sessions
vision_claims:
  - cross-entity-semantic-composition
  - target-independent-law-disposition
  - atomic-relational-realization
  - derived-reactive-observation
  - independent-handler-conformance
depends_on:
  - M005
  - M011
  - M016
  - M025
  - M026
---

# Mission

BANG derives and runs one cross-entity TinyBank transfer service from a checked project and the existing mission-local `AccountLedger.transferPreservesTotal` relational obligation.

Core supplies the Account state machine, Balance refinement, and AccountLedger bridge structure. An explicit M012-style composition selection links their Integer carriers. The reusable obligations package supplies the transfer equations and preservation claim; Core does not declare transfer semantics. The service uses SQLite and Effect TypeScript, while an independent handler supplies transfer arithmetic. BANG checks the handler result against the validated obligation before it commits either account.

# User claim

> I can transfer value between two accounts, observe both accounts and their derived total reactively, reject an overdraft without a partial write or publication, reopen the database, and see which parts of the preservation claim came from Core, a reusable theory, a proof provider, the target, the runtime, and the observed scenario.

# Shipped journey

The canonical command is:

```sh
bang database examples/tiny-bank/database/transfer.json
```

The acceptance command is:

```sh
bun run demo:m027
```

The demo prepares the declared M011, M016, and M018 evidence. It then invokes the product command. The product command reads declared inputs only.

The journey is:

```text
compile examples/tiny-bank/project-transfer.json with Account, Balance, and AccountLedger
 -> validate the two explicit representation-compatible composition links
 -> derive the mission-local lawful AccountLedger.transferPreservesTotal obligation
 -> verify the declared M016 evidence and retain its qualification
 -> derive one Account table and one typed Effect boundary
 -> create account-a with balance 10
 -> create account-b with balance 2
 -> subscribe to AccountSummary(account-a)
 -> subscribe to AccountSummary(account-b)
 -> subscribe to TotalFunds
 -> observe revisions 0/0/0 and balances 10/2/12
 -> dispatch Transfer(account-a, account-b, 4)
 -> invoke the independent handler
 -> check the returned poststate against the relational obligation
 -> commit both accounts in one SQLite transaction
 -> publish account-a revision 1 balance 6
 -> publish account-b revision 1 balance 6
 -> publish TotalFunds revision 1 total 12
 -> dispatch Transfer(account-a, account-b, 7)
 -> receive TransferRejected
 -> observe no revision 2, no partial write, and no new subscription value
 -> reopen SQLite
 -> query both accounts and TotalFunds
 -> compare incremental observations with clean reopened queries
 -> emit one qualified law-disposition report
```

Generated artifacts are disposable and deterministic under:

```text
.bang/semantic-database/tiny-bank-transfer/
  schema.sql
  bindings.ts
  report.json
```

Unchanged inputs produce byte-identical generated artifacts and standard output. A failure emits no partial success report to standard output.

# Stable semantic inputs

M027 reuses:

- the checked `Account` state machine and `nonnegativeBalance` invariant;
- the checked `Balance` refinement;
- the checked `AccountBalance`, `LedgerBalance`, and `AccountLedger` bridge declarations;
- the `Balance` shared-sort relation across the bridge;
- the two explicit M012 representation-compatible links from `Balance` to the Account state field and bridge shared sort;
- `deriveTransferPreservationObligation` and its stable mission-local identity `AccountLedger.transferPreservesTotal`;
- the distinct bounded Z3 and unbounded Lean evidence recorded by M016;
- M025 project-owned source composition;
- M026's SQLite, Effect SQL, native Effect Reactivity, generated-boundary, deterministic-artifact, and honest-report conventions.

The checked bridge declares `balancesAgree`; it does not declare transfer, totals, transactions, or a relation between the Account state field and bridge carrier. `representation-compatible` establishes only that the explicitly selected carriers use Core `Integer`. It does not establish domain identity or semantic equivalence.

The M011 normalized obligation supplies the mission-local transfer variables, assumptions, and preservation claim after its bridge preconditions hold. Its finite bounds describe the bounded model-finding provider. They do not restrict the runtime account representation. The M016 Lean provider projects the arithmetic proposition over `Int`, but its evidence does not establish host implementation conformance.

# Selection boundary

The strict M027 selection declares:

```text
project `examples/tiny-bank/project-transfer.json`
entity state machine and balance field
Balance refinement
AccountLedger bridge and shared Balance sort
two explicit representation-compatible composition links
mission-local relational obligation
proof evidence input
public transfer command identity
public rejection identity
AccountSummary query and subscription
TotalFunds query and subscription
target database and API
bounded acceptance scenario
```

The selection does not restate the transfer equations or preservation claim. Those come from the canonical reusable obligation derivation. It does state the exact representation links that authorize applying that obligation to persisted Account balances.

# Reference checks

Before target generation, BANG checks:

1. the dedicated transfer project compiles and its evidence policy accepts the selected composition;
2. the project artifact contains the selected Account state machine;
3. the selected balance field exists and has the checked nonnegative invariant;
4. the project artifact contains the selected Balance refinement;
5. the project artifact contains the selected AccountLedger bridge;
6. the bridge shares an Integer-represented Balance sort across both participants;
7. `Balance.refinement-to-account-state` resolves to the selected Integer refinement and Account balance field;
8. `Balance.refinement-to-ledger-bridge` resolves to the same refinement and selected bridge shared sort;
9. the selected mission-local relational obligation derives from that checked bridge;
10. the M016 evidence names the same obligation and live material closure;
11. the lawful kernel observation is retained separately from bounded solver evidence;
12. the source and target account identities differ;
13. initial balances and transfer amount satisfy the scenario boundary;
14. target database and API identities are supported.

A failed check returns one typed failure and writes no target artifacts or partial report.

# Interaction contract

The generated Effect boundary exposes:

```text
create(AccountCreate) -> Effect<AccountSummary, typed create errors>
account(AccountQuery) -> Effect<AccountSummary, typed query errors>
total(TotalFundsQuery) -> Effect<TotalFunds, typed query errors>
transfer(TransferCommand) -> Effect<TransferResult, TransferRejected | typed service errors>
subscribeAccount(AccountQuery) -> Stream<AccountSummary, typed query errors>
subscribeTotal(TotalFundsQuery) -> Stream<TotalFunds, typed query errors>
```

Public observations are immutable snapshots. They do not expose mutable provider state.

The generated module contains schemas, public values, error values, and one provider service contract. It contains no SQLite import, query text, handler implementation, runtime execution, or semantic evaluator.

# Independent handler

The app-local transfer handler receives:

```text
source balance
target balance
transfer amount
```

It returns:

```text
source balance after
target balance after
```

The handler owns arithmetic implementation only. It does not own transaction boundaries, persistence, publication, revisions, query derivation, or the preservation law.

Before commit, the provider checks the handler result against the obligation's transfer equations and total-preservation claim using exact integer arithmetic. A violation is a typed runtime conformance failure and rolls back the transaction.

# Transaction contract

One accepted transfer:

1. reads both accounts inside one SQLite transaction;
2. rejects identical source and target identities;
3. checks a positive amount and sufficient source funds before invoking the handler;
4. invokes the independent handler;
5. checks both poststate equations, nonnegative balances, and preserved total;
6. conditionally updates both rows and increments both revisions;
7. commits both updates atomically;
8. invalidates the two AccountSummary dependencies and TotalFunds dependency only after successful commit.

A rejected or failed transfer changes neither account and publishes no subscription snapshot.

M027 has one client and no concurrent commands. It makes no conflict-resolution or fairness claim.

# Derived query contract

`TotalFunds` is a declared public observation derived from committed Account balances:

```text
revision = maximum committed account revision
total = sum of committed account balances
```

The SQLite target derives the query implementation. The query does not become semantic authority for `transferPreservesTotal`.

The transfer transaction invalidates AccountSummary for the source and target plus TotalFunds. Unrelated AccountSummary identities are not invalidated.

M027 subscriptions are process-local snapshots with:

- an initial value;
- commit-order updates from this provider process;
- no replay before subscription;
- no durable delivery guarantee;
- no duplicate-suppression guarantee beyond this bounded journey;
- typed failure and bounded collection lifetime.

# Law dispositions

The report keeps at least these claims distinct:

| Subject                             | Law                                    | Source                            | Mechanism            | Qualification        |
| ----------------------------------- | -------------------------------------- | --------------------------------- | -------------------- | -------------------- |
| AccountLedger bridge                | Balance sharing                        | checked Core                      | structure            | structurally-derived |
| Account balance application         | selected Integer carriers              | authored composition links        | representation check | structurally-derived |
| transfer obligation                 | transfer equations and preserved total | reusable mission-local derivation | derivation           | structurally-derived |
| abstract arithmetic                 | transferPreservesTotal                 | M016 Lean provider                | kernel               | kernel-proven        |
| generated API                       | typed interaction boundary             | target projection                 | type                 | static-checked       |
| two Account rows                    | atomic transfer                        | SQLite target                     | transaction          | runtime-checked      |
| independent handler result          | transfer equations and preserved total | validated obligation              | runtime evaluator    | runtime-checked      |
| source and target Account summaries | commit propagation                     | observed journey                  | scenario             | scenario-tested      |
| TotalFunds                          | preservation and reactive parity       | observed journey                  | scenario             | scenario-tested      |
| rejected overdraft                  | no write and no publication            | observed journey                  | scenario             | scenario-tested      |
| reopened service                    | persisted clean parity                 | observed journey                  | scenario             | scenario-tested      |

The report must preserve these limitations:

- the Lean theorem proves the projected abstract arithmetic proposition, not Effect or SQLite implementation conformance;
- neither equal Integer representations nor the composition links establish domain identity or semantic equivalence;
- runtime checks observe accepted commands but are not a universal proof that arbitrary host code cannot bypass the provider;
- the independent handler remains authored code;
- reactivity is process-local and can lose publication if the process fails after commit;
- the journey has one client and no concurrent commands;
- SQLite evidence does not establish replication, crash recovery, or hardware durability.

# Positive fixtures

M027 includes:

1. the canonical transfer selection;
2. a lawful independent handler;
3. deterministic generated SQL and Effect binding snapshots through byte comparison;
4. the accepted transfer journey;
5. the overdraft rejection journey;
6. incremental, clean, and reopened parity;
7. verified M016 evidence with kernel and bounded-provider distinctions retained.

# Negative fixtures

M027 rejects:

- an unsafe project or evidence path;
- an unknown state machine or balance field;
- an unknown bridge;
- an unknown relational obligation;
- a project that omits the bridge source;
- stale or malformed M016 evidence;
- identical source and target identities;
- a nonpositive amount;
- an initially overdrawn scenario;
- an unsupported database or API target;
- an independent handler result that violates an equation or preserved total;
- excess selection fields.

Each selection failure produces a nonzero exit status, one typed diagnostic on standard error, and empty standard output. Runtime conformance failure produces no partial commit or subscription publication.

# Falsifiers

M027 fails if:

1. the target or selection restates the transfer law instead of consuming the checked obligation;
2. the M016 proof is presented as implementation conformance;
3. one account commits without the other;
4. a rejected or invalid command increments a revision or emits a subscription value;
5. the independent handler runs before preconditions are checked;
6. a handler result can bypass the relational poststate checks;
7. TotalFunds differs between incremental and clean evaluation;
8. reopened state differs from the final committed state;
9. generated bindings import SQLite or contain the handler body;
10. the product command regenerates evidence or modifies files outside its output and scoped scratch directories;
11. unchanged inputs produce different output bytes;
12. a failure emits a partial success report.

# Explicit non-goals

M027 does not add:

- concurrent command execution;
- optimistic conflict handling;
- multiple entity kinds or arbitrary joins;
- unrestricted CRUD;
- automatic schema migration;
- a durable event log or changefeed;
- HTTP, WebSocket, RPC, or browser bindings;
- authentication or row-level security;
- replication, sharding, distributed transactions, CRDTs, or consensus;
- generated business handler bodies;
- a universal relational solver or proof framework;
- a second database target.

# Acceptance

1. Run `bun run demo:m027` from a clean checkout.
2. Observe the project, bridge, obligation, evidence, and generated artifact identities.
3. Inspect the generated SQLite schema and Effect boundary.
4. Observe initial AccountSummary values 10 and 2 and TotalFunds 12.
5. Observe one accepted transfer producing 6, 6, and 12 at revision 1.
6. Observe the exact relational handler checks before commit.
7. Observe `TransferRejected` for amount 7.
8. Observe no revision 2, no partial write, and no new subscription value.
9. Observe reopened AccountSummary and TotalFunds parity.
10. Inspect every qualified law disposition and limitation.
11. Run the command twice and compare standard output and generated artifacts byte-for-byte.
12. Exercise every negative selection and runtime fixture.
13. Type-check the generated Effect boundary.
14. Run focused target, runtime, CLI, report, and evidence tests.
15. Obtain independent review.
16. Run `just verify`.

# Primary uncertainty

Can one explicitly composed Core structure plus a mission-local reusable relation coordinate an independent handler boundary, an atomic relational realization, a derived reactive observation, and honestly separated proof/runtime/scenario evidence without allowing the target to invent the missing meaning?

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0007-modular-propositions-providers-and-realizations.md`;
- `decisions/0011-semantic-data-service-exploration.md`;
- `design-specs/M005-two-related-theories.md`;
- `design-specs/M011-solver-backed-relational-obligation.md`;
- `design-specs/M016-dual-provider-evidence.md`;
- `design-specs/M025-single-authority-project.md`;
- `design-specs/M026-semantic-database.md`;
- `design-specs/M012-accumulated-system-report.md`;
- `examples/tiny-bank/core/account-ledger-bridge.json`;
- `examples/tiny-bank/core/balance.json`;
- `examples/tiny-bank/system/account-ledger.json`;
- `packages/obligations/src/index.ts`;
- `../effect/packages/sql/sqlite-bun/src/SqliteClient.ts`;
- `../effect/packages/effect/src/unstable/reactivity/Reactivity.ts`.
