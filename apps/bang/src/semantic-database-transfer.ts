import { encodeSemanticArtifact } from "@bang/core";
import {
  decodeM016DualProviderEvidenceManifest,
  verifyM016EvidenceMaterials,
  type M016DualProviderEvidenceManifest,
} from "@bang/evidence";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Crypto, Effect, Encoding, FileSystem, Path, Schema, Stream, type Scope } from "effect";

import { compileSelectedProject, type M025ProjectFailure } from "./project.ts";
import {
  type M027RuntimeFailure,
  type M027TransferConformanceFailure,
  type M027TransferRejected,
  defaultM027TransferHandler,
  runM027TransferJourney,
  type M027AccountSummary,
  type M027DatabaseJourney,
  type M027TotalFunds,
  type M027TransferHandler,
} from "./semantic-database-transfer-runtime.ts";
import {
  M027TransferReportSchema,
  decodeM027SemanticDatabaseSelection,
  deriveM027TransferPlan,
  renderM027EffectBindings,
  renderM027Sql,
  type M027SemanticDatabaseSelection,
  type M027TargetFailure,
  type M027TransferPlan,
  type M027TransferReport,
} from "./semantic-database-transfer-target.ts";

const parseOptions = { onExcessProperty: "error" } as const;
const defaultOutputDirectory = ".bang/semantic-database";

export type M027SemanticDatabaseStage =
  | "selection"
  | "project"
  | "reference"
  | "evidence"
  | "artifact"
  | "projection"
  | "filesystem"
  | "runtime"
  | "report";

/** One failure boundary for strict M027 selection, projection, runtime, and report work. */
export class M027SemanticDatabaseFailure extends Schema.TaggedError<M027SemanticDatabaseFailure>()(
  "M027SemanticDatabaseFailure",
  {
    stage: Schema.Literals([
      "selection",
      "project",
      "reference",
      "evidence",
      "artifact",
      "projection",
      "filesystem",
      "runtime",
      "report",
    ]),
    path: Schema.String,
    reason: Schema.String,
    identity: Schema.optional(Schema.String),
    message: Schema.String,
  },
) {}

const failure = (
  stage: M027SemanticDatabaseStage,
  path: string,
  reason: string,
  message: string,
  identity?: string,
): M027SemanticDatabaseFailure =>
  new M027SemanticDatabaseFailure({
    stage,
    path,
    reason,
    message,
    ...(identity === undefined ? {} : { identity }),
  });

const mapTargetFailure = (error: M027TargetFailure): M027SemanticDatabaseFailure =>
  failure(error.stage, error.path, error.reason, error.message, error.identity);

const mapProjectFailure = (error: M025ProjectFailure): M027SemanticDatabaseFailure =>
  failure("project", error.path, error.reason ?? error.stage, error.message, error.identity);

const mapRuntimeFailure = (
  error: M027RuntimeFailure | M027TransferRejected | M027TransferConformanceFailure,
  databasePath: string,
): M027SemanticDatabaseFailure => {
  if (error._tag === "M027RuntimeFailure") {
    return failure("runtime", error.path, error.reason, error.message, error.identity);
  }
  if (error._tag === "M027TransferConformanceFailure") {
    return failure("runtime", databasePath, "conformance", error.message, error.operation);
  }
  return failure(
    "runtime",
    databasePath,
    error.reason,
    `transfer ${error.failureId} was rejected: ${error.reason}`,
    error.failureId,
  );
};

const resolveRepositoryPath = Effect.fn("M027.resolveRepositoryPath")(function* (
  root: string,
  relativePath: string,
  stage: M027SemanticDatabaseStage,
): Effect.fn.Return<string, M027SemanticDatabaseFailure, Path.Path> {
  if (
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    relativePath.includes("\u0000") ||
    relativePath.startsWith("/") ||
    /^[A-Za-z]:/u.test(relativePath) ||
    relativePath
      .split("/")
      .some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
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
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return yield* failure(stage, relativePath, "unsafe-path", "path escapes the repository root");
  }
  return resolved;
});

const readText = Effect.fn("M027.readText")(function* (
  filePath: string,
  stage: M027SemanticDatabaseStage,
  label: string,
): Effect.fn.Return<string, M027SemanticDatabaseFailure, FileSystem.FileSystem> {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem
    .readFileString(filePath)
    .pipe(
      Effect.mapError((error) =>
        failure(stage, filePath, "read", `could not read ${label}: ${String(error)}`),
      ),
    );
});

const writeText = Effect.fn("M027.writeText")(function* (
  filePath: string,
  text: string,
): Effect.fn.Return<void, M027SemanticDatabaseFailure, FileSystem.FileSystem> {
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

const digestText = Effect.fn("M027.digestText")(function* (
  text: string,
  identity: string,
): Effect.fn.Return<string, M027SemanticDatabaseFailure, Crypto.Crypto> {
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

const runCheckedProcess = Effect.fn("M027.runCheckedProcess")(function* (
  root: string,
  application: string,
  arguments_: ReadonlyArray<string>,
  identityPath: string,
): Effect.fn.Return<
  void,
  M027SemanticDatabaseFailure,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const handle = yield* ChildProcess.make(application, arguments_, {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  }).pipe(
    Effect.mapError((error) =>
      failure(
        "projection",
        identityPath,
        "provider-conformance-start",
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
        "projection",
        identityPath,
        "provider-conformance-collect",
        `could not collect ${application} result: ${String(error)}`,
      ),
    ),
  );
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* failure(
      "projection",
      identityPath,
      "provider-conformance-typecheck",
      stderr.trim() || stdout.trim() || `${application} exited ${exitCode}`,
    );
  }
});

const typecheckBinding = (root: string, bindingPath: string) =>
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
      bindingPath,
    ],
    bindingPath,
  );

interface M027AccountReport {
  readonly accountId: string;
  readonly revision: string;
  readonly balance: string;
}

interface M027TotalReport {
  readonly revision: string;
  readonly total: string;
}

interface M027SnapshotReport {
  readonly source: M027AccountReport;
  readonly target: M027AccountReport;
  readonly total: M027TotalReport;
}

const toAccountReport = (snapshot: M027AccountSummary): M027AccountReport => ({
  accountId: snapshot.accountId,
  revision: snapshot.revision.toString(),
  balance: snapshot.balance.toString(),
});

const toTotalReport = (snapshot: M027TotalFunds): M027TotalReport => ({
  revision: snapshot.revision.toString(),
  total: snapshot.total.toString(),
});

const toJourneySnapshot = (
  source: M027AccountSummary,
  target: M027AccountSummary,
  total: M027TotalFunds,
): M027SnapshotReport => ({
  source: toAccountReport(source),
  target: toAccountReport(target),
  total: toTotalReport(total),
});

const makeJourneyReport = (journey: M027DatabaseJourney) => {
  const initial = toJourneySnapshot(
    journey.initialAccountSnapshots[0],
    journey.initialAccountSnapshots[1],
    journey.initialTotalSnapshot,
  );
  const committed = toJourneySnapshot(
    journey.committedAccountSnapshots[0],
    journey.committedAccountSnapshots[1],
    journey.committedTotalSnapshot,
  );
  const clean = toJourneySnapshot(
    journey.preReopenCleanAccounts[0],
    journey.preReopenCleanAccounts[1],
    journey.preReopenCleanTotal,
  );
  const reopened = toJourneySnapshot(
    journey.reopenedAccounts[0],
    journey.reopenedAccounts[1],
    journey.reopenedTotal,
  );
  const emitted = [
    toJourneySnapshot(
      journey.emittedAccountSnapshots[0],
      journey.emittedAccountSnapshots[1],
      journey.emittedTotalSnapshots[0],
    ),
    toJourneySnapshot(
      journey.emittedAccountSnapshots[2],
      journey.emittedAccountSnapshots[3],
      journey.emittedTotalSnapshots[1],
    ),
  ] as const;
  return {
    initial,
    committed,
    emitted,
    rejection: {
      identity: journey.rejectionIdentity,
      sourceRevisionUnchangedAt: journey.preReopenCleanAccounts[0].revision.toString(),
      targetRevisionUnchangedAt: journey.preReopenCleanAccounts[1].revision.toString(),
      totalRevisionUnchangedAt: journey.preReopenCleanTotal.revision.toString(),
    },
    queryRunsAfterRejection: journey.queryRunsAfterRejection.total,
    clean,
    reopened,
    incrementalEqualsClean: JSON.stringify(committed) === JSON.stringify(clean),
    reopenedEqualsClean: JSON.stringify(clean) === JSON.stringify(reopened),
  };
};

const makeDispositions = (plan: M027TransferPlan, journey: M027DatabaseJourney) =>
  [
    {
      subject: plan.addresses.bridge,
      law: "BalanceSharing",
      source: "checked-core" as const,
      mechanism: "structure" as const,
      qualification: "structurally-derived" as const,
      claim: "AccountLedger shares one Integer-represented Balance sort across both participants.",
      invalidators: ["a changed bridge declaration", "a changed shared sort representation"],
    },
    {
      subject: plan.addresses.compositionLinks.join(", "),
      law: "SelectedIntegerCarriers",
      source: "composition-links" as const,
      mechanism: "representation-check" as const,
      qualification: "structurally-derived" as const,
      claim:
        "Both explicit representation-compatible links resolve to the selected Balance carriers.",
      invalidators: ["a missing link", "a link endpoint drift", "domain identity assumptions"],
    },
    {
      subject: plan.addresses.obligation,
      law: "TransferEquationsAndPreservedTotal",
      source: "reusable-obligation" as const,
      mechanism: "derivation" as const,
      qualification: "structurally-derived" as const,
      claim:
        "The provider consumes the validated mission-local relational obligation before commit.",
      invalidators: ["a different obligation", "a bypass around poststate evaluation"],
    },
    {
      subject: plan.addresses.evidence,
      law: "AbstractTransferPreservation",
      source: "m016-lean" as const,
      mechanism: "kernel" as const,
      qualification: "kernel-proven" as const,
      claim:
        "M016 retains distinct kernel and bounded-provider evidence for abstract arithmetic only.",
      invalidators: ["stale M016 materials", "an implementation-conformance claim"],
    },
    {
      subject: `dataService:${plan.serviceId}.binding`,
      law: "TypedInteractionBoundary",
      source: "target" as const,
      mechanism: "type" as const,
      qualification: "static-checked" as const,
      claim:
        "The generated Effect boundary exposes typed Account, TotalFunds, Transfer, and subscription operations.",
      invalidators: ["generated binding drift", "Effect or TypeScript API changes"],
    },
    {
      subject: `${plan.addresses.entity}.transaction`,
      law: "AtomicTwoRowTransfer",
      source: "target" as const,
      mechanism: "atomic-transaction" as const,
      qualification: "runtime-checked" as const,
      claim: "Accepted source and target updates commit together in one SQLite transaction.",
      invalidators: ["a non-transactional update", "a partial-write path", "concurrent commands"],
    },
    {
      subject: plan.addresses.command,
      law: "IndependentHandlerConformance",
      source: "runtime" as const,
      mechanism: "runtime-evaluator" as const,
      qualification: "runtime-checked" as const,
      claim:
        "The handler poststate satisfies both transfer equations, nonnegativity, and preserved total before commit.",
      invalidators: ["a different handler", "a bypass around conformance checks"],
    },
    {
      subject: plan.addresses.accountSubscription,
      law: "AccountCommitPropagation",
      source: "scenario" as const,
      mechanism: "scenario" as const,
      qualification: "scenario-tested" as const,
      claim: `The accepted transfer published source ${journey.committedAccountSnapshots[0].balance} and target ${journey.committedAccountSnapshots[1].balance} at revision 1.`,
      invalidators: [
        "pre-commit invalidation",
        "different subscription keys",
        "process failure after commit",
      ],
    },
    {
      subject: plan.addresses.totalSubscription,
      law: "TotalFundsReactiveParity",
      source: "scenario" as const,
      mechanism: "scenario" as const,
      qualification: "scenario-tested" as const,
      claim: `The derived TotalFunds observation remained ${journey.committedTotalSnapshot.total} and matched clean and reopened evaluation.`,
      invalidators: [
        "a different derivation",
        "a missed invalidation",
        "process failure after commit",
      ],
    },
    {
      subject: `dataService:${plan.serviceId}.persistence`,
      law: "PersistentReopen",
      source: "scenario" as const,
      mechanism: "scenario" as const,
      qualification: "scenario-tested" as const,
      claim:
        "A reopened SQLite service matched the final incremental Account and TotalFunds observations.",
      invalidators: [
        "a different database file",
        "storage corruption",
        "hardware durability assumptions",
      ],
    },
    {
      subject: plan.addresses.rejection,
      law: "RejectedTransferNoPublication",
      source: "scenario" as const,
      mechanism: "scenario" as const,
      qualification: "scenario-tested" as const,
      claim:
        "The overdraft was rejected without revision advancement, partial write, or subscription publication.",
      invalidators: [
        "handler invocation before preconditions",
        "pre-commit invalidation",
        "a second client",
      ],
    },
  ] as const;

const limitations = [
  "The Lean theorem proves the projected abstract arithmetic proposition, not Effect or SQLite implementation conformance.",
  "Equal Integer representations and the selected composition links do not establish domain identity or semantic equivalence.",
  "Runtime checks observe accepted commands but are not a universal proof that arbitrary host code cannot bypass the provider.",
  "The independent transfer handler remains authored code.",
  "Reactivity is process-local and can lose publication if the process fails after commit.",
  "The journey has one client and no concurrent commands.",
  "SQLite evidence does not establish replication, crash recovery, or hardware durability.",
] as const;

const verifyEvidence = Effect.fn("M027.verifyEvidence")(function* (
  root: string,
  selection: M027SemanticDatabaseSelection,
  plan: M027TransferPlan,
): Effect.fn.Return<
  M016DualProviderEvidenceManifest,
  M027SemanticDatabaseFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> {
  const evidencePath = yield* resolveRepositoryPath(root, selection.evidence.path, "evidence");
  const encoded = yield* readText(evidencePath, "evidence", "M016 evidence");
  const manifest = yield* decodeM016DualProviderEvidenceManifest(encoded).pipe(
    Effect.mapError((error) =>
      failure(
        "evidence",
        evidencePath,
        error.reason,
        `invalid M016 evidence: ${error.message}`,
        error.obligationId,
      ),
    ),
  );
  yield* verifyM016EvidenceMaterials(manifest).pipe(
    Effect.mapError((error) =>
      failure(
        "evidence",
        evidencePath,
        error.reason,
        `invalid M016 evidence material: ${error.message}`,
        error.obligationId,
      ),
    ),
  );
  for (const observation of manifest.solver.observations) {
    const obligation = observation.obligation;
    if (
      obligation.id !== plan.obligation.id ||
      (obligation.variant !== "lawful" && obligation.variant !== "faulty") ||
      obligation.source.core !== plan.obligation.source.core ||
      obligation.source.bridge !== plan.obligation.source.bridge ||
      obligation.source.relation !== plan.obligation.source.relation
    ) {
      return yield* failure(
        "evidence",
        evidencePath,
        "identity-mismatch",
        "M016 solver evidence does not match the rederived transfer obligation",
        plan.obligation.id,
      );
    }
  }
  for (const observation of manifest.kernelProof.observations) {
    const obligation = observation.obligation;
    if (
      obligation.id !== plan.obligation.id ||
      (obligation.variant !== "lawful" && obligation.variant !== "faulty")
    ) {
      return yield* failure(
        "evidence",
        evidencePath,
        "identity-mismatch",
        "M016 kernel evidence does not match the rederived transfer obligation",
        plan.obligation.id,
      );
    }
  }
  if (
    manifest.solver.observations.length !== 2 ||
    manifest.kernelProof.observations.length !== 2 ||
    !manifest.solver.observations.some(({ obligation }) => obligation.variant === "lawful") ||
    !manifest.solver.observations.some(({ obligation }) => obligation.variant === "faulty") ||
    !manifest.kernelProof.observations.some(({ obligation }) => obligation.variant === "lawful") ||
    !manifest.kernelProof.observations.some(({ obligation }) => obligation.variant === "faulty")
  ) {
    return yield* failure(
      "evidence",
      evidencePath,
      "identity-mismatch",
      "M016 evidence must retain exactly one lawful and one faulty solver and kernel observation",
      plan.obligation.id,
    );
  }
  const lawful = manifest.kernelProof.observations.find(
    ({ obligation }) => obligation.variant === "lawful",
  );
  if (
    lawful === undefined ||
    lawful.obligation.id !== plan.obligation.id ||
    lawful.obligation.variant !== plan.obligation.variant
  ) {
    return yield* failure(
      "evidence",
      evidencePath,
      "identity-mismatch",
      "M016 evidence does not name the selected lawful transfer obligation",
      plan.obligation.id,
    );
  }
  return manifest;
});

const makeReport = Effect.fn("M027.makeReport")(function* (
  selectionPath: string,
  outputDirectory: string,
  selection: M027SemanticDatabaseSelection,
  plan: M027TransferPlan,
  artifactSha256: string,
  schemaSha256: string,
  bindingSha256: string,
  journey: M027DatabaseJourney,
): Effect.fn.Return<M027TransferReport, M027SemanticDatabaseFailure> {
  const journeyReport = makeJourneyReport(journey);
  const reportUnknown = {
    bangSemanticDatabaseReport: 1 as const,
    projectId: plan.projectId,
    serviceId: plan.serviceId,
    artifact: { id: plan.artifactId, sha256: artifactSha256 },
    selection: {
      path: selectionPath,
      stateMachine: plan.constructIds.stateMachine,
      initializer: plan.constructIds.initializer,
      invariant: plan.constructIds.invariant,
      refinement: plan.constructIds.refinement,
      bridge: plan.constructIds.bridge,
      obligation: plan.constructIds.obligation,
      evidence: plan.constructIds.evidence,
      command: plan.constructIds.command,
      rejection: plan.constructIds.rejection,
      accountQuery: plan.constructIds.accountQuery,
      totalQuery: plan.constructIds.totalQuery,
      accountSubscription: plan.constructIds.accountSubscription,
      totalSubscription: plan.constructIds.totalSubscription,
    },
    generatedArtifacts: [
      {
        kind: "sqlite-schema" as const,
        path: `${outputDirectory}/${plan.serviceId}/schema.sql`,
        sha256: schemaSha256,
      },
      {
        kind: "effect-binding" as const,
        path: `${outputDirectory}/${plan.serviceId}/bindings.ts`,
        sha256: bindingSha256,
      },
    ] as const,
    journey: journeyReport,
    dispositions: makeDispositions(plan, journey),
    limitations,
  };
  return yield* Schema.decodeEffect(M027TransferReportSchema)(reportUnknown, parseOptions).pipe(
    Effect.mapError((issue) =>
      failure("report", selectionPath, "report-schema", `invalid M027 report: ${String(issue)}`),
    ),
  );
});

const formatAccount = (label: string, summary: M027AccountReport) =>
  `${label}: ${summary.accountId}, revision ${summary.revision}, balance ${summary.balance}`;

const formatSnapshot = (label: string, snapshot: M027SnapshotReport): ReadonlyArray<string> => [
  `  ${label}:`,
  formatAccount("    Source", snapshot.source),
  formatAccount("    Target", snapshot.target),
  `    TotalFunds: revision ${snapshot.total.revision}, total ${snapshot.total.total}`,
];
export interface M027ReportArtifactIdentity {
  readonly path: string;
  readonly sha256?: string;
}

/** Format one complete M027 report after every artifact and runtime check succeeds. */
export const formatM027SemanticDatabaseReport = (
  report: M027TransferReport,
  reportArtifact?: M027ReportArtifactIdentity,
): string => {
  const [schemaArtifact, bindingArtifact] = report.generatedArtifacts;
  const reportPath =
    reportArtifact?.path ?? schemaArtifact.path.replace(/schema\.sql$/u, "report.json");
  const reportSha =
    reportArtifact?.sha256 === undefined ? [] : [`Report SHA-256: ${reportArtifact.sha256}`];
  return [
    "M027 cross-entity atomic TinyBank transfer",
    `Project: ${report.projectId}`,
    `Service: ${report.serviceId}`,
    `Semantic artifact: ${report.artifact.id}`,
    `Semantic artifact SHA-256: ${report.artifact.sha256}`,
    `State machine: ${report.selection.stateMachine}`,
    `Balance refinement: ${report.selection.refinement}`,
    `AccountLedger bridge: ${report.selection.bridge}`,
    `Transfer obligation: ${report.selection.obligation}`,
    `M016 evidence: ${report.selection.evidence}`,
    `Transfer command: ${report.selection.command}`,
    `Transfer rejection: ${report.selection.rejection}`,
    `Account query: ${report.selection.accountQuery}`,
    `TotalFunds query: ${report.selection.totalQuery}`,
    `Account subscription: ${report.selection.accountSubscription}`,
    `TotalFunds subscription: ${report.selection.totalSubscription}`,
    `Generated SQLite schema: ${schemaArtifact.path}`,
    `SQLite schema SHA-256: ${schemaArtifact.sha256}`,
    `Generated Effect binding: ${bindingArtifact.path}`,
    `Effect binding SHA-256: ${bindingArtifact.sha256}`,
    `Generated report: ${reportPath}`,
    ...reportSha,
    "Effect binding type-check: passed",
    "Journey:",
    ...formatSnapshot("Initial observations", report.journey.initial),
    ...formatSnapshot("Committed observations", report.journey.committed),
    `  Rejection: ${report.journey.rejection.identity}`,
    `  Source revision after rejection: ${report.journey.rejection.sourceRevisionUnchangedAt}`,
    `  Target revision after rejection: ${report.journey.rejection.targetRevisionUnchangedAt}`,
    `  TotalFunds revision after rejection: ${report.journey.rejection.totalRevisionUnchangedAt}`,
    `  Reactive query runs after rejection: ${report.journey.queryRunsAfterRejection}`,
    ...formatSnapshot("Reopened observations", report.journey.reopened),
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

export interface M027SemanticDatabaseCompileResult {
  readonly selection: M027SemanticDatabaseSelection;
  readonly plan: M027TransferPlan;
  readonly report: M027TransferReport;
  readonly reportSha256: string;
  readonly text: string;
}

/** Compile, type-check, execute, and report one M027 transfer selection. */
export const compileSelectedM027Transfer = (
  root: string,
  selectionPath: string,
  outputDirectory = defaultOutputDirectory,
  handler: M027TransferHandler = defaultM027TransferHandler,
): Effect.Effect<
  M027SemanticDatabaseCompileResult,
  M027SemanticDatabaseFailure,
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
      const encodedSelection = yield* readText(
        resolvedSelectionPath,
        "selection",
        "M027 selection",
      );
      const selection = yield* decodeM027SemanticDatabaseSelection(
        encodedSelection,
        resolvedSelectionPath,
      ).pipe(Effect.mapError(mapTargetFailure));
      const project = yield* compileSelectedProject(root, selection.project).pipe(
        Effect.mapError(mapProjectFailure),
      );
      const plan = yield* deriveM027TransferPlan(
        project.artifact,
        selection,
        resolvedSelectionPath,
      ).pipe(Effect.mapError(mapTargetFailure));
      yield* verifyEvidence(root, selection, plan);

      const schemaSource = renderM027Sql(plan);
      const bindingSource = renderM027EffectBindings(plan);
      const artifactSha256 = yield* digestText(
        encodeSemanticArtifact(project.artifact),
        plan.artifactId,
      );
      const schemaSha256 = yield* digestText(schemaSource, `dataService:${plan.serviceId}.schema`);
      const bindingSha256 = yield* digestText(
        bindingSource,
        `dataService:${plan.serviceId}.binding`,
      );
      const temporaryDirectory = yield* fileSystem
        .makeTempDirectoryScoped({ directory: root, prefix: ".m027-transfer-" })
        .pipe(
          Effect.mapError((error) =>
            failure(
              "filesystem",
              root,
              "temporary-directory",
              `could not create scoped transfer directory: ${String(error)}`,
            ),
          ),
        );
      const temporaryBindingPath = path.join(temporaryDirectory, "bindings.ts");
      yield* writeText(path.join(temporaryDirectory, "schema.sql"), schemaSource);
      yield* writeText(temporaryBindingPath, bindingSource);
      yield* typecheckBinding(root, temporaryBindingPath);

      const databasePath = path.join(temporaryDirectory, "transfer.sqlite");
      const journey = yield* runM027TransferJourney(plan, databasePath, handler).pipe(
        Effect.mapError((error) => mapRuntimeFailure(error, databasePath)),
      );
      const report = yield* makeReport(
        selectionPath,
        outputDirectory,
        selection,
        plan,
        artifactSha256,
        schemaSha256,
        bindingSha256,
        journey,
      );
      const reportJson = `${JSON.stringify(report)}\n`;
      const reportArtifactPath = `${outputDirectory}/${plan.serviceId}/report.json`;
      const reportSha256 = yield* digestText(reportJson, reportArtifactPath);
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
      yield* writeText(path.join(generatedDirectory, "schema.sql"), schemaSource);
      yield* writeText(path.join(generatedDirectory, "bindings.ts"), bindingSource);
      yield* writeText(path.join(generatedDirectory, "report.json"), reportJson);
      return {
        selection,
        plan,
        report,
        reportSha256,
        text: formatM027SemanticDatabaseReport(report, {
          path: reportArtifactPath,
          sha256: reportSha256,
        }),
      };
    }),
  );

/** Run the product M027 route and return only its canonical standard-output text. */
export const runM027TransferCli = (
  root: string,
  selectionPath: string,
  dataDir = defaultOutputDirectory,
): Effect.Effect<
  string,
  M027SemanticDatabaseFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> => compileSelectedM027Transfer(root, selectionPath, dataDir).pipe(Effect.map(({ text }) => text));

/** Format an M027 failure without a stack trace or partial success report. */
export const formatM027SemanticDatabaseFailure = (error: M027SemanticDatabaseFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`, `reason: ${error.reason}`];
  if (error.identity !== undefined) lines.push(`identity: ${error.identity}`);
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};
