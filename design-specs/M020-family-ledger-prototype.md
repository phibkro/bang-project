---
id: M020
title: Persistent family ledger prototype
status: complete
timebox: 6 focused sessions
vision_claims:
  - usable-domain-prototype
  - persistent-double-entry-journal
  - idempotent-transaction-identity
  - journal-derived-balances
depends_on:
  - M014
  - M015
  - M019
---

# Mission

BANG can operate one correct local family ledger through shipped CLI commands that run as separate processes.

The ledger stores immutable balanced journal entries. It derives every account balance from those entries. It does not store a second mutable balance authority.

# User claim

> A family can create one local ledger, create accounts, record income, expenses, and transfers, and inspect balances and journal history without duplicate transactions changing the result twice.

# User journey

The journey uses one isolated data directory and one fixed currency, `LOCAL`.

```sh
bang --data-dir <directory> ledger init family-1 "Family ledger"
bang --data-dir <directory> ledger account create cash "Cash" asset
bang --data-dir <directory> ledger account create salary "Salary" income
bang --data-dir <directory> ledger account create groceries "Groceries" expense
bang --data-dir <directory> ledger post income income-1 cash salary 100000 "Monthly income"
bang --data-dir <directory> ledger post expense expense-1 cash groceries 25000 "Groceries"
bang --data-dir <directory> ledger balances
bang --data-dir <directory> ledger journal
bang --data-dir <directory> ledger rebuild verify
```

A separate transfer journey creates a second asset account and moves value between the two asset accounts.

Amounts are positive integer minor units. The CLI does not use JavaScript floating-point values for money.

# Accounting boundary

The ledger has three account types:

- `asset`;
- `income`;
- `expense`.

Every journal entry has at least two postings. Every posting has one account, one side (`debit` or `credit`), and a positive amount in minor units.

An entry is balanced exactly when:

```text
sum(debit minor units) = sum(credit minor units)
```

The standard commands create these postings:

| Command  | Debit             | Credit         |
| -------- | ----------------- | -------------- |
| income   | destination asset | income account |
| expense  | expense account   | source asset   |
| transfer | destination asset | source asset   |

Asset and expense balances are debit-normal. Income balances are credit-normal.

The mission adds no overdraft policy. A negative asset balance is an accounting observation, not an invalid journal entry.

# Identity and idempotency

The caller supplies a stable transaction identity.

- The first accepted payload for an identity appends one journal entry.
- Repeating the same canonical payload returns the existing entry and appends nothing.
- Reusing the identity with a different payload fails with `transaction-identity-conflict` and appends nothing.

Account and transaction identities are stable nonempty identifiers. Journal line identities are deterministic from the transaction identity and line position.

# Persistence boundary

The application stores one SQLite database inside the selected data directory. The schema has separate ledger, account, transaction, and posting relations.

Accepted mutations run in one SQLite transaction. The database uses unique constraints for ledger, account, transaction, and posting identities. SQLite supplies local writer serialization; M020 makes no distributed database claim.

There is no product command to edit or delete an accepted transaction or posting.

Normal balance queries aggregate the persisted journal. `ledger rebuild verify` independently folds the complete decoded journal and compares the result with the SQL aggregate for every account.

# Semantic authority

M020 does not add a Core primitive.

Current Core cannot express an append-only journal, transaction identity, idempotency, or a fold over postings. Pretending that the existing `AccountLedger.balancesAgree` sampled bridge law defines these semantics would overstate its authority.

The family-ledger domain module owns the accounting judgments. It keeps validation and journal folding as total direct functions. Effect owns persistence, transactions, configuration, and CLI composition.

Existing checked Core and historical Account/Ledger evidence remain independent demonstrations. They do not authorize a ledger mutation.

# Command contract

The root command accepts `--data-dir <directory>`. It defaults to `.bang/family-ledger`.

The shipped ledger subtree supports:

```text
ledger init
ledger account create
ledger post income
ledger post expense
ledger post transfer
ledger post entry
ledger journal
ledger balances
ledger rebuild verify
```

`ledger post entry <request.json>` accepts one strict Schema-backed general entry request. It exists to exercise balanced and unbalanced requests without adding a second accounting path. Standard income, expense, and transfer commands construct the same canonical entry request.

A successful command writes one deterministic readable result to standard output and exits `0`.

A failed command writes no successful result, writes one typed diagnostic to standard error, exits nonzero, and leaves the ledger unchanged.

# Failure contract

The application preserves these failure reasons:

- `not-initialized`;
- `already-initialized`;
- `duplicate-account`;
- `unknown-account`;
- `wrong-account-type`;
- `invalid-amount`;
- `self-transfer`;
- `unbalanced-entry`;
- `transaction-identity-conflict`;
- `invalid-request`;
- `corrupt-journal`;
- `storage-failure`.

Failures retain the relevant ledger, account, transaction, request path, or storage path identity.

# Falsifiers

M020 fails for any of these observations:

1. A successful entry has unequal debit and credit totals.
2. A failed command changes the journal or a balance.
3. Replaying an identical transaction appends another entry.
4. Replaying a changed payload under the same identity succeeds.
5. A balance depends on mutable state that cannot be reconstructed from the journal.
6. A process restart loses an accepted account or transaction.
7. An accepted transaction or posting can be edited or deleted through the CLI.
8. A malformed or unbalanced general entry succeeds.
9. A query silently accepts malformed persisted rows.
10. The report describes runtime checks as proof of all ledger behavior.

# Acceptance path

1. Start with an isolated empty data directory.
2. Initialize one family ledger.
3. Create two asset accounts, one income account, and one expense account.
4. Record one income, one expense, and one transfer in separate CLI processes.
5. Repeat the income with the same identity and payload; observe no new journal entry.
6. Repeat that identity with a changed amount; observe `transaction-identity-conflict` and no state change.
7. Submit an unbalanced general entry; observe `unbalanced-entry` and no state change.
8. Submit unknown-account and self-transfer requests; observe typed failures and no state change.
9. Query the journal and verify every entry is balanced.
10. Query balances and compare them with the expected exact minor-unit values.
11. Run `ledger rebuild verify` and observe agreement for every account.
12. Run the journey again from new processes against the same database.
13. Run `bun test tests/ledger-domain.test.ts tests/ledger-cli.test.ts`.
14. Run `just verify`.

# Evidence classification

The acceptance journey produces `runtime-checked` evidence with scope `single-local-sqlite-ledger`.

It demonstrates:

- persistence across the observed separate CLI processes;
- balanced accepted entries in the observed journal;
- typed rejection without mutation for the exercised failures;
- idempotent replay for the exercised transaction identity;
- agreement between SQL aggregation and independent journal folding.

It does not demonstrate:

- a proof of accounting correctness;
- distributed exactly-once delivery;
- concurrent multi-writer linearizability beyond SQLite's local transaction behavior;
- durability after storage or operating-system failure;
- multi-currency accounting;
- bank integration, reconciliation, tax, lending, budgeting, or audit certification;
- authorization, encryption, privacy, or production readiness.

# Non-goals

- no occupational-health implementation;
- no new Core declaration or surface syntax;
- no mutable balance table;
- no transaction edit or delete command;
- no floating-point money;
- no multi-currency conversion;
- no remote database or network service;
- no GUI, daemon, watch mode, or deployment;
- no claim that the family ledger is regulated financial software.

# Primary uncertainty

Can BANG's existing typed boundary, Effect application model, and shipped CLI support one genuinely useful persistent domain without moving application-specific accounting semantics into Core or weakening evidence honesty?

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `design-specs/M014-cohesive-system-cli.md`;
- `design-specs/M015-entity-ownership-and-messages.md`;
- `design-specs/M019-real-bang-self-check.md`;
- `examples/tiny-bank/account.bang`;
- `examples/tiny-bank/core/account-ledger-bridge.json`;
- `../effect/packages/sql/sqlite-bun/src/SqliteClient.ts`;
- `../effect/packages/effect/src/unstable/sql/SqlClient.ts`.
