import {
  M031TargetQualificationObservations,
  type M031TargetQualificationEvidence,
} from "@bang/evidence";
import { encodeCanonicalJson } from "@bang/core";
import { PlanningReportSchema } from "@bang/planning";
import { makeGleamExactOneAssemblyMaterials } from "@bang/target-gleam";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Crypto, Effect, Encoding, FileSystem, Path, Schema, Stream, type Scope } from "effect";

import { compileSelectedPlanStaged, type PlanCompileStagedResult } from "./plan.ts";
import { M031ProbeObservationFromJson, normalizeM031ProbeObservation } from "./classify.ts";
import {
  publishAtomically,
  type PublicationFailure,
  type PublicationEntry,
} from "./publication.ts";

const parseOptions = { onExcessProperty: "error" } as const;
const textEncoder = new TextEncoder();

const repositoryRelativePath = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(
      (value) =>
        value.length > 0 &&
        !value.includes("\\") &&
        !value.includes("\u0000") &&
        !value.startsWith("/") &&
        !/^[A-Za-z]:/u.test(value) &&
        value
          .split("/")
          .every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
      { expected: "a repository-relative path without traversal segments" },
    ),
  ),
);

const safeIdentity = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value), {
      expected: "a safe non-empty identifier",
    }),
  ),
);

const sha256 = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[0-9a-f]{64}$/u.test(value), {
      expected: "a lowercase SHA-256 digest",
    }),
  ),
);

const AssemblyArtifactSchema = Schema.Struct({
  kind: Schema.Literal("escript"),
  entry: Schema.Literal("main"),
  path: repositoryRelativePath,
  sha256,
}).annotate({ parseOptions });

const AssemblyMaterialRoleSchema = Schema.Literals([
  "qualified-generated",
  "assembled-entry",
  "assembly-configuration",
  "third-party-lock",
  "compiled-artifact",
  "toolchain-definition",
  "assembly-canonicalizer",
]);

const AssemblyMaterialSchema = Schema.Struct({
  role: AssemblyMaterialRoleSchema,
  path: repositoryRelativePath,
  sha256,
}).annotate({ parseOptions });

const AssemblyObservationSchema = Schema.Struct({
  exitCode: Schema.Literal(0),
  stderr: Schema.Literal(""),
  observation: M031TargetQualificationObservations,
}).annotate({ parseOptions });

const AssemblyToolchainSchema = Schema.Struct({
  definition: Schema.Struct({ path: repositoryRelativePath, sha256 }),
  nixpkgs: Schema.Struct({ revision: Schema.String, sha256: Schema.String }),
  gleam: Schema.String,
  otp: Schema.String,
}).annotate({ parseOptions });

/** Strict M033 assembly selection input. */
export const AssemblySelectionSchema = Schema.Struct({
  bangAssembly: Schema.Literal(1),
  id: safeIdentity,
  planSelection: repositoryRelativePath,
  artifact: Schema.Struct({
    kind: Schema.Literal("escript"),
    entry: Schema.Literal("main"),
  }).annotate({ parseOptions }),
}).annotate({ parseOptions });

export const AssemblySelectionFromJson = Schema.fromJsonString(AssemblySelectionSchema);
export type AssemblySelection = typeof AssemblySelectionSchema.Type;

/** Strict M033 report persisted with the complete published closure. */
export const AssemblyReportSchema = Schema.Struct({
  bangAssembly: Schema.Literal(1),
  id: safeIdentity,
  planSelection: repositoryRelativePath,
  plan: PlanningReportSchema,
  selectedCandidate: Schema.Struct({
    target: Schema.Literal("gleam-beam"),
    realization: Schema.String,
    artifactId: Schema.String,
    artifactFormat: Schema.Literal("bangSemanticArtifact:1"),
    requirementAddress: Schema.String,
  }).annotate({ parseOptions }),
  qualification: Schema.Struct({
    selectionPath: repositoryRelativePath,
    evidencePath: repositoryRelativePath,
    evidenceSha256: sha256,
    generatedBoundaryPath: repositoryRelativePath,
    generatedBoundarySha256: sha256,
  }).annotate({ parseOptions }),
  materials: Schema.NonEmptyArray(AssemblyMaterialSchema),
  toolchain: AssemblyToolchainSchema,
  execution: AssemblyObservationSchema,
  artifact: AssemblyArtifactSchema,
  assumptions: Schema.NonEmptyArray(Schema.String),
  limitations: Schema.NonEmptyArray(Schema.String),
  lifetime: Schema.String,
  invalidators: Schema.NonEmptyArray(Schema.String),
}).annotate({ parseOptions });
export type AssemblyReport = typeof AssemblyReportSchema.Type;

export const AssemblyStageSchema = Schema.Literals([
  "selection",
  "planning",
  "material",
  "toolchain",
  "build",
  "execution",
  "publication",
]);
export type AssemblyStage = typeof AssemblyStageSchema.Type;

export const AssemblyReasonSchema = Schema.String;

/** A typed, schema-visible M033 failure. */
export class AssemblyFailure extends Schema.TaggedError<AssemblyFailure>()("AssemblyFailure", {
  stage: AssemblyStageSchema,
  path: Schema.String,
  reason: AssemblyReasonSchema,
  message: Schema.String,
  address: Schema.optional(Schema.String),
}) {}

const failure = (
  stage: AssemblyStage,
  path: string,
  reason: string,
  message: string,
  address?: string,
): AssemblyFailure =>
  new AssemblyFailure({
    stage,
    path,
    reason,
    message,
    ...(address === undefined ? {} : { address }),
  });

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;

const stringField = (value: unknown, key: string): string | undefined => {
  const candidate = field(value, key);
  return typeof candidate === "string" ? candidate : undefined;
};

const fail = (
  stage: AssemblyStage,
  path: string,
  reason: string,
  message: string,
  address?: string,
): Effect.Effect<never, AssemblyFailure> =>
  Effect.fail(failure(stage, path, reason, message, address));

const sha256Bytes = Effect.fn("bangAssembly.sha256Bytes")(function* (bytes: Uint8Array) {
  const crypto = yield* Crypto.Crypto;
  const digest = yield* crypto
    .digest("SHA-256", bytes)
    .pipe(Effect.mapError((error) => errorMessage(error)));
  return Encoding.encodeHex(digest);
});

const readBytes = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  relativePath: string,
  stage: AssemblyStage,
  reason: string,
): Effect.Effect<Uint8Array, AssemblyFailure> =>
  fileSystem
    .readFile(path.resolve(root, relativePath))
    .pipe(
      Effect.mapError((error) =>
        failure(
          stage,
          relativePath,
          reason,
          `could not read ${relativePath}: ${errorMessage(error)}`,
        ),
      ),
    );

const writeBytes = (
  fileSystem: FileSystem.FileSystem,
  absolutePath: string,
  bytes: Uint8Array,
  diagnosticPath: string,
  stage: AssemblyStage,
  reason: string,
): Effect.Effect<void, AssemblyFailure> =>
  fileSystem
    .writeFile(absolutePath, bytes)
    .pipe(
      Effect.mapError((error) =>
        failure(
          stage,
          diagnosticPath,
          reason,
          `could not write ${diagnosticPath}: ${errorMessage(error)}`,
        ),
      ),
    );

const writeString = (
  fileSystem: FileSystem.FileSystem,
  absolutePath: string,
  value: string,
  diagnosticPath: string,
  stage: AssemblyStage,
  reason: string,
): Effect.Effect<void, AssemblyFailure> =>
  writeBytes(fileSystem, absolutePath, textEncoder.encode(value), diagnosticPath, stage, reason);

export const runAssemblyProcess = (
  command: string,
  arguments_: ReadonlyArray<string>,
  cwd: string,
  env: Record<string, string | undefined>,
  stage: AssemblyStage,
  reason: string,
  diagnosticPath: string,
): Effect.Effect<
  {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: ChildProcessSpawner.ExitCode;
  },
  AssemblyFailure,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make(command, [...arguments_], {
      cwd,
      env,
      extendEnv: true,
      stdout: "pipe",
      stderr: "pipe",
    }).pipe(
      Effect.mapError((error) =>
        failure(
          stage,
          diagnosticPath,
          reason,
          `could not start ${command}: ${errorMessage(error)}`,
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
          diagnosticPath,
          reason,
          `could not collect ${command} output: ${errorMessage(error)}`,
        ),
      ),
    );
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* fail(
        stage,
        diagnosticPath,
        reason,
        stderr.trim() || `${command} exited unsuccessfully`,
      );
    }
    return { stdout, stderr, exitCode };
  });

const deterministicEnvironment = (): Record<string, string> => ({
  ERL_COMPILER_OPTIONS: "deterministic",
  SOURCE_DATE_EPOCH: "315532800",
  TZ: "UTC",
  LC_ALL: "C",
  LANG: "C",
  GIT_CONFIG_NOSYSTEM: "1",
});

const toolchainRelativePath = "nix/gleam.nix";

export const extractToolchainPin = (
  bytes: Uint8Array,
): Effect.Effect<{ readonly revision: string; readonly sha256: string }, AssemblyFailure> => {
  const match = /nixpkgsRevision = "([0-9a-f]{40})";[\s\S]*?nixpkgsSha256 = "([0-9a-z]+)";/u.exec(
    new TextDecoder().decode(bytes),
  );
  const revision = match?.[1];
  const digest = match?.[2];
  return revision === undefined || digest === undefined
    ? fail(
        "toolchain",
        toolchainRelativePath,
        "toolchain-unavailable",
        "nix/gleam.nix does not declare a pinned nixpkgs revision and digest",
      )
    : Effect.succeed({ revision, sha256: digest });
};

const mapPlanningFailure = (selectionPath: string, error: unknown): AssemblyFailure =>
  failure(
    "planning",
    selectionPath,
    "planning-failed",
    stringField(error, "message") ?? String(error),
    stringField(error, "address"),
  );

const decodeSelection = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  selectionPath: string,
): Effect.Effect<AssemblySelection, AssemblyFailure> =>
  Effect.gen(function* () {
    if (
      selectionPath.length === 0 ||
      selectionPath.includes("\\") ||
      selectionPath.includes("\u0000") ||
      selectionPath.startsWith("/") ||
      /^[A-Za-z]:/u.test(selectionPath) ||
      !selectionPath
        .split("/")
        .every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    ) {
      return yield* fail(
        "selection",
        selectionPath,
        "invalid-selection",
        "assembly selection path must be repository-relative without traversal segments",
      );
    }
    const absolute = path.resolve(root, selectionPath);
    const encoded = yield* fileSystem
      .readFileString(absolute)
      .pipe(
        Effect.mapError((error) =>
          failure(
            "selection",
            selectionPath,
            "invalid-selection",
            `could not read assembly selection: ${errorMessage(error)}`,
          ),
        ),
      );
    return yield* Schema.decodeEffect(AssemblySelectionFromJson)(encoded, parseOptions).pipe(
      Effect.mapError((issue) =>
        failure(
          "selection",
          selectionPath,
          "invalid-selection",
          `invalid assembly selection: ${String(issue)}`,
        ),
      ),
    );
  });

export const selectedGleamEvidence = (
  staged: PlanCompileStagedResult,
): Effect.Effect<
  {
    readonly evidence: (typeof staged.qualification.evidence)[number];
    readonly evidencePath: string;
    readonly generatedPath: string;
    readonly generatedBoundaryPath: string;
    readonly generatedBytes: Uint8Array;
    readonly generatedSha256: string;
    readonly evidenceSha256: string;
  },
  AssemblyFailure,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    if (staged.report._tag !== "Selected") {
      return yield* fail(
        "planning",
        staged.selection.id,
        staged.report._tag === "Incomparable" ? "incomparable-plan" : "no-plan",
        `M032 planning returned ${staged.report._tag}; one selected plan is required`,
      );
    }
    if (staged.report.plan.candidate.target !== "gleam-beam") {
      return yield* fail(
        "planning",
        staged.selection.id,
        "unsupported-selected-target",
        `M032 selected target ${staged.report.plan.candidate.target} is not assembleable`,
        staged.report.plan.candidate.target,
      );
    }
    const evidence = staged.qualification.evidence.find(
      ({ targetId }) => targetId === "gleam-beam",
    );
    if (evidence === undefined) {
      return yield* fail(
        "material",
        staged.selection.qualificationSelection,
        "material-mismatch",
        "selected Gleam plan has no checked M031 evidence",
      );
    }
    const generated = evidence.materials.find(({ role }) => role === "generated-gleam-boundary");
    if (generated === undefined) {
      return yield* fail(
        "material",
        staged.selection.qualificationSelection,
        "material-mismatch",
        "checked M031 Gleam evidence has no generated boundary material",
      );
    }
    const generatedPathPrefix = `.bang/qualifications/${staged.qualification.selection.id}/gleam-beam/`;
    if (!generated.path.startsWith(generatedPathPrefix)) {
      return yield* fail(
        "material",
        generated.path,
        "material-mismatch",
        "checked M031 generated boundary is outside the selected Gleam staging directory",
      );
    }
    const generatedBoundaryPath = generated.path.slice(generatedPathPrefix.length);
    const generatedEntry = staged.publicationEntries.find(({ path }) => path === generated.path);
    if (generatedEntry === undefined) {
      return yield* fail(
        "material",
        generated.path,
        "material-mismatch",
        "checked M031 generated boundary is absent from staged publication",
      );
    }
    const generatedSha256 = yield* sha256Bytes(generatedEntry.bytes).pipe(
      Effect.mapError((error) =>
        failure("material", generated.path, "material-digest-failed", errorMessage(error)),
      ),
    );
    if (generatedSha256 !== generated.sha256) {
      return yield* fail(
        "material",
        generated.path,
        "material-mismatch",
        `checked M031 boundary digest ${generated.sha256} differs from staged bytes ${generatedSha256}`,
      );
    }
    const evidencePath = `.bang/qualifications/${staged.qualification.selection.id}/gleam-beam/evidence.json`;
    const evidenceEntry = staged.publicationEntries.find(({ path }) => path === evidencePath);
    if (evidenceEntry === undefined) {
      return yield* fail(
        "material",
        evidencePath,
        "material-mismatch",
        "selected checked M031 evidence is absent from staged publication",
      );
    }
    const evidenceSha256 = yield* sha256Bytes(evidenceEntry.bytes).pipe(
      Effect.mapError((error) =>
        failure("material", evidencePath, "material-digest-failed", errorMessage(error)),
      ),
    );
    return {
      evidence,
      evidencePath,
      generatedPath: generated.path,
      generatedBoundaryPath,
      generatedBytes: generatedEntry.bytes,
      generatedSha256,
      evidenceSha256,
    };
  });

const materialDigest = (
  bytes: Uint8Array,
  path: string,
): Effect.Effect<
  { readonly path: string; readonly sha256: string },
  AssemblyFailure,
  Crypto.Crypto
> =>
  sha256Bytes(bytes).pipe(
    Effect.map((digest) => ({ path, sha256: digest })),
    Effect.mapError((error) =>
      failure("material", path, "material-digest-failed", errorMessage(error)),
    ),
  );

export const findRawExport = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  projectRoot: string,
): Effect.Effect<string, AssemblyFailure> =>
  Effect.gen(function* () {
    const preferred = [
      path.join(projectRoot, "main"),
      path.join(projectRoot, "main.escript"),
      path.join(projectRoot, "build", "export", "main"),
      path.join(projectRoot, "build", "export", "main.escript"),
    ];
    for (const candidate of preferred) {
      const exists = yield* fileSystem
        .exists(candidate)
        .pipe(
          Effect.mapError((error) =>
            failure(
              "build",
              "build/export",
              "export-failed",
              `could not inspect Gleam export: ${errorMessage(error)}`,
            ),
          ),
        );
      if (exists) return candidate;
    }
    const files = yield* fileSystem
      .readDirectory(projectRoot, { recursive: true })
      .pipe(
        Effect.mapError((error) =>
          failure(
            "build",
            "build/export",
            "export-failed",
            `could not inspect Gleam export: ${errorMessage(error)}`,
          ),
        ),
      );
    const matches = files
      .map((file) => (path.isAbsolute(file) ? file : path.resolve(projectRoot, file)))
      .filter((file) => {
        const relative = path.relative(projectRoot, file).replaceAll("\\", "/");
        return (
          relative.startsWith("build/export/") &&
          (relative.endsWith("/main") || relative.endsWith("/main.escript"))
        );
      })
      .toSorted();
    const candidate = matches[0];
    if (candidate === undefined) {
      return yield* fail(
        "build",
        "build/export",
        "export-failed",
        "Gleam did not produce a main escript",
      );
    }
    return candidate;
  });

export const decodeAssemblyObservation = (
  stdout: string,
  stderr: string,
  evidence: Pick<M031TargetQualificationEvidence, "observations">,
  diagnosticPath: string,
): Effect.Effect<M031TargetQualificationObservations, AssemblyFailure> =>
  Effect.gen(function* () {
    if (stderr.length !== 0) {
      return yield* fail(
        "execution",
        diagnosticPath,
        "execution-failed",
        "canonical escript wrote to standard error",
      );
    }
    const marker = "BANG_M031_RESULT|";
    const lines = stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.startsWith(marker));
    if (lines.length !== 1) {
      return yield* fail(
        "execution",
        diagnosticPath,
        "execution-failed",
        "canonical escript did not emit exactly one M031 observation",
      );
    }
    const payload = lines[0]!.slice(marker.length);
    const rawObservation = yield* Schema.decodeEffect(M031ProbeObservationFromJson)(
      payload,
      parseOptions,
    ).pipe(
      Effect.mapError((issue) =>
        failure(
          "execution",
          diagnosticPath,
          "execution-failed",
          `invalid M031 observation: ${String(issue)}`,
        ),
      ),
    );
    const observation = yield* Schema.decodeEffect(M031TargetQualificationObservations)(
      normalizeM031ProbeObservation(rawObservation),
      parseOptions,
    ).pipe(
      Effect.mapError((issue) =>
        failure(
          "execution",
          diagnosticPath,
          "execution-failed",
          `invalid normalized M031 observation: ${String(issue)}`,
        ),
      ),
    );
    if (encodeCanonicalJson(observation) !== encodeCanonicalJson(evidence.observations)) {
      return yield* fail(
        "execution",
        diagnosticPath,
        "observation-mismatch",
        "canonical escript observation differs from selected M031 evidence",
      );
    }
    return observation;
  });

export interface AssemblyCompileOptions {
  /** Publication is the only injectable side effect, for rollback tests. */
  readonly publish?: (
    root: string,
    entries: ReadonlyArray<PublicationEntry>,
  ) => Effect.Effect<void, PublicationFailure, FileSystem.FileSystem | Path.Path>;
}

export interface AssemblyCompileResult {
  readonly report: AssemblyReport;
  readonly text: string;
}

/** Stage, execute, and atomically publish one selected Gleam M033 assembly. */
export const compileSelectedAssembly = (
  root: string,
  selectionPath: string,
  options: AssemblyCompileOptions = {},
): Effect.Effect<
  AssemblyCompileResult,
  AssemblyFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const selection = yield* decodeSelection(fileSystem, path, root, selectionPath);
      const staged = yield* compileSelectedPlanStaged(root, selection.planSelection).pipe(
        Effect.mapError((error) => mapPlanningFailure(selection.planSelection, error)),
      );
      const evidenceMaterial = yield* selectedGleamEvidence(staged);
      if (staged.report._tag !== "Selected") {
        return yield* fail(
          "planning",
          staged.selection.id,
          staged.report._tag === "Incomparable" ? "incomparable-plan" : "no-plan",
          `M032 planning returned ${staged.report._tag}; one selected plan is required`,
        );
      }
      const selectedReport = staged.report;

      const toolchainBytes = yield* readBytes(
        fileSystem,
        path,
        root,
        toolchainRelativePath,
        "toolchain",
        "toolchain-unavailable",
      );
      const toolchainDigest = yield* materialDigest(toolchainBytes, toolchainRelativePath);
      const toolchainPin = yield* extractToolchainPin(toolchainBytes);
      const temporaryRoot = yield* fileSystem
        .makeTempDirectoryScoped({ directory: root, prefix: ".m033-assembly-" })
        .pipe(
          Effect.mapError((error) =>
            failure(
              "build",
              selectionPath,
              "export-failed",
              `could not create assembly staging directory: ${errorMessage(error)}`,
            ),
          ),
        );
      const projectRoot = temporaryRoot;
      const sourceDirectory = path.join(projectRoot, "src", "bang");
      yield* fileSystem
        .makeDirectory(sourceDirectory, { recursive: true })
        .pipe(
          Effect.mapError((error) =>
            failure(
              "build",
              selectionPath,
              "export-failed",
              `could not create assembly source directory: ${errorMessage(error)}`,
            ),
          ),
        );
      yield* fileSystem
        .makeDirectory(path.join(projectRoot, "src"), { recursive: true })
        .pipe(
          Effect.mapError((error) =>
            failure(
              "build",
              selectionPath,
              "export-failed",
              `could not create assembly entry directory: ${errorMessage(error)}`,
            ),
          ),
        );

      const materials = yield* Effect.try({
        try: () => makeGleamExactOneAssemblyMaterials(evidenceMaterial.generatedBoundaryPath),
        catch: (error) =>
          failure(
            "material",
            evidenceMaterial.generatedPath,
            "material-mismatch",
            errorMessage(error),
          ),
      });
      yield* writeString(
        fileSystem,
        path.join(projectRoot, materials.paths.config),
        materials.gleamToml,
        materials.paths.config,
        "build",
        "export-failed",
      );
      yield* writeString(
        fileSystem,
        path.join(projectRoot, materials.paths.manifest),
        materials.manifestToml,
        materials.paths.manifest,
        "build",
        "export-failed",
      );
      yield* writeBytes(
        fileSystem,
        path.join(projectRoot, materials.paths.generatedBoundary),
        evidenceMaterial.generatedBytes,
        materials.paths.generatedBoundary,
        "build",
        "export-failed",
      );
      yield* writeString(
        fileSystem,
        path.join(projectRoot, materials.paths.entry),
        materials.mainGleam,
        materials.paths.entry,
        "build",
        "export-failed",
      );
      yield* writeString(
        fileSystem,
        path.join(projectRoot, materials.paths.canonicalizer),
        materials.canonicalizerEscript,
        materials.paths.canonicalizer,
        "build",
        "export-failed",
      );

      const configDigest = yield* materialDigest(
        textEncoder.encode(materials.gleamToml),
        materials.paths.config,
      );
      const manifestDigest = yield* materialDigest(
        textEncoder.encode(materials.manifestToml),
        materials.paths.manifest,
      );
      const entryDigest = yield* materialDigest(
        textEncoder.encode(materials.mainGleam),
        materials.paths.entry,
      );
      const canonicalizerDigest = yield* materialDigest(
        textEncoder.encode(materials.canonicalizerEscript),
        materials.paths.canonicalizer,
      );

      const toolchainPath = path.resolve(root, toolchainRelativePath);
      const environment = deterministicEnvironment();
      const gleamVersionProcess = yield* runAssemblyProcess(
        "nix",
        ["shell", "-f", toolchainPath, "-c", "gleam", "--version"],
        projectRoot,
        environment,
        "toolchain",
        "toolchain-unavailable",
        toolchainRelativePath,
      );
      const otpVersionProcess = yield* runAssemblyProcess(
        "nix",
        [
          "shell",
          "-f",
          toolchainPath,
          "-c",
          "erl",
          "-noshell",
          "-eval",
          'io:format("~s", [erlang:system_info(otp_release)]), halt().',
        ],
        projectRoot,
        environment,
        "toolchain",
        "toolchain-unavailable",
        toolchainRelativePath,
      );

      yield* runAssemblyProcess(
        "nix",
        ["shell", "-f", toolchainPath, "-c", "gleam", "export", "escript"],
        projectRoot,
        environment,
        "build",
        "export-failed",
        selectionPath,
      );
      const rawExportPath = yield* findRawExport(fileSystem, path, projectRoot);
      const canonicalPath = path.join(projectRoot, "canonical", "exact_one");
      yield* fileSystem
        .makeDirectory(path.dirname(canonicalPath), { recursive: true })
        .pipe(
          Effect.mapError((error) =>
            failure(
              "build",
              selectionPath,
              "export-failed",
              `could not create canonical artifact directory: ${errorMessage(error)}`,
            ),
          ),
        );
      yield* runAssemblyProcess(
        "nix",
        [
          "shell",
          "-f",
          toolchainPath,
          "-c",
          "escript",
          path.join(projectRoot, materials.paths.canonicalizer),
          rawExportPath,
          canonicalPath,
        ],
        projectRoot,
        environment,
        "build",
        "export-failed",
        materials.paths.canonicalizer,
      );
      const artifactBytes = yield* fileSystem
        .readFile(canonicalPath)
        .pipe(
          Effect.mapError((error) =>
            failure(
              "build",
              selectionPath,
              "export-failed",
              `could not read canonical escript: ${errorMessage(error)}`,
            ),
          ),
        );
      if (artifactBytes.length === 0) {
        return yield* fail("build", selectionPath, "export-failed", "canonical escript is empty");
      }

      const executionProcess = yield* runAssemblyProcess(
        "nix",
        ["shell", "-f", toolchainPath, "-c", "escript", canonicalPath],
        projectRoot,
        environment,
        "execution",
        "execution-failed",
        selectionPath,
      );
      const observation = yield* decodeAssemblyObservation(
        executionProcess.stdout,
        executionProcess.stderr,
        evidenceMaterial.evidence,
        selectionPath,
      );
      const artifactDigest = yield* materialDigest(
        artifactBytes,
        `.bang/assemblies/${selection.id}/bin/exact_one`,
      );
      const assemblyBase = `.bang/assemblies/${selection.id}`;
      const artifactPath = `${assemblyBase}/bin/exact_one`;
      const reportValue = {
        bangAssembly: 1 as const,
        id: selection.id,
        planSelection: selection.planSelection,
        plan: staged.report,
        selectedCandidate: {
          target: selectedReport.plan.candidate.target,
          realization: selectedReport.plan.candidate.realization,
          artifactId: selectedReport.plan.candidate.artifactId,
          artifactFormat: selectedReport.plan.candidate.artifactFormat,
          requirementAddress: selectedReport.plan.candidate.requirementAddress,
        },
        qualification: {
          selectionPath: staged.selection.qualificationSelection,
          evidencePath: evidenceMaterial.evidencePath,
          evidenceSha256: evidenceMaterial.evidenceSha256,
          generatedBoundaryPath: evidenceMaterial.generatedPath,
          generatedBoundarySha256: evidenceMaterial.generatedSha256,
        },
        materials: [
          {
            role: "qualified-generated" as const,
            path: `${assemblyBase}/${materials.paths.generatedBoundary}`,
            sha256: evidenceMaterial.generatedSha256,
          },
          {
            role: "assembled-entry" as const,
            path: `${assemblyBase}/${materials.paths.entry}`,
            sha256: entryDigest.sha256,
          },
          {
            role: "assembly-configuration" as const,
            path: `${assemblyBase}/${materials.paths.config}`,
            sha256: configDigest.sha256,
          },
          {
            role: "third-party-lock" as const,
            path: `${assemblyBase}/${materials.paths.manifest}`,
            sha256: manifestDigest.sha256,
          },
          { role: "compiled-artifact" as const, path: artifactPath, sha256: artifactDigest.sha256 },
          {
            role: "toolchain-definition" as const,
            path: toolchainRelativePath,
            sha256: toolchainDigest.sha256,
          },
          {
            role: "assembly-canonicalizer" as const,
            path: `${assemblyBase}/${materials.paths.canonicalizer}`,
            sha256: canonicalizerDigest.sha256,
          },
        ].toSorted((left, right) => left.path.localeCompare(right.path)),
        toolchain: {
          definition: { path: toolchainRelativePath, sha256: toolchainDigest.sha256 },
          nixpkgs: toolchainPin,
          gleam: gleamVersionProcess.stdout.trim(),
          otp: otpVersionProcess.stdout.trim(),
        },
        execution: { exitCode: 0 as const, stderr: "" as const, observation },
        artifact: {
          kind: "escript" as const,
          entry: "main" as const,
          path: artifactPath,
          sha256: artifactDigest.sha256,
        },
        assumptions: [
          "the staged Gleam boundary bytes are exactly the M031-qualified generated material",
          "the host supplies a compatible Erlang runtime through the pinned Nix toolchain",
        ],
        limitations: [
          "one bounded runtime observation does not establish universal realization correctness",
          "the artifact does not establish durable exactly-once delivery or distributed coordination",
          "the artifact is not deployment-ready or a security or performance guarantee",
        ],
        lifetime:
          "valid while checked, generated, dependency, compiler, OTP, and Nix materials remain unchanged",
        invalidators: [
          "checked Core declaration, requirement, or selected plan changes",
          "M031 generated Gleam boundary or evidence changes",
          "Gleam dependencies, compiler, OTP, or Nix toolchain changes",
        ],
      };
      const report = yield* Schema.decodeUnknownEffect(AssemblyReportSchema)(
        reportValue,
        parseOptions,
      ).pipe(
        Effect.mapError((issue) =>
          failure(
            "build",
            selectionPath,
            "invalid-report",
            `invalid assembly report: ${String(issue)}`,
          ),
        ),
      );
      const reportEncoded = `${encodeCanonicalJson(report)}\n`;
      const publicationEntries: Array<PublicationEntry> = [
        ...staged.publicationEntries,
        {
          path: `${assemblyBase}/${materials.paths.config}`,
          bytes: textEncoder.encode(materials.gleamToml),
        },
        {
          path: `${assemblyBase}/${materials.paths.manifest}`,
          bytes: textEncoder.encode(materials.manifestToml),
        },
        {
          path: `${assemblyBase}/${materials.paths.generatedBoundary}`,
          bytes: new Uint8Array(evidenceMaterial.generatedBytes),
        },
        {
          path: `${assemblyBase}/${materials.paths.canonicalizer}`,
          bytes: textEncoder.encode(materials.canonicalizerEscript),
        },
        {
          path: `${assemblyBase}/${materials.paths.entry}`,
          bytes: textEncoder.encode(materials.mainGleam),
        },
        { path: artifactPath, bytes: new Uint8Array(artifactBytes) },
        { path: `${assemblyBase}/report.json`, bytes: textEncoder.encode(reportEncoded) },
      ];
      const publish = options.publish ?? publishAtomically;
      yield* publish(root, publicationEntries).pipe(
        Effect.mapError((error) =>
          failure("publication", error.path, "publication-failed", error.message),
        ),
      );
      const text = [
        "M033 selected realization assembly",
        `Assembly: ${selection.id}`,
        `Target: ${selectedReport.plan.candidate.target}`,
        `Artifact: ${artifactPath}`,
        `Report: ${assemblyBase}/report.json`,
        `Run: escript ${artifactPath}`,
        `Artifact SHA-256: ${artifactDigest.sha256}`,
        `Qualified boundary: ${evidenceMaterial.generatedPath} [${evidenceMaterial.generatedSha256}]`,
        `Evidence: ${evidenceMaterial.evidencePath} [${evidenceMaterial.evidenceSha256}]`,
        "Evidence scope: one bounded runtime observation",
        `Gleam: ${gleamVersionProcess.stdout.trim()}`,
        `OTP: ${otpVersionProcess.stdout.trim()}`,
        "Limitations: universal correctness, durable exactly-once delivery, and deployment readiness are not established",
      ].join("\n");
      return { report, text };
    }),
  );

export const formatAssemblyFailure = (error: AssemblyFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`, `reason: ${error.reason}`];
  if (error.address !== undefined) lines.push(`address: ${error.address}`);
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};
