import { compareNormalizedCore, encodeCanonicalJson, encodeSemanticArtifact } from "@bang/core";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Crypto, Effect, Encoding, FileSystem, Path, Schema, Stream, type Scope } from "effect";

import {
  compileSelectedProject,
  compileSelectedProjectArtifact,
  type M025ProjectFailure,
} from "./project.ts";
import {
  type M028CompatibleRuntimeJourney,
  type M028EvolutionRuntimeFailure,
  runM028CompatibleRuntimeJourney,
} from "./semantic-database-evolution-runtime.ts";
import {
  M028SemanticEvolutionReportFromJson,
  M028SemanticEvolutionReportSchema,
  classifyM028Compatibility,
  confirmM028CandidatePlan,
  confirmM028Projection,
  decodeM028SemanticEvolutionSelection,
  deriveM028SelectedServiceClosure,
  type M028CompatibilityClassification,
  type M028SemanticEvolutionReport,
  type M028SemanticEvolutionSelection,
  type M028TargetFailure,
} from "./semantic-database-evolution-target.ts";
import {
  verifyM027Evidence,
  type M027SemanticDatabaseFailure,
} from "./semantic-database-transfer.ts";
import {
  decodeM027SemanticDatabaseSelection,
  deriveM027TransferPlan,
  renderM027EffectBindings,
  renderM027Sql,
  type M027SemanticDatabaseSelection,
  type M027TransferPlan,
  type M027TargetFailure,
} from "./semantic-database-transfer-target.ts";

const parseOptions = { onExcessProperty: "error" } as const;
const defaultOutputDirectory = ".bang/semantic-evolution";

export type M028SemanticEvolutionStage =
  | "selection"
  | "baseline"
  | "candidate"
  | "comparison"
  | "compatibility"
  | "evidence"
  | "projection"
  | "filesystem"
  | "runtime"
  | "report";

/** One failure boundary for M028 selection, compatibility, migration, and reporting. */
export class M028SemanticEvolutionFailure extends Schema.TaggedError<M028SemanticEvolutionFailure>()(
  "M028SemanticEvolutionFailure",
  {
    stage: Schema.Literals([
      "selection",
      "baseline",
      "candidate",
      "comparison",
      "compatibility",
      "evidence",
      "projection",
      "filesystem",
      "runtime",
      "report",
    ]),
    path: Schema.String,
    reason: Schema.String,
    identity: Schema.optional(Schema.String),
    invalidatingAddresses: Schema.optional(Schema.Array(Schema.String)),
    message: Schema.String,
  },
) {}

const failure = (
  stage: M028SemanticEvolutionStage,
  path: string,
  reason: string,
  message: string,
  options: {
    readonly identity?: string;
    readonly invalidatingAddresses?: ReadonlyArray<string>;
  } = {},
): M028SemanticEvolutionFailure =>
  new M028SemanticEvolutionFailure({
    stage,
    path,
    reason,
    message,
    ...(options.identity === undefined ? {} : { identity: options.identity }),
    ...(options.invalidatingAddresses === undefined
      ? {}
      : { invalidatingAddresses: options.invalidatingAddresses }),
  });

const identityOptions = (identity: string | undefined): { readonly identity?: string } =>
  identity === undefined ? {} : { identity };

const mapTargetFailure = (error: M028TargetFailure): M028SemanticEvolutionFailure =>
  failure(error.stage, error.path, error.reason, error.message, {
    ...(error.identity === undefined ? {} : { identity: error.identity }),
    ...(error.invalidatingAddresses === undefined
      ? {}
      : { invalidatingAddresses: error.invalidatingAddresses }),
  });

const mapM027TargetFailure = (
  error: M027TargetFailure,
  stage: "baseline" | "candidate",
): M028SemanticEvolutionFailure =>
  failure(
    error.stage === "projection" ? "projection" : stage,
    error.path,
    error.reason,
    error.message,
    identityOptions(error.identity),
  );

const mapProjectFailure = (
  error: M025ProjectFailure,
  stage: "baseline" | "candidate",
): M028SemanticEvolutionFailure =>
  failure(
    stage,
    error.path,
    error.reason ?? error.stage,
    error.message,
    identityOptions(error.identity),
  );

const mapM027Failure = (error: M027SemanticDatabaseFailure): M028SemanticEvolutionFailure =>
  failure("evidence", error.path, error.reason, error.message, identityOptions(error.identity));

const mapRuntimeFailure = (error: M028EvolutionRuntimeFailure): M028SemanticEvolutionFailure =>
  failure("runtime", error.path, error.reason, error.message, identityOptions(error.identity));

const resolveRepositoryPath = Effect.fn("M028.resolveRepositoryPath")(function* (
  root: string,
  relativePath: string,
  stage: M028SemanticEvolutionStage,
): Effect.fn.Return<string, M028SemanticEvolutionFailure, Path.Path> {
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

const readText = Effect.fn("M028.readText")(function* (
  filePath: string,
  stage: M028SemanticEvolutionStage,
  label: string,
): Effect.fn.Return<string, M028SemanticEvolutionFailure, FileSystem.FileSystem> {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem
    .readFileString(filePath)
    .pipe(
      Effect.mapError((error) =>
        failure(stage, filePath, "read", `could not read ${label}: ${String(error)}`),
      ),
    );
});

const writeText = Effect.fn("M028.writeText")(function* (
  filePath: string,
  text: string,
): Effect.fn.Return<void, M028SemanticEvolutionFailure, FileSystem.FileSystem> {
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

const digestText = Effect.fn("M028.digestText")(function* (
  text: string,
  identity: string,
): Effect.fn.Return<string, M028SemanticEvolutionFailure, Crypto.Crypto> {
  const crypto = yield* Crypto.Crypto;
  const digest = yield* crypto
    .digest("SHA-256", new TextEncoder().encode(text))
    .pipe(
      Effect.mapError((error) =>
        failure("projection", identity, "digest", `could not digest material: ${String(error)}`),
      ),
    );
  return Encoding.encodeHex(digest);
});

const runCheckedProcess = Effect.fn("M028.runCheckedProcess")(function* (
  root: string,
  application: string,
  arguments_: ReadonlyArray<string>,
  identityPath: string,
): Effect.fn.Return<
  void,
  M028SemanticEvolutionFailure,
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

const observation = (
  value: M028CompatibleRuntimeJourney["beforeCutover"],
): M028SemanticEvolutionReport["observations"]["beforeCutover"] => ({
  source: {
    accountId: value.source.accountId,
    revision: value.source.revision.toString(),
    balance: value.source.balance.toString(),
  },
  target: {
    accountId: value.target.accountId,
    revision: value.target.revision.toString(),
    balance: value.target.balance.toString(),
  },
  total: {
    revision: value.total.revision.toString(),
    total: value.total.total.toString(),
  },
});

const limitations = [
  "Compatibility is classified only for the selected M027 service closure, not the complete project.",
  "The reuse-schema migration is one scoped SQLite journey, not a general deployment migration.",
  "Reactivity remains process-local and can lose publication if the process fails after commit.",
  "The journey has one client and no concurrent commands.",
  "SQLite evidence does not establish replication, crash recovery, or hardware durability.",
] as const;

const makeReport = Effect.fn("M028.makeReport")(function* (
  selectionPath: string,
  outputDirectory: string,
  selection: M028SemanticEvolutionSelection,
  baselineSelection: M027SemanticDatabaseSelection,
  baselinePlan: M027TransferPlan,
  compatibility: M028CompatibilityClassification,
  baselineArtifactSha256: string,
  baselineNormalizedSha256: string,
  candidateArtifactSha256: string,
  candidateNormalizedSha256: string,
  schemaSha256: string,
  bindingSha256: string,
  journey: M028CompatibleRuntimeJourney,
  m018Identity: string,
  m018Path: string,
): Effect.fn.Return<M028SemanticEvolutionReport, M028SemanticEvolutionFailure> {
  const basePath = `${outputDirectory}/${selection.id}`;
  const reportUnknown = {
    bangSemanticEvolutionReport: 1 as const,
    id: selection.id,
    serviceId: baselinePlan.serviceId,
    baselineVersion: selection.baselineVersion,
    candidateVersion: selection.candidateVersion,
    baselineProjectPath: baselineSelection.project,
    candidateProjectPath: selection.candidate.project,
    digests: {
      baseline: {
        artifactSha256: baselineArtifactSha256,
        normalizedSha256: baselineNormalizedSha256,
      },
      candidate: {
        artifactSha256: candidateArtifactSha256,
        normalizedSha256: candidateNormalizedSha256,
      },
    },
    changedConstructs: compatibility.changedConstructs,
    selectedServiceClosure: compatibility.selectedClosure.map(({ address }) => address),
    compatibility,
    constructDispositions: compatibility.selectedClosure.map((entry) => ({
      address: entry.address,
      disposition: entry.disposition,
      invalidatingAddresses: entry.invalidatedBy,
    })),
    evidenceDispositions: [
      {
        identity: baselinePlan.obligation.id,
        path: baselineSelection.evidence.path,
        disposition: "reused" as const,
        invalidatingAddresses: [],
      },
      {
        identity: m018Identity,
        path: m018Path,
        disposition: "reused" as const,
        invalidatingAddresses: [],
      },
      {
        identity: `${baselinePlan.serviceId}.runtime`,
        path: selectionPath,
        disposition: "reused" as const,
        invalidatingAddresses: [],
      },
    ],
    projectDispositions: [
      {
        identity: baselinePlan.projectId,
        path: baselineSelection.project,
        disposition: "reused" as const,
        reason: "version 1 project artifact is the migration baseline",
      },
      {
        identity: baselinePlan.projectId,
        path: selection.candidate.project,
        disposition: "rebuilt" as const,
        reason:
          "candidate source material changed while selected service conclusions remained reusable",
      },
    ],
    targetDispositions: [
      {
        kind: "sqlite-schema" as const,
        path: `${basePath}/schema.sql`,
        disposition: "reused" as const,
        sha256: schemaSha256,
      },
      {
        kind: "effect-binding" as const,
        path: `${basePath}/bindings.ts`,
        disposition: "reused" as const,
        sha256: bindingSha256,
      },
    ] as const,
    generatedArtifacts: [
      { kind: "sqlite-schema" as const, path: `${basePath}/schema.sql`, sha256: schemaSha256 },
      { kind: "effect-binding" as const, path: `${basePath}/bindings.ts`, sha256: bindingSha256 },
    ] as const,
    storedVersionBefore: journey.versionBeforeCutover,
    storedVersionAfter: journey.versionAfterCutover,
    observations: {
      beforeCutover: observation(journey.beforeCutover),
      afterCutover: observation(journey.afterCutover),
      afterTransfer: observation(journey.afterTransfer),
      finalReopen: observation(journey.reopened),
    },
    postEvolutionTransferAmount: selection.scenario.postEvolutionTransferAmount,
    cleanParity: journey.cleanParity,
    limitations,
  };
  return yield* Schema.decodeUnknownEffect(M028SemanticEvolutionReportSchema)(
    reportUnknown,
    parseOptions,
  ).pipe(
    Effect.mapError((issue) =>
      failure(
        "report",
        selectionPath,
        "report-schema",
        `invalid M028 semantic evolution report: ${String(issue)}`,
      ),
    ),
  );
});

/** Canonical standard output for one accepted M028 evolution. */
export const formatM028SemanticEvolutionReport = (
  report: M028SemanticEvolutionReport,
  reportSha256?: string,
): string => {
  const before = report.observations.beforeCutover;
  const afterCutover = report.observations.afterCutover;
  const afterTransfer = report.observations.afterTransfer;
  const reopened = report.observations.finalReopen;
  return [
    "M028 versioned semantic-service evolution",
    `Evolution: ${report.id}`,
    `Service: ${report.serviceId}`,
    `Semantic version: ${report.baselineVersion} -> ${report.candidateVersion}`,
    `Compatibility: ${report.compatibility.classification}`,
    `Compatibility scope: ${report.compatibility.scope}`,
    `Changed constructs: ${report.changedConstructs.length}`,
    ...report.changedConstructs.map(({ address, status }) => `  ${status}: ${address}`),
    `Selected service conclusions reused: ${report.constructDispositions.filter(({ disposition }) => disposition === "reused").length}/${report.constructDispositions.length}`,
    `Evidence reused: ${report.evidenceDispositions.length}/${report.evidenceDispositions.length}`,
    `SQLite schema: ${report.generatedArtifacts[0].path}`,
    `SQLite schema SHA-256: ${report.generatedArtifacts[0].sha256}`,
    `Effect binding: ${report.generatedArtifacts[1].path}`,
    `Effect binding SHA-256: ${report.generatedArtifacts[1].sha256}`,
    `Stored version before cutover: ${report.storedVersionBefore.semanticVersion}`,
    `Stored version after cutover: ${report.storedVersionAfter.semanticVersion}`,
    `Before cutover: ${before.source.balance}/${before.target.balance}/${before.total.total}`,
    `After cutover: ${afterCutover.source.balance}/${afterCutover.target.balance}/${afterCutover.total.total}`,
    `After transfer: ${afterTransfer.source.balance}/${afterTransfer.target.balance}/${afterTransfer.total.total}`,
    `Final reopen: ${reopened.source.balance}/${reopened.target.balance}/${reopened.total.total}`,
    `Clean parity: ${report.cleanParity ? "match" : "mismatch"}`,
    ...(reportSha256 === undefined ? [] : [`Report SHA-256: ${reportSha256}`]),
    "Limitations:",
    ...report.limitations.map((item) => `  - ${item}`),
  ].join("\n");
};

export interface M028SemanticEvolutionCompileResult {
  readonly selection: M028SemanticEvolutionSelection;
  readonly compatibility: M028CompatibilityClassification;
  readonly report: M028SemanticEvolutionReport;
  readonly reportSha256: string;
  readonly text: string;
}

/** Compile, classify, migrate, reopen, and report one accepted M028 evolution. */
export const compileSelectedM028Evolution = (
  root: string,
  selectionPath: string,
  outputDirectory = defaultOutputDirectory,
): Effect.Effect<
  M028SemanticEvolutionCompileResult,
  M028SemanticEvolutionFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fileSystem = yield* FileSystem.FileSystem;
      const resolvedSelectionPath = yield* resolveRepositoryPath(root, selectionPath, "selection");
      const encodedSelection = yield* readText(
        resolvedSelectionPath,
        "selection",
        "M028 selection",
      );
      const selection = yield* decodeM028SemanticEvolutionSelection(
        encodedSelection,
        resolvedSelectionPath,
      ).pipe(Effect.mapError(mapTargetFailure));

      const resolvedServicePath = yield* resolveRepositoryPath(root, selection.service, "baseline");
      const encodedService = yield* readText(
        resolvedServicePath,
        "baseline",
        "baseline M027 service selection",
      );
      const baselineSelection = yield* decodeM027SemanticDatabaseSelection(
        encodedService,
        resolvedServicePath,
      ).pipe(
        Effect.mapError((error) =>
          failure(
            "baseline",
            error.path,
            error.reason,
            error.message,
            identityOptions(error.identity),
          ),
        ),
      );
      const candidateSelection: M027SemanticDatabaseSelection = {
        ...baselineSelection,
        project: selection.candidate.project,
      };

      const [baselineProject, candidateProject] = yield* Effect.all(
        [
          compileSelectedProject(root, baselineSelection.project).pipe(
            Effect.mapError((error) => mapProjectFailure(error, "baseline")),
          ),
          compileSelectedProjectArtifact(root, selection.candidate.project).pipe(
            Effect.mapError((error) => mapProjectFailure(error, "candidate")),
          ),
        ] as const,
        { concurrency: "unbounded" },
      );
      const baselinePlan = yield* deriveM027TransferPlan(
        baselineProject.artifact,
        baselineSelection,
        resolvedSelectionPath,
      ).pipe(Effect.mapError((error) => mapM027TargetFailure(error, "baseline")));

      const comparison = yield* compareNormalizedCore(
        baselineProject.artifact.normalized,
        candidateProject.artifact.normalized,
      ).pipe(
        Effect.mapError((error) =>
          failure(
            "comparison",
            resolvedSelectionPath,
            error.reason,
            error.message,
            identityOptions(error.address),
          ),
        ),
      );
      const closure = deriveM028SelectedServiceClosure(baselinePlan);
      const compatibility = classifyM028Compatibility(comparison, closure);
      if (compatibility.classification !== "compatible") {
        return yield* failure(
          "compatibility",
          resolvedSelectionPath,
          "incompatible-service",
          "candidate changes invalidate the selected semantic-service closure",
          {
            identity: selection.id,
            invalidatingAddresses: compatibility.invalidatingAddresses,
          },
        );
      }
      const candidatePlan = yield* deriveM027TransferPlan(
        candidateProject.artifact,
        candidateSelection,
        resolvedSelectionPath,
        selection.candidate.accountSource,
      ).pipe(Effect.mapError((error) => mapM027TargetFailure(error, "candidate")));
      yield* confirmM028CandidatePlan(baselinePlan, candidatePlan, resolvedSelectionPath).pipe(
        Effect.mapError(mapTargetFailure),
      );
      yield* verifyM027Evidence(root, baselineSelection, baselinePlan).pipe(
        Effect.mapError(mapM027Failure),
      );
      yield* verifyM027Evidence(root, candidateSelection, candidatePlan).pipe(
        Effect.mapError(mapM027Failure),
      );

      const baselineSql = renderM027Sql(baselinePlan);
      const candidateSql = renderM027Sql(candidatePlan);
      const baselineBinding = renderM027EffectBindings(baselinePlan);
      const candidateBinding = renderM027EffectBindings(candidatePlan);
      yield* confirmM028Projection(
        baselineSql,
        candidateSql,
        baselineBinding,
        candidateBinding,
        resolvedSelectionPath,
      ).pipe(Effect.mapError(mapTargetFailure));

      const [
        baselineArtifactSha256,
        baselineNormalizedSha256,
        candidateArtifactSha256,
        candidateNormalizedSha256,
        schemaSha256,
        bindingSha256,
      ] = yield* Effect.all(
        [
          digestText(encodeSemanticArtifact(baselineProject.artifact), baselinePlan.artifactId),
          digestText(
            encodeCanonicalJson(baselineProject.artifact.normalized),
            `${baselinePlan.artifactId}.normalized`,
          ),
          digestText(encodeSemanticArtifact(candidateProject.artifact), candidatePlan.artifactId),
          digestText(
            encodeCanonicalJson(candidateProject.artifact.normalized),
            `${candidatePlan.artifactId}.normalized`,
          ),
          digestText(candidateSql, `${candidatePlan.serviceId}.schema`),
          digestText(candidateBinding, `${candidatePlan.serviceId}.binding`),
        ] as const,
        { concurrency: "unbounded" },
      );

      const temporaryDirectory = yield* fileSystem
        .makeTempDirectoryScoped({ directory: root, prefix: ".m028-evolution-" })
        .pipe(
          Effect.mapError((error) =>
            failure(
              "filesystem",
              root,
              "temporary-directory",
              `could not create scoped evolution directory: ${String(error)}`,
            ),
          ),
        );
      const temporaryBindingPath = path.join(temporaryDirectory, "bindings.ts");
      yield* writeText(temporaryBindingPath, candidateBinding);
      yield* typecheckBinding(root, temporaryBindingPath);

      const journey = yield* runM028CompatibleRuntimeJourney({
        baselinePlan,
        candidatePlan,
        databasePath: path.join(temporaryDirectory, "evolution.sqlite"),
        baselineArtifactSha256,
        baselineNormalizedSha256,
        candidateArtifactSha256,
        candidateNormalizedSha256,
        postEvolutionTransferAmount: BigInt(selection.scenario.postEvolutionTransferAmount),
      }).pipe(Effect.mapError(mapRuntimeFailure));

      const m018 = candidateProject.selection.evidence[0]!;
      const report = yield* makeReport(
        selectionPath,
        outputDirectory,
        selection,
        baselineSelection,
        baselinePlan,
        compatibility,
        baselineArtifactSha256,
        baselineNormalizedSha256,
        candidateArtifactSha256,
        candidateNormalizedSha256,
        schemaSha256,
        bindingSha256,
        journey,
        m018.id,
        m018.path,
      );
      const reportText = yield* Schema.encodeEffect(M028SemanticEvolutionReportFromJson)(
        report,
      ).pipe(
        Effect.mapError((issue) =>
          failure(
            "report",
            resolvedSelectionPath,
            "report-encoding",
            `could not encode M028 report: ${String(issue)}`,
          ),
        ),
      );
      const reportJson = `${reportText}\n`;
      const reportArtifactPath = `${outputDirectory}/${selection.id}/report.json`;
      const reportSha256 = yield* digestText(reportJson, reportArtifactPath);

      const resolvedOutputDirectory = yield* resolveRepositoryPath(
        root,
        outputDirectory,
        "filesystem",
      );
      const generatedDirectory = path.join(resolvedOutputDirectory, selection.id);
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
      yield* writeText(path.join(generatedDirectory, "schema.sql"), candidateSql);
      yield* writeText(path.join(generatedDirectory, "bindings.ts"), candidateBinding);
      yield* writeText(path.join(generatedDirectory, "report.json"), reportJson);

      return {
        selection,
        compatibility,
        report,
        reportSha256,
        text: formatM028SemanticEvolutionReport(report, reportSha256),
      };
    }),
  );

/** Run the product M028 route and return its canonical standard-output text. */
export const runM028EvolutionCli = (
  root: string,
  selectionPath: string,
  outputDirectory = defaultOutputDirectory,
): Effect.Effect<
  string,
  M028SemanticEvolutionFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  compileSelectedM028Evolution(root, selectionPath, outputDirectory).pipe(
    Effect.map(({ text }) => text),
  );

/** Format a typed M028 failure without a stack trace or partial success report. */
export const formatM028SemanticEvolutionFailure = (error: M028SemanticEvolutionFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`, `reason: ${error.reason}`];
  if (error.identity !== undefined) lines.push(`identity: ${error.identity}`);
  if (error.invalidatingAddresses !== undefined && error.invalidatingAddresses.length > 0) {
    lines.push("invalidating addresses:");
    lines.push(...error.invalidatingAddresses.map((address) => `  - ${address}`));
  }
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};
