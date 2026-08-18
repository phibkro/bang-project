import { Result, Schema } from "effect";

/** The largest exact integer accepted by SQLite INTEGER columns. */
export const MAX_LEDGER_MINOR_UNITS = 9_223_372_036_854_775_807n;

const strict = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Struct(fields).annotate({ parseOptions: { onExcessProperty: "error" } });

const identifierPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const identifier = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.check(Schema.isPattern(identifierPattern)),
);

/** A stable identifier used by the family-ledger relations. */
export const IdentifierSchema = identifier;
export type Identifier = typeof IdentifierSchema.Type;

export const LedgerId = identifier;
export type LedgerId = typeof LedgerId.Type;
export const LedgerIdSchema = LedgerId;

export const AccountId = identifier;
export type AccountId = typeof AccountId.Type;
export const AccountIdSchema = AccountId;

export const TransactionId = identifier;
export type TransactionId = typeof TransactionId.Type;
export const TransactionIdSchema = TransactionId;

const postingId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9_-]*:[0-9]+$/)),
);
export const PostingId = postingId;
export type PostingId = typeof PostingId.Type;
export const PostingIdSchema = PostingId;

export const AccountType = Schema.Literals(["asset", "income", "expense"]);
export type AccountType = typeof AccountType.Type;
export const AccountTypeSchema = AccountType;

export const PostingSide = Schema.Literals(["debit", "credit"]);
export type PostingSide = typeof PostingSide.Type;
export const PostingSideSchema = PostingSide;

export const LedgerCurrency = Schema.Literal("LOCAL");
export type LedgerCurrency = typeof LedgerCurrency.Type;
export const Currency = LedgerCurrency;
const amountFilter = Schema.makeFilter(
  (value: unknown): value is bigint =>
    typeof value === "bigint" && value >= 1n && value <= MAX_LEDGER_MINOR_UNITS,
  { expected: `a positive bigint no greater than ${MAX_LEDGER_MINOR_UNITS}` },
);

/** A positive minor-unit amount decoded from its canonical decimal JSON string. */
export const Amount = Schema.BigIntFromString.pipe(Schema.check(amountFilter));
export type Amount = typeof Amount.Type;
export const AmountSchema = Amount;

/** A positive minor-unit amount already decoded from a safe SQLite INTEGER. */
export const MinorUnits = Schema.BigInt.pipe(Schema.check(amountFilter));
export type MinorUnits = typeof MinorUnits.Type;
export const MinorUnitsSchema = MinorUnits;

const nonEmptyText = Schema.String.pipe(Schema.check(Schema.isNonEmpty()));

const PostingRequestSchema = strict({
  accountId: AccountId,
  side: PostingSide,
  amount: Amount,
});
export type PostingRequest = typeof PostingRequestSchema.Type;
export const GeneralPostingSchema = PostingRequestSchema;

/** The canonical decoded representation accepted by the general-entry command. */
export const GeneralEntryRequest = strict({
  transactionId: TransactionId,
  description: Schema.String,
  postings: Schema.Array(PostingRequestSchema),
});
export type GeneralEntryRequest = typeof GeneralEntryRequest.Type;
export const GeneralEntryRequestSchema = GeneralEntryRequest;
export const GeneralEntryRequestFromJson = Schema.fromJsonString(GeneralEntryRequest);

export const decodeGeneralEntryRequest = (value: unknown) =>
  Schema.decodeUnknownEffect(GeneralEntryRequest)(value, { onExcessProperty: "error" });
export const decodeGeneralEntryRequestJson = (value: string) =>
  Schema.decodeUnknownEffect(GeneralEntryRequestFromJson)(value, { onExcessProperty: "error" });

export const Account = strict({
  id: AccountId,
  name: nonEmptyText,
  type: AccountType,
});
export const AccountSchema = Account;
export type Account = typeof Account.Type;

export const Ledger = strict({
  id: LedgerId,
  name: nonEmptyText,
  currency: LedgerCurrency,
});
export const LedgerSchema = Ledger;
export type Ledger = typeof Ledger.Type;

/** A persisted ledger row. Kept separate from the decoded relation to make the boundary explicit. */
export const LedgerRow = Ledger;
export type LedgerRow = typeof LedgerRow.Type;
export const LedgerRowSchema = LedgerRow;

export const AccountRow = strict({
  ledgerId: LedgerId,
  id: AccountId,
  name: nonEmptyText,
  type: AccountType,
});
export type AccountRow = typeof AccountRow.Type;
export const AccountRowSchema = AccountRow;

export const Posting = strict({
  lineId: PostingId,
  accountId: AccountId,
  side: PostingSide,
  amount: MinorUnits,
});
export type Posting = typeof Posting.Type;
export const PostingSchema = Posting;
export const JournalPosting = Posting;
export type JournalPosting = Posting;

export const TransactionRow = strict({
  ledgerId: LedgerId,
  transactionId: TransactionId,
  description: Schema.String,
  fingerprint: nonEmptyText,
});
export type TransactionRow = typeof TransactionRow.Type;
export const TransactionRowSchema = TransactionRow;

export const PostingRow = strict({
  ledgerId: LedgerId,
  transactionId: TransactionId,
  lineId: PostingId,
  accountId: AccountId,
  side: PostingSide,
  amount: MinorUnits,
});
export type PostingRow = typeof PostingRow.Type;
export const PostingRowSchema = PostingRow;

/** A decoded immutable entry assembled from one transaction row and its posting rows. */
export const JournalEntry = strict({
  transactionId: TransactionId,
  description: Schema.String,
  fingerprint: nonEmptyText,
  postings: Schema.Array(Posting),
});
export type JournalEntry = typeof JournalEntry.Type;
export const JournalEntrySchema = JournalEntry;
export const JournalRow = JournalEntry;
export type JournalRow = JournalEntry;
export const JournalRowSchema = JournalRow;

export const JournalResult = strict({ entries: Schema.Array(JournalEntry) });
export type JournalResult = typeof JournalResult.Type;
export const JournalResultSchema = JournalResult;

export const BalanceResult = strict({
  accountId: AccountId,
  balance: Schema.BigInt,
});
export type BalanceResult = typeof BalanceResult.Type;
export const BalanceResultSchema = BalanceResult;
export const BalanceRow = BalanceResult;
export type BalanceRow = BalanceResult;
export const BalanceRowSchema = BalanceRow;

export const IncomeRequest = strict({
  transactionId: TransactionId,
  destinationAccountId: AccountId,
  incomeAccountId: AccountId,
  amount: Amount,
  description: Schema.String,
});
export type IncomeRequest = typeof IncomeRequest.Type;
export const IncomeRequestSchema = IncomeRequest;

export const ExpenseRequest = strict({
  transactionId: TransactionId,
  sourceAccountId: AccountId,
  expenseAccountId: AccountId,
  amount: Amount,
  description: Schema.String,
});
export type ExpenseRequest = typeof ExpenseRequest.Type;
export const ExpenseRequestSchema = ExpenseRequest;

export const TransferRequest = strict({
  transactionId: TransactionId,
  sourceAccountId: AccountId,
  destinationAccountId: AccountId,
  amount: Amount,
  description: Schema.String,
});
export type TransferRequest = typeof TransferRequest.Type;
export const TransferRequestSchema = TransferRequest;

export type StandardEntryKind = "income" | "expense" | "transfer";
export const StandardEntryKindSchema = Schema.Literals(["income", "expense", "transfer"]);

export type FamilyLedgerErrorReason =
  | "not-initialized"
  | "already-initialized"
  | "duplicate-account"
  | "unknown-account"
  | "wrong-account-type"
  | "invalid-amount"
  | "amount-out-of-range"
  | "self-transfer"
  | "unbalanced-entry"
  | "transaction-identity-conflict"
  | "invalid-request"
  | "corrupt-journal"
  | "storage-failure";

export const FamilyLedgerErrorReason = Schema.Literals([
  "not-initialized",
  "already-initialized",
  "duplicate-account",
  "unknown-account",
  "wrong-account-type",
  "invalid-amount",
  "amount-out-of-range",
  "self-transfer",
  "unbalanced-entry",
  "transaction-identity-conflict",
  "invalid-request",
  "corrupt-journal",
  "storage-failure",
]);

/** A typed domain/storage failure retaining the useful identity and path context. */
export class FamilyLedgerError extends Schema.TaggedError<FamilyLedgerError>()(
  "FamilyLedgerError",
  {
    reason: FamilyLedgerErrorReason,
    message: Schema.String,
    path: Schema.optional(Schema.String),
    identity: Schema.optional(Schema.String),
    ledgerId: Schema.optional(LedgerId),
    accountId: Schema.optional(AccountId),
    transactionId: Schema.optional(TransactionId),
    requestPath: Schema.optional(Schema.String),
    storagePath: Schema.optional(Schema.String),
  },
) {}

const error = (
  reason: FamilyLedgerErrorReason,
  message: string,
  fields: {
    readonly path?: string;
    readonly identity?: string;
    readonly ledgerId?: LedgerId;
    readonly accountId?: AccountId;
    readonly transactionId?: TransactionId;
    readonly requestPath?: string;
    readonly storagePath?: string;
  } = {},
): FamilyLedgerError => new FamilyLedgerError({ reason, message, ...fields });

export type KnownAccounts =
  | ReadonlyArray<Pick<Account, "id" | "type">>
  | ReadonlyMap<string, AccountType | Pick<Account, "id" | "type">>
  | Readonly<Record<string, AccountType | Pick<Account, "id" | "type">>>;

const accountTypes = (accounts: KnownAccounts): ReadonlyMap<string, AccountType> => {
  if (accounts instanceof Map) {
    return new Map(
      Array.from(accounts.entries()).map(([id, value]) => [
        id,
        typeof value === "string" ? value : value.type,
      ]),
    );
  }
  if (Array.isArray(accounts)) {
    return new Map(accounts.map((account) => [account.id, account.type]));
  }
  return new Map(
    Object.entries(accounts).map(([id, value]) => [
      id,
      typeof value === "string" ? value : value.type,
    ]),
  );
};

const isIdentifier = (value: unknown): value is string =>
  typeof value === "string" && identifierPattern.test(value);
const isPostingSide = (value: unknown): value is PostingSide =>
  value === "debit" || value === "credit";
const isPostingId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]*:[0-9]+$/.test(value);

/** Derive the stable posting identity from a transaction identity and zero-based line position. */
export const lineIdentity = (transactionId: TransactionId, position: number): PostingId =>
  `${transactionId}:${position}`;
export const postingIdentity = lineIdentity;

const lengthPrefixedField = (value: string): string => `${value.length}:${value}`;

/**
 * Build a delimiter-safe, property-order-independent material string for transaction identity.
 * Posting order is semantic because it determines the immutable line identity.
 */
export const canonicalTransactionMaterial = (request: GeneralEntryRequest): string =>
  [
    "family-ledger-transaction-v1",
    lengthPrefixedField(request.transactionId),
    lengthPrefixedField(request.description),
    lengthPrefixedField(String(request.postings.length)),
    ...request.postings.map((posting, index) =>
      [
        lengthPrefixedField(String(index)),
        lengthPrefixedField(posting.accountId),
        lengthPrefixedField(posting.side),
        lengthPrefixedField(posting.amount.toString(10)),
      ].join(""),
    ),
  ].join("");
export const transactionFingerprintMaterial = canonicalTransactionMaterial;
export const canonicalTransactionFingerprint = canonicalTransactionMaterial;
export const transactionFingerprint = canonicalTransactionMaterial;

const toEntryRequest = (entry: JournalEntry): GeneralEntryRequest => ({
  transactionId: entry.transactionId,
  description: entry.description,
  postings: entry.postings.map(({ accountId, side, amount }) => ({ accountId, side, amount })),
});

const standardKind = (value: unknown): value is StandardEntryKind =>
  value === "income" || value === "expense" || value === "transfer";

/** Validate and materialize a canonical immutable journal entry. */
export const validateEntry = (
  request: GeneralEntryRequest,
  accounts: KnownAccounts,
  expectedKind?: StandardEntryKind,
): Result.Result<JournalEntry, FamilyLedgerError> => {
  if (
    request === null ||
    typeof request !== "object" ||
    !isIdentifier(request.transactionId) ||
    typeof request.description !== "string" ||
    !Array.isArray(request.postings)
  ) {
    return Result.fail(
      error("invalid-request", "General entry request has an invalid shape", { path: "request" }),
    );
  }

  if (request.postings.length < 2) {
    return Result.fail(
      error("invalid-request", "A journal entry must contain at least two postings", {
        path: "postings",
        transactionId: request.transactionId,
      }),
    );
  }

  if (expectedKind !== undefined && !standardKind(expectedKind)) {
    return Result.fail(error("invalid-request", "Unknown standard entry kind", { path: "kind" }));
  }

  const known = accountTypes(accounts);
  const lines: Array<Posting> = [];
  const lineIds = new Set<string>();
  let debitTotal = 0n;
  let creditTotal = 0n;

  for (const [index, posting] of request.postings.entries()) {
    const path = `postings[${index}]`;
    if (
      posting === null ||
      typeof posting !== "object" ||
      !isIdentifier(posting.accountId) ||
      !isPostingSide(posting.side)
    ) {
      return Result.fail(
        error("invalid-request", "Posting has an invalid shape", {
          path,
          transactionId: request.transactionId,
        }),
      );
    }
    if (typeof posting.amount !== "bigint" || posting.amount <= 0n) {
      return Result.fail(
        error("invalid-amount", "Posting amount must be a positive bigint minor-unit value", {
          path: `${path}.amount`,
          transactionId: request.transactionId,
        }),
      );
    }
    if (posting.amount > MAX_LEDGER_MINOR_UNITS) {
      return Result.fail(
        error("amount-out-of-range", `Posting amount exceeds ${MAX_LEDGER_MINOR_UNITS}`, {
          path: `${path}.amount`,
          transactionId: request.transactionId,
        }),
      );
    }

    const accountType = known.get(posting.accountId);
    if (accountType === undefined) {
      return Result.fail(
        error("unknown-account", `Unknown account ${posting.accountId}`, {
          path: `${path}.accountId`,
          identity: posting.accountId,
          accountId: posting.accountId,
          transactionId: request.transactionId,
        }),
      );
    }

    const lineId = lineIdentity(request.transactionId, index);
    if (lineIds.has(lineId)) {
      return Result.fail(
        error("invalid-request", `Duplicate journal line identity ${lineId}`, {
          path,
          identity: lineId,
          transactionId: request.transactionId,
        }),
      );
    }
    lineIds.add(lineId);
    lines.push({
      lineId,
      accountId: posting.accountId,
      side: posting.side,
      amount: posting.amount,
    });
    if (posting.side === "debit") debitTotal += posting.amount;
    else creditTotal += posting.amount;
  }

  if (debitTotal > MAX_LEDGER_MINOR_UNITS || creditTotal > MAX_LEDGER_MINOR_UNITS) {
    return Result.fail(
      error("amount-out-of-range", `Entry total exceeds ${MAX_LEDGER_MINOR_UNITS}`, {
        path: "postings",
        transactionId: request.transactionId,
      }),
    );
  }
  if (debitTotal !== creditTotal) {
    return Result.fail(
      error(
        "unbalanced-entry",
        `Debit total ${debitTotal} does not equal credit total ${creditTotal}`,
        {
          path: "postings",
          transactionId: request.transactionId,
        },
      ),
    );
  }

  if (expectedKind !== undefined) {
    if (lines.length !== 2) {
      return Result.fail(
        error("invalid-request", `${expectedKind} entries must contain exactly two postings`, {
          path: "postings",
          transactionId: request.transactionId,
        }),
      );
    }
    const [first, second] = lines;
    if (first === undefined || second === undefined) {
      return Result.fail(
        error("invalid-request", "Missing standard entry postings", {
          transactionId: request.transactionId,
        }),
      );
    }
    const expected =
      expectedKind === "income"
        ? [
            ["debit", "asset"],
            ["credit", "income"],
          ]
        : expectedKind === "expense"
          ? [
              ["debit", "expense"],
              ["credit", "asset"],
            ]
          : [
              ["debit", "asset"],
              ["credit", "asset"],
            ];
    for (const [index, [side, type]] of expected.entries()) {
      const line = index === 0 ? first : second;
      if (line.side !== side || known.get(line.accountId) !== type) {
        return Result.fail(
          error("wrong-account-type", `${expectedKind} posting ${index} must be ${side} ${type}`, {
            path: `postings[${index}]`,
            accountId: line.accountId,
            transactionId: request.transactionId,
          }),
        );
      }
    }
    if (expectedKind === "transfer" && first.accountId === second.accountId) {
      return Result.fail(
        error("self-transfer", "A transfer source and destination must differ", {
          path: "postings",
          identity: first.accountId,
          accountId: first.accountId,
          transactionId: request.transactionId,
        }),
      );
    }
  }

  const entry: JournalEntry = {
    transactionId: request.transactionId,
    description: request.description,
    fingerprint: canonicalTransactionMaterial(request),
    postings: lines,
  };
  return Result.succeed(entry);
};

export const validateGeneralEntry = validateEntry;

/** Validate a standard command's canonical general-entry request. */
export function validateStandardEntry(
  request: GeneralEntryRequest,
  accounts: KnownAccounts,
  kind: StandardEntryKind,
): Result.Result<JournalEntry, FamilyLedgerError>;
export function validateStandardEntry(
  kind: StandardEntryKind,
  request: GeneralEntryRequest,
  accounts: KnownAccounts,
): Result.Result<JournalEntry, FamilyLedgerError>;
export function validateStandardEntry(
  first: GeneralEntryRequest | StandardEntryKind,
  second: KnownAccounts | GeneralEntryRequest,
  third: StandardEntryKind | KnownAccounts,
): Result.Result<JournalEntry, FamilyLedgerError> {
  if (typeof first === "string") {
    return validateEntry(second as GeneralEntryRequest, third as KnownAccounts, first);
  }
  return validateEntry(first, second as KnownAccounts, third as StandardEntryKind);
}

export const validateIncomeEntry = (request: GeneralEntryRequest, accounts: KnownAccounts) =>
  validateEntry(request, accounts, "income");
export const validateExpenseEntry = (request: GeneralEntryRequest, accounts: KnownAccounts) =>
  validateEntry(request, accounts, "expense");
export const validateTransferEntry = (request: GeneralEntryRequest, accounts: KnownAccounts) =>
  validateEntry(request, accounts, "transfer");

const makeIncome = (
  transactionId: TransactionId,
  destinationAccountId: AccountId,
  incomeAccountId: AccountId,
  amount: Amount,
  description: string,
): GeneralEntryRequest => ({
  transactionId,
  description,
  postings: [
    { accountId: destinationAccountId, side: "debit", amount },
    { accountId: incomeAccountId, side: "credit", amount },
  ],
});

const makeExpense = (
  transactionId: TransactionId,
  sourceAccountId: AccountId,
  expenseAccountId: AccountId,
  amount: Amount,
  description: string,
): GeneralEntryRequest => ({
  transactionId,
  description,
  postings: [
    { accountId: expenseAccountId, side: "debit", amount },
    { accountId: sourceAccountId, side: "credit", amount },
  ],
});

const makeTransfer = (
  transactionId: TransactionId,
  sourceAccountId: AccountId,
  destinationAccountId: AccountId,
  amount: Amount,
  description: string,
): GeneralEntryRequest => ({
  transactionId,
  description,
  postings: [
    { accountId: destinationAccountId, side: "debit", amount },
    { accountId: sourceAccountId, side: "credit", amount },
  ],
});

export function makeIncomeRequest(input: IncomeRequest): GeneralEntryRequest;
export function makeIncomeRequest(
  transactionId: TransactionId,
  destinationAccountId: AccountId,
  incomeAccountId: AccountId,
  amount: Amount,
  description: string,
): GeneralEntryRequest;
export function makeIncomeRequest(
  first: IncomeRequest | TransactionId,
  destinationAccountId?: AccountId,
  incomeAccountId?: AccountId,
  amount?: Amount,
  description?: string,
): GeneralEntryRequest {
  if (typeof first === "object") {
    return makeIncome(
      first.transactionId,
      first.destinationAccountId,
      first.incomeAccountId,
      first.amount,
      first.description,
    );
  }
  return makeIncome(first, destinationAccountId!, incomeAccountId!, amount!, description!);
}

export function makeExpenseRequest(input: ExpenseRequest): GeneralEntryRequest;
export function makeExpenseRequest(
  transactionId: TransactionId,
  sourceAccountId: AccountId,
  expenseAccountId: AccountId,
  amount: Amount,
  description: string,
): GeneralEntryRequest;
export function makeExpenseRequest(
  first: ExpenseRequest | TransactionId,
  sourceAccountId?: AccountId,
  expenseAccountId?: AccountId,
  amount?: Amount,
  description?: string,
): GeneralEntryRequest {
  if (typeof first === "object") {
    return makeExpense(
      first.transactionId,
      first.sourceAccountId,
      first.expenseAccountId,
      first.amount,
      first.description,
    );
  }
  return makeExpense(first, sourceAccountId!, expenseAccountId!, amount!, description!);
}

export function makeTransferRequest(input: TransferRequest): GeneralEntryRequest;
export function makeTransferRequest(
  transactionId: TransactionId,
  sourceAccountId: AccountId,
  destinationAccountId: AccountId,
  amount: Amount,
  description: string,
): GeneralEntryRequest;
export function makeTransferRequest(
  first: TransferRequest | TransactionId,
  sourceAccountId?: AccountId,
  destinationAccountId?: AccountId,
  amount?: Amount,
  description?: string,
): GeneralEntryRequest {
  if (typeof first === "object") {
    return makeTransfer(
      first.transactionId,
      first.sourceAccountId,
      first.destinationAccountId,
      first.amount,
      first.description,
    );
  }
  return makeTransfer(first, sourceAccountId!, destinationAccountId!, amount!, description!);
}

export const incomeRequest = makeIncomeRequest;
export const expenseRequest = makeExpenseRequest;
export const transferRequest = makeTransferRequest;

const validateKnownAccounts = (
  accounts: KnownAccounts,
): Result.Result<ReadonlyMap<string, AccountType>, FamilyLedgerError> => {
  if (Array.isArray(accounts)) {
    const seen = new Set<string>();
    for (const account of accounts) {
      if (!isIdentifier(account.id) || !standardAccountType(account.type)) {
        return Result.fail(
          error("invalid-request", "Account catalog contains an invalid account", {
            identity: account.id,
            accountId: account.id,
          }),
        );
      }
      if (seen.has(account.id)) {
        return Result.fail(
          error("duplicate-account", `Duplicate account ${account.id}`, {
            identity: account.id,
            accountId: account.id,
          }),
        );
      }
      seen.add(account.id);
    }
  }
  const map = accountTypes(accounts);
  for (const [id, type] of map) {
    if (!isIdentifier(id) || !standardAccountType(type)) {
      return Result.fail(
        error("invalid-request", "Account catalog contains an invalid account", {
          identity: id,
          accountId: id,
        }),
      );
    }
  }
  return Result.succeed(map);
};

const standardAccountType = (value: unknown): value is AccountType =>
  value === "asset" || value === "income" || value === "expense";

/**
 * Fold immutable journal entries into debit-normal/credit-normal balances.
 * The result is sorted by account identity and includes zero balances.
 */
export function foldJournal(
  entries: ReadonlyArray<JournalEntry>,
  accounts: KnownAccounts,
): Result.Result<ReadonlyArray<BalanceResult>, FamilyLedgerError>;
export function foldJournal(
  accounts: KnownAccounts,
  entries: ReadonlyArray<JournalEntry>,
): Result.Result<ReadonlyArray<BalanceResult>, FamilyLedgerError>;
export function foldJournal(
  first: ReadonlyArray<JournalEntry> | KnownAccounts,
  second: ReadonlyArray<JournalEntry> | KnownAccounts,
): Result.Result<ReadonlyArray<BalanceResult>, FamilyLedgerError> {
  const firstIsEntries =
    Array.isArray(first) &&
    first.some((value) => value !== null && typeof value === "object" && "postings" in value);
  const secondIsEntries =
    Array.isArray(second) &&
    second.some((value) => value !== null && typeof value === "object" && "postings" in value);
  const entries = secondIsEntries && !firstIsEntries ? second : first;
  const accounts = entries === first ? second : first;
  if (!Array.isArray(entries)) {
    return Result.fail(
      error("corrupt-journal", "Decoded journal is not an array", { path: "journal" }),
    );
  }
  const catalog = validateKnownAccounts(accounts as KnownAccounts);
  if (Result.isFailure(catalog)) return Result.fail(catalog.failure);
  const types = catalog.success;
  const balances = new Map<string, bigint>(Array.from(types.keys(), (id) => [id, 0n]));
  const transactionIds = new Set<string>();
  const lineIds = new Set<string>();

  for (const [entryIndex, entry] of entries.entries()) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !isIdentifier(entry.transactionId) ||
      typeof entry.description !== "string" ||
      typeof entry.fingerprint !== "string" ||
      !Array.isArray(entry.postings)
    ) {
      return Result.fail(
        error("corrupt-journal", "Decoded journal entry has an invalid shape", {
          path: `journal[${entryIndex}]`,
        }),
      );
    }
    if (transactionIds.has(entry.transactionId)) {
      return Result.fail(
        error("corrupt-journal", `Duplicate transaction ${entry.transactionId}`, {
          path: `journal[${entryIndex}].transactionId`,
          identity: entry.transactionId,
          transactionId: entry.transactionId,
        }),
      );
    }
    transactionIds.add(entry.transactionId);

    const request = toEntryRequest(entry);
    const checked = validateEntry(request, types);
    if (Result.isFailure(checked)) {
      const failureFields =
        checked.failure.identity === undefined ? {} : { identity: checked.failure.identity };
      return Result.fail(
        error("corrupt-journal", checked.failure.message, {
          path: `journal[${entryIndex}]${checked.failure.path === undefined ? "" : `.${checked.failure.path}`}`,
          ...failureFields,
          transactionId: entry.transactionId,
        }),
      );
    }
    if (entry.fingerprint !== checked.success.fingerprint) {
      return Result.fail(
        error(
          "corrupt-journal",
          "Journal fingerprint does not match canonical transaction material",
          {
            path: `journal[${entryIndex}].fingerprint`,
            identity: entry.transactionId,
            transactionId: entry.transactionId,
          },
        ),
      );
    }

    for (const [index, posting] of entry.postings.entries()) {
      if (
        !isPostingId(posting.lineId) ||
        posting.lineId !== lineIdentity(entry.transactionId, index)
      ) {
        return Result.fail(
          error("corrupt-journal", "Journal line identity is not deterministic", {
            path: `journal[${entryIndex}].postings[${index}].lineId`,
            identity: posting.lineId,
            transactionId: entry.transactionId,
          }),
        );
      }
      if (lineIds.has(posting.lineId)) {
        return Result.fail(
          error("corrupt-journal", `Duplicate journal line ${posting.lineId}`, {
            path: `journal[${entryIndex}].postings[${index}].lineId`,
            identity: posting.lineId,
            transactionId: entry.transactionId,
          }),
        );
      }
      lineIds.add(posting.lineId);

      const prior = balances.get(posting.accountId);
      if (prior === undefined) {
        return Result.fail(
          error("corrupt-journal", `Unknown account ${posting.accountId} in journal`, {
            path: `journal[${entryIndex}].postings[${index}].accountId`,
            identity: posting.accountId,
            accountId: posting.accountId,
            transactionId: entry.transactionId,
          }),
        );
      }
      const type = types.get(posting.accountId)!;
      const debitNormal = type === "asset" || type === "expense";
      const signed = (posting.side === "debit") === debitNormal ? posting.amount : -posting.amount;
      balances.set(posting.accountId, prior + signed);
    }
  }

  return Result.succeed(
    Array.from(balances.entries())
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([accountId, balance]) => ({ accountId, balance })),
  );
}

export const foldBalances = foldJournal;
