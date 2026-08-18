import { encodeSemanticArtifact } from "@bang/core";
import { Crypto, Effect, Encoding, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { withdrawAccountState } from "../../../examples/tiny-bank/implementation/account-withdrawal.ts";
import { compileSelectedProject, type M025ProjectFailure } from "./project.ts";
import {
  M026RuntimeFailure,
  runM026DatabaseJourney,
  type M026AccountSummary,
  type M026DatabaseJourney,
  type M026WithdrawHandler,
} from "./semantic-database-runtime.ts";
import {
  type M026TargetFailure,
  decodeM026SemanticDatabaseSelection,
  deriveM026DataServicePlan,
  renderM026EffectBindings,
  renderM026Sql,
  type M026DataServicePlan,
  type M026SemanticDatabaseSelection,
} from "./semantic-database-target.ts";

const parseOptions = { onExcessProperty: "error" } as const;
const defaultOutputDirectory = ".bang/semantic-database";

const isRepositoryRelativePath = (value: string): boolean => {
  if (value.length === 0 || value.includes("\\") || value.includes("\u0000")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
};

const CanonicalNonNegativeInteger = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^(?:0|[1-9][0-9]*)$/u)),
);
const Sha256 = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u)));
const M026StageSchema = Schema.Literals([
  "selection",
  "project",
  "reference",
  "artifact",
  "projection",
  "filesystem",
  "runtime",
  "report",
]);
const SourcePositionSchema = Schema.Struct({
  offset: Schema.Natural,
  line: Schema.Natural.check(Schema.isGreaterThan(0)),
  column: Schema.Natural.check(Schema.isGreaterThan(0)),
});
const SourceSpanSchema = Schema.Struct({
  start: SourcePositionSchema,
  end: SourcePositionSchema,
});

export type M026SemanticDatabaseStage = typeof M026StageSchema.Type;

/** One failure boundary for the complete M026 selection, projection, runtime, and report path. */
export class M026SemanticDatabaseFailure extends Schema.TaggedError<M026SemanticDatabaseFailure>()(
  "M026SemanticDatabaseFailure",
  {
    stage: M026StageSchema,
    path: Schema.String,
    reason: Schema.String,
    identity: Schema.optional(Schema.String),
    message: Schema.String,
    span: Schema.optional(SourceSpanSchema),
  },
) {}

const failure = (
  stage: M026SemanticDatabaseStage,
  path: string,
  reason: string,
  message: string,
  fields: {
    readonly identity?: string;
    readonly span?: M025ProjectFailure["span"];
  } = {},
): M026SemanticDatabaseFailure =>
  new M026SemanticDatabaseFailure({
    stage,
    path,
    reason,
    message,
    ...(fields.identity === undefined ? {} : { identity: fields.identity }),
    ...(fields.span === undefined ? {} : { span: fields.span }),
  });

const mapTargetFailure = (error: M026TargetFailure): M026SemanticDatabaseFailure =>
  failure(
    error.stage,
    error.path,
    error.reason,
    error.message,
    error.identity === undefined ? {} : { identity: error.identity },
  );

const mapProjectFailure = (error: M025ProjectFailure): M026SemanticDatabaseFailure =>
  failure("project", error.path, error.reason ?? error.stage, error.message, {
    ...(error.identity === undefined ? {} : { identity: error.identity }),
    ...(error.span === undefined ? {} : { span: error.span }),
  });

const mapRuntimeFailure = (error: M026RuntimeFailure): M026SemanticDatabaseFailure =>
  failure(
    "runtime",
    error.path,
    error.reason,
    error.message,
    error.identity === undefined ? {} : { identity: error.identity },
  );

const summaryReportSchema = Schema.Struct({
  accountId: Schema.String,
  revision: CanonicalNonNegativeInteger,
  balance: CanonicalNonNegativeInteger,
  withdrawalAvailable: Schema.Boolean,
}).annotate({ parseOptions });

const generatedArtifactSchema = Schema.Struct({
  kind: Schema.Literals(["sqlite-schema", "effect-binding"]),
  path: Schema.String,
  sha256: Sha256,
}).annotate({ parseOptions });

const dispositionSchema = Schema.Struct({
  subject: Schema.String,
  law: Schema.String,
  source: Schema.Literals(["authored", "structurally-derived", "theory-derived"]),
  mechanism: Schema.Literals([
    "type",
    "database-constraint",
    "atomic-transaction",
    "runtime-check",
    "scenario",
  ]),
  qualification: Schema.Literals([
    "static-checked",
    "runtime-checked",
    "scenario-tested",
    "unsupported-by-target",
    "unresolved",
  ]),
  claim: Schema.String,
  invalidators: Schema.NonEmptyArray(Schema.String),
}).annotate({ parseOptions });

const M026SemanticDatabaseReportSchemaBase = Schema.Struct({
  bangSemanticDatabaseReport: Schema.Literal(1),
  projectId: Schema.String,
  serviceId: Schema.String,
  artifact: Schema.Struct({
    id: Schema.String,
    sha256: Sha256,
  }).annotate({ parseOptions }),
  selection: Schema.Struct({
    path: Schema.String,
    stateMachine: Schema.String,
    initializer: Schema.String,
    invariant: Schema.String,
    realization: Schema.String,
    capability: Schema.String,
    query: Schema.String,
    subscription: Schema.String,
  }).annotate({ parseOptions }),
  generatedArtifacts: Schema.Tuple([generatedArtifactSchema, generatedArtifactSchema]),
  journey: Schema.Struct({
    initial: summaryReportSchema,
    committed: summaryReportSchema,
    emitted: Schema.Tuple([summaryReportSchema, summaryReportSchema]),
    rejection: Schema.Struct({
      identity: Schema.String,
      revisionUnchangedAt: CanonicalNonNegativeInteger,
    }).annotate({ parseOptions }),
    queryRunsAfterRejection: Schema.Natural,
    clean: summaryReportSchema,
    reopened: summaryReportSchema,
    incrementalEqualsClean: Schema.Boolean,
    reopenedEqualsClean: Schema.Boolean,
  }).annotate({ parseOptions }),
  dispositions: Schema.NonEmptyArray(dispositionSchema),
  limitations: Schema.NonEmptyArray(Schema.String),
}).annotate({ parseOptions });

type M026SemanticDatabaseReportValue = typeof M026SemanticDatabaseReportSchemaBase.Type;

const reportSummariesEqual = (
  left: typeof summaryReportSchema.Type,
  right: typeof summaryReportSchema.Type,
): boolean =>
  left.accountId === right.accountId &&
  left.revision === right.revision &&
  left.balance === right.balance &&
  left.withdrawalAvailable === right.withdrawalAvailable;

const hasConsistentReport = (report: M026SemanticDatabaseReportValue): boolean => {
  const [schemaArtifact, bindingArtifact] = report.generatedArtifacts;
  if (schemaArtifact.kind !== "sqlite-schema" || bindingArtifact.kind !== "effect-binding") {
    return false;
  }
  if (
    report.journey.initial.revision !== "0" ||
    report.journey.committed.revision !== "1" ||
    report.journey.queryRunsAfterRejection !== 2 ||
    report.journey.rejection.revisionUnchangedAt !== "1" ||
    !report.journey.incrementalEqualsClean ||
    !report.journey.reopenedEqualsClean
  ) {
    return false;
  }
  return (
    reportSummariesEqual(report.journey.emitted[0], report.journey.initial) &&
    reportSummariesEqual(report.journey.emitted[1], report.journey.committed) &&
    reportSummariesEqual(report.journey.clean, report.journey.committed) &&
    reportSummariesEqual(report.journey.reopened, report.journey.clean)
  );
};

/** Strict deterministic M026 report boundary. */
export const M026SemanticDatabaseReportSchema = M026SemanticDatabaseReportSchemaBase.check(
  Schema.makeFilter((report: M026SemanticDatabaseReportValue) => hasConsistentReport(report), {
    expected: "an internally consistent M026 revision, artifact, and parity report",
  }),
);
export type M026SemanticDatabaseReport = typeof M026SemanticDatabaseReportSchema.Type;
export const M026SemanticDatabaseReportFromJson = Schema.fromJsonString(
  M026SemanticDatabaseReportSchema,
);

const resolveRepositoryPath = Effect.fn("M026.resolveRepositoryPath")(function* (
  root: string,
  relativePath: string,
  stage: "selection" | "filesystem",
): Effect.fn.Return<string, M026SemanticDatabaseFailure, Path.Path> {
  if (!isRepositoryRelativePath(relativePath)) {
    return yield* failure(
      stage,
      relativePath,
      "unsafe-path",
      "path must be repository-relative without traversal segments",
    );
  }
  const path = yield* Path.Path;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const withinRoot = path.relative(resolvedRoot, resolved);
  if (withinRoot.startsWith("..") || path.isAbsolute(withinRoot)) {
    return yield* failure(stage, relativePath, "unsafe-path", "path escapes the repository root");
  }
  return resolved;
});

const readText = Effect.fn("M026.readText")(function* (
  filePath: string,
): Effect.fn.Return<string, M026SemanticDatabaseFailure, FileSystem.FileSystem> {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem
    .readFileString(filePath)
    .pipe(
      Effect.mapError((error) =>
        failure("selection", filePath, "read", `could not read selection: ${String(error)}`),
      ),
    );
});

const digestText = Effect.fn("M026.digestText")(function* (
  text: string,
  identity: string,
): Effect.fn.Return<string, M026SemanticDatabaseFailure, Crypto.Crypto> {
  const crypto = yield* Crypto.Crypto;
  const digest = yield* crypto
    .digest("SHA-256", new TextEncoder().encode(text))
    .pipe(
      Effect.mapError((error) =>
        failure(
          "artifact",
          identity,
          "digest",
          `could not digest generated material: ${String(error)}`,
        ),
      ),
    );
  return Encoding.encodeHex(digest);
});

const runCheckedProcess = Effect.fn("M026.runCheckedProcess")(function* (
  root: string,
  application: string,
  arguments_: ReadonlyArray<string>,
  stage: M026SemanticDatabaseStage,
  identityPath: string,
  reason: string,
) {
  const handle = yield* ChildProcess.make(application, arguments_, {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  }).pipe(
    Effect.mapError((error) =>
      failure(
        stage,
        identityPath,
        `${reason}-start`,
        `could not start ${application}: ${String(error)}`,
      ),
    ),
  );
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
      handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
      handle.exitCode,
    ] as const,
    { concurrency: "unbounded" },
  ).pipe(
    Effect.mapError((error) =>
      failure(
        stage,
        identityPath,
        `${reason}-collect`,
        `could not collect ${application} result: ${String(error)}`,
      ),
    ),
  );
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* failure(
      stage,
      identityPath,
      reason,
      stderr.trim() || stdout.trim() || `${application} exited ${exitCode}`,
    );
  }
}, Effect.scoped);

const typecheckProviderConformance = (root: string, conformancePath: string) =>
  runCheckedProcess(
    root,
    "bun",
    [
      "x",
      "tsc",
      "--ignoreConfig",
      "--noEmit",
      "--target",
      "ES2023",
      "--module",
      "ESNext",
      "--moduleResolution",
      "bundler",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--skipLibCheck",
      "--allowImportingTsExtensions",
      conformancePath,
    ],
    "projection",
    conformancePath,
    "provider-conformance-typecheck",
  );

const makeProviderConformanceSource = (bindingImport: string, runtimeImport: string): string =>
  [
    "// Scoped M026 provider conformance check.",
    `import type { M026DataServiceShape } from ${JSON.stringify(bindingImport)};`,
    `import type { M026DatabaseProviderShape } from ${JSON.stringify(runtimeImport)};`,
    "",
    "declare const runtimeProvider: M026DatabaseProviderShape;",
    "const generatedBoundary: M026DataServiceShape = runtimeProvider;",
    "void generatedBoundary;",
    "",
  ].join("\n");

const writeText = Effect.fn("M026.writeText")(function* (
  filePath: string,
  text: string,
): Effect.fn.Return<void, M026SemanticDatabaseFailure, FileSystem.FileSystem> {
  const fileSystem = yield* FileSystem.FileSystem;
  yield* fileSystem
    .writeFileString(filePath, text)
    .pipe(
      Effect.mapError((error) =>
        failure(
          "filesystem",
          filePath,
          "write",
          `could not write generated artifact: ${String(error)}`,
        ),
      ),
    );
});

const summaryEquals = (left: M026AccountSummary, right: M026AccountSummary): boolean =>
  left.accountId === right.accountId &&
  left.revision === right.revision &&
  left.balance === right.balance &&
  left.withdrawalAvailable === right.withdrawalAvailable;

const toSummaryReport = (summary: M026AccountSummary) => ({
  accountId: summary.accountId,
  revision: summary.revision.toString(),
  balance: summary.balance.toString(),
  withdrawalAvailable: summary.withdrawalAvailable,
});

const canonicalHandler =
  (databasePath: string): M026WithdrawHandler =>
  (state, { amount }) => {
    const balance = state.balance;
    if (balance === undefined) {
      return Effect.fail(
        new M026RuntimeFailure({
          stage: "runtime",
          path: databasePath,
          reason: "handler",
          identity: "balance",
          operation: "independent withdrawal handler",
          message: "the selected state did not provide balance to the independent handler",
        }),
      );
    }
    return withdrawAccountState({ balance }, amount);
  };

const validateJourney = (
  plan: M026DataServicePlan,
  journey: M026DatabaseJourney,
  databasePath: string,
): M026SemanticDatabaseFailure | undefined => {
  const expected = withdrawAccountState(
    { balance: plan.scenario.initialBalance },
    plan.scenario.withdrawAmount,
  );
  if (
    journey.initialSnapshot.accountId !== plan.scenario.accountId ||
    journey.initialSnapshot.revision !== 0n ||
    journey.initialSnapshot.balance !== plan.scenario.initialBalance ||
    !journey.initialSnapshot.withdrawalAvailable
  ) {
    return failure(
      "runtime",
      databasePath,
      "initial-observation",
      "initial Account summary is not the selected revision-zero state",
    );
  }
  if (
    journey.committedSnapshot.revision !== 1n ||
    journey.committedSnapshot.balance !== expected.balance ||
    journey.committedSnapshot.withdrawalAvailable
  ) {
    return failure(
      "runtime",
      databasePath,
      "committed-observation",
      "committed Account summary does not match the independent handler result",
    );
  }
  if (
    journey.rejectionIdentity !== plan.command.disabledFailureId ||
    journey.queryRunsAfterRejection !== 2 ||
    !summaryEquals(journey.committedSnapshot, journey.preReopenCleanQuery) ||
    !summaryEquals(journey.preReopenCleanQuery, journey.reopenedQuery)
  ) {
    return failure(
      "runtime",
      databasePath,
      "journey-parity",
      "rejection, reactive, clean-query, or reopen parity failed",
    );
  }
  return undefined;
};

const makeDispositions = (plan: M026DataServicePlan, journey: M026DatabaseJourney) =>
  [
    {
      subject: plan.addresses.entity,
      law: "UniqueEntityIdentity",
      source: "structurally-derived" as const,
      mechanism: "database-constraint" as const,
      qualification: "runtime-checked" as const,
      claim: "SQLite rejects duplicate Account identities through the generated primary key.",
      invalidators: ["a target that does not preserve SQLite primary-key semantics"],
    },
    {
      subject: plan.addresses.invariant,
      law: "StateInvariantPreservation",
      source: "authored" as const,
      mechanism: "database-constraint" as const,
      qualification: "runtime-checked" as const,
      claim: "The generated balance constraint rejects negative or noncanonical persisted values.",
      invalidators: [
        "schema replacement",
        "disabled SQLite constraints",
        "an incompatible state representation",
      ],
    },
    {
      subject: plan.addresses.invariant,
      law: "StateInvariantPreservation",
      source: "authored" as const,
      mechanism: "runtime-check" as const,
      qualification: "runtime-checked" as const,
      claim: "The runtime validates the independent handler result before the transaction commits.",
      invalidators: [
        "a handler path that bypasses result validation",
        "a new state field without a decoder",
      ],
    },
    {
      subject: plan.addresses.operation,
      law: "TransitionRequirements",
      source: "authored" as const,
      mechanism: "runtime-check" as const,
      qualification: "runtime-checked" as const,
      claim:
        "The provider checks the current state and command input before it invokes the independent handler.",
      invalidators: [
        "a command path that bypasses checked requirements",
        "a new predicate without a runtime evaluator",
      ],
    },
    {
      subject: plan.addresses.capabilityRequirement,
      law: "ExactOneCapabilityExecution",
      source: "theory-derived" as const,
      mechanism: "atomic-transaction" as const,
      qualification: "runtime-checked" as const,
      claim:
        "The conditional state update consumes the one remaining grant in the same SQLite transaction.",
      invalidators: [
        "grant consumption outside the transaction",
        "a non-atomic target update",
        "a quantity other than exactly one",
      ],
    },
    {
      subject: `dataService:${plan.serviceId}.binding`,
      law: "TypedInteractionBoundary",
      source: "structurally-derived" as const,
      mechanism: "type" as const,
      qualification: "static-checked" as const,
      claim:
        "The generated Effect boundary accepts the app-local M026 database provider shape for typed create, query, dispatch, and Stream subscription methods.",
      invalidators: [
        "a pinned Effect or TypeScript API change",
        "manual changes to generated bindings",
        "provider shape drift",
      ],
    },
    {
      subject: plan.addresses.operation,
      law: "WithdrawPoststate",
      source: "authored" as const,
      mechanism: "scenario" as const,
      qualification: "scenario-tested" as const,
      claim: `The independent TinyBank handler changed balance ${plan.scenario.initialBalance} to ${journey.committedSnapshot.balance} for amount ${plan.scenario.withdrawAmount}.`,
      invalidators: [
        "a different handler",
        "different scenario input",
        "a future authored postcondition",
      ],
    },
    {
      subject: plan.addresses.subscription,
      law: "ReactiveCleanParity",
      source: "structurally-derived" as const,
      mechanism: "scenario" as const,
      qualification: "scenario-tested" as const,
      claim:
        "Two in-process snapshots were observed, rejection caused no rerun, and the last snapshot equals a clean query.",
      invalidators: [
        "different invalidation keys",
        "pre-commit invalidation",
        "concurrent mutation",
        "process failure after commit",
      ],
    },
    {
      subject: `dataService:${plan.serviceId}.persistence`,
      law: "PersistentReopen",
      source: "structurally-derived" as const,
      mechanism: "scenario" as const,
      qualification: "scenario-tested" as const,
      claim:
        "A second SQLite runtime read the same revision-one Account state from the scratch database.",
      invalidators: [
        "a different database file",
        "failed commit",
        "storage corruption",
        "hardware durability assumptions",
      ],
    },
  ] as const;

const limitations = [
  "Withdrawal arithmetic is supplied by an independent handler; current Core does not derive its poststate.",
  "Reactive invalidation is process-local and can lose an observation if the process fails after commit.",
  "M026 projects only the Account balance field; broader state projections remain unsupported.",
  "The journey has one client, one subscriber, and no concurrent commands.",
  "The evidence is SQLite-specific and does not establish replication, crash recovery, or hardware durability.",
  "The journey has no network, authentication, backpressure, fairness, or liveness claim.",
] as const;

const makeReport = Effect.fn("M026.makeReport")(function* (
  selectionPath: string,
  outputDirectory: string,
  plan: M026DataServicePlan,
  artifactSha256: string,
  schemaSha256: string,
  bindingSha256: string,
  journey: M026DatabaseJourney,
): Effect.fn.Return<M026SemanticDatabaseReport, M026SemanticDatabaseFailure> {
  const schemaPath = `${outputDirectory}/${plan.serviceId}/schema.sql`;
  const bindingPath = `${outputDirectory}/${plan.serviceId}/bindings.ts`;
  const reportUnknown = {
    bangSemanticDatabaseReport: 1 as const,
    projectId: plan.projectId,
    serviceId: plan.serviceId,
    artifact: { id: plan.artifactId, sha256: artifactSha256 },
    selection: {
      path: selectionPath,
      stateMachine: plan.constructIds.stateMachine,
      initializer: plan.constructIds.initializer,
      invariant: plan.entity.invariantId,
      realization: plan.constructIds.realization,
      capability: plan.constructIds.capability,
      query: plan.constructIds.query,
      subscription: plan.constructIds.subscription,
    },
    generatedArtifacts: [
      { kind: "sqlite-schema" as const, path: schemaPath, sha256: schemaSha256 },
      { kind: "effect-binding" as const, path: bindingPath, sha256: bindingSha256 },
    ] as const,
    journey: {
      initial: toSummaryReport(journey.initialSnapshot),
      committed: toSummaryReport(journey.committedSnapshot),
      emitted: [
        toSummaryReport(journey.emittedSnapshots[0]),
        toSummaryReport(journey.emittedSnapshots[1]),
      ] as const,
      rejection: {
        identity: journey.rejectionIdentity,
        revisionUnchangedAt: journey.preReopenCleanQuery.revision.toString(),
      },
      queryRunsAfterRejection: journey.queryRunsAfterRejection,
      clean: toSummaryReport(journey.preReopenCleanQuery),
      reopened: toSummaryReport(journey.reopenedQuery),
      incrementalEqualsClean: summaryEquals(journey.committedSnapshot, journey.preReopenCleanQuery),
      reopenedEqualsClean: summaryEquals(journey.preReopenCleanQuery, journey.reopenedQuery),
    },
    dispositions: makeDispositions(plan, journey),
    limitations,
  };
  return yield* Schema.decodeEffect(M026SemanticDatabaseReportSchema)(
    reportUnknown,
    parseOptions,
  ).pipe(
    Effect.mapError((issue) =>
      failure("report", selectionPath, "report-schema", `invalid M026 report: ${String(issue)}`),
    ),
  );
});

const formatSummary = (label: string, summary: M026SemanticDatabaseReport["journey"]["initial"]) =>
  `${label}: revision ${summary.revision}, balance ${summary.balance}, withdrawal available ${summary.withdrawalAvailable ? "yes" : "no"}`;

/** Format one complete M026 report after every artifact and runtime check succeeds. */
export const formatM026SemanticDatabaseReport = (report: M026SemanticDatabaseReport): string => {
  const [schemaArtifact, bindingArtifact] = report.generatedArtifacts;
  return [
    "M026 persistent reactive semantic database",
    `Project: ${report.projectId}`,
    `Service: ${report.serviceId}`,
    `Semantic artifact: ${report.artifact.id}`,
    `Semantic artifact SHA-256: ${report.artifact.sha256}`,
    `State machine: ${report.selection.stateMachine}`,
    `Invariant: ${report.selection.invariant}`,
    `Realization: ${report.selection.realization}`,
    `Capability: ${report.selection.capability} exactly 1`,
    `Query: ${report.selection.query}`,
    `Subscription: ${report.selection.subscription}`,
    `Generated SQLite schema: ${schemaArtifact.path}`,
    `SQLite schema SHA-256: ${schemaArtifact.sha256}`,
    `Generated Effect binding: ${bindingArtifact.path}`,
    `Effect binding SHA-256: ${bindingArtifact.sha256}`,
    "Effect binding type-check: passed",
    "Journey:",
    `  ${formatSummary("Initial subscription", report.journey.initial)}`,
    `  ${formatSummary("Committed subscription", report.journey.committed)}`,
    `  Rejection: ${report.journey.rejection.identity}`,
    `  Revision after rejection: ${report.journey.rejection.revisionUnchangedAt}`,
    `  Reactive query runs after rejection: ${report.journey.queryRunsAfterRejection}`,
    `  ${formatSummary("Reopened query", report.journey.reopened)}`,
    `  Incremental equals clean query: ${report.journey.incrementalEqualsClean ? "yes" : "no"}`,
    `  Reopened equals clean query: ${report.journey.reopenedEqualsClean ? "yes" : "no"}`,
    "Law dispositions:",
    ...report.dispositions.map(
      (disposition) =>
        `  [${disposition.qualification}] ${disposition.law} @ ${disposition.subject}: ${disposition.claim}`,
    ),
    "Limitations:",
    ...report.limitations.map((limitation) => `  - ${limitation}`),
  ].join("\n");
};

export interface M026SemanticDatabaseCompileResult {
  readonly selection: M026SemanticDatabaseSelection;
  readonly plan: M026DataServicePlan;
  readonly report: M026SemanticDatabaseReport;
  readonly text: string;
}

/** Compile, type-check, execute, and report one M026 semantic database selection. */
export const compileSelectedSemanticDatabase = (
  root: string,
  selectionPath: string,
  outputDirectory = defaultOutputDirectory,
): Effect.Effect<
  M026SemanticDatabaseCompileResult,
  M026SemanticDatabaseFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fileSystem = yield* FileSystem.FileSystem;
      const resolvedSelectionPath = yield* resolveRepositoryPath(root, selectionPath, "selection");
      const resolvedOutputDirectory = yield* resolveRepositoryPath(
        root,
        outputDirectory,
        "filesystem",
      );
      const encodedSelection = yield* readText(resolvedSelectionPath);
      const selection = yield* decodeM026SemanticDatabaseSelection(
        encodedSelection,
        resolvedSelectionPath,
      ).pipe(Effect.mapError(mapTargetFailure));
      const project = yield* compileSelectedProject(root, selection.project).pipe(
        Effect.mapError(mapProjectFailure),
      );
      const plan = yield* deriveM026DataServicePlan(
        project.artifact,
        selection,
        resolvedSelectionPath,
      ).pipe(Effect.mapError(mapTargetFailure));
      const schemaSource = renderM026Sql(plan);
      const bindingSource = renderM026EffectBindings(plan);
      const artifactSha256 = yield* digestText(
        encodeSemanticArtifact(project.artifact),
        plan.artifactId,
      );
      const schemaSha256 = yield* digestText(schemaSource, plan.addresses.entity);
      const bindingSha256 = yield* digestText(
        bindingSource,
        `dataService:${plan.serviceId}.binding`,
      );

      const generatedDirectory = path.join(resolvedOutputDirectory, plan.serviceId);
      yield* fileSystem
        .makeDirectory(generatedDirectory, { recursive: true })
        .pipe(
          Effect.mapError((error) =>
            failure(
              "filesystem",
              generatedDirectory,
              "create-directory",
              `could not create generated artifact directory: ${String(error)}`,
            ),
          ),
        );
      const schemaPath = path.join(generatedDirectory, "schema.sql");
      const bindingPath = path.join(generatedDirectory, "bindings.ts");
      const reportPath = path.join(generatedDirectory, "report.json");
      yield* writeText(schemaPath, schemaSource);
      yield* writeText(bindingPath, bindingSource);

      const temporaryDirectory = yield* fileSystem
        .makeTempDirectoryScoped({ directory: root, prefix: ".m026-database-" })
        .pipe(
          Effect.mapError((error) =>
            failure(
              "filesystem",
              root,
              "temporary-directory",
              `could not create scoped database directory: ${String(error)}`,
            ),
          ),
        );
      const providerConformancePath = path.join(temporaryDirectory, "provider-conformance.ts");
      const runtimePath = path.resolve(root, "apps/bang/src/semantic-database-runtime.ts");
      const relativeBindingImport = path
        .relative(temporaryDirectory, bindingPath)
        .replaceAll("\\", "/");
      const relativeRuntimeImport = path
        .relative(temporaryDirectory, runtimePath)
        .replaceAll("\\", "/");
      const providerConformanceSource = makeProviderConformanceSource(
        relativeBindingImport.startsWith(".")
          ? relativeBindingImport
          : `./${relativeBindingImport}`,
        relativeRuntimeImport.startsWith(".")
          ? relativeRuntimeImport
          : `./${relativeRuntimeImport}`,
      );
      yield* writeText(providerConformancePath, providerConformanceSource);
      yield* typecheckProviderConformance(root, providerConformancePath);

      const databasePath = path.join(temporaryDirectory, "account.sqlite");
      const journey = yield* runM026DatabaseJourney(
        plan,
        databasePath,
        canonicalHandler(databasePath),
      ).pipe(Effect.mapError(mapRuntimeFailure));
      const journeyFailure = validateJourney(plan, journey, databasePath);
      if (journeyFailure !== undefined) return yield* journeyFailure;

      const report = yield* makeReport(
        selectionPath,
        outputDirectory,
        plan,
        artifactSha256,
        schemaSha256,
        bindingSha256,
        journey,
      );
      const reportJson = JSON.stringify(report);
      yield* writeText(reportPath, `${reportJson}\n`);
      return {
        selection,
        plan,
        report,
        text: formatM026SemanticDatabaseReport(report),
      };
    }),
  );

/** Format an M026 failure without a stack trace or partial success report. */
export const formatM026SemanticDatabaseFailure = (error: M026SemanticDatabaseFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`, `reason: ${error.reason}`];
  if (error.identity !== undefined) lines.push(`identity: ${error.identity}`);
  lines.push(`message: ${error.message}`);
  if (error.span !== undefined) {
    lines.push(
      `line: ${error.span.start.line}`,
      `column: ${error.span.start.column}`,
      `end-line: ${error.span.end.line}`,
      `end-column: ${error.span.end.column}`,
    );
  }
  return lines.join("\n");
};
