import type { Fragment } from "effect/unstable/sql/Statement";
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

import {
  renderM026Sql,
  violatesM026StatePredicates,
  type M026DataServicePlan,
} from "./semantic-database-target.ts";

const parseOptions = { onExcessProperty: "error" } as const;
const accountReactivityKey = (plan: M026DataServicePlan, accountId: string): string =>
  `m026-account:${plan.serviceId}:${accountId}`;

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

const remainingUsesSchema = Schema.Union([Schema.Literal(0n), Schema.Literal(1n)]);

/** The public observation exposed by the M026 query and subscription. */
export interface M026AccountSummary {
  readonly accountId: string;
  readonly revision: bigint;
  readonly balance: bigint;
  readonly withdrawalAvailable: boolean;
}

export const M026AccountSummarySchema = strict({
  accountId: Schema.String,
  revision: nonNegativeBigInt,
  balance: nonNegativeBigInt,
  withdrawalAvailable: Schema.Boolean,
});

export type M026RuntimeFailureReason =
  | "sql"
  | "schema"
  | "corruption"
  | "handler"
  | "invariant"
  | "concurrency"
  | "runtime"
  | "parity";

/** A typed failure from SQLite, row decoding, the independent handler, or the journey. */
export class M026RuntimeFailure extends Schema.TaggedError<M026RuntimeFailure>()(
  "M026RuntimeFailure",
  {
    stage: Schema.Literal("runtime"),
    path: Schema.String,
    reason: Schema.Literals([
      "sql",
      "schema",
      "corruption",
      "handler",
      "invariant",
      "concurrency",
      "runtime",
      "parity",
    ]),
    message: Schema.String,
    identity: Schema.optional(Schema.String),
    operation: Schema.optional(Schema.String),
  },
) {}

/** The expected disabled command result. It is deliberately not a runtime failure. */
export class M026DisabledRejection extends Schema.TaggedError<M026DisabledRejection>()(
  "M026DisabledRejection",
  {
    identity: Schema.String,
    accountId: Schema.String,
    amount: Schema.BigInt,
    revision: Schema.BigInt,
  },
) {}

/** Typed generated-boundary failures exposed by the runtime provider. */
export class M026DataServiceMissingError extends Schema.TaggedError<M026DataServiceMissingError>()(
  "M026DataServiceMissingError",
  { accountId: Schema.String },
) {}

export class M026DataServiceDuplicateError extends Schema.TaggedError<M026DataServiceDuplicateError>()(
  "M026DataServiceDuplicateError",
  { accountId: Schema.String },
) {}

export class M026DataServiceDisabledError extends Schema.TaggedError<M026DataServiceDisabledError>()(
  "M026DataServiceDisabledError",
  {
    accountId: Schema.String,
    failureId: Schema.String,
  },
) {}

export class M026DataServiceUnavailableError extends Schema.TaggedError<M026DataServiceUnavailableError>()(
  "M026DataServiceUnavailableError",
  { message: Schema.String },
) {}

export interface M026DatabaseProviderShape {
  readonly create: (input: {
    readonly accountId: string;
    readonly initialBalance: bigint;
  }) => Effect.Effect<
    M026AccountSummary,
    M026DataServiceDuplicateError | M026DataServiceUnavailableError
  >;
  readonly query: (input: {
    readonly accountId: string;
  }) => Effect.Effect<
    M026AccountSummary,
    M026DataServiceMissingError | M026DataServiceUnavailableError
  >;
  readonly dispatch: (command: {
    readonly _tag: string;
    readonly accountId: string;
    readonly amount: bigint;
  }) => Effect.Effect<
    M026AccountSummary,
    M026DataServiceMissingError | M026DataServiceDisabledError | M026DataServiceUnavailableError
  >;
  readonly subscribe: (input: {
    readonly accountId: string;
  }) => Stream.Stream<
    M026AccountSummary,
    M026DataServiceMissingError | M026DataServiceUnavailableError
  >;
  readonly subscriptionQueryRuns: Effect.Effect<number, M026DataServiceUnavailableError>;
}

export class M026DatabaseProvider extends Context.Service<
  M026DatabaseProvider,
  M026DatabaseProviderShape
>()("@bang/bang/M026DatabaseProvider") {
  static layer(
    plan: M026DataServicePlan,
    databasePath: string,
    handler: M026WithdrawHandler,
  ): Layer.Layer<
    M026DatabaseProvider,
    M026RuntimeFailure,
    SqlClient.SqlClient | Reactivity.Reactivity
  > {
    return makeM026DatabaseProviderLayer(plan, databasePath, handler);
  }
}

export type M026WithdrawState = Readonly<Record<string, bigint>>;

export interface M026WithdrawInput {
  readonly amount: bigint;
}

/** A handler may return the next state directly or in a named `state` field. */
export type M026WithdrawResult =
  | M026WithdrawState
  | {
      readonly state: M026WithdrawState;
    };
/** Independent business arithmetic. The handler cannot access SQL or the grant. */
export type M026WithdrawHandler = (
  state: M026WithdrawState,
  input: M026WithdrawInput,
) => Effect.Effect<M026WithdrawResult, M026RuntimeFailure> | M026WithdrawResult;

export interface M026DatabaseJourney {
  readonly initialSnapshot: M026AccountSummary;
  readonly committedSnapshot: M026AccountSummary;
  readonly emittedSnapshots: readonly [M026AccountSummary, M026AccountSummary];
  readonly rejectionIdentity: string;
  readonly queryRunsAfterRejection: number;
  readonly preReopenCleanQuery: M026AccountSummary;
  readonly reopenedQuery: M026AccountSummary;
}

interface DecodedAccountRow {
  readonly accountId: string;
  readonly revision: bigint;
  readonly remainingUses: bigint;
  readonly state: M026WithdrawState;
}

type RuntimeFailureFields = Readonly<{
  readonly path?: string;
  readonly identity?: string;
  readonly operation?: string;
}>;

const runtimeFailure = (
  reason: M026RuntimeFailureReason,
  message: string,
  fields: RuntimeFailureFields = {},
): M026RuntimeFailure =>
  new M026RuntimeFailure({
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
): M026RuntimeFailure =>
  runtimeFailure("schema", `Strict ${operation} row decoding failed: ${String(issue)}`, {
    path: databasePath,
    operation,
  });

const sqlFailure = (
  operation: string,
  databasePath: string,
  error: SqlError.SqlError,
): M026RuntimeFailure =>
  runtimeFailure("sql", `SQLite ${operation} failed: ${error.message}`, {
    path: databasePath,
    operation,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const planFailure = (databasePath: string, message: string): M026RuntimeFailure =>
  runtimeFailure("runtime", message, { path: databasePath });

const validatePlan = (
  plan: M026DataServicePlan,
  databasePath: string,
): M026RuntimeFailure | undefined => {
  if (plan.stateColumns.length === 0) {
    return planFailure(databasePath, "The selected query has no state columns");
  }
  if (plan.command.exactUses !== 1n) {
    return planFailure(databasePath, "The runtime requires one exact capability use");
  }
  if (plan.scenario.initialBalance < 0n || plan.scenario.withdrawAmount < 0n) {
    return planFailure(databasePath, "The runtime scenario contains a negative integer");
  }
  const fields = new Set<string>();
  const columns = new Set<string>();
  for (const stateColumn of plan.stateColumns) {
    if (fields.has(stateColumn.id)) {
      return planFailure(databasePath, `Duplicate selected state field ${stateColumn.id}`);
    }
    if (columns.has(stateColumn.column)) {
      return planFailure(databasePath, `Duplicate generated SQL column ${stateColumn.column}`);
    }
    fields.add(stateColumn.id);
    columns.add(stateColumn.column);
  }
  if (!plan.stateColumns.some(({ column }) => column === plan.balanceColumn)) {
    return planFailure(databasePath, "The selected state fields do not contain balance");
  }
  return undefined;
};

const makeRowSchema = (plan: M026DataServicePlan) => {
  const fields: Record<string, Schema.Codec<unknown, unknown, never, never>> = {
    accountId: Schema.String,
    revision: nonNegativeBigInt,
    remainingUses: remainingUsesSchema,
  };
  for (const stateColumn of plan.stateColumns) {
    fields[stateColumn.id] = canonicalNonNegativeInteger;
  }
  return strict(fields);
};

const makeHandlerStateSchema = (plan: M026DataServicePlan) => {
  const fields: Record<string, Schema.Codec<unknown, unknown, never, never>> = {};
  for (const stateColumn of plan.stateColumns) {
    fields[stateColumn.id] = Schema.BigInt;
  }
  return strict(fields);
};

const makeSelectFragments = (sql: SqlClient.SqlClient, plan: M026DataServicePlan) => [
  sql`${sql(plan.identityColumn)} AS "accountId"`,
  ...plan.stateColumns.map(({ id, column }) => sql`${sql(column)} AS ${sql(id)}`),
  sql`${sql(plan.revisionColumn)} AS "revision"`,
  sql`${sql(plan.remainingUsesColumn)} AS "remainingUses"`,
];

const initializeSchema = Effect.fn("M026.initializeSchema")(function* (
  sql: SqlClient.SqlClient,
  plan: M026DataServicePlan,
  databasePath: string,
): Effect.fn.Return<void, M026RuntimeFailure> {
  yield* sql
    .unsafe(renderM026Sql(plan))
    .raw.pipe(Effect.mapError((error) => sqlFailure("schema initialization", databasePath, error)));
});

const insertAccount = Effect.fn("M026.insertAccount")(function* (
  sql: SqlClient.SqlClient,
  plan: M026DataServicePlan,
  accountId: string,
  initialBalance: bigint,
  databasePath: string,
): Effect.fn.Return<void, M026RuntimeFailure> {
  if (initialBalance < 0n) {
    return yield* Effect.fail(
      runtimeFailure("invariant", "The initial balance must be nonnegative", {
        path: databasePath,
        identity: accountId,
        operation: "account creation",
      }),
    );
  }
  const table = sql(plan.tableName);
  const insertColumns = [
    sql`${sql(plan.identityColumn)}`,
    ...plan.stateColumns.map(({ column }) => sql`${sql(column)}`),
    sql`${sql(plan.revisionColumn)}`,
    sql`${sql(plan.remainingUsesColumn)}`,
  ];
  const insertValues = [
    accountId,
    ...plan.stateColumns.map(({ column }) =>
      (column === plan.balanceColumn ? initialBalance : 0n).toString(),
    ),
    0n,
    1n,
  ];
  const valueFragments = insertValues.map((value) => sql`${value}`);
  yield* sql`INSERT INTO ${table} (
    ${sql.join(",", false)(insertColumns)}
  ) VALUES (
    ${sql.join(",", false)(valueFragments)}
  )`.raw.pipe(Effect.mapError((error) => sqlFailure("account creation", databasePath, error)));
});

const decodeAccountRow = Effect.fn("M026.decodeAccountRow")(function* (
  rows: unknown,
  plan: M026DataServicePlan,
  databasePath: string,
): Effect.fn.Return<DecodedAccountRow, M026RuntimeFailure> {
  const rowSchema = makeRowSchema(plan);
  const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(rowSchema))(
    rows,
    parseOptions,
  ).pipe(Effect.mapError((issue) => schemaFailure("account", databasePath, issue)));
  if (decoded.length !== 1) {
    return yield* Effect.fail(
      runtimeFailure("corruption", `Expected exactly one account row, received ${decoded.length}`, {
        path: databasePath,
        identity: plan.scenario.accountId,
        operation: "account query",
      }),
    );
  }
  const row = decoded[0];
  if (row === undefined) {
    return yield* Effect.fail(
      runtimeFailure("corruption", "The decoded account row disappeared", {
        path: databasePath,
        identity: plan.scenario.accountId,
        operation: "account query",
      }),
    );
  }
  const state: Record<string, bigint> = {};
  for (const stateColumn of plan.stateColumns) {
    const value = row[stateColumn.id];
    if (typeof value !== "bigint") {
      return yield* Effect.fail(
        runtimeFailure("corruption", `Decoded state field ${stateColumn.id} is not a bigint`, {
          path: databasePath,
          identity: plan.scenario.accountId,
          operation: "account query",
        }),
      );
    }
    state[stateColumn.id] = value;
  }
  if (
    typeof row.accountId !== "string" ||
    typeof row.revision !== "bigint" ||
    typeof row.remainingUses !== "bigint"
  ) {
    return yield* Effect.fail(
      runtimeFailure("corruption", "The decoded account identity or revision has the wrong type", {
        path: databasePath,
        identity: plan.scenario.accountId,
        operation: "account query",
      }),
    );
  }
  return {
    accountId: row.accountId,
    revision: row.revision,
    remainingUses: row.remainingUses,
    state,
  };
});

const readAccountRow = Effect.fn("M026.readAccountRow")(function* (
  sql: SqlClient.SqlClient,
  plan: M026DataServicePlan,
  accountId: string,
  databasePath: string,
): Effect.fn.Return<DecodedAccountRow, M026RuntimeFailure> {
  const rows = yield* sql<Record<string, unknown>>`
    SELECT ${sql.join(",", false)(makeSelectFragments(sql, plan))}
    FROM ${sql(plan.tableName)}
    WHERE ${sql(plan.identityColumn)} = ${accountId}
  `.pipe(Effect.mapError((error) => sqlFailure("account query", databasePath, error)));
  return yield* decodeAccountRow(rows, plan, databasePath);
});
const readAccountRowMaybe = Effect.fn("M026.readAccountRowMaybe")(function* (
  sql: SqlClient.SqlClient,
  plan: M026DataServicePlan,
  accountId: string,
  databasePath: string,
): Effect.fn.Return<Option.Option<DecodedAccountRow>, M026RuntimeFailure> {
  const rows = yield* sql<Record<string, unknown>>`
    SELECT ${sql.join(",", false)(makeSelectFragments(sql, plan))}
    FROM ${sql(plan.tableName)}
    WHERE ${sql(plan.identityColumn)} = ${accountId}
  `.pipe(Effect.mapError((error) => sqlFailure("account query", databasePath, error)));
  const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(makeRowSchema(plan)))(
    rows,
    parseOptions,
  ).pipe(Effect.mapError((issue) => schemaFailure("account", databasePath, issue)));
  if (decoded.length === 0) {
    return Option.none();
  }
  if (decoded.length !== 1) {
    return yield* Effect.fail(
      runtimeFailure("corruption", `Expected at most one account row, received ${decoded.length}`, {
        path: databasePath,
        identity: accountId,
        operation: "account query",
      }),
    );
  }
  return Option.some(yield* decodeAccountRow(rows, plan, databasePath));
});

const summaryFromRow = Effect.fn("M026.summaryFromRow")(function* (
  row: DecodedAccountRow,
  plan: M026DataServicePlan,
  databasePath: string,
): Effect.fn.Return<M026AccountSummary, M026RuntimeFailure> {
  const balanceField = plan.stateColumns.find(({ column }) => column === plan.balanceColumn);
  if (balanceField === undefined) {
    return yield* Effect.fail(
      planFailure(databasePath, "The selected state fields do not contain balance"),
    );
  }
  const balance = row.state[balanceField.id];
  if (balance === undefined) {
    return yield* Effect.fail(
      runtimeFailure("corruption", "The decoded balance field is missing", {
        path: databasePath,
        identity: row.accountId,
        operation: "summary decoding",
      }),
    );
  }
  return yield* Schema.decodeUnknownEffect(M026AccountSummarySchema)(
    {
      accountId: row.accountId,
      revision: row.revision,
      balance,
      withdrawalAvailable: row.remainingUses === 1n,
    },
    parseOptions,
  ).pipe(Effect.mapError((issue) => schemaFailure("summary", databasePath, issue)));
});

const summariesEqual = (left: M026AccountSummary, right: M026AccountSummary): boolean =>
  left.accountId === right.accountId &&
  left.revision === right.revision &&
  left.balance === right.balance &&
  left.withdrawalAvailable === right.withdrawalAvailable;

const decodeNextState = Effect.fn("M026.decodeNextState")(function* (
  value: M026WithdrawResult,
  plan: M026DataServicePlan,
  databasePath: string,
): Effect.fn.Return<M026WithdrawState, M026RuntimeFailure> {
  const candidate: unknown =
    !plan.stateColumns.some(({ id }) => id === "state") &&
    isRecord(value) &&
    Object.hasOwn(value, "state")
      ? value.state
      : value;
  const decoded = yield* Schema.decodeUnknownEffect(makeHandlerStateSchema(plan))(
    candidate,
    parseOptions,
  ).pipe(Effect.mapError((issue) => schemaFailure("handler result", databasePath, issue)));
  const state: Record<string, bigint> = {};
  for (const stateColumn of plan.stateColumns) {
    const next = decoded[stateColumn.id];
    if (typeof next !== "bigint") {
      return yield* Effect.fail(
        runtimeFailure("handler", `Handler result omitted ${stateColumn.id}`, {
          path: databasePath,
          operation: "handler result",
        }),
      );
    }
    state[stateColumn.id] = next;
  }
  const balance =
    state[plan.stateColumns.find(({ column }) => column === plan.balanceColumn)?.id ?? ""];
  if (balance === undefined || balance < 0n) {
    return yield* Effect.fail(
      runtimeFailure("invariant", "The independent handler returned a negative balance", {
        path: databasePath,
        operation: "handler result",
      }),
    );
  }
  return state;
});

const updateAccount = Effect.fn("M026.updateAccount")(function* (
  sql: SqlClient.SqlClient,
  plan: M026DataServicePlan,
  row: DecodedAccountRow,
  nextState: M026WithdrawState,
  databasePath: string,
): Effect.fn.Return<void, M026RuntimeFailure> {
  const assignments: Array<Fragment> = [];
  for (const { id, column } of plan.stateColumns) {
    const value = nextState[id];
    if (value === undefined) {
      return yield* Effect.fail(
        runtimeFailure("handler", `Handler result omitted ${id}`, {
          path: databasePath,
          operation: "handler result",
        }),
      );
    }
    assignments.push(sql`${sql(column)} = ${value.toString()}`);
  }
  const updatedRows = yield* sql<Record<string, unknown>>`
    UPDATE ${sql(plan.tableName)}
    SET ${sql.join(
      ",",
      false,
    )([
      ...assignments,
      sql`${sql(plan.revisionColumn)} = ${sql(plan.revisionColumn)} + 1`,
      sql`${sql(plan.remainingUsesColumn)} = 0`,
    ])}
    WHERE ${sql(plan.identityColumn)} = ${row.accountId}
      AND ${sql(plan.revisionColumn)} = ${row.revision}
      AND ${sql(plan.remainingUsesColumn)} = 1
    RETURNING ${sql(plan.revisionColumn)} AS "revision"
  `.pipe(Effect.mapError((error) => sqlFailure("conditional account update", databasePath, error)));
  const updateSchema = strict({ revision: Schema.BigInt });
  const decodedRows = yield* Schema.decodeUnknownEffect(Schema.Array(updateSchema))(
    updatedRows,
    parseOptions,
  ).pipe(Effect.mapError((issue) => schemaFailure("conditional update", databasePath, issue)));
  if (decodedRows.length !== 1) {
    return yield* Effect.fail(
      runtimeFailure(
        "concurrency",
        "The conditional revision and remaining-use update affected no account row",
        { path: databasePath, identity: row.accountId, operation: "conditional account update" },
      ),
    );
  }
});

const dispatch = Effect.fn("M026.dispatch")(function* (
  sql: SqlClient.SqlClient,
  plan: M026DataServicePlan,
  accountId: string,
  amount: bigint,
  handler: M026WithdrawHandler,
  databasePath: string,
): Effect.fn.Return<void, M026RuntimeFailure | M026DisabledRejection, Reactivity.Reactivity> {
  const write = Effect.gen(function* () {
    const row = yield* readAccountRow(sql, plan, accountId, databasePath);
    if (row.remainingUses === 0n) {
      return yield* Effect.fail(
        new M026DisabledRejection({
          identity: plan.command.disabledFailureId,
          accountId,
          amount,
          revision: row.revision,
        }),
      );
    }
    if (
      violatesM026StatePredicates(
        plan.command.requires,
        new Map(Object.entries(row.state)),
        new Map([["amount", amount]]),
      )
    ) {
      return yield* Effect.fail(
        runtimeFailure(
          "invariant",
          "Command input does not satisfy checked transition requirements",
          {
            path: databasePath,
            identity: accountId,
            operation: plan.command.operationId,
          },
        ),
      );
    }
    const suppliedResult = yield* Effect.try({
      try: () => handler(row.state, { amount }),
      catch: (defect) =>
        runtimeFailure("handler", `The independent handler threw: ${String(defect)}`, {
          path: databasePath,
          operation: "handler",
        }),
    });
    const handlerEffect = Effect.isEffect(suppliedResult)
      ? suppliedResult
      : Effect.succeed(suppliedResult);
    const nextResult = yield* handlerEffect.pipe(
      Effect.catchDefect((defect) =>
        Effect.fail(
          runtimeFailure("handler", `The independent handler defected: ${String(defect)}`, {
            path: databasePath,
            operation: "handler",
          }),
        ),
      ),
      Effect.mapError((error) =>
        error instanceof M026RuntimeFailure
          ? error
          : runtimeFailure("handler", `The independent handler failed: ${String(error)}`, {
              path: databasePath,
              operation: "handler",
            }),
      ),
    );
    const nextState = yield* decodeNextState(nextResult, plan, databasePath);
    yield* updateAccount(sql, plan, row, nextState, databasePath);
  });

  return yield* Reactivity.mutation([accountReactivityKey(plan, accountId)])(
    sql.withTransaction(write),
  ).pipe(
    Effect.mapError((error) => {
      if (error instanceof M026RuntimeFailure || error instanceof M026DisabledRejection) {
        return error;
      }
      if (SqlError.isSqlError(error)) {
        return sqlFailure("withdrawal transaction", databasePath, error);
      }
      return runtimeFailure("runtime", `Withdrawal transaction failed: ${String(error)}`, {
        path: databasePath,
        operation: "withdrawal transaction",
      });
    }),
  );
});
const providerUnavailable = (error: unknown): M026DataServiceUnavailableError =>
  new M026DataServiceUnavailableError({
    message: error instanceof Error ? error.message : String(error),
  });

const makeM026DatabaseProviderLayer = (
  plan: M026DataServicePlan,
  databasePath: string,
  handler: M026WithdrawHandler,
): Layer.Layer<
  M026DatabaseProvider,
  M026RuntimeFailure,
  SqlClient.SqlClient | Reactivity.Reactivity
> =>
  Layer.effect(
    M026DatabaseProvider,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const reactivity = yield* Reactivity.Reactivity;
      yield* initializeSchema(sql, plan, databasePath);
      const subscriptionQueryRuns = yield* Ref.make(0);

      const query = (input: {
        readonly accountId: string;
      }): Effect.Effect<
        M026AccountSummary,
        M026DataServiceMissingError | M026DataServiceUnavailableError
      > =>
        Effect.gen(function* () {
          const maybeRow = yield* readAccountRowMaybe(
            sql,
            plan,
            input.accountId,
            databasePath,
          ).pipe(Effect.mapError(providerUnavailable));
          if (Option.isNone(maybeRow)) {
            return yield* Effect.fail(
              new M026DataServiceMissingError({ accountId: input.accountId }),
            );
          }
          return yield* summaryFromRow(maybeRow.value, plan, databasePath).pipe(
            Effect.mapError(providerUnavailable),
          );
        });

      const create = (input: {
        readonly accountId: string;
        readonly initialBalance: bigint;
      }): Effect.Effect<
        M026AccountSummary,
        M026DataServiceDuplicateError | M026DataServiceUnavailableError
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
              new M026DataServiceDuplicateError({ accountId: input.accountId }),
            );
          }
          yield* insertAccount(sql, plan, input.accountId, input.initialBalance, databasePath).pipe(
            Effect.mapError(providerUnavailable),
          );
          const row = yield* readAccountRow(sql, plan, input.accountId, databasePath).pipe(
            Effect.mapError(providerUnavailable),
          );
          return yield* summaryFromRow(row, plan, databasePath).pipe(
            Effect.mapError(providerUnavailable),
          );
        });

      const dispatchProvider = (command: {
        readonly _tag: string;
        readonly accountId: string;
        readonly amount: bigint;
      }): Effect.Effect<
        M026AccountSummary,
        M026DataServiceMissingError | M026DataServiceDisabledError | M026DataServiceUnavailableError
      > =>
        Effect.gen(function* () {
          if (command._tag !== plan.command.id) {
            return yield* Effect.fail(
              providerUnavailable(`Unsupported command tag: ${command._tag}`),
            );
          }
          if (command.amount < 0n) {
            return yield* Effect.fail(
              providerUnavailable("The command amount must be nonnegative"),
            );
          }
          const existing = yield* readAccountRowMaybe(
            sql,
            plan,
            command.accountId,
            databasePath,
          ).pipe(Effect.mapError(providerUnavailable));
          if (Option.isNone(existing)) {
            return yield* Effect.fail(
              new M026DataServiceMissingError({ accountId: command.accountId }),
            );
          }
          yield* dispatch(sql, plan, command.accountId, command.amount, handler, databasePath).pipe(
            Effect.provideService(Reactivity.Reactivity, reactivity),
            Effect.mapError((error) => {
              if (error instanceof M026DisabledRejection) {
                return new M026DataServiceDisabledError({
                  accountId: command.accountId,
                  failureId: error.identity,
                });
              }
              return providerUnavailable(error);
            }),
          );
          const row = yield* readAccountRow(sql, plan, command.accountId, databasePath).pipe(
            Effect.mapError(providerUnavailable),
          );
          return yield* summaryFromRow(row, plan, databasePath).pipe(
            Effect.mapError(providerUnavailable),
          );
        });

      const subscribe = (input: {
        readonly accountId: string;
      }): Stream.Stream<
        M026AccountSummary,
        M026DataServiceMissingError | M026DataServiceUnavailableError
      > => {
        const queryEffect = Effect.gen(function* () {
          yield* Ref.update(subscriptionQueryRuns, (count) => count + 1);
          return yield* query(input);
        });
        return Stream.unwrap(
          sql
            .reactiveMailbox([accountReactivityKey(plan, input.accountId)], queryEffect)
            .pipe(Effect.map(Stream.fromQueue)),
        );
      };

      const subscriptionRuns = Ref.get(subscriptionQueryRuns).pipe(
        Effect.mapError(providerUnavailable),
      );

      return {
        create,
        query,
        dispatch: dispatchProvider,
        subscribe,
        subscriptionQueryRuns: subscriptionRuns,
      };
    }),
  );

interface FirstScopeResult {
  readonly initialSnapshot: M026AccountSummary;
  readonly committedSnapshot: M026AccountSummary;
  readonly preReopenCleanQuery: M026AccountSummary;
  readonly rejectionIdentity: string;
  readonly queryRunsAfterRejection: number;
}

const runtimeFromProviderError = (
  error: unknown,
  databasePath: string,
  operation: string,
): M026RuntimeFailure =>
  runtimeFailure("runtime", error instanceof Error ? error.message : String(error), {
    path: databasePath,
    operation,
  });

const runFirstScope = Effect.fn("M026.runFirstScope")(function* (
  plan: M026DataServicePlan,
  databasePath: string,
): Effect.fn.Return<FirstScopeResult, M026RuntimeFailure, M026DatabaseProvider | Scope.Scope> {
  const provider = yield* M026DatabaseProvider;
  yield* provider
    .create({
      accountId: plan.scenario.accountId,
      initialBalance: plan.scenario.initialBalance,
    })
    .pipe(
      Effect.mapError((error) => runtimeFromProviderError(error, databasePath, "account creation")),
    );

  const snapshots = yield* Queue.unbounded<M026AccountSummary | M026RuntimeFailure>();
  const stream = provider.subscribe({ accountId: plan.scenario.accountId });
  yield* Stream.runForEach(stream, (snapshot) =>
    Queue.offer(snapshots, snapshot).pipe(Effect.asVoid),
  ).pipe(
    Effect.catchEager((error) =>
      Queue.offer(snapshots, runtimeFromProviderError(error, databasePath, "subscription")).pipe(
        Effect.asVoid,
      ),
    ),
    Effect.forkScoped,
  );

  const takeSnapshot = Effect.fn("M026.takeSnapshot")(function* (): Effect.fn.Return<
    M026AccountSummary,
    M026RuntimeFailure
  > {
    const value = yield* Queue.take(snapshots).pipe(
      Effect.timeoutOrElse({
        duration: "5 seconds",
        orElse: () =>
          Effect.fail(
            runtimeFailure("runtime", "No subscription snapshot arrived before the deadline", {
              path: databasePath,
              identity: plan.scenario.accountId,
              operation: "subscription snapshot",
            }),
          ),
      }),
    );
    if (value instanceof M026RuntimeFailure) {
      return yield* Effect.fail(value);
    }
    return value;
  });

  const initialSnapshot = yield* takeSnapshot();
  yield* provider
    .dispatch({
      _tag: plan.command.id,
      accountId: plan.scenario.accountId,
      amount: plan.scenario.withdrawAmount,
    })
    .pipe(
      Effect.mapError((error) => runtimeFromProviderError(error, databasePath, "first withdrawal")),
    );
  const committedSnapshot = yield* takeSnapshot();

  const rejected = yield* Effect.exit(
    provider.dispatch({
      _tag: plan.command.id,
      accountId: plan.scenario.accountId,
      amount: plan.scenario.withdrawAmount,
    }),
  );
  let rejectionIdentity: string;
  if (rejected._tag === "Success") {
    return yield* Effect.fail(
      runtimeFailure("runtime", "The expected disabled withdrawal unexpectedly succeeded", {
        path: databasePath,
        identity: plan.scenario.accountId,
        operation: "second withdrawal",
      }),
    );
  }
  const rejection = Cause.findErrorOption(rejected.cause);
  if (Option.isSome(rejection) && rejection.value instanceof M026DataServiceDisabledError) {
    rejectionIdentity = rejection.value.failureId;
  } else {
    return yield* Effect.fail(
      runtimeFromProviderError(
        Option.isSome(rejection) ? rejection.value : "missing disabled failure",
        databasePath,
        "second withdrawal",
      ),
    );
  }

  const queryRunsAfterRejection = yield* provider.subscriptionQueryRuns.pipe(
    Effect.mapError((error) =>
      runtimeFromProviderError(error, databasePath, "subscription query count"),
    ),
  );
  if (queryRunsAfterRejection !== 2) {
    return yield* Effect.fail(
      runtimeFailure(
        "concurrency",
        `The subscription query ran ${queryRunsAfterRejection} times after the accepted command`,
        {
          path: databasePath,
          identity: plan.scenario.accountId,
          operation: "subscription query count",
        },
      ),
    );
  }
  const preReopenCleanQuery = yield* provider
    .query({
      accountId: plan.scenario.accountId,
    })
    .pipe(Effect.mapError((error) => runtimeFromProviderError(error, databasePath, "clean query")));
  return {
    initialSnapshot,
    committedSnapshot,
    preReopenCleanQuery,
    rejectionIdentity,
    queryRunsAfterRejection,
  };
});
const runReopenedScope = Effect.fn("M026.runReopenedScope")(function* (
  plan: M026DataServicePlan,
  databasePath: string,
): Effect.fn.Return<M026AccountSummary, M026RuntimeFailure, M026DatabaseProvider> {
  const provider = yield* M026DatabaseProvider;
  return yield* provider
    .query({
      accountId: plan.scenario.accountId,
    })
    .pipe(
      Effect.mapError((error) => runtimeFromProviderError(error, databasePath, "reopened query")),
    );
});

/** Run the bounded persistent reactive SQLite journey from a checked target plan. */
export const runM026DatabaseJourney = Effect.fn("runM026DatabaseJourney")(function* (
  plan: M026DataServicePlan,
  databasePath: string,
  handler: M026WithdrawHandler,
): Effect.fn.Return<M026DatabaseJourney, M026RuntimeFailure> {
  const invalidPlan = validatePlan(plan, databasePath);
  if (invalidPlan !== undefined) {
    return yield* Effect.fail(invalidPlan);
  }

  const reactivityLayer = Reactivity.layer;
  const sqliteLayer = SqliteClient.layer({ filename: databasePath }).pipe(
    Layer.provide(reactivityLayer),
  );
  const baseLayer = Layer.mergeAll(reactivityLayer, sqliteLayer);
  const providerLayer = M026DatabaseProvider.layer(plan, databasePath, handler).pipe(
    Layer.provide(baseLayer),
  );
  const runScoped = <A, E>(
    program: Effect.Effect<A, E, M026DatabaseProvider | Scope.Scope>,
  ): Effect.Effect<A, E | M026RuntimeFailure> =>
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

  const reopenedQuery = yield* runScoped(runReopenedScope(plan, databasePath)).pipe(
    Effect.catchDefect((defect) =>
      Effect.fail(
        runtimeFailure("runtime", `The reopened SQLite scope defected: ${String(defect)}`, {
          path: databasePath,
          operation: "reopened scope",
        }),
      ),
    ),
  );

  if (!summariesEqual(first.committedSnapshot, first.preReopenCleanQuery)) {
    return yield* Effect.fail(
      runtimeFailure("parity", "The committed reactive observation differs from the clean query", {
        path: databasePath,
        identity: plan.scenario.accountId,
        operation: "pre-reopen parity",
      }),
    );
  }
  if (!summariesEqual(first.preReopenCleanQuery, reopenedQuery)) {
    return yield* Effect.fail(
      runtimeFailure("parity", "The clean query differs from the reopened query", {
        path: databasePath,
        identity: plan.scenario.accountId,
        operation: "reopen parity",
      }),
    );
  }

  return {
    initialSnapshot: first.initialSnapshot,
    committedSnapshot: first.committedSnapshot,
    emittedSnapshots: [first.initialSnapshot, first.committedSnapshot],
    rejectionIdentity: first.rejectionIdentity,
    queryRunsAfterRejection: first.queryRunsAfterRejection,
    preReopenCleanQuery: first.preReopenCleanQuery,
    reopenedQuery,
  };
});
