import { describe, expect, test } from "bun:test";
import { Effect, Result } from "effect";

import {
  MAX_LEDGER_MINOR_UNITS,
  GeneralEntryRequestSchema,
  decodeGeneralEntryRequest,
  foldJournal,
  makeExpenseRequest,
  makeIncomeRequest,
  makeTransferRequest,
  type GeneralEntryRequest,
  type JournalEntry,
  validateEntry,
} from "../apps/bang/src/ledger-domain.ts";

const accounts = [
  { id: "cash", type: "asset" as const },
  { id: "savings", type: "asset" as const },
  { id: "salary", type: "income" as const },
  { id: "groceries", type: "expense" as const },
  { id: "empty", type: "asset" as const },
];

const decode = (value: unknown) => Effect.runSync(decodeGeneralEntryRequest(value));

const failure = (request: GeneralEntryRequest, expected?: "income" | "expense" | "transfer") => {
  const result = validateEntry(request, accounts, expected);
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isSuccess(result)) throw new Error("expected a family-ledger failure");
  return result.failure;
};

const checked = (
  request: GeneralEntryRequest,
  expected?: "income" | "expense" | "transfer",
): JournalEntry => {
  const result = validateEntry(request, accounts, expected);
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

describe("family ledger domain schemas", () => {
  test("decode canonical JSON amounts as bigint and reject unsafe numbers", () => {
    const request = decode({
      transactionId: "income-1",
      description: "Monthly income",
      postings: [
        { accountId: "cash", side: "debit", amount: "100000" },
        { accountId: "salary", side: "credit", amount: "100000" },
      ],
    });

    expect(request.postings[0]?.amount).toBe(100000n);
    expect(
      Result.isFailure(
        Effect.runSync(
          Effect.result(
            decodeGeneralEntryRequest({
              transactionId: "income-1",
              description: "Monthly income",
              postings: [
                { accountId: "cash", side: "debit", amount: 100000 },
                { accountId: "salary", side: "credit", amount: "100000" },
              ],
            }),
          ),
        ),
      ),
    ).toBe(true);
  });

  test("strict request schemas reject excess properties and amounts above SQLite INTEGER", () => {
    const extra = Effect.runSync(
      Effect.result(
        decodeGeneralEntryRequest({
          transactionId: "tx-1",
          description: "extra",
          postings: [
            { accountId: "cash", side: "debit", amount: "1", extra: true },
            { accountId: "salary", side: "credit", amount: "1" },
          ],
        }),
      ),
    );
    expect(Result.isFailure(extra)).toBe(true);

    const outOfRange = Effect.runSync(
      Effect.result(
        decodeGeneralEntryRequest({
          transactionId: "tx-1",
          description: "too large",
          postings: [
            { accountId: "cash", side: "debit", amount: (MAX_LEDGER_MINOR_UNITS + 1n).toString() },
            {
              accountId: "salary",
              side: "credit",
              amount: (MAX_LEDGER_MINOR_UNITS + 1n).toString(),
            },
          ],
        }),
      ),
    );
    expect(Result.isFailure(outOfRange)).toBe(true);
    expect(GeneralEntryRequestSchema).toBeDefined();
  });
});

describe("family ledger canonical constructors and validation", () => {
  test("standard constructors create exactly balanced canonical postings", () => {
    const income = makeIncomeRequest("income-1", "cash", "salary", 100000n, "Monthly income");
    expect(income.postings).toEqual([
      { accountId: "cash", side: "debit", amount: 100000n },
      { accountId: "salary", side: "credit", amount: 100000n },
    ]);

    const expense = makeExpenseRequest("expense-1", "cash", "groceries", 25000n, "Groceries");
    expect(expense.postings).toEqual([
      { accountId: "groceries", side: "debit", amount: 25000n },
      { accountId: "cash", side: "credit", amount: 25000n },
    ]);

    const transfer = makeTransferRequest("transfer-1", "cash", "savings", 5000n, "Move");
    expect(transfer.postings).toEqual([
      { accountId: "savings", side: "debit", amount: 5000n },
      { accountId: "cash", side: "credit", amount: 5000n },
    ]);
  });

  test("validation enforces known accounts, positive bounded amounts, and exact balance", () => {
    const unknown = failure({
      transactionId: "tx-unknown",
      description: "unknown",
      postings: [
        { accountId: "cash", side: "debit", amount: 1n },
        { accountId: "missing", side: "credit", amount: 1n },
      ],
    });
    expect(unknown.reason).toBe("unknown-account");

    const zero = failure({
      transactionId: "tx-zero",
      description: "zero",
      postings: [
        { accountId: "cash", side: "debit", amount: 0n },
        { accountId: "salary", side: "credit", amount: 0n },
      ],
    });
    expect(zero.reason).toBe("invalid-amount");

    const tooLarge = failure({
      transactionId: "tx-large",
      description: "large",
      postings: [
        { accountId: "cash", side: "debit", amount: MAX_LEDGER_MINOR_UNITS + 1n },
        { accountId: "salary", side: "credit", amount: MAX_LEDGER_MINOR_UNITS + 1n },
      ],
    });
    expect(tooLarge.reason).toBe("amount-out-of-range");

    const unbalanced = failure({
      transactionId: "tx-unbalanced",
      description: "bad",
      postings: [
        { accountId: "cash", side: "debit", amount: 2n },
        { accountId: "salary", side: "credit", amount: 1n },
      ],
    });
    expect(unbalanced.reason).toBe("unbalanced-entry");

    const tooFew = failure({
      transactionId: "tx-one",
      description: "one",
      postings: [{ accountId: "cash", side: "debit", amount: 1n }],
    });
    expect(tooFew.reason).toBe("invalid-request");
  });

  test("standard validation enforces account types and rejects self-transfer", () => {
    expect(
      failure(
        {
          transactionId: "bad-income",
          description: "wrong source type",
          postings: [
            { accountId: "groceries", side: "debit", amount: 1n },
            { accountId: "salary", side: "credit", amount: 1n },
          ],
        },
        "income",
      ).reason,
    ).toBe("wrong-account-type");
    expect(
      failure(
        {
          transactionId: "bad-expense",
          description: "wrong side",
          postings: [
            { accountId: "cash", side: "debit", amount: 1n },
            { accountId: "groceries", side: "credit", amount: 1n },
          ],
        },
        "expense",
      ).reason,
    ).toBe("wrong-account-type");

    expect(
      failure(makeTransferRequest("self-transfer", "cash", "cash", 1n, "self"), "transfer").reason,
    ).toBe("self-transfer");
  });
});

describe("family ledger fingerprints and journal folds", () => {
  test("fingerprint material is independent of JSON property order", () => {
    const left: GeneralEntryRequest = {
      transactionId: "tx-order",
      description: "same",
      postings: [
        { accountId: "cash", side: "debit", amount: 4n },
        { accountId: "salary", side: "credit", amount: 4n },
      ],
    };
    const right: GeneralEntryRequest = {
      postings: [
        { amount: 4n, side: "debit", accountId: "cash" },
        { amount: 4n, accountId: "salary", side: "credit" },
      ],
      description: "same",
      transactionId: "tx-order",
    };
    const first = checked(left);
    const second = checked(right);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.postings.map((posting) => posting.lineId)).toEqual(["tx-order:0", "tx-order:1"]);
  });

  test("fold reconstructs sorted debit-normal and credit-normal balances including zero accounts", () => {
    const entries = [
      checked(makeIncomeRequest("income-1", "cash", "salary", 100n, "income"), "income"),
      checked(makeExpenseRequest("expense-1", "cash", "groceries", 25n, "food"), "expense"),
      checked(makeTransferRequest("transfer-1", "cash", "savings", 10n, "move"), "transfer"),
    ];
    const folded = foldJournal(entries, accounts);
    if (Result.isFailure(folded)) throw folded.failure;
    expect(folded.success).toEqual([
      { accountId: "cash", balance: 65n },
      { accountId: "empty", balance: 0n },
      { accountId: "groceries", balance: 25n },
      { accountId: "salary", balance: 100n },
      { accountId: "savings", balance: 10n },
    ]);
  });

  test("fold rejects malformed, unbalanced, and non-deterministic decoded journals", () => {
    const valid = checked(makeIncomeRequest("income-1", "cash", "salary", 10n, "income"), "income");
    const unbalanced: JournalEntry = {
      ...valid,
      postings: [{ ...valid.postings[0]!, amount: 9n }, valid.postings[1]!],
    };
    const badBalance = foldJournal([unbalanced], accounts);
    expect(Result.isFailure(badBalance)).toBe(true);
    if (Result.isFailure(badBalance)) expect(badBalance.failure.reason).toBe("corrupt-journal");

    const badLine: JournalEntry = {
      ...valid,
      postings: [{ ...valid.postings[0]!, lineId: "income-1:9" }, valid.postings[1]!],
    };
    const badIdentity = foldJournal([badLine], accounts);
    expect(Result.isFailure(badIdentity)).toBe(true);
    if (Result.isFailure(badIdentity)) expect(badIdentity.failure.reason).toBe("corrupt-journal");
  });
});
