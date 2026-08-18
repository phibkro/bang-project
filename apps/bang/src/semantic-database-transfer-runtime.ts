import type {
  RelationalExpression,
  RelationalObligation,
  RelationalPredicate,
} from "@bang/obligations";
import { SqliteClient } from "@effect/sql-sqlite-bun";
import {
  Cause,
  Context,
  Effect,
  Layer,
  Option,
  Queue,
  Ref,
  Schema,
  SchemaTransformation,
  type Scope,
  Stream,
} from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { SqlClient } from "effect/unstable/sql";
import * as SqlError from "effect/unstable/sql/SqlError";

import { transferAccountState } from "../../../examples/tiny-bank/implementation/account-transfer.ts";
import { renderM027Sql, type M027TransferPlan } from "./semantic-database-transfer-target.ts";

const parseOptions = { onExcessProperty: "error" } as const;

const strict = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Struct(fields).annotate({ parseOptions });

const nonNegativeBigInt = Schema.BigInt.pipe(
  Schema.check(
    Schema.makeFilter(
      (value: unknown): value is bigint => typeof value === "bigint" && value >= 0n,
      { expected: "a nonnegative bigint" },
    ),
  ),
);

const canonicalNonNegativeInteger = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^(0|[1-9][0-9]*)$/u)),
  Schema.decodeTo(Schema.BigInt, SchemaTransformation.bigintFromString),
  Schema.check(
    Schema.makeFilter(
      (value: unknown): value is bigint => typeof value === "bigint" && value >= 0n,
      { expected: "a nonnegative bigint" },
    ),
  ),
);

/** An immutable committed Account observation. */
export interface M027AccountSummary {
  readonly accountId: string;
  readonly revision: bigint;
  readonly balance: bigint;
}

export const M027AccountSummarySchema = strict({
  accountId: Schema.String,
  revision: nonNegativeBigInt,
  balance: nonNegativeBigInt,
});

/** The immutable TotalFunds observation derived from committed Account rows. */
export interface M027TotalFunds {
  readonly revision: bigint;
  readonly total: bigint;
}

export const M027TotalFundsSchema = strict({
  revision: nonNegativeBigInt,
  total: nonNegativeBigInt,
});

export interface M027TransferHandlerInput {
  readonly sourceBalance: bigint;
  readonly targetBalance: bigint;
  readonly amount: bigint;
}

export interface M027TransferHandlerResult {
  readonly sourceBalanceAfter: bigint;
  readonly targetBalanceAfter: bigint;
}

/** Independent transfer arithmetic. The handler has no database or publication authority. */
export type M027TransferHandler = (
  input: M027TransferHandlerInput,
) => Effect.Effect<M027TransferHandlerResult, unknown> | M027TransferHandlerResult;

/** The default independent handler used by the TinyBank journey. */
export const defaultM027TransferHandler: M027TransferHandler = (input) =>
  transferAccountState(input);

export type M027RuntimeFailureReason =
  | "sql"
  | "schema"
  | "corruption"
  | "handler"
  | "invariant"
  | "conformance"
  | "runtime"
  | "parity";

/** Typed failure from SQLite, strict decoding, handler execution, or parity checks. */
export class M027RuntimeFailure extends Schema.TaggedError<M027RuntimeFailure>()(
  "M027RuntimeFailure",
  {
    stage: Schema.Literal("runtime"),
    path: Schema.String,
    reason: Schema.Literals([
      "sql",
      "schema",
      "corruption",
      "handler",
      "invariant",
      "conformance",
      "runtime",
      "parity",
    ]),
    message: Schema.String,
    identity: Schema.optional(Schema.String),
    operation: Schema.optional(Schema.String),
  },
) {}

/** Expected command rejection. It never mutates rows or invalidates a key. */
export class M027TransferRejected extends Schema.TaggedError<M027TransferRejected>()(
  "TransferRejected",
  {
    sourceAccountId: Schema.String,
    targetAccountId: Schema.String,
    amount: Schema.BigInt,
    reason: Schema.Literals(["identical-account", "nonpositive-amount", "overdraft"]),
    failureId: Schema.String,
    revision: Schema.BigInt,
    message: Schema.String,
  },
) {}

/** Alias retained for callers that use the public generated failure identity. */
export const TransferRejected = M027TransferRejected;
export type TransferRejected = M027TransferRejected;

export class M027TransferConformanceFailure extends Schema.TaggedError<M027TransferConformanceFailure>()(
  "M027TransferConformanceFailure",
  {
    message: Schema.String,
    operation: Schema.String,
  },
) {}

export class M027DataServiceMissingError extends Schema.TaggedError<M027DataServiceMissingError>()(
  "M027DataServiceMissingError",
  { accountId: Schema.String },
) {}

export class M027DataServiceDuplicateError extends Schema.TaggedError<M027DataServiceDuplicateError>()(
  "M027DataServiceDuplicateError",
  { accountId: Schema.String },
) {}

export class M027DataServiceUnavailableError extends Schema.TaggedError<M027DataServiceUnavailableError>()(
  "M027DataServiceUnavailableError",
  { message: Schema.String },
) {}

export interface M027TransferResult {
  readonly source: M027AccountSummary;
  readonly target: M027AccountSummary;
  readonly total: M027TotalFunds;
}

export interface M027SubscriptionQueryRuns {
  readonly sourceAccount: number;
  readonly targetAccount: number;
  readonly total: number;
}

export interface M027DatabaseProviderShape {
  readonly create: (input: {
    readonly accountId: string;
    readonly initialBalance: bigint;
  }) => Effect.Effect<
    M027AccountSummary,
    M027RuntimeFailure | M027DataServiceDuplicateError | M027DataServiceUnavailableError
  >;
  readonly query: (input: {
    readonly accountId: string;
  }) => Effect.Effect<
    M027AccountSummary,
    M027RuntimeFailure | M027DataServiceMissingError | M027DataServiceUnavailableError
  >;
  readonly account: (input: {
    readonly accountId: string;
  }) => Effect.Effect<
    M027AccountSummary,
    M027RuntimeFailure | M027DataServiceMissingError | M027DataServiceUnavailableError
  >;
  readonly total: (
    input?: Readonly<Record<string, never>>,
  ) => Effect.Effect<M027TotalFunds, M027RuntimeFailure | M027DataServiceUnavailableError>;
  readonly transfer: (command: {
    readonly _tag?: string;
    readonly sourceAccountId: string;
    readonly targetAccountId: string;
    readonly amount: bigint;
  }) => Effect.Effect<
    M027TransferResult,
    | M027RuntimeFailure
    | M027TransferRejected
    | M027TransferConformanceFailure
    | M027DataServiceMissingError
    | M027DataServiceUnavailableError
  >;
  readonly subscribeAccount: (input: {
    readonly accountId: string;
  }) => Stream.Stream<
    M027AccountSummary,
    M027RuntimeFailure | M027DataServiceMissingError | M027DataServiceUnavailableError
  >;
  readonly subscribeTotal: (
    input?: Readonly<Record<string, never>>,
  ) => Stream.Stream<M027TotalFunds, M027RuntimeFailure | M027DataServiceUnavailableError>;
  readonly subscriptionQueryRuns: Effect.Effect<
    M027SubscriptionQueryRuns,
    M027DataServiceUnavailableError
  >;
}

export class M027DatabaseProvider extends Context.Service<
  M027DatabaseProvider,
  M027DatabaseProviderShape
>()("@bang/bang/M027DatabaseProvider") {
  static layer(
    plan: M027TransferPlan,
    databasePath: string,
    handler: M027TransferHandler,
  ): Layer.Layer<
    M027DatabaseProvider,
    M027RuntimeFailure,
    SqlClient.SqlClient | Reactivity.Reactivity
  > {
    return makeM027DatabaseProviderLayer(plan, databasePath, handler);
  }
}

export interface M027DatabaseJourney {
  readonly initialAccountSnapshots: readonly [M027AccountSummary, M027AccountSummary];
  readonly initialTotalSnapshot: M027TotalFunds;
  readonly committedAccountSnapshots: readonly [M027AccountSummary, M027AccountSummary];
  readonly committedTotalSnapshot: M027TotalFunds;
  readonly emittedAccountSnapshots: readonly [
    M027AccountSummary,
    M027AccountSummary,
    M027AccountSummary,
    M027AccountSummary,
  ];
  readonly emittedTotalSnapshots: readonly [M027TotalFunds, M027TotalFunds];
  readonly rejectionIdentity: string;
  readonly queryRunsAfterRejection: M027SubscriptionQueryRuns;
  readonly preReopenCleanAccounts: readonly [M027AccountSummary, M027AccountSummary];
  readonly preReopenCleanTotal: M027TotalFunds;
  readonly reopenedAccounts: readonly [M027AccountSummary, M027AccountSummary];
  readonly reopenedTotal: M027TotalFunds;
}

interface DecodedAccountRow {
  readonly accountId: string;
  readonly revision: bigint;
  readonly state: Readonly<Record<string, bigint>>;
}

type RuntimeFailureFields = Readonly<{
  readonly path?: string;
  readonly identity?: string;
  readonly operation?: string;
}>;

const runtimeFailure = (
  reason: M027RuntimeFailureReason,
  message: string,
  fields: RuntimeFailureFields = {},
): M027RuntimeFailure =>
  new M027RuntimeFailure({
    stage: "runtime",
    path: fields.path ?? "runtime",
    reason,
    message,
    ...(fields.identity === undefined ? {} : { identity: fields.identity }),
    ...(fields.operation === undefined ? {} : { operation: fields.operation }),
  });

const schemaFailure = (
  operation: string,
  databasePath: string,
  issue: unknown,
): M027RuntimeFailure =>
  runtimeFailure("schema", `Strict ${operation} decoding failed: ${String(issue)}`, {
    path: databasePath,
    operation,
  });

const sqlFailure = (
  operation: string,
  databasePath: string,
  error: SqlError.SqlError,
): M027RuntimeFailure =>
  runtimeFailure("sql", `SQLite ${operation} failed: ${error.message}`, {
    path: databasePath,
    operation,
  });

const providerUnavailable = (error: unknown): M027DataServiceUnavailableError =>
  new M027DataServiceUnavailableError({
    message: error instanceof Error ? error.message : String(error),
  });

const accountKey = (plan: M027TransferPlan, accountId: string): string =>
  `m027-account:${plan.serviceId}:${accountId}`;

const totalKey = (plan: M027TransferPlan): string => `m027-total:${plan.serviceId}`;

const balanceStateColumn = (plan: M027TransferPlan) =>
  plan.stateColumns.find(({ column }) => column === plan.balanceColumn);

const rowSchema = (plan: M027TransferPlan) => {
  const fields: Record<string, Schema.Codec<unknown, unknown, never, never>> = {
    accountId: Schema.String,
    revision: nonNegativeBigInt,
  };
  for (const column of plan.stateColumns) {
    fields[column.id] = canonicalNonNegativeInteger;
  }
  return strict(fields);
};

const makeSelectFragments = (sql: SqlClient.SqlClient, plan: M027TransferPlan) => [
  sql`${sql(plan.identityColumn)} AS "accountId"`,
  ...plan.stateColumns.map(({ id, column }) => sql`${sql(column)} AS ${sql(id)}`),
  sql`${sql(plan.revisionColumn)} AS "revision"`,
];

const initializeSchema = (
  sql: SqlClient.SqlClient,
  plan: M027TransferPlan,
  databasePath: string,
): Effect.Effect<void, M027RuntimeFailure> =>
  sql
    .unsafe(renderM027Sql(plan))
    .raw.pipe(Effect.mapError((error) => sqlFailure("schema initialization", databasePath, error)));

const readRows = (
  sql: SqlClient.SqlClient,
  plan: M027TransferPlan,
  databasePath: string,
): Effect.Effect<ReadonlyArray<DecodedAccountRow>, M027RuntimeFailure> =>
  Effect.gen(function* () {
    const rows = yield* sql<Record<string, unknown>>`
      SELECT ${sql.join(",", false)(makeSelectFragments(sql, plan))}
      FROM ${sql(plan.tableName)}
      ORDER BY ${sql(plan.identityColumn)}
    `.pipe(Effect.mapError((error) => sqlFailure("account query", databasePath, error)));
    const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(rowSchema(plan)))(
      rows,
      parseOptions,
    ).pipe(Effect.mapError((issue) => schemaFailure("account", databasePath, issue)));
    const result: Array<DecodedAccountRow> = [];
    for (const row of decoded) {
      const accountId = row.accountId;
      const revision = row.revision;
      if (typeof accountId !== "string" || typeof revision !== "bigint") {
        return yield* Effect.fail(
          runtimeFailure("corruption", "Decoded Account identity or revision has an invalid type", {
            path: databasePath,
            operation: "account query",
          }),
        );
      }
      const state: Record<string, bigint> = {};
      for (const column of plan.stateColumns) {
        const value = row[column.id];
        if (typeof value !== "bigint") {
          return yield* Effect.fail(
            runtimeFailure("corruption", `Decoded balance field ${column.id} is not a bigint`, {
              path: databasePath,
              identity: accountId,
              operation: "account query",
            }),
          );
        }
        state[column.id] = value;
      }
      result.push({ accountId, revision, state });
    }
    return result;
  });

const readAccountRowMaybe = (
  sql: SqlClient.SqlClient,
  plan: M027TransferPlan,
  accountId: string,
  databasePath: string,
): Effect.Effect<Option.Option<DecodedAccountRow>, M027RuntimeFailure> =>
  readRows(sql, plan, databasePath).pipe(
    Effect.map((rows) => {
      const row = rows.find((candidate) => candidate.accountId === accountId);
      return row === undefined ? Option.none() : Option.some(row);
    }),
  );

const readAccountRow = (
  sql: SqlClient.SqlClient,
  plan: M027TransferPlan,
  accountId: string,
  databasePath: string,
): Effect.Effect<DecodedAccountRow, M027RuntimeFailure> =>
  Effect.gen(function* () {
    const maybe = yield* readAccountRowMaybe(sql, plan, accountId, databasePath);
    if (Option.isNone(maybe)) {
      return yield* Effect.fail(
        runtimeFailure("corruption", `Account ${accountId} is missing`, {
          path: databasePath,
          identity: accountId,
          operation: "account query",
        }),
      );
    }
    return maybe.value;
  });

const accountSummary = (
  row: DecodedAccountRow,
  plan: M027TransferPlan,
  databasePath: string,
): Effect.Effect<M027AccountSummary, M027RuntimeFailure> =>
  Effect.gen(function* () {
    const field = balanceStateColumn(plan);
    if (field === undefined) {
      return yield* Effect.fail(
        runtimeFailure("corruption", "The selected balance field is missing", {
          path: databasePath,
          operation: "summary decoding",
        }),
      );
    }
    const balance = row.state[field.id];
    if (balance === undefined) {
      return yield* Effect.fail(
        runtimeFailure("corruption", "The decoded balance field is missing", {
          path: databasePath,
          identity: row.accountId,
          operation: "summary decoding",
        }),
      );
    }
    return yield* Schema.decodeUnknownEffect(M027AccountSummarySchema)(
      { accountId: row.accountId, revision: row.revision, balance },
      parseOptions,
    ).pipe(Effect.mapError((issue) => schemaFailure("account summary", databasePath, issue)));
  });

const readTotal = (
  sql: SqlClient.SqlClient,
  plan: M027TransferPlan,
  databasePath: string,
): Effect.Effect<M027TotalFunds, M027RuntimeFailure> =>
  Effect.gen(function* () {
    const rows = yield* readRows(sql, plan, databasePath);
    const field = balanceStateColumn(plan);
    if (field === undefined) {
      return yield* Effect.fail(
        runtimeFailure("corruption", "The selected balance field is missing", {
          path: databasePath,
          operation: "total query",
        }),
      );
    }
    let revision = 0n;
    let total = 0n;
    for (const row of rows) {
      const balance = row.state[field.id];
      if (balance === undefined) {
        return yield* Effect.fail(
          runtimeFailure("corruption", "A row omitted the selected balance field", {
            path: databasePath,
            identity: row.accountId,
            operation: "total query",
          }),
        );
      }
      total += balance;
      if (row.revision > revision) revision = row.revision;
    }
    return yield* Schema.decodeUnknownEffect(M027TotalFundsSchema)(
      { revision, total },
      parseOptions,
    ).pipe(Effect.mapError((issue) => schemaFailure("total", databasePath, issue)));
  });

const insertAccount = (
  sql: SqlClient.SqlClient,
  plan: M027TransferPlan,
  accountId: string,
  initialBalance: bigint,
  databasePath: string,
): Effect.Effect<void, M027RuntimeFailure> =>
  Effect.gen(function* () {
    if (initialBalance < 0n) {
      return yield* Effect.fail(
        runtimeFailure("invariant", "The initial account balance must be nonnegative", {
          path: databasePath,
          identity: accountId,
          operation: "account creation",
        }),
      );
    }
    const table = sql(plan.tableName);
    const columns = [
      sql`${sql(plan.identityColumn)}`,
      ...plan.stateColumns.map(({ column }) => sql`${sql(column)}`),
      sql`${sql(plan.revisionColumn)}`,
    ];
    const values = [
      accountId,
      ...plan.stateColumns.map(({ column }) =>
        column === plan.balanceColumn ? initialBalance.toString() : "0",
      ),
      0n,
    ];
    yield* sql`INSERT INTO ${table} (
      ${sql.join(",", false)(columns)}
    ) VALUES (
      ${sql.join(",", false)(values.map((value) => sql`${value}`))}
    )`.raw.pipe(Effect.mapError((error) => sqlFailure("account creation", databasePath, error)));
  });

const updateAccount = (
  sql: SqlClient.SqlClient,
  plan: M027TransferPlan,
  row: DecodedAccountRow,
  nextBalance: bigint,
  databasePath: string,
): Effect.Effect<void, M027RuntimeFailure> =>
  Effect.gen(function* () {
    if (nextBalance < 0n) {
      return yield* Effect.fail(
        runtimeFailure("invariant", "The independent handler returned a negative balance", {
          path: databasePath,
          identity: row.accountId,
          operation: "handler result",
        }),
      );
    }
    const updatedRows = yield* sql<Record<string, unknown>>`
      UPDATE ${sql(plan.tableName)}
      SET ${sql(plan.balanceColumn)} = ${nextBalance.toString()},
          ${sql(plan.revisionColumn)} = ${sql(plan.revisionColumn)} + 1
      WHERE ${sql(plan.identityColumn)} = ${row.accountId}
        AND ${sql(plan.revisionColumn)} = ${row.revision}
      RETURNING ${sql(plan.revisionColumn)} AS "revision"
    `.pipe(
      Effect.mapError((error) => sqlFailure("conditional account update", databasePath, error)),
    );
    const decoded = yield* Schema.decodeUnknownEffect(
      Schema.Array(strict({ revision: Schema.BigInt })),
    )(updatedRows, parseOptions).pipe(
      Effect.mapError((issue) => schemaFailure("conditional update", databasePath, issue)),
    );
    if (decoded.length !== 1) {
      return yield* Effect.fail(
        runtimeFailure("runtime", "The conditional account update affected no row", {
          path: databasePath,
          identity: row.accountId,
          operation: "conditional account update",
        }),
      );
    }
  });

const evaluateExpression = (
  expression: RelationalExpression,
  model: ReadonlyMap<string, bigint>,
): bigint | undefined => {
  switch (expression.kind) {
    case "variable":
      return model.get(expression.id);
    case "literal":
      return BigInt(expression.value);
    case "add": {
      const left = evaluateExpression(expression.left, model);
      const right = evaluateExpression(expression.right, model);
      return left === undefined || right === undefined ? undefined : left + right;
    }
    case "subtract": {
      const left = evaluateExpression(expression.left, model);
      const right = evaluateExpression(expression.right, model);
      return left === undefined || right === undefined ? undefined : left - right;
    }
  }
};

const expressionVariables = (expression: RelationalExpression): ReadonlyArray<string> => {
  switch (expression.kind) {
    case "variable":
      return [expression.id];
    case "literal":
      return [];
    case "add":
    case "subtract":
      return [...expressionVariables(expression.left), ...expressionVariables(expression.right)];
  }
};

const predicateVariables = (predicate: RelationalPredicate): ReadonlyArray<string> => [
  ...expressionVariables(predicate.left),
  ...expressionVariables(predicate.right),
];

const holdsPredicate = (
  predicate: RelationalPredicate,
  model: ReadonlyMap<string, bigint>,
): boolean | undefined => {
  const left = evaluateExpression(predicate.left, model);
  const right = evaluateExpression(predicate.right, model);
  if (left === undefined || right === undefined) return undefined;
  return predicate.kind === "equal" ? left === right : left <= right;
};

const validateObligation = (
  obligation: RelationalObligation,
  input: M027TransferHandlerInput,
  result: M027TransferHandlerResult,
  databasePath: string,
): Effect.Effect<void, M027RuntimeFailure | M027TransferConformanceFailure> =>
  Effect.gen(function* () {
    const model = new Map<string, bigint>([
      ["sourceBefore", input.sourceBalance],
      ["targetBefore", input.targetBalance],
      ["amount", input.amount],
      ["sourceAfter", result.sourceBalanceAfter],
      ["targetAfter", result.targetBalanceAfter],
    ]);
    for (const variable of obligation.variables) {
      if (!model.has(variable.id)) {
        return yield* Effect.fail(
          runtimeFailure(
            "conformance",
            `The transfer obligation variable ${variable.id} is unsupported`,
            {
              path: databasePath,
              operation: "obligation evaluation",
            },
          ),
        );
      }
    }
    const predicates = [...obligation.assumptions, obligation.claim];
    for (const predicate of predicates) {
      const value = holdsPredicate(predicate, model);
      if (value === undefined || !value) {
        const variables = predicateVariables(predicate).join(",");
        return yield* Effect.fail(
          new M027TransferConformanceFailure({
            message: `The independent handler violated the transfer obligation predicate (${variables})`,
            operation: "obligation evaluation",
          }),
        );
      }
    }
    if (result.sourceBalanceAfter < 0n || result.targetBalanceAfter < 0n) {
      return yield* Effect.fail(
        runtimeFailure("invariant", "The independent handler returned a negative balance", {
          path: databasePath,
          operation: "handler result",
        }),
      );
    }
  });

const decodeHandlerResult = (
  value: unknown,
  databasePath: string,
): Effect.Effect<M027TransferHandlerResult, M027RuntimeFailure> =>
  Schema.decodeUnknownEffect(
    strict({ sourceBalanceAfter: Schema.BigInt, targetBalanceAfter: Schema.BigInt }),
  )(value, parseOptions).pipe(
    Effect.mapError((issue) => schemaFailure("handler result", databasePath, issue)),
  );

const reject = (
  plan: M027TransferPlan,
  sourceAccountId: string,
  targetAccountId: string,
  amount: bigint,
  reason: "identical-account" | "nonpositive-amount" | "overdraft",
  revision: bigint,
): M027TransferRejected =>
  new M027TransferRejected({
    sourceAccountId,
    targetAccountId,
    amount,
    reason,
    failureId: plan.rejection.id,
    revision,
    message:
      reason === "overdraft"
        ? "The source account does not have sufficient funds"
        : reason === "identical-account"
          ? "The source and target accounts must differ"
          : "The transfer amount must be positive",
  });

const dispatchTransfer = (
  sql: SqlClient.SqlClient,
  reactivity: Context.Service.Shape<typeof Reactivity.Reactivity>,
  plan: M027TransferPlan,
  command: {
    readonly sourceAccountId: string;
    readonly targetAccountId: string;
    readonly amount: bigint;
  },
  handler: M027TransferHandler,
  databasePath: string,
): Effect.Effect<
  void,
  M027RuntimeFailure | M027TransferRejected | M027TransferConformanceFailure
> => {
  const write = Effect.gen(function* () {
    const source = yield* readAccountRow(sql, plan, command.sourceAccountId, databasePath);
    const target = yield* readAccountRow(sql, plan, command.targetAccountId, databasePath);
    const balanceField = balanceStateColumn(plan);
    if (balanceField === undefined) {
      return yield* Effect.fail(
        runtimeFailure("corruption", "The selected balance field is missing", {
          path: databasePath,
          operation: "transfer precondition",
        }),
      );
    }
    const sourceBalance = source.state[balanceField.id];
    const targetBalance = target.state[balanceField.id];
    if (sourceBalance === undefined || targetBalance === undefined) {
      return yield* Effect.fail(
        runtimeFailure("corruption", "A transfer account omitted its balance", {
          path: databasePath,
          operation: "transfer precondition",
        }),
      );
    }
    if (command.sourceAccountId === command.targetAccountId) {
      return yield* Effect.fail(
        reject(
          plan,
          command.sourceAccountId,
          command.targetAccountId,
          command.amount,
          "identical-account",
          source.revision,
        ),
      );
    }
    if (command.amount <= 0n) {
      return yield* Effect.fail(
        reject(
          plan,
          command.sourceAccountId,
          command.targetAccountId,
          command.amount,
          "nonpositive-amount",
          source.revision,
        ),
      );
    }
    if (sourceBalance < command.amount) {
      return yield* Effect.fail(
        reject(
          plan,
          command.sourceAccountId,
          command.targetAccountId,
          command.amount,
          "overdraft",
          source.revision,
        ),
      );
    }
    const input = {
      sourceBalance,
      targetBalance,
      amount: command.amount,
    } satisfies M027TransferHandlerInput;
    const supplied = yield* Effect.try({
      try: () => handler(input),
      catch: (defect) =>
        runtimeFailure("handler", `The independent transfer handler threw: ${String(defect)}`, {
          path: databasePath,
          operation: "independent transfer handler",
        }),
    });
    const handlerEffect = Effect.isEffect(supplied) ? supplied : Effect.succeed(supplied);
    const output = yield* handlerEffect.pipe(
      Effect.catchDefect((defect) =>
        Effect.fail(
          runtimeFailure(
            "handler",
            `The independent transfer handler defected: ${String(defect)}`,
            {
              path: databasePath,
              operation: "independent transfer handler",
            },
          ),
        ),
      ),
      Effect.mapError((error) =>
        error instanceof M027RuntimeFailure
          ? error
          : runtimeFailure("handler", `The independent transfer handler failed: ${String(error)}`, {
              path: databasePath,
              operation: "independent transfer handler",
            }),
      ),
    );
    const result = yield* decodeHandlerResult(output, databasePath);
    yield* validateObligation(plan.obligation, input, result, databasePath);
    yield* updateAccount(sql, plan, source, result.sourceBalanceAfter, databasePath);
    yield* updateAccount(sql, plan, target, result.targetBalanceAfter, databasePath);
  });
  return Reactivity.mutation([
    accountKey(plan, command.sourceAccountId),
    accountKey(plan, command.targetAccountId),
    totalKey(plan),
  ])(sql.withTransaction(write)).pipe(
    Effect.provideService(Reactivity.Reactivity, reactivity),
    Effect.mapError((error) => {
      if (
        error instanceof M027RuntimeFailure ||
        error instanceof M027TransferRejected ||
        error instanceof M027TransferConformanceFailure
      ) {
        return error;
      }
      if (SqlError.isSqlError(error)) {
        return sqlFailure("transfer transaction", databasePath, error);
      }
      return runtimeFailure("runtime", `Transfer transaction failed: ${String(error)}`, {
        path: databasePath,
        operation: "transfer transaction",
      });
    }),
  );
};

const makeM027DatabaseProviderLayer = (
  plan: M027TransferPlan,
  databasePath: string,
  handler: M027TransferHandler,
): Layer.Layer<
  M027DatabaseProvider,
  M027RuntimeFailure,
  SqlClient.SqlClient | Reactivity.Reactivity
> =>
  Layer.effect(
    M027DatabaseProvider,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const reactivity = yield* Reactivity.Reactivity;
      yield* initializeSchema(sql, plan, databasePath);
      const sourceRuns = yield* Ref.make(0);
      const targetRuns = yield* Ref.make(0);
      const totalRuns = yield* Ref.make(0);
      const query = (input: {
        readonly accountId: string;
      }): Effect.Effect<
        M027AccountSummary,
        M027RuntimeFailure | M027DataServiceMissingError | M027DataServiceUnavailableError
      > =>
        Effect.gen(function* () {
          const maybe = yield* readAccountRowMaybe(sql, plan, input.accountId, databasePath).pipe(
            Effect.mapError(providerUnavailable),
          );
          if (Option.isNone(maybe)) {
            return yield* Effect.fail(
              new M027DataServiceMissingError({ accountId: input.accountId }),
            );
          }
          return yield* accountSummary(maybe.value, plan, databasePath).pipe(
            Effect.mapError(providerUnavailable),
          );
        });
      const account = query;
      const totalEffect = readTotal(sql, plan, databasePath).pipe(
        Effect.mapError(providerUnavailable),
      );
      const total = (_input?: Readonly<Record<string, never>>) => totalEffect;

      const create = (input: {
        readonly accountId: string;
        readonly initialBalance: bigint;
      }): Effect.Effect<
        M027AccountSummary,
        M027RuntimeFailure | M027DataServiceDuplicateError | M027DataServiceUnavailableError
      > =>
        Effect.gen(function* () {
          const existing = yield* readAccountRowMaybe(
            sql,
            plan,
            input.accountId,
            databasePath,
          ).pipe(Effect.mapError(providerUnavailable));
          if (Option.isSome(existing)) {
            return yield* Effect.fail(
              new M027DataServiceDuplicateError({ accountId: input.accountId }),
            );
          }
          yield* Reactivity.mutation([accountKey(plan, input.accountId), totalKey(plan)])(
            sql.withTransaction(
              insertAccount(sql, plan, input.accountId, input.initialBalance, databasePath),
            ),
          ).pipe(
            Effect.provideService(Reactivity.Reactivity, reactivity),
            Effect.mapError(providerUnavailable),
          );
          return yield* query({ accountId: input.accountId }).pipe(
            Effect.mapError((error) =>
              error instanceof M027DataServiceMissingError
                ? runtimeFailure("corruption", "The inserted Account could not be read", {
                    path: databasePath,
                    identity: input.accountId,
                    operation: "account creation",
                  })
                : error,
            ),
          );
        });

      const transfer = (command: {
        readonly _tag?: string;
        readonly sourceAccountId: string;
        readonly targetAccountId: string;
        readonly amount: bigint;
      }): Effect.Effect<
        M027TransferResult,
        | M027RuntimeFailure
        | M027TransferRejected
        | M027TransferConformanceFailure
        | M027DataServiceMissingError
        | M027DataServiceUnavailableError
      > =>
        Effect.gen(function* () {
          if (command._tag !== undefined && command._tag !== plan.command.id) {
            return yield* Effect.fail(
              providerUnavailable(`Unsupported transfer command tag: ${command._tag}`),
            );
          }
          yield* dispatchTransfer(sql, reactivity, plan, command, handler, databasePath);
          const target = yield* query({ accountId: command.targetAccountId });
          const committedSource = yield* query({ accountId: command.sourceAccountId });
          const committedTotal = yield* total({});
          return {
            source: committedSource,
            target,
            total: committedTotal,
          } satisfies M027TransferResult;
        });

      const subscribeAccount = (input: {
        readonly accountId: string;
      }): Stream.Stream<
        M027AccountSummary,
        M027RuntimeFailure | M027DataServiceMissingError | M027DataServiceUnavailableError
      > => {
        const runs = input.accountId === plan.scenario.sourceAccountId ? sourceRuns : targetRuns;
        const queryEffect = Effect.gen(function* () {
          yield* Ref.update(runs, (count) => count + 1);
          return yield* query(input);
        });
        return reactivity.stream([accountKey(plan, input.accountId)], queryEffect);
      };

      const subscribeTotal = (_input?: Readonly<Record<string, never>>) =>
        reactivity.stream(
          [totalKey(plan)],
          Effect.gen(function* () {
            yield* Ref.update(totalRuns, (count) => count + 1);
            return yield* total();
          }),
        );

      const subscriptionQueryRuns = Effect.all({
        sourceAccount: Ref.get(sourceRuns),
        targetAccount: Ref.get(targetRuns),
        total: Ref.get(totalRuns),
      }).pipe(Effect.mapError(providerUnavailable));
      return {
        create,
        query,
        account,
        total,
        transfer,
        subscribeAccount,
        subscribeTotal,
        subscriptionQueryRuns,
      };
    }),
  );

const runtimeFromProviderError = (
  error: unknown,
  databasePath: string,
  operation: string,
): M027RuntimeFailure => {
  if (error instanceof M027TransferConformanceFailure) {
    return runtimeFailure("conformance", error.message, {
      path: databasePath,
      identity: error.operation,
      operation,
    });
  }
  return runtimeFailure("runtime", error instanceof Error ? error.message : String(error), {
    path: databasePath,
    operation,
  });
};

const summariesEqual = (left: M027AccountSummary, right: M027AccountSummary): boolean =>
  left.accountId === right.accountId &&
  left.revision === right.revision &&
  left.balance === right.balance;

const totalsEqual = (left: M027TotalFunds, right: M027TotalFunds): boolean =>
  left.revision === right.revision && left.total === right.total;

interface FirstScopeResult {
  readonly initialAccountSnapshots: readonly [M027AccountSummary, M027AccountSummary];
  readonly initialTotalSnapshot: M027TotalFunds;
  readonly committedAccountSnapshots: readonly [M027AccountSummary, M027AccountSummary];
  readonly committedTotalSnapshot: M027TotalFunds;
  readonly rejectionIdentity: string;
  readonly queryRunsAfterRejection: M027SubscriptionQueryRuns;
  readonly preReopenCleanAccounts: readonly [M027AccountSummary, M027AccountSummary];
  readonly preReopenCleanTotal: M027TotalFunds;
}

const runFirstScope = (
  plan: M027TransferPlan,
  databasePath: string,
): Effect.Effect<FirstScopeResult, M027RuntimeFailure, M027DatabaseProvider | Scope.Scope> =>
  Effect.gen(function* () {
    const provider = yield* M027DatabaseProvider;
    yield* provider
      .create({
        accountId: plan.scenario.sourceAccountId,
        initialBalance: plan.scenario.sourceInitialBalance,
      })
      .pipe(
        Effect.mapError((error) =>
          runtimeFromProviderError(error, databasePath, "source creation"),
        ),
      );
    yield* provider
      .create({
        accountId: plan.scenario.targetAccountId,
        initialBalance: plan.scenario.targetInitialBalance,
      })
      .pipe(
        Effect.mapError((error) =>
          runtimeFromProviderError(error, databasePath, "target creation"),
        ),
      );

    const sourceQueue = yield* Queue.unbounded<M027AccountSummary | M027RuntimeFailure>();
    const targetQueue = yield* Queue.unbounded<M027AccountSummary | M027RuntimeFailure>();
    const totalQueue = yield* Queue.unbounded<M027TotalFunds | M027RuntimeFailure>();

    const collect = <A, E>(
      stream: Stream.Stream<A, E>,
      queue: Queue.Queue<A | M027RuntimeFailure>,
      operation: string,
    ) =>
      Stream.runForEach(stream, (snapshot) =>
        Queue.offer(queue, snapshot).pipe(Effect.asVoid),
      ).pipe(
        Effect.catchEager((error) =>
          Queue.offer(queue, runtimeFromProviderError(error, databasePath, operation)).pipe(
            Effect.asVoid,
          ),
        ),
        Effect.forkScoped,
      );

    yield* collect(
      provider.subscribeAccount({ accountId: plan.scenario.sourceAccountId }),
      sourceQueue,
      "source subscription",
    );
    yield* collect(
      provider.subscribeAccount({ accountId: plan.scenario.targetAccountId }),
      targetQueue,
      "target subscription",
    );
    yield* collect(provider.subscribeTotal({}), totalQueue, "total subscription");

    const take = <A>(queue: Queue.Queue<A | M027RuntimeFailure>, operation: string) =>
      Effect.gen(function* () {
        const value = yield* Queue.take(queue).pipe(
          Effect.timeoutOrElse({
            duration: "5 seconds",
            orElse: () =>
              Effect.fail(
                runtimeFailure("runtime", "No bounded subscription snapshot arrived", {
                  path: databasePath,
                  operation,
                }),
              ),
          }),
        );
        if (value instanceof M027RuntimeFailure) return yield* Effect.fail(value);
        return value;
      });

    const initialSource = yield* take(sourceQueue, "initial source snapshot");
    const initialTarget = yield* take(targetQueue, "initial target snapshot");
    const initialTotal = yield* take(totalQueue, "initial total snapshot");

    yield* provider
      .transfer({
        _tag: plan.command.id,
        sourceAccountId: plan.scenario.sourceAccountId,
        targetAccountId: plan.scenario.targetAccountId,
        amount: plan.scenario.transferAmount,
      })
      .pipe(
        Effect.mapError((error) =>
          runtimeFromProviderError(error, databasePath, "accepted transfer"),
        ),
      );

    const committedSource = yield* take(sourceQueue, "committed source snapshot");
    const committedTarget = yield* take(targetQueue, "committed target snapshot");
    const committedTotal = yield* take(totalQueue, "committed total snapshot");

    const rejected = yield* Effect.exit(
      provider.transfer({
        _tag: plan.command.id,
        sourceAccountId: plan.scenario.sourceAccountId,
        targetAccountId: plan.scenario.targetAccountId,
        amount: plan.scenario.rejectionAmount,
      }),
    );
    if (rejected._tag === "Success") {
      return yield* Effect.fail(
        runtimeFailure("runtime", "The expected overdraft transfer unexpectedly succeeded", {
          path: databasePath,
          operation: "rejected transfer",
        }),
      );
    }
    const rejection = Cause.findErrorOption(rejected.cause);
    if (Option.isNone(rejection) || !(rejection.value instanceof M027TransferRejected)) {
      return yield* Effect.fail(
        runtimeFromProviderError(
          Option.isSome(rejection) ? rejection.value : "missing TransferRejected",
          databasePath,
          "rejected transfer",
        ),
      );
    }

    const queryRunsAfterRejection = yield* provider.subscriptionQueryRuns.pipe(
      Effect.mapError((error) =>
        runtimeFromProviderError(error, databasePath, "subscription query count"),
      ),
    );
    if (
      queryRunsAfterRejection.sourceAccount !== 2 ||
      queryRunsAfterRejection.targetAccount !== 2 ||
      queryRunsAfterRejection.total !== 2
    ) {
      return yield* Effect.fail(
        runtimeFailure(
          "runtime",
          "The bounded subscriptions ran outside initial plus accepted snapshots",
          {
            path: databasePath,
            operation: "subscription query count",
          },
        ),
      );
    }

    const preReopenSource = yield* provider
      .query({ accountId: plan.scenario.sourceAccountId })
      .pipe(
        Effect.mapError((error) =>
          runtimeFromProviderError(error, databasePath, "clean source query"),
        ),
      );
    const preReopenTarget = yield* provider
      .query({ accountId: plan.scenario.targetAccountId })
      .pipe(
        Effect.mapError((error) =>
          runtimeFromProviderError(error, databasePath, "clean target query"),
        ),
      );
    const preReopenTotal = yield* provider
      .total({})
      .pipe(
        Effect.mapError((error) =>
          runtimeFromProviderError(error, databasePath, "clean total query"),
        ),
      );

    return {
      initialAccountSnapshots: [initialSource, initialTarget],
      initialTotalSnapshot: initialTotal,
      committedAccountSnapshots: [committedSource, committedTarget],
      committedTotalSnapshot: committedTotal,
      rejectionIdentity: rejection.value.failureId,
      queryRunsAfterRejection,
      preReopenCleanAccounts: [preReopenSource, preReopenTarget],
      preReopenCleanTotal: preReopenTotal,
    };
  });

const runReopenedScope = (
  plan: M027TransferPlan,
  databasePath: string,
): Effect.Effect<
  Pick<M027DatabaseJourney, "reopenedAccounts" | "reopenedTotal">,
  M027RuntimeFailure,
  M027DatabaseProvider
> =>
  Effect.gen(function* () {
    const provider = yield* M027DatabaseProvider;
    const source = yield* provider
      .query({ accountId: plan.scenario.sourceAccountId })
      .pipe(
        Effect.mapError((error) =>
          runtimeFromProviderError(error, databasePath, "reopened source query"),
        ),
      );
    const target = yield* provider
      .query({ accountId: plan.scenario.targetAccountId })
      .pipe(
        Effect.mapError((error) =>
          runtimeFromProviderError(error, databasePath, "reopened target query"),
        ),
      );
    const total = yield* provider
      .total({})
      .pipe(
        Effect.mapError((error) =>
          runtimeFromProviderError(error, databasePath, "reopened total query"),
        ),
      );
    return { reopenedAccounts: [source, target], reopenedTotal: total };
  });

/** Run the bounded persistent reactive two-account transfer journey. */
export const runM027TransferJourney = Effect.fn("runM027TransferJourney")(function* (
  plan: M027TransferPlan,
  databasePath: string,
  handler: M027TransferHandler = defaultM027TransferHandler,
): Effect.fn.Return<M027DatabaseJourney, M027RuntimeFailure> {
  if (plan.target.database !== "sqlite" || plan.target.api !== "effect-typescript") {
    return yield* Effect.fail(
      runtimeFailure("runtime", "The M027 runtime supports only SQLite and Effect TypeScript", {
        path: databasePath,
        operation: "runtime target",
      }),
    );
  }
  if (plan.scenario.sourceAccountId === plan.scenario.targetAccountId) {
    return yield* Effect.fail(
      runtimeFailure("invariant", "The transfer scenario requires distinct account identities", {
        path: databasePath,
        operation: "runtime scenario",
      }),
    );
  }
  const reactivityLayer = Reactivity.layer;
  const sqliteLayer = SqliteClient.layer({ filename: databasePath }).pipe(
    Layer.provide(reactivityLayer),
  );
  const baseLayer = Layer.mergeAll(reactivityLayer, sqliteLayer);
  const providerLayer = M027DatabaseProvider.layer(plan, databasePath, handler).pipe(
    Layer.provide(baseLayer),
  );
  const runScoped = <A, E>(
    program: Effect.Effect<A, E, M027DatabaseProvider | Scope.Scope>,
  ): Effect.Effect<A, E | M027RuntimeFailure> =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(providerLayer);
        return yield* program.pipe(
          Effect.provide(context),
          Effect.provideService(SqlClient.SafeIntegers, true),
        );
      }),
    );

  const first = yield* runScoped(runFirstScope(plan, databasePath)).pipe(
    Effect.catchDefect((defect) =>
      Effect.fail(
        runtimeFailure("runtime", `The first SQLite scope defected: ${String(defect)}`, {
          path: databasePath,
          operation: "first scope",
        }),
      ),
    ),
  );
  const reopened = yield* runScoped(runReopenedScope(plan, databasePath)).pipe(
    Effect.catchDefect((defect) =>
      Effect.fail(
        runtimeFailure("runtime", `The reopened SQLite scope defected: ${String(defect)}`, {
          path: databasePath,
          operation: "reopened scope",
        }),
      ),
    ),
  );
  if (
    !summariesEqual(first.committedAccountSnapshots[0], first.preReopenCleanAccounts[0]) ||
    !summariesEqual(first.committedAccountSnapshots[1], first.preReopenCleanAccounts[1]) ||
    !totalsEqual(first.committedTotalSnapshot, first.preReopenCleanTotal)
  ) {
    return yield* Effect.fail(
      runtimeFailure("parity", "The accepted reactive observations differ from clean queries", {
        path: databasePath,
        operation: "pre-reopen parity",
      }),
    );
  }
  if (
    !summariesEqual(first.preReopenCleanAccounts[0], reopened.reopenedAccounts[0]) ||
    !summariesEqual(first.preReopenCleanAccounts[1], reopened.reopenedAccounts[1]) ||
    !totalsEqual(first.preReopenCleanTotal, reopened.reopenedTotal)
  ) {
    return yield* Effect.fail(
      runtimeFailure("parity", "The clean queries differ from reopened SQLite queries", {
        path: databasePath,
        operation: "reopen parity",
      }),
    );
  }
  return {
    initialAccountSnapshots: first.initialAccountSnapshots,
    initialTotalSnapshot: first.initialTotalSnapshot,
    committedAccountSnapshots: first.committedAccountSnapshots,
    committedTotalSnapshot: first.committedTotalSnapshot,
    emittedAccountSnapshots: [
      first.initialAccountSnapshots[0],
      first.initialAccountSnapshots[1],
      first.committedAccountSnapshots[0],
      first.committedAccountSnapshots[1],
    ],
    emittedTotalSnapshots: [first.initialTotalSnapshot, first.committedTotalSnapshot],
    rejectionIdentity: first.rejectionIdentity,
    queryRunsAfterRejection: first.queryRunsAfterRejection,
    preReopenCleanAccounts: first.preReopenCleanAccounts,
    preReopenCleanTotal: first.preReopenCleanTotal,
    reopenedAccounts: reopened.reopenedAccounts,
    reopenedTotal: reopened.reopenedTotal,
  };
});
