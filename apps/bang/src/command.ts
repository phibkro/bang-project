import { Console, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";

import {
  AccountSchema,
  Amount,
  ExpenseRequestSchema,
  FamilyLedgerError,
  GeneralEntryRequestFromJson,
  IncomeRequestSchema,
  LedgerSchema,
  TransferRequestSchema,
  makeExpenseRequest,
  makeIncomeRequest,
  makeTransferRequest,
} from "./ledger-domain.ts";
import { LedgerStorage, makeLedgerStorageLayer } from "./ledger-storage.ts";
import { compileSelectedSelfCheck, formatBangCheckFailure } from "./check.ts";
import { compileSelectedNormalization, formatNormalizationFailure } from "./normalize.ts";
import { compileSelectedExplanation, formatExplanationFailure } from "./explain.ts";
import { compileSelectedClassification, formatClassificationFailure } from "./classify.ts";
import { compileSelectedSystemReport, formatBangReportFailure } from "./report.ts";
import { compileSelectedTrace, formatTraceFailure } from "./trace.ts";
import { compileSelectedProject, formatProjectFailure } from "./project.ts";
import {
  compileSelectedSemanticDatabase,
  formatM026SemanticDatabaseFailure,
  type M026SemanticDatabaseFailure,
} from "./semantic-database.ts";
import {
  formatM027SemanticDatabaseFailure,
  runM027TransferCli,
  type M027SemanticDatabaseFailure,
} from "./semantic-database-transfer.ts";

const m027RouteProbeFromJson = Schema.fromJsonString(
  Schema.Struct({
    bangSemanticDatabase: Schema.Literal(1),
    bridge: Schema.Unknown,
    obligation: Schema.Unknown,
  }),
);

const parseOptions = { onExcessProperty: "error" } as const;

const isM027Selection = (encoded: string): Effect.Effect<boolean> =>
  Schema.decodeUnknownEffect(m027RouteProbeFromJson)(encoded, {
    onExcessProperty: "ignore",
  }).pipe(
    Effect.match({
      onFailure: () => false,
      onSuccess: () => true,
    }),
  );

type DatabaseCompileFailure = M026SemanticDatabaseFailure | M027SemanticDatabaseFailure;

const runDatabaseSelection = (root: string, selection: string, outputDirectory: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedRoot = path.resolve(root);
    const resolvedSelection = path.resolve(resolvedRoot, selection);
    const relativeSelection = path.relative(resolvedRoot, resolvedSelection);
    if (
      relativeSelection.startsWith("..") ||
      path.isAbsolute(relativeSelection) ||
      relativeSelection.length === 0
    ) {
      return yield* compileSelectedSemanticDatabase(root, selection, outputDirectory).pipe(
        Effect.map(({ text }) => text),
      );
    }
    const encoded = yield* fileSystem
      .readFileString(resolvedSelection)
      .pipe(Effect.catch(() => Effect.succeed(undefined)));
    if (encoded === undefined) {
      return yield* compileSelectedSemanticDatabase(root, selection, outputDirectory).pipe(
        Effect.map(({ text }) => text),
      );
    }
    if (yield* isM027Selection(encoded)) {
      return yield* runM027TransferCli(root, selection, outputDirectory);
    }
    return yield* compileSelectedSemanticDatabase(root, selection, outputDirectory).pipe(
      Effect.map(({ text }) => text),
    );
  });

const formatDatabaseFailure = (error: DatabaseCompileFailure): string =>
  error._tag === "M027SemanticDatabaseFailure"
    ? formatM027SemanticDatabaseFailure(error)
    : formatM026SemanticDatabaseFailure(error);

const ledgerFailure = (
  reason: FamilyLedgerError["reason"],
  message: string,
  fields: {
    readonly path?: string;
    readonly identity?: string;
    readonly ledgerId?: string;
    readonly accountId?: string;
    readonly transactionId?: string;
    readonly requestPath?: string;
    readonly storagePath?: string;
  } = {},
) => new FamilyLedgerError({ reason, message, ...fields });

const formatLedgerFailure = (error: FamilyLedgerError): string => {
  const context = [
    ["path", error.path],
    ["identity", error.identity],
    ["ledger", error.ledgerId],
    ["account", error.accountId],
    ["transaction", error.transactionId],
    ["request", error.requestPath],
    ["storage", error.storagePath],
  ]
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  return `${error.reason}: ${error.message}${context.length > 0 ? ` (${context})` : ""}`;
};

const toCliError = (error: unknown): CliError.UserError => {
  if (error instanceof FamilyLedgerError) {
    return new CliError.UserError({
      cause: error,
      userMessage: formatLedgerFailure(error),
    });
  }
  return new CliError.UserError({
    cause: error,
    userMessage: formatLedgerFailure(ledgerFailure("storage-failure", "ledger storage failed")),
  });
};

const decodeSchema = <A>(
  schema: Schema.Codec<A, unknown, never, unknown>,
  value: unknown,
  label: string,
  fields: {
    readonly requestPath?: string;
  } = {},
) =>
  Schema.decodeUnknownEffect(schema)(value, parseOptions).pipe(
    Effect.mapError((issue) =>
      ledgerFailure("invalid-request", `invalid ${label}: ${String(issue)}`, fields),
    ),
  );

const decodeAmount = (value: string, label: string) =>
  Schema.decodeUnknownEffect(Amount)(value, parseOptions).pipe(
    Effect.mapError(() => ledgerFailure("invalid-amount", `invalid amount for ${label}`)),
    Effect.asVoid,
  );

const resolveDataDirectory = (root: string, dataDir: string, path: Path.Path): string =>
  path.isAbsolute(dataDir) ? path.normalize(dataDir) : path.resolve(root, dataDir);

/**
 * Open one local ledger for one command invocation.
 *
 * The directory is created before the SQLite layer is provided because
 * SqliteClient creates the database file but not its parent directory.
 */
const runLedger = <A, E>(
  root: string,
  dataDir: string,
  operation: (resolvedDataDir: string) => Effect.Effect<A, E, LedgerStorage>,
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedDataDir = resolveDataDirectory(root, dataDir, path);
    yield* fileSystem.makeDirectory(resolvedDataDir, { recursive: true }).pipe(
      Effect.mapError(() =>
        ledgerFailure("storage-failure", "could not create ledger data directory", {
          storagePath: resolvedDataDir,
        }),
      ),
    );
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(makeLedgerStorageLayer({ dataDir: resolvedDataDir }));
        return yield* operation(resolvedDataDir).pipe(Effect.provide(context));
      }),
    );
  });

const formatLedger = (ledger: {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
}) => [
  `Family ID: ${ledger.id}`,
  `Ledger name: ${JSON.stringify(ledger.name)}`,
  `Currency: ${ledger.currency}`,
];

const formatAccount = (account: {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}) => [
  `Account ID: ${account.id}`,
  `Account name: ${JSON.stringify(account.name)}`,
  `Account type: ${account.type}`,
];

const formatPosting = (
  posting: {
    readonly lineId: string;
    readonly accountId: string;
    readonly side: string;
    readonly amount: bigint;
  },
  position: number,
) =>
  `Posting ${position}: line ${posting.lineId}, account ${posting.accountId}, ${posting.side}, amount ${String(
    posting.amount,
  )}`;

const formatEntry = (entry: {
  readonly transactionId: string;
  readonly description: string;
  readonly fingerprint: string;
  readonly postings: ReadonlyArray<{
    readonly lineId: string;
    readonly accountId: string;
    readonly side: string;
    readonly amount: bigint;
  }>;
}) => [
  `Transaction ID: ${entry.transactionId}`,
  `Description: ${JSON.stringify(entry.description)}`,
  `Fingerprint: ${entry.fingerprint}`,
  ...entry.postings.map(formatPosting),
];

const formatBalance = (balance: { readonly accountId: string; readonly balance: bigint }) =>
  `Balance: account ${balance.accountId}, minor units ${String(balance.balance)}`;

const formatJournal = (
  ledger: { readonly id: string; readonly name: string; readonly currency: string },
  entries: ReadonlyArray<{
    readonly transactionId: string;
    readonly description: string;
    readonly fingerprint: string;
    readonly postings: ReadonlyArray<{
      readonly lineId: string;
      readonly accountId: string;
      readonly side: string;
      readonly amount: bigint;
    }>;
  }>,
) => [
  "Family ledger journal",
  ...formatLedger(ledger),
  ...entries.flatMap((entry) => formatEntry(entry)),
];

const formatBalances = (
  ledger: { readonly id: string; readonly name: string; readonly currency: string },
  balances: ReadonlyArray<{ readonly accountId: string; readonly balance: bigint }>,
) => ["Family ledger balances", ...formatLedger(ledger), ...balances.map(formatBalance)];

const formatRebuild = (
  ledger: { readonly id: string; readonly name: string; readonly currency: string },
  balances: ReadonlyArray<{ readonly accountId: string; readonly balance: bigint }>,
  matches: boolean,
) => [
  "Family ledger rebuild verification",
  ...formatLedger(ledger),
  `Rebuild: ${matches ? "matches" : "does-not-match"}`,
  "Evidence: runtime-checked",
  "Scope: single-local-sqlite-ledger",
  ...balances.map(formatBalance),
];

/** Build the `bang` command tree for one explicit repository root. */
export const makeBangCommand = (root: string) => {
  const bang = Command.make("bang").pipe(
    Command.withSharedFlags({
      dataDir: Flag.string("data-dir").pipe(Flag.withDefault(".bang/family-ledger")),
    }),
  );
  const database = Command.make(
    "database",
    {
      selection: Argument.string("selection"),
      outputDirectory: Flag.string("output-dir").pipe(Flag.withDefault(".bang/semantic-database")),
    },
    ({ outputDirectory, selection }) =>
      runDatabaseSelection(root, selection, outputDirectory).pipe(
        Effect.flatMap((text) => Console.log(text)),
        Effect.mapError(
          (error) =>
            new CliError.UserError({
              cause: error,
              userMessage: formatDatabaseFailure(error),
            }),
        ),
      ),
  );

  const project = Command.make(
    "project",
    { selection: Argument.string("selection") },
    ({ selection }) =>
      compileSelectedProject(root, selection).pipe(
        Effect.flatMap(({ text }) => Console.log(text)),
        Effect.mapError(
          (error) =>
            new CliError.UserError({
              cause: error,
              userMessage: formatProjectFailure(error),
            }),
        ),
      ),
  );

  const trace = Command.make(
    "trace",
    { selection: Argument.string("selection") },
    ({ selection }) =>
      compileSelectedTrace(root, selection).pipe(
        Effect.flatMap(({ text }) => Console.log(text)),
        Effect.mapError(
          (error) =>
            new CliError.UserError({
              cause: error,
              userMessage: formatTraceFailure(error),
            }),
        ),
      ),
  );

  const report = Command.make(
    "report",
    { selection: Argument.string("selection") },
    ({ selection }) =>
      compileSelectedSystemReport(root, selection).pipe(
        Effect.flatMap(({ text }) => Console.log(text)),
        Effect.mapError(
          (error) =>
            new CliError.UserError({
              cause: error,
              userMessage: formatBangReportFailure(error),
            }),
        ),
      ),
  );

  const normalize = Command.make(
    "normalize",
    { selection: Argument.string("selection") },
    ({ selection }) =>
      compileSelectedNormalization(root, selection).pipe(
        Effect.flatMap(({ text }) => Console.log(text)),
        Effect.mapError(
          (error) =>
            new CliError.UserError({
              cause: error,
              userMessage: formatNormalizationFailure(error),
            }),
        ),
      ),
  );

  const explain = Command.make(
    "explain",
    { selection: Argument.string("selection") },
    ({ selection }) =>
      compileSelectedExplanation(root, selection).pipe(
        Effect.flatMap(({ text }) => Console.log(text)),
        Effect.mapError(
          (error) =>
            new CliError.UserError({
              cause: error,
              userMessage: formatExplanationFailure(error),
            }),
        ),
      ),
  );

  const classify = Command.make(
    "classify",
    { selection: Argument.string("selection") },
    ({ selection }) =>
      compileSelectedClassification(root, selection).pipe(
        Effect.flatMap(({ text }) => Console.log(text)),
        Effect.mapError(
          (error) =>
            new CliError.UserError({
              cause: error,
              userMessage: formatClassificationFailure(error),
            }),
        ),
      ),
  );

  const check = Command.make(
    "check",
    { selection: Argument.string("selection") },
    ({ selection }) =>
      compileSelectedSelfCheck(root, selection).pipe(
        Effect.flatMap(({ text }) => Console.log(text)),
        Effect.mapError(
          (error) =>
            new CliError.UserError({
              cause: error,
              userMessage: formatBangCheckFailure(error),
            }),
        ),
      ),
  );

  const init = Command.make(
    "init",
    {
      ledgerId: Argument.string("ledger-id"),
      name: Argument.string("name"),
    },
    ({ ledgerId, name }) =>
      Effect.gen(function* () {
        const ledgerInput = yield* decodeSchema(
          LedgerSchema,
          { id: ledgerId, name, currency: "LOCAL" },
          "ledger",
        );
        const { dataDir } = yield* bang;
        const ledger = yield* runLedger(root, dataDir, () =>
          Effect.gen(function* () {
            const storage = yield* LedgerStorage;
            return yield* storage.initialize({ id: ledgerInput.id, name: ledgerInput.name });
          }),
        );
        yield* Console.log(["Family ledger initialized", ...formatLedger(ledger)].join("\n"));
      }).pipe(Effect.mapError(toCliError)),
  );

  const accountCreate = Command.make(
    "create",
    {
      accountId: Argument.string("account-id"),
      name: Argument.string("name"),
      type: Argument.string("type"),
    },
    ({ accountId, name, type }) =>
      Effect.gen(function* () {
        const accountInput = yield* decodeSchema(
          AccountSchema,
          { id: accountId, name, type },
          "account",
        );
        const { dataDir } = yield* bang;
        const text = yield* runLedger(root, dataDir, () =>
          Effect.gen(function* () {
            const storage = yield* LedgerStorage;
            const ledger = yield* storage.getLedger();
            const created = yield* storage.createAccount(accountInput);
            return [...formatLedger(ledger), ...formatAccount(created)].join("\n");
          }),
        );
        yield* Console.log(text);
      }).pipe(Effect.mapError(toCliError)),
  );

  const postIncome = Command.make(
    "income",
    {
      transactionId: Argument.string("transaction-id"),
      destinationAccountId: Argument.string("destination-account-id"),
      incomeAccountId: Argument.string("income-account-id"),
      amount: Argument.string("amount"),
      description: Argument.string("description"),
    },
    ({ transactionId, destinationAccountId, incomeAccountId, amount, description }) =>
      Effect.gen(function* () {
        yield* decodeAmount(amount, "income");
        const input = yield* decodeSchema(
          IncomeRequestSchema,
          { transactionId, destinationAccountId, incomeAccountId, amount, description },
          "income",
        );
        const { dataDir } = yield* bang;
        const text = yield* runLedger(root, dataDir, () =>
          Effect.gen(function* () {
            const storage = yield* LedgerStorage;
            const ledger = yield* storage.getLedger();
            const result = yield* storage.postEntry(makeIncomeRequest(input), "income");
            return [
              `Family ID: ${ledger.id}`,
              `Transaction ID: ${result.entry.transactionId}`,
              `Replay: ${result.replayed ? "replayed" : "accepted"}`,
              ...formatEntry(result.entry).slice(1),
            ].join("\n");
          }),
        );
        yield* Console.log(text);
      }).pipe(Effect.mapError(toCliError)),
  );

  const postExpense = Command.make(
    "expense",
    {
      transactionId: Argument.string("transaction-id"),
      sourceAccountId: Argument.string("source-account-id"),
      expenseAccountId: Argument.string("expense-account-id"),
      amount: Argument.string("amount"),
      description: Argument.string("description"),
    },
    ({ transactionId, sourceAccountId, expenseAccountId, amount, description }) =>
      Effect.gen(function* () {
        yield* decodeAmount(amount, "expense");
        const input = yield* decodeSchema(
          ExpenseRequestSchema,
          { transactionId, sourceAccountId, expenseAccountId, amount, description },
          "expense",
        );
        const { dataDir } = yield* bang;
        const text = yield* runLedger(root, dataDir, () =>
          Effect.gen(function* () {
            const storage = yield* LedgerStorage;
            const ledger = yield* storage.getLedger();
            const result = yield* storage.postEntry(makeExpenseRequest(input), "expense");
            return [
              `Family ID: ${ledger.id}`,
              `Transaction ID: ${result.entry.transactionId}`,
              `Replay: ${result.replayed ? "replayed" : "accepted"}`,
              ...formatEntry(result.entry).slice(1),
            ].join("\n");
          }),
        );
        yield* Console.log(text);
      }).pipe(Effect.mapError(toCliError)),
  );

  const postTransfer = Command.make(
    "transfer",
    {
      transactionId: Argument.string("transaction-id"),
      sourceAccountId: Argument.string("source-account-id"),
      destinationAccountId: Argument.string("destination-account-id"),
      amount: Argument.string("amount"),
      description: Argument.string("description"),
    },
    ({ transactionId, sourceAccountId, destinationAccountId, amount, description }) =>
      Effect.gen(function* () {
        yield* decodeAmount(amount, "transfer");
        const input = yield* decodeSchema(
          TransferRequestSchema,
          { transactionId, sourceAccountId, destinationAccountId, amount, description },
          "transfer",
        );
        const { dataDir } = yield* bang;
        const text = yield* runLedger(root, dataDir, () =>
          Effect.gen(function* () {
            const storage = yield* LedgerStorage;
            const ledger = yield* storage.getLedger();
            const result = yield* storage.postEntry(makeTransferRequest(input), "transfer");
            return [
              `Family ID: ${ledger.id}`,
              `Transaction ID: ${result.entry.transactionId}`,
              `Replay: ${result.replayed ? "replayed" : "accepted"}`,
              ...formatEntry(result.entry).slice(1),
            ].join("\n");
          }),
        );
        yield* Console.log(text);
      }).pipe(Effect.mapError(toCliError)),
  );

  const postEntry = Command.make(
    "entry",
    { requestPath: Argument.string("request.json") },
    ({ requestPath }) =>
      Effect.gen(function* () {
        const { dataDir } = yield* bang;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const resolvedRequestPath = path.resolve(root, requestPath);
        const contents = yield* fileSystem.readFileString(resolvedRequestPath).pipe(
          Effect.mapError(() =>
            ledgerFailure("invalid-request", "could not read general entry request", {
              requestPath: resolvedRequestPath,
            }),
          ),
        );
        const request = yield* Schema.decodeUnknownEffect(GeneralEntryRequestFromJson)(
          contents,
          parseOptions,
        ).pipe(
          Effect.mapError((issue) =>
            ledgerFailure("invalid-request", `invalid general entry request: ${String(issue)}`, {
              requestPath: resolvedRequestPath,
            }),
          ),
        );
        const text = yield* runLedger(root, dataDir, () =>
          Effect.gen(function* () {
            const storage = yield* LedgerStorage;
            const ledger = yield* storage.getLedger();
            const result = yield* storage.postEntry(request);
            return [
              `Family ID: ${ledger.id}`,
              `Request: ${resolvedRequestPath}`,
              `Transaction ID: ${result.entry.transactionId}`,
              `Replay: ${result.replayed ? "replayed" : "accepted"}`,
              ...formatEntry(result.entry).slice(1),
            ].join("\n");
          }),
        );
        yield* Console.log(text);
      }).pipe(Effect.mapError(toCliError)),
  );

  const post = Command.make("post").pipe(
    Command.withSubcommands([postIncome, postExpense, postTransfer, postEntry]),
  );

  const journal = Command.make("journal", {}, () =>
    Effect.gen(function* () {
      const { dataDir } = yield* bang;
      const text = yield* runLedger(root, dataDir, () =>
        Effect.gen(function* () {
          const storage = yield* LedgerStorage;
          const ledger = yield* storage.getLedger();
          const result = yield* storage.listJournal();
          return formatJournal(ledger, result.entries).join("\n");
        }),
      );
      yield* Console.log(text);
    }).pipe(Effect.mapError(toCliError)),
  );

  const balances = Command.make("balances", {}, () =>
    Effect.gen(function* () {
      const { dataDir } = yield* bang;
      const text = yield* runLedger(root, dataDir, () =>
        Effect.gen(function* () {
          const storage = yield* LedgerStorage;
          const ledger = yield* storage.getLedger();
          const result = yield* storage.listBalances();
          return formatBalances(ledger, result).join("\n");
        }),
      );
      yield* Console.log(text);
    }).pipe(Effect.mapError(toCliError)),
  );

  const rebuildVerify = Command.make("verify", {}, () =>
    Effect.gen(function* () {
      const { dataDir } = yield* bang;
      const text = yield* runLedger(root, dataDir, () =>
        Effect.gen(function* () {
          const storage = yield* LedgerStorage;
          const ledger = yield* storage.getLedger();
          const result = yield* storage.verifyRebuild();
          return formatRebuild(ledger, result.balances, result.matches).join("\n");
        }),
      );
      yield* Console.log(text);
    }).pipe(Effect.mapError(toCliError)),
  );

  const rebuild = Command.make("rebuild").pipe(Command.withSubcommands([rebuildVerify]));
  const account = Command.make("account").pipe(Command.withSubcommands([accountCreate]));
  const ledger = Command.make("ledger").pipe(
    Command.withSubcommands([init, account, post, journal, balances, rebuild]),
  );

  return bang.pipe(
    Command.withSubcommands([
      database,
      project,
      trace,
      report,
      normalize,
      check,
      explain,
      classify,
      ledger,
    ]),
  );
};
