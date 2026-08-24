import { SqliteClient } from "@effect/sql-sqlite-bun";
import { Effect, Layer, Schema } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { SqlClient } from "effect/unstable/sql";
import * as SqlError from "effect/unstable/sql/SqlError";

import {
  M027DatabaseProvider,
  M027RuntimeFailure,
  type M027AccountSummary,
  type M027DatabaseJourney,
  type M027DatabaseProviderShape,
  type M027TotalFunds,
  type M027TransferHandler,
  defaultM027TransferHandler,
  runM027TransferJourney,
} from "./semantic-database-transfer-runtime.ts";
import type { M027TransferPlan } from "./semantic-database-transfer-target.ts";

const parseOptions = { onExcessProperty: "error" } as const;
const metadataTableName = "bang_semantic_service_version";

const strict = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Struct(fields).annotate({ parseOptions });

const positiveInteger = Schema.Int.pipe(
  Schema.check(
    Schema.makeFilter(
      (value: unknown): value is number =>
        typeof value === "number" && Number.isSafeInteger(value) && value >= 1,
      { expected: "a positive safe integer" },
    ),
  ),
);

const sha256 = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: unknown): value is string => /^[0-9a-f]{64}$/u.test(String(value)), {
      expected: "a lowercase SHA-256 digest",
    }),
  ),
);

/** The target-owned semantic-service version row. It carries no domain meaning. */
export const M028StoredSemanticVersionSchema = strict({
  serviceId: Schema.String.pipe(Schema.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9._-]*$/u))),
  semanticVersion: positiveInteger,
  artifactSha256: sha256,
  normalizedSha256: sha256,
});
export type M028StoredSemanticVersion = typeof M028StoredSemanticVersionSchema.Type;
const metadataRowSchema = strict({
  serviceId: Schema.String,
  semanticVersion: Schema.Union([Schema.BigInt, positiveInteger]),
  artifactSha256: Schema.String,
  normalizedSha256: Schema.String,
});

export type M028EvolutionRuntimeFailureReason =
  | "sql"
  | "missing-metadata"
  | "metadata-schema"
  | "service-id-mismatch"
  | "digest-mismatch"
  | "version-mismatch"
  | "observation-mismatch"
  | "cutover"
  | "invalid-transfer-amount"
  | "runtime"
  | "parity";

/** One typed failure boundary for target metadata and the M028 runtime journey. */
export class M028EvolutionRuntimeFailure extends Schema.TaggedError<M028EvolutionRuntimeFailure>()(
  "M028EvolutionRuntimeFailure",
  {
    stage: Schema.Literal("runtime"),
    reason: Schema.Literals([
      "sql",
      "missing-metadata",
      "metadata-schema",
      "service-id-mismatch",
      "digest-mismatch",
      "version-mismatch",
      "observation-mismatch",
      "cutover",
      "invalid-transfer-amount",
      "runtime",
      "parity",
    ]),
    path: Schema.String,
    message: Schema.String,
    identity: Schema.optional(Schema.String),
    operation: Schema.optional(Schema.String),
  },
) {}

const runtimeFailure = (
  reason: M028EvolutionRuntimeFailureReason,
  message: string,
  path: string,
  fields: { readonly identity?: string; readonly operation?: string } = {},
): M028EvolutionRuntimeFailure =>
  new M028EvolutionRuntimeFailure({ stage: "runtime", reason, path, message, ...fields });

const sqlFailure = (
  operation: string,
  databasePath: string,
  error: SqlError.SqlError,
): M028EvolutionRuntimeFailure =>
  runtimeFailure("sql", `SQLite ${operation} failed: ${error.message}`, databasePath, {
    operation,
  });

const unknownFailure = (
  operation: string,
  databasePath: string,
  error: unknown,
): M028EvolutionRuntimeFailure =>
  runtimeFailure(
    "runtime",
    `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
    databasePath,
    { operation },
  );

const metadataSchemaFailure = (
  operation: string,
  databasePath: string,
  issue: unknown,
): M028EvolutionRuntimeFailure =>
  runtimeFailure(
    "metadata-schema",
    `Strict ${operation} metadata decoding failed: ${String(issue)}`,
    databasePath,
    {
      operation,
    },
  );

const metadataTableSql = `CREATE TABLE IF NOT EXISTS "${metadataTableName}" (
  service_id TEXT PRIMARY KEY NOT NULL,
  semantic_version INTEGER NOT NULL CHECK (typeof(semantic_version) = 'integer' AND semantic_version >= 1),
  artifact_sha256 TEXT NOT NULL,
  normalized_sha256 TEXT NOT NULL
) STRICT;`;

const decodeStoredMetadata = (
  value: unknown,
  databasePath: string,
  operation: string,
): Effect.Effect<M028StoredSemanticVersion, M028EvolutionRuntimeFailure> =>
  Schema.decodeUnknownEffect(M028StoredSemanticVersionSchema)(value, parseOptions).pipe(
    Effect.mapError((issue) => metadataSchemaFailure(operation, databasePath, issue)),
  );

const decodeMetadataRows = (
  value: unknown,
  databasePath: string,
  operation: string,
): Effect.Effect<ReadonlyArray<M028StoredSemanticVersion>, M028EvolutionRuntimeFailure> =>
  Schema.decodeUnknownEffect(Schema.Array(metadataRowSchema))(value, parseOptions).pipe(
    Effect.mapError((issue) => metadataSchemaFailure(operation, databasePath, issue)),
    Effect.flatMap((rows) =>
      Effect.gen(function* () {
        const decoded: Array<M028StoredSemanticVersion> = [];
        for (const row of rows) {
          const version = Number(row.semanticVersion);
          if (!Number.isSafeInteger(version) || version < 1) {
            return yield* Effect.fail(
              metadataSchemaFailure(
                operation,
                databasePath,
                `semantic_version is not a positive safe integer: ${String(row.semanticVersion)}`,
              ),
            );
          }
          decoded.push(
            yield* decodeStoredMetadata(
              {
                serviceId: row.serviceId,
                semanticVersion: version,
                artifactSha256: row.artifactSha256,
                normalizedSha256: row.normalizedSha256,
              },
              databasePath,
              operation,
            ),
          );
        }
        return decoded;
      }),
    ),
  );

const isMissingMetadataTable = (error: SqlError.SqlError): boolean =>
  /no such table.*bang_semantic_service_version/iu.test(error.message);

const metadataQueryFailure = (
  operation: string,
  databasePath: string,
  error: SqlError.SqlError,
): M028EvolutionRuntimeFailure =>
  isMissingMetadataTable(error)
    ? runtimeFailure(
        "missing-metadata",
        "The semantic-service metadata table is missing",
        databasePath,
        {
          operation,
        },
      )
    : sqlFailure(operation, databasePath, error);

const validateInputMetadata = (
  metadata: M028StoredSemanticVersion,
  databasePath: string,
  operation: string,
): Effect.Effect<M028StoredSemanticVersion, M028EvolutionRuntimeFailure> =>
  decodeStoredMetadata(metadata, databasePath, operation);

const initializeMetadataWithSql = (
  sql: SqlClient.SqlClient,
  databasePath: string,
  metadata: M028StoredSemanticVersion,
): Effect.Effect<void, M028EvolutionRuntimeFailure> =>
  Effect.gen(function* () {
    const checked = yield* validateInputMetadata(metadata, databasePath, "version initialization");
    if (checked.semanticVersion !== 1) {
      return yield* Effect.fail(
        runtimeFailure(
          "version-mismatch",
          "Version metadata initialization requires semantic version 1",
          databasePath,
          { identity: checked.serviceId, operation: "version 1 metadata initialization" },
        ),
      );
    }
    yield* sql
      .unsafe(metadataTableSql)
      .raw.pipe(
        Effect.mapError((error) =>
          SqlError.isSqlError(error)
            ? sqlFailure("metadata table initialization", databasePath, error)
            : unknownFailure("metadata table initialization", databasePath, error),
        ),
      );
    yield* sql<Record<string, unknown>>`
      INSERT INTO ${sql(metadataTableName)} (
        service_id,
        semantic_version,
        artifact_sha256,
        normalized_sha256
      ) VALUES (
        ${checked.serviceId},
        ${checked.semanticVersion},
        ${checked.artifactSha256},
        ${checked.normalizedSha256}
      )
    `.raw.pipe(
      Effect.mapError((error) =>
        SqlError.isSqlError(error)
          ? sqlFailure("version 1 metadata insert", databasePath, error)
          : unknownFailure("version 1 metadata insert", databasePath, error),
      ),
    );
  }).pipe(
    Effect.catchDefect((defect) =>
      Effect.fail(unknownFailure("version 1 metadata initialization", databasePath, defect)),
    ),
  );

const readMetadataWithSql = (
  sql: SqlClient.SqlClient,
  databasePath: string,
  serviceId: string,
): Effect.Effect<M028StoredSemanticVersion, M028EvolutionRuntimeFailure> =>
  Effect.gen(function* () {
    const rows = yield* sql<Record<string, unknown>>`
      SELECT
        service_id AS "serviceId",
        semantic_version AS "semanticVersion",
        artifact_sha256 AS "artifactSha256",
        normalized_sha256 AS "normalizedSha256"
      FROM ${sql(metadataTableName)}
      ORDER BY service_id
    `.pipe(
      Effect.mapError((error) =>
        SqlError.isSqlError(error)
          ? metadataQueryFailure("metadata read", databasePath, error)
          : unknownFailure("metadata read", databasePath, error),
      ),
    );
    const decoded = yield* decodeMetadataRows(
      rows,
      databasePath,
      "stored semantic-service version",
    );
    if (decoded.length === 0) {
      return yield* Effect.fail(
        runtimeFailure(
          "missing-metadata",
          "No semantic-service metadata row exists",
          databasePath,
          {
            identity: serviceId,
            operation: "metadata read",
          },
        ),
      );
    }
    const matching = decoded.filter((row) => row.serviceId === serviceId);
    if (matching.length === 0) {
      return yield* Effect.fail(
        runtimeFailure(
          "service-id-mismatch",
          "Stored metadata does not contain the requested service identity",
          databasePath,
          {
            identity: serviceId,
            operation: "metadata read",
          },
        ),
      );
    }
    if (matching.length !== 1) {
      return yield* Effect.fail(
        runtimeFailure(
          "metadata-schema",
          "Stored metadata contains duplicate service rows",
          databasePath,
          {
            identity: serviceId,
            operation: "metadata read",
          },
        ),
      );
    }
    return matching[0]!;
  }).pipe(
    Effect.catchDefect((defect) =>
      Effect.fail(unknownFailure("stored semantic-service version read", databasePath, defect)),
    ),
  );

const sqliteLayerFor = (databasePath: string) => {
  const reactivityLayer = Reactivity.layer;
  const sqliteLayer = SqliteClient.layer({ filename: databasePath }).pipe(
    Layer.provide(reactivityLayer),
  );
  return Layer.mergeAll(reactivityLayer, sqliteLayer);
};

const runWithSqlite = <A>(
  databasePath: string,
  operation: Effect.Effect<A, M028EvolutionRuntimeFailure, SqlClient.SqlClient>,
): Effect.Effect<A, M028EvolutionRuntimeFailure> =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = yield* Layer.build(sqliteLayerFor(databasePath));
      return yield* operation.pipe(
        Effect.provide(context),
        Effect.provideService(SqlClient.SafeIntegers, true),
      );
    }),
  ).pipe(
    Effect.catchDefect((defect) =>
      Effect.fail(unknownFailure("SQLite scope", databasePath, defect)),
    ),
  );

/** Insert immutable version 1 target metadata after a successful M027 journey. */
export const initializeM028VersionMetadata = (
  databasePath: string,
  metadata: M028StoredSemanticVersion,
): Effect.Effect<void, M028EvolutionRuntimeFailure> =>
  runWithSqlite(
    databasePath,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql
        .withTransaction(initializeMetadataWithSql(sql, databasePath, metadata))
        .pipe(
          Effect.mapError((error) =>
            error instanceof M028EvolutionRuntimeFailure
              ? error
              : SqlError.isSqlError(error)
                ? sqlFailure("version 1 metadata transaction", databasePath, error)
                : unknownFailure("version 1 metadata transaction", databasePath, error),
          ),
        );
    }),
  ).pipe(
    Effect.catchDefect((defect) =>
      Effect.fail(unknownFailure("version 1 metadata transaction", databasePath, defect)),
    ),
  );

/** Read and strictly decode one target-owned semantic-service metadata row. */
export const readM028VersionMetadata = (
  databasePath: string,
  serviceId: string,
): Effect.Effect<M028StoredSemanticVersion, M028EvolutionRuntimeFailure> =>
  runWithSqlite(
    databasePath,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return yield* readMetadataWithSql(sql, databasePath, serviceId);
    }),
  );

const sameStoredMetadata = (
  left: M028StoredSemanticVersion,
  right: M028StoredSemanticVersion,
): boolean =>
  left.serviceId === right.serviceId &&
  left.semanticVersion === right.semanticVersion &&
  left.artifactSha256 === right.artifactSha256 &&
  left.normalizedSha256 === right.normalizedSha256;

const metadataMismatch = (
  expected: M028StoredSemanticVersion,
  actual: M028StoredSemanticVersion,
  databasePath: string,
): M028EvolutionRuntimeFailure => {
  if (actual.serviceId !== expected.serviceId) {
    return runtimeFailure(
      "service-id-mismatch",
      "Stored service identity does not match the expected service",
      databasePath,
      {
        identity: expected.serviceId,
        operation: "semantic-version cutover",
      },
    );
  }
  if (actual.semanticVersion !== expected.semanticVersion) {
    return runtimeFailure(
      "version-mismatch",
      `Stored semantic version ${actual.semanticVersion} does not match expected ${expected.semanticVersion}`,
      databasePath,
      { identity: expected.serviceId, operation: "semantic-version cutover" },
    );
  }
  if (
    actual.artifactSha256 !== expected.artifactSha256 ||
    actual.normalizedSha256 !== expected.normalizedSha256
  ) {
    return runtimeFailure(
      "digest-mismatch",
      "Stored semantic-service digest does not match the expected digest",
      databasePath,
      {
        identity: expected.serviceId,
        operation: "semantic-version cutover",
      },
    );
  }
  return runtimeFailure(
    "cutover",
    "Stored metadata did not match the expected cutover precondition",
    databasePath,
    {
      identity: expected.serviceId,
      operation: "semantic-version cutover",
    },
  );
};

const cutoverTransaction = (
  sql: SqlClient.SqlClient,
  databasePath: string,
  expected: M028StoredSemanticVersion,
  next: M028StoredSemanticVersion,
): Effect.Effect<
  { readonly before: M028StoredSemanticVersion; readonly after: M028StoredSemanticVersion },
  M028EvolutionRuntimeFailure
> =>
  Effect.gen(function* () {
    const checkedExpected = yield* validateInputMetadata(
      expected,
      databasePath,
      "cutover expected metadata",
    );
    const checkedNext = yield* validateInputMetadata(
      next,
      databasePath,
      "cutover candidate metadata",
    );
    if (checkedExpected.semanticVersion !== 1 || checkedNext.semanticVersion !== 2) {
      return yield* Effect.fail(
        runtimeFailure(
          "version-mismatch",
          "M028 cutover requires semantic version 1 to advance to version 2",
          databasePath,
          {
            identity: checkedExpected.serviceId,
            operation: "semantic-version cutover",
          },
        ),
      );
    }
    if (checkedExpected.serviceId !== checkedNext.serviceId) {
      return yield* Effect.fail(
        runtimeFailure(
          "service-id-mismatch",
          "The candidate metadata changes the selected service identity",
          databasePath,
          {
            identity: checkedExpected.serviceId,
            operation: "semantic-version cutover",
          },
        ),
      );
    }

    const current = yield* readMetadataWithSql(sql, databasePath, checkedExpected.serviceId);
    if (!sameStoredMetadata(current, checkedExpected)) {
      return yield* Effect.fail(metadataMismatch(checkedExpected, current, databasePath));
    }

    const updated = yield* sql<Record<string, unknown>>`
      UPDATE ${sql(metadataTableName)}
      SET
        semantic_version = ${checkedNext.semanticVersion},
        artifact_sha256 = ${checkedNext.artifactSha256},
        normalized_sha256 = ${checkedNext.normalizedSha256}
      WHERE service_id = ${checkedExpected.serviceId}
        AND semantic_version = ${checkedExpected.semanticVersion}
        AND artifact_sha256 = ${checkedExpected.artifactSha256}
        AND normalized_sha256 = ${checkedExpected.normalizedSha256}
      RETURNING
        service_id AS "serviceId",
        semantic_version AS "semanticVersion",
        artifact_sha256 AS "artifactSha256",
        normalized_sha256 AS "normalizedSha256"
    `.pipe(
      Effect.mapError((error) =>
        SqlError.isSqlError(error)
          ? sqlFailure("semantic-version cutover", databasePath, error)
          : unknownFailure("semantic-version cutover", databasePath, error),
      ),
    );
    const decoded = yield* decodeMetadataRows(updated, databasePath, "semantic-version cutover");
    if (decoded.length !== 1) {
      return yield* Effect.fail(
        runtimeFailure("cutover", "The compare-and-update changed no metadata row", databasePath, {
          identity: checkedExpected.serviceId,
          operation: "semantic-version cutover",
        }),
      );
    }
    const after = decoded[0]!;
    if (!sameStoredMetadata(after, checkedNext)) {
      return yield* Effect.fail(
        runtimeFailure(
          "cutover",
          "The committed metadata does not equal the candidate version",
          databasePath,
          {
            identity: checkedExpected.serviceId,
            operation: "semantic-version cutover",
          },
        ),
      );
    }
    return { before: current, after };
  });

/** Compare and update only semantic-service metadata in one SQLite transaction. */
export const cutoverM028SemanticVersion = (
  sql: SqlClient.SqlClient,
  databasePath: string,
  expected: M028StoredSemanticVersion,
  next: M028StoredSemanticVersion,
): Effect.Effect<
  { readonly before: M028StoredSemanticVersion; readonly after: M028StoredSemanticVersion },
  M028EvolutionRuntimeFailure
> =>
  sql.withTransaction(cutoverTransaction(sql, databasePath, expected, next)).pipe(
    Effect.mapError((error) =>
      error instanceof M028EvolutionRuntimeFailure
        ? error
        : SqlError.isSqlError(error)
          ? sqlFailure("semantic-version cutover transaction", databasePath, error)
          : unknownFailure("semantic-version cutover transaction", databasePath, error),
    ),
    Effect.catchDefect((defect) =>
      Effect.fail(unknownFailure("semantic-version cutover transaction", databasePath, defect)),
    ),
  );

export interface M028TransferObservation {
  readonly source: M027AccountSummary;
  readonly target: M027AccountSummary;
  readonly total: M027TotalFunds;
}

/** Result of the compatible M028 same-file cutover and transfer journey. */
export interface M028CompatibleRuntimeJourney {
  readonly baselineJourney: M027DatabaseJourney;
  readonly versionBeforeCutover: M028StoredSemanticVersion;
  readonly versionAfterCutover: M028StoredSemanticVersion;
  readonly beforeCutover: M028TransferObservation;
  readonly afterCutover: M028TransferObservation;
  readonly afterTransfer: M028TransferObservation;
  readonly reopened: M028TransferObservation;
  readonly reopenedVersion: M028StoredSemanticVersion;
  readonly cleanParity: true;
}

interface M028CompatibleRuntimeInput {
  readonly baselinePlan: M027TransferPlan;
  readonly candidatePlan: M027TransferPlan;
  readonly databasePath: string;
  readonly baselineArtifactSha256: string;
  readonly baselineNormalizedSha256: string;
  readonly candidateArtifactSha256: string;
  readonly candidateNormalizedSha256: string;
  readonly postEvolutionTransferAmount: bigint;
  readonly handler?: M027TransferHandler;
}

const observationsEqual = (
  left: M028TransferObservation,
  right: M028TransferObservation,
): boolean =>
  left.source.accountId === right.source.accountId &&
  left.source.revision === right.source.revision &&
  left.source.balance === right.source.balance &&
  left.target.accountId === right.target.accountId &&
  left.target.revision === right.target.revision &&
  left.target.balance === right.target.balance &&
  left.total.revision === right.total.revision &&
  left.total.total === right.total.total;

const baselineObservation = (journey: M027DatabaseJourney): M028TransferObservation => ({
  source: journey.committedAccountSnapshots[0],
  target: journey.committedAccountSnapshots[1],
  total: journey.committedTotalSnapshot,
});

const assertExpectedBaseline = (
  journey: M027DatabaseJourney,
  databasePath: string,
): Effect.Effect<void, M028EvolutionRuntimeFailure> => {
  const committed = baselineObservation(journey);
  const reopened: M028TransferObservation = {
    source: journey.reopenedAccounts[0],
    target: journey.reopenedAccounts[1],
    total: journey.reopenedTotal,
  };
  if (
    committed.source.balance !== 6n ||
    committed.target.balance !== 6n ||
    committed.total.total !== 12n ||
    committed.source.revision !== 1n ||
    committed.target.revision !== 1n ||
    committed.total.revision !== 1n ||
    !observationsEqual(committed, reopened)
  ) {
    return Effect.fail(
      runtimeFailure(
        "observation-mismatch",
        "The baseline M027 journey did not commit and reopen at 6/6/12",
        databasePath,
        {
          operation: "baseline journey",
        },
      ),
    );
  }
  return Effect.void;
};

const plansShareRows = (baseline: M027TransferPlan, candidate: M027TransferPlan): boolean =>
  baseline.serviceId === candidate.serviceId &&
  baseline.tableName === candidate.tableName &&
  baseline.identityColumn === candidate.identityColumn &&
  baseline.balanceColumn === candidate.balanceColumn &&
  baseline.revisionColumn === candidate.revisionColumn &&
  baseline.scenario.sourceAccountId === candidate.scenario.sourceAccountId &&
  baseline.scenario.targetAccountId === candidate.scenario.targetAccountId;

const providerFailure = (
  error: unknown,
  databasePath: string,
  operation: string,
): M028EvolutionRuntimeFailure => {
  if (error instanceof M028EvolutionRuntimeFailure) return error;
  if (error instanceof M027RuntimeFailure) {
    const reason: M028EvolutionRuntimeFailureReason =
      error.reason === "sql" ? "sql" : error.reason === "parity" ? "parity" : "runtime";
    return runtimeFailure(reason, error.message, databasePath, {
      ...(error.identity === undefined ? {} : { identity: error.identity }),
      operation,
    });
  }
  return runtimeFailure(
    "runtime",
    `M027 provider ${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
    databasePath,
    { operation },
  );
};

const readProviderObservation = (
  provider: M027DatabaseProviderShape,
  plan: M027TransferPlan,
  databasePath: string,
  operation: string,
): Effect.Effect<M028TransferObservation, M028EvolutionRuntimeFailure> =>
  Effect.gen(function* () {
    const source = yield* provider
      .query({ accountId: plan.scenario.sourceAccountId })
      .pipe(
        Effect.mapError((error) =>
          providerFailure(error, databasePath, `${operation} source query`),
        ),
      );
    const target = yield* provider
      .query({ accountId: plan.scenario.targetAccountId })
      .pipe(
        Effect.mapError((error) =>
          providerFailure(error, databasePath, `${operation} target query`),
        ),
      );
    const total = yield* provider
      .total({})
      .pipe(
        Effect.mapError((error) =>
          providerFailure(error, databasePath, `${operation} total query`),
        ),
      );
    return { source, target, total };
  });

const runProviderScope = <A>(
  plan: M027TransferPlan,
  databasePath: string,
  handler: M027TransferHandler,
  operation: Effect.Effect<A, M028EvolutionRuntimeFailure, M027DatabaseProvider>,
): Effect.Effect<A, M028EvolutionRuntimeFailure> => {
  const providerLayer = M027DatabaseProvider.layer(plan, databasePath, handler).pipe(
    Layer.provide(sqliteLayerFor(databasePath)),
  );
  return Effect.scoped(
    Effect.gen(function* () {
      const context = yield* Layer.build(providerLayer).pipe(
        Effect.mapError((error) => providerFailure(error, databasePath, "scope initialization")),
      );
      return yield* operation.pipe(
        Effect.provide(context),
        Effect.provideService(SqlClient.SafeIntegers, true),
      );
    }),
  ).pipe(
    Effect.catchDefect((defect) =>
      Effect.fail(unknownFailure("M027 provider scope", databasePath, defect)),
    ),
  );
};

/** Read one persisted semantic version and its selected Account observations without mutation. */
export const observeM028StoredService = (
  plan: M027TransferPlan,
  databasePath: string,
): Effect.Effect<
  {
    readonly version: M028StoredSemanticVersion;
    readonly observation: M028TransferObservation;
  },
  M028EvolutionRuntimeFailure
> =>
  Effect.all({
    version: readM028VersionMetadata(databasePath, plan.serviceId),
    observation: runProviderScope(
      plan,
      databasePath,
      defaultM027TransferHandler,
      Effect.gen(function* () {
        const provider = yield* M027DatabaseProvider;
        return yield* readProviderObservation(provider, plan, databasePath, "stored service");
      }),
    ),
  });

const expectedAfterTransfer = (
  before: M028TransferObservation,
  amount: bigint,
): M028TransferObservation => ({
  source: {
    ...before.source,
    revision: before.source.revision + 1n,
    balance: before.source.balance - amount,
  },
  target: {
    ...before.target,
    revision: before.target.revision + 1n,
    balance: before.target.balance + amount,
  },
  total: {
    revision: before.total.revision + 1n,
    total: before.total.total,
  },
});

/** Run the compatible M028 same-file version cutover and post-evolution transfer. */
export const runM028CompatibleRuntimeJourney = (
  input: M028CompatibleRuntimeInput,
): Effect.Effect<M028CompatibleRuntimeJourney, M028EvolutionRuntimeFailure> =>
  Effect.gen(function* () {
    const {
      baselinePlan,
      candidatePlan,
      databasePath,
      baselineArtifactSha256,
      baselineNormalizedSha256,
      candidateArtifactSha256,
      candidateNormalizedSha256,
      postEvolutionTransferAmount,
      handler = defaultM027TransferHandler,
    } = input;
    if (postEvolutionTransferAmount <= 0n) {
      return yield* Effect.fail(
        runtimeFailure(
          "invalid-transfer-amount",
          "The post-evolution transfer amount must be positive",
          databasePath,
          { operation: "post-evolution transfer" },
        ),
      );
    }
    if (!plansShareRows(baselinePlan, candidatePlan)) {
      return yield* Effect.fail(
        runtimeFailure(
          "observation-mismatch",
          "The candidate plan does not address the baseline Account rows",
          databasePath,
          { identity: baselinePlan.serviceId, operation: "candidate plan" },
        ),
      );
    }

    const baselineJourney = yield* runM027TransferJourney(baselinePlan, databasePath, handler).pipe(
      Effect.mapError((error) => providerFailure(error, databasePath, "baseline journey")),
    );
    yield* assertExpectedBaseline(baselineJourney, databasePath);
    const beforeCutover = baselineObservation(baselineJourney);

    const versionOne: M028StoredSemanticVersion = {
      serviceId: baselinePlan.serviceId,
      semanticVersion: 1,
      artifactSha256: baselineArtifactSha256,
      normalizedSha256: baselineNormalizedSha256,
    };
    const versionTwo: M028StoredSemanticVersion = {
      serviceId: candidatePlan.serviceId,
      semanticVersion: 2,
      artifactSha256: candidateArtifactSha256,
      normalizedSha256: candidateNormalizedSha256,
    };
    yield* initializeM028VersionMetadata(databasePath, versionOne);
    const versionBeforeCutover = yield* readM028VersionMetadata(
      databasePath,
      baselinePlan.serviceId,
    );
    const versionAfterCutover = yield* runWithSqlite(
      databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const result = yield* cutoverM028SemanticVersion(
          sql,
          databasePath,
          versionBeforeCutover,
          versionTwo,
        );
        return result.after;
      }),
    );

    const candidate = yield* runProviderScope(
      candidatePlan,
      databasePath,
      handler,
      Effect.gen(function* () {
        const provider = yield* M027DatabaseProvider;
        const afterCutover = yield* readProviderObservation(
          provider,
          candidatePlan,
          databasePath,
          "after cutover",
        );
        if (!observationsEqual(beforeCutover, afterCutover)) {
          return yield* Effect.fail(
            runtimeFailure(
              "observation-mismatch",
              "The semantic-version cutover changed Account or TotalFunds observations",
              databasePath,
              { identity: candidatePlan.serviceId, operation: "after cutover observation" },
            ),
          );
        }
        yield* provider
          .transfer({
            _tag: candidatePlan.command.id,
            sourceAccountId: candidatePlan.scenario.sourceAccountId,
            targetAccountId: candidatePlan.scenario.targetAccountId,
            amount: postEvolutionTransferAmount,
          })
          .pipe(
            Effect.mapError((error) =>
              providerFailure(error, databasePath, "post-evolution transfer"),
            ),
          );
        const afterTransfer = yield* readProviderObservation(
          provider,
          candidatePlan,
          databasePath,
          "after transfer",
        );
        const expected = expectedAfterTransfer(afterCutover, postEvolutionTransferAmount);
        if (!observationsEqual(afterTransfer, expected)) {
          return yield* Effect.fail(
            runtimeFailure(
              "observation-mismatch",
              "The post-evolution transfer observations do not preserve total funds",
              databasePath,
              { identity: candidatePlan.serviceId, operation: "after transfer observation" },
            ),
          );
        }
        return { afterCutover, afterTransfer };
      }),
    );

    const reopened = yield* runProviderScope(
      candidatePlan,
      databasePath,
      handler,
      Effect.gen(function* () {
        const provider = yield* M027DatabaseProvider;
        return yield* readProviderObservation(provider, candidatePlan, databasePath, "reopened");
      }),
    );
    const reopenedVersion = yield* readM028VersionMetadata(databasePath, candidatePlan.serviceId);
    const cleanParity = observationsEqual(candidate.afterTransfer, reopened);
    if (!cleanParity || !sameStoredMetadata(reopenedVersion, versionAfterCutover)) {
      return yield* Effect.fail(
        runtimeFailure(
          "parity",
          "The reopened candidate state or semantic version differs from committed state",
          databasePath,
          { identity: candidatePlan.serviceId, operation: "reopen parity" },
        ),
      );
    }
    return {
      baselineJourney,
      versionBeforeCutover,
      versionAfterCutover,
      beforeCutover,
      afterCutover: candidate.afterCutover,
      afterTransfer: candidate.afterTransfer,
      reopened,
      reopenedVersion,
      cleanParity: true,
    } satisfies M028CompatibleRuntimeJourney;
  });
