import { SqliteClient } from "@effect/sql-sqlite-bun";
import { Context, Effect, Layer, Result, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import * as SqlError from "effect/unstable/sql/SqlError";

import {
  Account,
  AccountId,
  AccountRowSchema,
  AccountType,
  Amount,
  BalanceResultSchema,
  FamilyLedgerError,
  type GeneralEntryRequest,
  type JournalEntry,
  JournalEntrySchema,
  JournalResultSchema,
  Ledger,
  LedgerId,
  LedgerRowSchema,
  MAX_LEDGER_MINOR_UNITS,
  MinorUnits,
  PostingSide,
  PostingRowSchema,
  TransactionRowSchema,
  canonicalTransactionFingerprint,
  foldJournal,
  validateEntry,
} from "./ledger-domain.ts";
import type { FamilyLedgerErrorReason, StandardEntryKind } from "./ledger-domain.ts";

const strict = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Struct(fields).annotate({ parseOptions: { onExcessProperty: "error" } });

const nonEmptyText = Schema.String.pipe(Schema.check(Schema.isNonEmpty()));

/** Input accepted by ledger init. The database stores the id in the domain `Ledger.id` field. */
export const InitializeLedgerRequestSchema = strict({
  id: LedgerId,
  name: nonEmptyText,
});
export type InitializeLedgerRequest = typeof InitializeLedgerRequestSchema.Type;

/** Input accepted by account create. */
export const CreateAccountRequestSchema = strict({
  id: AccountId,
  name: nonEmptyText,
  type: AccountType,
});
export type CreateAccountRequest = typeof CreateAccountRequestSchema.Type;

/** Decoded post result, retaining whether a transaction was an idempotent replay. */
export const PostResultSchema = strict({
  entry: JournalEntrySchema,
  replayed: Schema.Boolean,
});
export type PostResult = typeof PostResultSchema.Type;

/** Result of comparing SQL aggregation with the independent domain fold. */
export const VerifyRebuildResultSchema = strict({
  balances: Schema.Array(BalanceResultSchema),
  matches: Schema.Literal(true),
});
export type VerifyRebuildResult = typeof VerifyRebuildResultSchema.Type;

export type LedgerStorageFailureReason = FamilyLedgerErrorReason;

export interface LedgerStorageOptions {
  /** Directory containing the one local family-ledger SQLite database. */
  readonly dataDir?: string | undefined;
  /** Optional explicit database path, primarily useful to composition roots and tests. */
  readonly databasePath?: string | undefined;
}

export interface LedgerStorageService {
  readonly initialize: (
    request: InitializeLedgerRequest,
  ) => Effect.Effect<Ledger, FamilyLedgerError>;
  readonly getLedger: () => Effect.Effect<Ledger, FamilyLedgerError>;
  readonly createAccount: (
    request: CreateAccountRequest,
  ) => Effect.Effect<Account, FamilyLedgerError>;
  readonly postEntry: (
    request: GeneralEntryRequest,
    expectedKind?: StandardEntryKind,
  ) => Effect.Effect<PostResult, FamilyLedgerError>;
  readonly listJournal: () => Effect.Effect<
    Schema.Schema.Type<typeof JournalResultSchema>,
    FamilyLedgerError
  >;
  readonly listBalances: () => Effect.Effect<
    ReadonlyArray<Schema.Schema.Type<typeof BalanceResultSchema>>,
    FamilyLedgerError
  >;
  readonly verifyRebuild: () => Effect.Effect<VerifyRebuildResult, FamilyLedgerError>;
}
/** One scoped service owning one SQLite database connection and its journal API. */
export class LedgerStorage extends Context.Service<LedgerStorage, LedgerStorageService>()(
  "@bang/bang/LedgerStorage",
) {}

const defaultDataDir = ".bang/family-ledger";
const defaultDatabaseFile = "ledger.sqlite";

type FailureFields = {
  readonly path?: string;
  readonly identity?: string;
  readonly ledgerId?: string;
  readonly accountId?: string;
  readonly transactionId?: string;
  readonly requestPath?: string;
  readonly storagePath?: string;
};

const failure = (
  reason: FamilyLedgerErrorReason,
  message: string,
  fields: FailureFields = {},
): FamilyLedgerError => new FamilyLedgerError({ reason, message, ...fields });

const schemaFailure = (
  path: string,
  storagePath: string,
  label: string,
  issue: unknown,
): FamilyLedgerError =>
  failure("corrupt-journal", `Persisted ${label} failed strict schema decoding: ${String(issue)}`, {
    path,
    storagePath,
  });

const mapSqlError = (
  operation: string,
  storagePath: string,
  error: SqlError.SqlError,
  fields: FailureFields = {},
): FamilyLedgerError => {
  if (error.reason instanceof SqlError.UniqueViolation) {
    if (operation === "initialize") {
      return failure("already-initialized", "A family ledger is already initialized", {
        ...fields,
        storagePath,
      });
    }
    if (operation === "create-account") {
      return failure("duplicate-account", "The account identity is already present", {
        ...fields,
        storagePath,
      });
    }
  }
  return failure("storage-failure", `SQLite operation failed: ${operation}`, {
    ...fields,
    storagePath,
  });
};

const mapSqlEffect = <A, R>(
  effect: Effect.Effect<A, FamilyLedgerError | SqlError.SqlError, R>,
  operation: string,
  storagePath: string,
  fields: FailureFields = {},
): Effect.Effect<A, FamilyLedgerError, R> =>
  effect.pipe(
    Effect.mapError((error) =>
      SqlError.isSqlError(error) ? mapSqlError(operation, storagePath, error, fields) : error,
    ),
  );

const decodeLedgerRows = (
  input: unknown,
  storagePath: string,
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<typeof LedgerRowSchema>>, FamilyLedgerError> =>
  Schema.decodeUnknownEffect(Schema.Array(LedgerRowSchema))(input, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError((issue) => schemaFailure("ledger", storagePath, "ledger rows", issue)));

const decodeAccountRows = (
  input: unknown,
  storagePath: string,
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<typeof AccountRowSchema>>, FamilyLedgerError> =>
  Schema.decodeUnknownEffect(Schema.Array(AccountRowSchema))(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) => schemaFailure("accounts", storagePath, "account rows", issue)),
  );

const decodeTransactionRows = (
  input: unknown,
  storagePath: string,
): Effect.Effect<
  ReadonlyArray<Schema.Schema.Type<typeof TransactionRowSchema>>,
  FamilyLedgerError
> =>
  Schema.decodeUnknownEffect(Schema.Array(TransactionRowSchema))(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      schemaFailure("journal.transactions", storagePath, "transaction rows", issue),
    ),
  );

const decodePostingRows = (
  input: unknown,
  storagePath: string,
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<typeof PostingRowSchema>>, FamilyLedgerError> =>
  Schema.decodeUnknownEffect(Schema.Array(PostingRowSchema))(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      schemaFailure("journal.postings", storagePath, "posting rows", issue),
    ),
  );

const decodeJournalEntry = (
  input: unknown,
  storagePath: string,
): Effect.Effect<JournalEntry, FamilyLedgerError> =>
  Schema.decodeUnknownEffect(JournalEntrySchema)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) => schemaFailure("journal", storagePath, "journal entry", issue)),
  );

const decodeJournalResult = (
  input: unknown,
  storagePath: string,
): Effect.Effect<Schema.Schema.Type<typeof JournalResultSchema>, FamilyLedgerError> =>
  Schema.decodeUnknownEffect(JournalResultSchema)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) => schemaFailure("journal", storagePath, "journal result", issue)),
  );

const decodeBalanceRows = (
  input: unknown,
  storagePath: string,
): Effect.Effect<
  ReadonlyArray<Schema.Schema.Type<typeof BalanceResultSchema>>,
  FamilyLedgerError
> =>
  Schema.decodeUnknownEffect(Schema.Array(BalanceResultSchema))(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) => schemaFailure("balances", storagePath, "balance rows", issue)),
  );

const decodePostResult = (
  input: unknown,
  storagePath: string,
): Effect.Effect<PostResult, FamilyLedgerError> =>
  Schema.decodeUnknownEffect(PostResultSchema)(input, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError((issue) => schemaFailure("journal", storagePath, "post result", issue)));

const decodeVerifyResult = (
  input: unknown,
  storagePath: string,
): Effect.Effect<VerifyRebuildResult, FamilyLedgerError> =>
  Schema.decodeUnknownEffect(VerifyRebuildResultSchema)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) => schemaFailure("balances", storagePath, "verify result", issue)),
  );

const storagePostRequestPosting = strict({
  accountId: AccountId,
  side: PostingSide,
  amount: Schema.Union([Amount, MinorUnits]),
});
const StoragePostRequestSchema = strict({
  transactionId: Schema.String,
  description: Schema.String,
  postings: Schema.Array(storagePostRequestPosting),
});

const decodePostRequest = (
  input: unknown,
  storagePath: string,
): Effect.Effect<GeneralEntryRequest, FamilyLedgerError> =>
  Schema.decodeUnknownEffect(StoragePostRequestSchema)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.map(
      (request): GeneralEntryRequest => ({
        transactionId: request.transactionId,
        description: request.description,
        postings: request.postings.map(({ accountId, side, amount }) => ({
          accountId,
          side,
          amount,
        })),
      }),
    ),
    Effect.mapError((issue) =>
      failure(
        "invalid-request",
        `General entry request failed strict schema decoding: ${String(issue)}`,
        {
          requestPath: "request",
          storagePath,
        },
      ),
    ),
  );

const makeLedgerFromRow = (
  row: Schema.Schema.Type<typeof LedgerRowSchema>,
  storagePath: string,
): Effect.Effect<Ledger, FamilyLedgerError> =>
  Schema.decodeUnknownEffect(Ledger)(row, { onExcessProperty: "error" }).pipe(
    Effect.mapError((issue) => schemaFailure("ledger", storagePath, "ledger", issue)),
  );

const makeAccountFromRow = (
  row: Schema.Schema.Type<typeof AccountRowSchema>,
  storagePath: string,
): Effect.Effect<Account, FamilyLedgerError> =>
  Schema.decodeUnknownEffect(Account)(
    { id: row.id, name: row.name, type: row.type },
    {
      onExcessProperty: "error",
    },
  ).pipe(
    Effect.mapError((issue) => schemaFailure(`accounts.${row.id}`, storagePath, "account", issue)),
  );

const readLedgerRows = (
  sql: SqlClient.SqlClient,
  storagePath: string,
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<typeof LedgerRowSchema>>, FamilyLedgerError> =>
  mapSqlEffect(
    Effect.gen(function* () {
      const rows = yield* sql<Record<string, unknown>>`
        SELECT id, name, currency
        FROM ledger
        ORDER BY id ASC
      `;
      return yield* decodeLedgerRows(rows, storagePath);
    }),
    "read-ledger",
    storagePath,
  );

const readSingletonLedger = (
  sql: SqlClient.SqlClient,
  storagePath: string,
): Effect.Effect<Ledger, FamilyLedgerError> =>
  Effect.gen(function* () {
    const rows = yield* readLedgerRows(sql, storagePath);
    if (rows.length === 0) {
      return yield* Effect.fail(
        failure("not-initialized", "No family ledger is initialized", { storagePath }),
      );
    }
    if (rows.length !== 1) {
      return yield* Effect.fail(
        failure("corrupt-journal", "The data directory contains multiple family ledgers", {
          path: "ledger",
          storagePath,
        }),
      );
    }
    const row = rows[0];
    if (row === undefined) {
      return yield* Effect.fail(
        failure("corrupt-journal", "The singleton ledger row disappeared during decoding", {
          path: "ledger",
          storagePath,
        }),
      );
    }
    return yield* makeLedgerFromRow(row, storagePath);
  });

const readAccounts = (
  sql: SqlClient.SqlClient,
  ledger: Ledger,
  storagePath: string,
): Effect.Effect<ReadonlyArray<Account>, FamilyLedgerError> =>
  Effect.gen(function* () {
    const rows = yield* mapSqlEffect(
      sql<Record<string, unknown>>`
        SELECT ledger_id AS "ledgerId", id, name, type
        FROM account
        WHERE ledger_id = ${ledger.id}
        ORDER BY id ASC
      `,
      "read-accounts",
      storagePath,
    ).pipe(Effect.flatMap((result) => decodeAccountRows(result, storagePath)));
    const accounts: Array<Account> = [];
    for (const row of rows) {
      accounts.push(yield* makeAccountFromRow(row, storagePath));
    }
    return accounts;
  });

const readTransactionRow = (
  sql: SqlClient.SqlClient,
  ledger: Ledger,
  transactionId: string,
  storagePath: string,
): Effect.Effect<Schema.Schema.Type<typeof TransactionRowSchema> | undefined, FamilyLedgerError> =>
  Effect.gen(function* () {
    const rows = yield* mapSqlEffect(
      sql<Record<string, unknown>>`
        SELECT ledger_id AS "ledgerId", transaction_id AS "transactionId", description, fingerprint
        FROM journal_transaction
        WHERE ledger_id = ${ledger.id} AND transaction_id = ${transactionId}
        ORDER BY sequence ASC
      `,
      "read-transaction",
      storagePath,
    ).pipe(Effect.flatMap((result) => decodeTransactionRows(result, storagePath)));
    if (rows.length === 0) return undefined;
    if (rows.length !== 1) {
      return yield* Effect.fail(
        failure("corrupt-journal", "A transaction identity appears more than once", {
          path: "journal.transactions",
          identity: transactionId,
          transactionId,
          storagePath,
        }),
      );
    }
    return rows[0];
  });

const readPostingRows = (
  sql: SqlClient.SqlClient,
  ledger: Ledger,
  transactionId: string,
  storagePath: string,
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<typeof PostingRowSchema>>, FamilyLedgerError> =>
  mapSqlEffect(
    sql<Record<string, unknown>>`
      SELECT ledger_id AS "ledgerId", transaction_id AS "transactionId",
             line_id AS "lineId", account_id AS "accountId", side, amount
      FROM posting
      WHERE ledger_id = ${ledger.id} AND transaction_id = ${transactionId}
      ORDER BY line_index ASC
    `,
    "read-postings",
    storagePath,
  ).pipe(Effect.flatMap((rows) => decodePostingRows(rows, storagePath)));

const materializeJournalEntry = (
  transaction: Schema.Schema.Type<typeof TransactionRowSchema>,
  postings: ReadonlyArray<Schema.Schema.Type<typeof PostingRowSchema>>,
  storagePath: string,
): Effect.Effect<JournalEntry, FamilyLedgerError> =>
  Effect.gen(function* () {
    const entry = yield* decodeJournalEntry(
      {
        transactionId: transaction.transactionId,
        description: transaction.description,
        fingerprint: transaction.fingerprint,
        postings: postings.map(({ lineId, accountId, side, amount }) => ({
          lineId,
          accountId,
          side,
          amount,
        })),
      },
      storagePath,
    );
    return entry;
  });

const readEntry = (
  sql: SqlClient.SqlClient,
  ledger: Ledger,
  transaction: Schema.Schema.Type<typeof TransactionRowSchema>,
  storagePath: string,
): Effect.Effect<JournalEntry, FamilyLedgerError> =>
  readPostingRows(sql, ledger, transaction.transactionId, storagePath).pipe(
    Effect.flatMap((postings) => materializeJournalEntry(transaction, postings, storagePath)),
  );

const readAllEntries = (
  sql: SqlClient.SqlClient,
  ledger: Ledger,
  storagePath: string,
): Effect.Effect<ReadonlyArray<JournalEntry>, FamilyLedgerError> =>
  Effect.gen(function* () {
    const transactions = yield* mapSqlEffect(
      sql<Record<string, unknown>>`
        SELECT ledger_id AS "ledgerId", transaction_id AS "transactionId", description, fingerprint
        FROM journal_transaction
        WHERE ledger_id = ${ledger.id}
        ORDER BY sequence ASC
      `,
      "read-journal",
      storagePath,
    ).pipe(Effect.flatMap((rows) => decodeTransactionRows(rows, storagePath)));
    const entries: Array<JournalEntry> = [];
    for (const transaction of transactions) {
      entries.push(yield* readEntry(sql, ledger, transaction, storagePath));
    }
    return entries;
  });

const corruptFromFold = (error: FamilyLedgerError, storagePath: string): FamilyLedgerError => {
  const fields: {
    path?: string;
    identity?: string;
    ledgerId?: string;
    accountId?: string;
    transactionId?: string;
    storagePath: string;
  } = { storagePath };
  if (error.path !== undefined) fields.path = error.path;
  if (error.identity !== undefined) fields.identity = error.identity;
  if (error.ledgerId !== undefined) fields.ledgerId = error.ledgerId;
  if (error.accountId !== undefined) fields.accountId = error.accountId;
  if (error.transactionId !== undefined) fields.transactionId = error.transactionId;
  return failure("corrupt-journal", error.message, fields);
};

const validatePersistedJournal = (
  entries: ReadonlyArray<JournalEntry>,
  accounts: ReadonlyArray<Account>,
  storagePath: string,
): Effect.Effect<
  ReadonlyArray<Schema.Schema.Type<typeof BalanceResultSchema>>,
  FamilyLedgerError
> => {
  const folded = foldJournal(entries, accounts);
  return Result.isFailure(folded)
    ? Effect.fail(corruptFromFold(folded.failure, storagePath))
    : Effect.succeed(folded.success);
};

const readSqlBalances = (
  sql: SqlClient.SqlClient,
  ledger: Ledger,
  storagePath: string,
): Effect.Effect<
  ReadonlyArray<Schema.Schema.Type<typeof BalanceResultSchema>>,
  FamilyLedgerError
> =>
  mapSqlEffect(
    sql<Record<string, unknown>>`
      SELECT a.id AS "accountId",
             COALESCE(
               SUM(
                 CASE
                   WHEN a.type = 'income' AND p.side = 'credit' THEN p.amount
                   WHEN a.type = 'income' AND p.side = 'debit' THEN -p.amount
                   WHEN p.side = 'debit' THEN p.amount
                   WHEN p.side = 'credit' THEN -p.amount
                   ELSE 0
                 END
               ),
               CAST(0 AS INTEGER)
             ) AS balance
      FROM account AS a
      LEFT JOIN posting AS p
        ON p.ledger_id = a.ledger_id AND p.account_id = a.id
      WHERE a.ledger_id = ${ledger.id}
      GROUP BY a.id
      ORDER BY a.id ASC
    `,
    "read-balances",
    storagePath,
  ).pipe(Effect.flatMap((rows) => decodeBalanceRows(rows, storagePath)));

const readDebitTotal = (
  sql: SqlClient.SqlClient,
  ledger: Ledger,
  storagePath: string,
): Effect.Effect<bigint, FamilyLedgerError> =>
  mapSqlEffect(
    sql<Record<string, unknown>>`
      SELECT COALESCE(SUM(amount), CAST(0 AS INTEGER)) AS total
      FROM posting
      WHERE ledger_id = ${ledger.id} AND side = 'debit'
    `,
    "read-debit-total",
    storagePath,
  ).pipe(
    Effect.flatMap((rows) =>
      Schema.decodeUnknownEffect(Schema.Array(strict({ total: Schema.BigInt })))(rows, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          schemaFailure("journal.postings", storagePath, "debit total", issue),
        ),
        Effect.flatMap((decoded) => {
          const row = decoded[0];
          return row === undefined
            ? Effect.fail(
                failure("corrupt-journal", "The debit-total aggregate returned no row", {
                  path: "journal.postings",
                  storagePath,
                }),
              )
            : Effect.succeed(row.total);
        }),
      ),
    ),
  );

const initializeSchema = (
  sql: SqlClient.SqlClient,
  storagePath: string,
): Effect.Effect<void, FamilyLedgerError> => {
  const migration = sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`
        CREATE TABLE IF NOT EXISTS schema_migration (
          version INTEGER PRIMARY KEY
        )
      `;
      yield* sql`
        CREATE TABLE IF NOT EXISTS ledger (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          currency TEXT NOT NULL CHECK (currency = 'LOCAL'),
          CONSTRAINT ledger_identity UNIQUE (id)
        )
      `;
      yield* sql`
        CREATE TABLE IF NOT EXISTS account (
          ledger_id TEXT NOT NULL,
          id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('asset', 'income', 'expense')),
          PRIMARY KEY (ledger_id, id),
          CONSTRAINT account_identity UNIQUE (ledger_id, id),
          CONSTRAINT account_ledger_fk FOREIGN KEY (ledger_id)
            REFERENCES ledger (id) ON DELETE RESTRICT
        )
      `;
      yield* sql`
        CREATE TABLE IF NOT EXISTS journal_transaction (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          ledger_id TEXT NOT NULL,
          transaction_id TEXT NOT NULL,
          description TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          CONSTRAINT transaction_identity UNIQUE (ledger_id, transaction_id),
          CONSTRAINT transaction_ledger_fk FOREIGN KEY (ledger_id)
            REFERENCES ledger (id) ON DELETE RESTRICT
        )
      `;
      yield* sql`
        CREATE TABLE IF NOT EXISTS posting (
          ledger_id TEXT NOT NULL,
          transaction_id TEXT NOT NULL,
          line_index INTEGER NOT NULL,
          line_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          side TEXT NOT NULL CHECK (side IN ('debit', 'credit')),
          amount INTEGER NOT NULL CHECK (amount > 0),
          PRIMARY KEY (ledger_id, transaction_id, line_id),
          CONSTRAINT posting_identity UNIQUE (ledger_id, transaction_id, line_id),
          CONSTRAINT posting_transaction_fk FOREIGN KEY (ledger_id, transaction_id)
            REFERENCES journal_transaction (ledger_id, transaction_id) ON DELETE RESTRICT,
          CONSTRAINT posting_account_fk FOREIGN KEY (ledger_id, account_id)
            REFERENCES account (ledger_id, id) ON DELETE RESTRICT
        )
      `;
      yield* sql`
        INSERT OR IGNORE INTO schema_migration (version) VALUES (1)
      `;
    }),
  );
  return mapSqlEffect(
    sql`PRAGMA foreign_keys = ON`.pipe(Effect.andThen(migration), Effect.asVoid),
    "initialize-schema",
    storagePath,
  ).pipe(Effect.provideService(SqlClient.SafeIntegers, true));
};

const makeService = (sql: SqlClient.SqlClient, storagePath: string): LedgerStorageService => {
  const initialize = (input: InitializeLedgerRequest): Effect.Effect<Ledger, FamilyLedgerError> =>
    Effect.gen(function* () {
      const request = yield* Schema.decodeUnknownEffect(InitializeLedgerRequestSchema)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          failure(
            "invalid-request",
            `Ledger init request failed strict schema decoding: ${String(issue)}`,
            {
              requestPath: "ledger.init",
              storagePath,
            },
          ),
        ),
      );
      return yield* mapSqlEffect(
        sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* readLedgerRows(sql, storagePath);
            if (rows.length > 1) {
              return yield* Effect.fail(
                failure("corrupt-journal", "The data directory contains multiple family ledgers", {
                  path: "ledger",
                  storagePath,
                }),
              );
            }
            if (rows.length === 1) {
              return yield* Effect.fail(
                failure("already-initialized", "A family ledger is already initialized", {
                  storagePath,
                }),
              );
            }
            yield* sql`
              INSERT INTO ledger (id, name, currency)
              VALUES (${request.id}, ${request.name}, 'LOCAL')
            `;
            return yield* makeLedgerFromRow(
              { id: request.id, name: request.name, currency: "LOCAL" },
              storagePath,
            );
          }),
        ),
        "initialize",
        storagePath,
        { ledgerId: request.id },
      ).pipe(Effect.provideService(SqlClient.SafeIntegers, true));
    });
  const getLedger = (): Effect.Effect<Ledger, FamilyLedgerError> =>
    readSingletonLedger(sql, storagePath).pipe(Effect.provideService(SqlClient.SafeIntegers, true));
  const createAccount = (input: CreateAccountRequest): Effect.Effect<Account, FamilyLedgerError> =>
    Effect.gen(function* () {
      const request = yield* Schema.decodeUnknownEffect(CreateAccountRequestSchema)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          failure(
            "invalid-request",
            `Account create request failed strict schema decoding: ${String(issue)}`,
            {
              requestPath: "ledger.account.create",
              storagePath,
            },
          ),
        ),
      );
      return yield* mapSqlEffect(
        sql.withTransaction(
          Effect.gen(function* () {
            const ledger = yield* readSingletonLedger(sql, storagePath);
            const existing = yield* mapSqlEffect(
              sql<Record<string, unknown>>`
                SELECT id
                FROM account
                WHERE ledger_id = ${ledger.id} AND id = ${request.id}
              `,
              "create-account",
              storagePath,
            );
            if (existing.length > 0) {
              return yield* Effect.fail(
                failure("duplicate-account", "The account identity is already present", {
                  identity: request.id,
                  accountId: request.id,
                  ledgerId: ledger.id,
                  storagePath,
                }),
              );
            }
            yield* sql`
              INSERT INTO account (ledger_id, id, name, type)
              VALUES (${ledger.id}, ${request.id}, ${request.name}, ${request.type})
            `;
            return yield* makeAccountFromRow(
              { ledgerId: ledger.id, id: request.id, name: request.name, type: request.type },
              storagePath,
            );
          }),
        ),
        "create-account",
        storagePath,
        { accountId: request.id },
      ).pipe(Effect.provideService(SqlClient.SafeIntegers, true));
    });
  const postEntry = (
    input: GeneralEntryRequest,
    expectedKind?: StandardEntryKind,
  ): Effect.Effect<PostResult, FamilyLedgerError> =>
    Effect.gen(function* () {
      const request = yield* decodePostRequest(input, storagePath);
      const fingerprint = canonicalTransactionFingerprint(request);
      return yield* mapSqlEffect(
        sql.withTransaction(
          Effect.gen(function* () {
            const ledger = yield* readSingletonLedger(sql, storagePath);
            const existingTransaction = yield* readTransactionRow(
              sql,
              ledger,
              request.transactionId,
              storagePath,
            );
            if (existingTransaction !== undefined) {
              if (existingTransaction.fingerprint !== fingerprint) {
                return yield* Effect.fail(
                  failure(
                    "transaction-identity-conflict",
                    "Transaction identity was already used with a different canonical payload",
                    {
                      identity: request.transactionId,
                      transactionId: request.transactionId,
                      ledgerId: ledger.id,
                      storagePath,
                    },
                  ),
                );
              }
              const existingEntry = yield* readEntry(sql, ledger, existingTransaction, storagePath);
              const accounts = yield* readAccounts(sql, ledger, storagePath);
              yield* validatePersistedJournal([existingEntry], accounts, storagePath);
              const replayChecked = validateEntry(request, accounts, expectedKind);
              if (Result.isFailure(replayChecked)) {
                return yield* Effect.fail(replayChecked.failure);
              }
              return yield* decodePostResult({ entry: existingEntry, replayed: true }, storagePath);
            }

            const accounts = yield* readAccounts(sql, ledger, storagePath);
            const checked = validateEntry(request, accounts, expectedKind);
            if (Result.isFailure(checked)) return yield* Effect.fail(checked.failure);
            const entry = checked.success;
            const debitTotal = entry.postings.reduce(
              (total, posting) => (posting.side === "debit" ? total + posting.amount : total),
              0n,
            );
            const currentDebitTotal = yield* readDebitTotal(sql, ledger, storagePath);
            if (currentDebitTotal + debitTotal > MAX_LEDGER_MINOR_UNITS) {
              return yield* Effect.fail(
                failure(
                  "amount-out-of-range",
                  `Accepted debit total would exceed ${MAX_LEDGER_MINOR_UNITS}`,
                  {
                    path: "postings",
                    transactionId: request.transactionId,
                    ledgerId: ledger.id,
                    storagePath,
                  },
                ),
              );
            }
            yield* sql`
              INSERT INTO journal_transaction (ledger_id, transaction_id, description, fingerprint)
              VALUES (${ledger.id}, ${entry.transactionId}, ${entry.description}, ${entry.fingerprint})
            `;
            for (const [lineIndex, posting] of entry.postings.entries()) {
              yield* sql`
                INSERT INTO posting (
                  ledger_id, transaction_id, line_index, line_id, account_id, side, amount
                ) VALUES (
                  ${ledger.id}, ${entry.transactionId}, ${lineIndex}, ${posting.lineId},
                  ${posting.accountId}, ${posting.side}, ${posting.amount}
                )
              `;
            }
            return yield* decodePostResult({ entry, replayed: false }, storagePath);
          }),
        ),
        "post-entry",
        storagePath,
      ).pipe(Effect.provideService(SqlClient.SafeIntegers, true));
    });

  const listJournal = (): Effect.Effect<
    Schema.Schema.Type<typeof JournalResultSchema>,
    FamilyLedgerError
  > =>
    mapSqlEffect(
      sql.withTransaction(
        Effect.gen(function* () {
          const ledger = yield* readSingletonLedger(sql, storagePath);
          const accounts = yield* readAccounts(sql, ledger, storagePath);
          const entries = yield* readAllEntries(sql, ledger, storagePath);
          yield* validatePersistedJournal(entries, accounts, storagePath);
          return yield* decodeJournalResult({ entries }, storagePath);
        }),
      ),
      "list-journal",
      storagePath,
    ).pipe(Effect.provideService(SqlClient.SafeIntegers, true));

  const listBalances = (): Effect.Effect<
    ReadonlyArray<Schema.Schema.Type<typeof BalanceResultSchema>>,
    FamilyLedgerError
  > =>
    mapSqlEffect(
      sql.withTransaction(
        Effect.gen(function* () {
          const ledger = yield* readSingletonLedger(sql, storagePath);
          const accounts = yield* readAccounts(sql, ledger, storagePath);
          const entries = yield* readAllEntries(sql, ledger, storagePath);
          yield* validatePersistedJournal(entries, accounts, storagePath);
          return yield* readSqlBalances(sql, ledger, storagePath);
        }),
      ),
      "list-balances",
      storagePath,
    ).pipe(Effect.provideService(SqlClient.SafeIntegers, true));

  const verifyRebuild = (): Effect.Effect<VerifyRebuildResult, FamilyLedgerError> =>
    mapSqlEffect(
      sql.withTransaction(
        Effect.gen(function* () {
          const ledger = yield* readSingletonLedger(sql, storagePath);
          const accounts = yield* readAccounts(sql, ledger, storagePath);
          const entries = yield* readAllEntries(sql, ledger, storagePath);
          const sqlBalances = yield* readSqlBalances(sql, ledger, storagePath);
          const foldedBalances = yield* validatePersistedJournal(entries, accounts, storagePath);
          if (
            sqlBalances.length !== foldedBalances.length ||
            sqlBalances.some(
              (balance, index) =>
                balance.accountId !== foldedBalances[index]?.accountId ||
                balance.balance !== foldedBalances[index]?.balance,
            )
          ) {
            return yield* Effect.fail(
              failure("corrupt-journal", "SQL balances differ from the independent journal fold", {
                path: "balances",
                ledgerId: ledger.id,
                storagePath,
              }),
            );
          }
          return yield* decodeVerifyResult({ balances: sqlBalances, matches: true }, storagePath);
        }),
      ),
      "verify-rebuild",
      storagePath,
    ).pipe(Effect.provideService(SqlClient.SafeIntegers, true));

  return LedgerStorage.of({
    initialize,
    getLedger,
    createAccount,
    postEntry,
    listJournal,
    listBalances,
    verifyRebuild,
  });
};

const resolveDatabasePath = (options: LedgerStorageOptions): string => {
  if (options.databasePath !== undefined) return options.databasePath;
  const dataDir = options.dataDir ?? defaultDataDir;
  const separator = dataDir.endsWith("/") || dataDir.endsWith("\\") ? "" : "/";
  return `${dataDir}${separator}${defaultDatabaseFile}`;
};

/**
 * Build a scoped SQLite-backed family ledger service. The composition root
 * owns creation of `dataDir`; this layer runs idempotent schema migrations,
 * enables foreign keys, and closes the Bun SQLite connection at scope end.
 */
export const makeLedgerStorageLayer = (
  options: LedgerStorageOptions = {},
): Layer.Layer<LedgerStorage, FamilyLedgerError> => {
  const storagePath = resolveDatabasePath(options);
  const clientLayer = SqliteClient.layer({ filename: storagePath });
  return Layer.effect(
    LedgerStorage,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* initializeSchema(sql, storagePath);
      return makeService(sql, storagePath);
    }),
  ).pipe(Layer.provide(clientLayer));
};

/** Alias retained as the composition-root name used by the CLI seam. */
export const ledgerStorageLayer = makeLedgerStorageLayer;
