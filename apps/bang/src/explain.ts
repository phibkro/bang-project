import {
  CoreDocumentFromJson,
  encodeSemanticArtifact,
  produceSemanticArtifact,
  type CheckedCoreDocument,
  type CoreDocument,
  type NormalizationProvenance,
  type SemanticArtifact,
  validateCore,
} from "@bang/core";
import { sourceToCore } from "@bang/surface";
import {
  consumeExactOneCapabilityExecution,
  type ExactOneCapabilityExecutionResult,
} from "@bang/theories";
import { type Crypto, Effect, FileSystem, Path, Schema } from "effect";

const parseOptions = { onExcessProperty: "error" } as const;

const isRepositoryRelativePath = (value: string): boolean => {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\u0000") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value)
  ) {
    return false;
  }

  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
};

const RepositoryRelativePath = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(isRepositoryRelativePath, {
      expected: "a repository-relative path without traversal segments",
    }),
  ),
);

const ExplainSource = Schema.Struct({
  path: RepositoryRelativePath,
  format: Schema.Literals(["bang-source", "core-json"]),
}).annotate({ parseOptions });

const ExplainSources = Schema.NonEmptyArray(ExplainSource);

const ExplanationIdentity = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[A-Za-z][A-Za-z0-9._-]*$/u.test(value), {
      expected: "an artifact identity without path separators",
    }),
  ),
);

const RequirementAddress = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(
      (value) => value.length > 0 && !value.includes("\\") && !value.includes("\u0000"),
      { expected: "a non-empty requirement address" },
    ),
  ),
);

const ArtifactPath = RepositoryRelativePath.pipe(
  Schema.check(
    Schema.makeFilter(
      (value) => value === ".bang/artifacts" || value.startsWith(".bang/artifacts/"),
      { expected: "a path under .bang/artifacts" },
    ),
  ),
);

/** Strict JSON selection for one external M022 theory explanation. */
const ExplainSelectionSchema = Schema.Struct({
  bangExplanation: Schema.Literal(1),
  id: ExplanationIdentity,
  sources: ExplainSources,
  requirement: RequirementAddress,
  artifactPath: Schema.optional(ArtifactPath),
}).annotate({ parseOptions });

export const ExplainSelectionFromJson = Schema.fromJsonString(ExplainSelectionSchema);
export type ExplainSelection = typeof ExplainSelectionSchema.Type;
export type ExplainSource = typeof ExplainSource.Type;

export type ExplanationStage =
  | "selection"
  | "source-read"
  | "source-decode"
  | "core-validation"
  | "artifact-build"
  | "artifact-consume"
  | "artifact-write"
  | "theory";

const ExplanationStageSchema = Schema.Literals([
  "selection",
  "source-read",
  "source-decode",
  "core-validation",
  "artifact-build",
  "artifact-consume",
  "artifact-write",
  "theory",
]);

/** A typed failure at one frozen M022 application boundary. */
export class ExplanationFailure extends Schema.TaggedError<ExplanationFailure>()(
  "ExplanationFailure",
  {
    stage: ExplanationStageSchema,
    path: Schema.String,
    address: Schema.optional(Schema.String),
    message: Schema.String,
  },
) {}

const optionalErrorField = (error: unknown, field: string): unknown => {
  if (typeof error !== "object" || error === null) return undefined;
  return Object.getOwnPropertyDescriptor(error, field)?.value;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  const message = optionalErrorField(error, "message");
  return typeof message === "string" ? message : String(error);
};

const errorAddress = (error: unknown): string | undefined => {
  const address = optionalErrorField(error, "address");
  return typeof address === "string" ? address : undefined;
};

const errorReason = (error: unknown): string | undefined => {
  const reason = optionalErrorField(error, "reason");
  return typeof reason === "string" ? reason : undefined;
};

const makeFailure = (
  stage: ExplanationStage,
  path: string,
  message: string,
  address?: string,
): ExplanationFailure =>
  new ExplanationFailure({
    stage,
    path,
    message,
    ...(address === undefined ? {} : { address }),
  });

const readText = (filePath: string, stage: ExplanationStage) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem
      .readFileString(filePath)
      .pipe(Effect.mapError((error) => makeFailure(stage, filePath, errorMessage(error))));
  });

const decodeCoreSource = (contents: string, sourcePath: string) =>
  Schema.decodeEffect(CoreDocumentFromJson)(contents, parseOptions).pipe(
    Effect.mapError((issue) =>
      makeFailure("source-decode", sourcePath, `invalid Core document: ${String(issue)}`),
    ),
  );

const decodeBangSource = (contents: string, sourcePath: string) =>
  Effect.fromResult(sourceToCore(contents)).pipe(
    Effect.mapError((error) =>
      makeFailure("source-decode", sourcePath, `invalid BANG source: ${errorMessage(error)}`),
    ),
  );

const decodeSource = (source: ExplainSource, contents: string, sourcePath: string) =>
  source.format === "core-json"
    ? decodeCoreSource(contents, sourcePath)
    : decodeBangSource(contents, sourcePath);

interface LoadedSource {
  readonly document: CoreDocument;
  readonly provenance: NormalizationProvenance;
}

const loadSource = (root: string, source: ExplainSource) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedPath = path.resolve(root, source.path);
    const contents = yield* readText(resolvedPath, "source-read");
    const document = yield* decodeSource(source, contents, resolvedPath);
    return {
      document,
      provenance: document.declarations.map((declaration) => ({
        declaration: declaration.id,
        path: source.path,
      })),
    } satisfies LoadedSource;
  });

const mergeDocuments = (documents: ReadonlyArray<CoreDocument>): CoreDocument => ({
  bangCore: 1,
  declarations: documents.flatMap(({ declarations }) => declarations),
});

const loadSources = (root: string, sources: ReadonlyArray<ExplainSource>) =>
  Effect.gen(function* () {
    const loaded: Array<LoadedSource> = [];
    for (const source of sources) loaded.push(yield* loadSource(root, source));
    return {
      document: mergeDocuments(loaded.map(({ document }) => document)),
      provenance: loaded.flatMap(({ provenance }) => provenance),
    } satisfies LoadedSource;
  });

const validateDocument = (
  document: CoreDocument,
  provenance: NormalizationProvenance,
  selectionPath: string,
) =>
  validateCore(document).pipe(
    Effect.mapError((error) => {
      const message = errorMessage(error);
      const source = provenance
        .map((entry) => ({ ...entry, offset: message.indexOf(entry.declaration) }))
        .filter(({ offset }) => offset >= 0)
        .toSorted(
          (left, right) =>
            left.offset - right.offset || right.declaration.length - left.declaration.length,
        )[0];
      return makeFailure(
        "core-validation",
        source?.path ?? selectionPath,
        message,
        errorAddress(error),
      );
    }),
  );

const resolveArtifactPath = (
  root: string,
  selection: ExplainSelection,
  path: Path.Path,
): string => {
  const artifactPath = selection.artifactPath ?? `.bang/artifacts/${selection.id}.json`;
  return path.resolve(root, artifactPath);
};

const writeArtifact = (root: string, selection: ExplainSelection, encoded: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const artifactPath = resolveArtifactPath(root, selection, path);
    const artifactDirectory = path.dirname(artifactPath);
    yield* fileSystem
      .makeDirectory(artifactDirectory, { recursive: true })
      .pipe(
        Effect.mapError((error) =>
          makeFailure(
            "artifact-write",
            artifactPath,
            `could not create artifact directory: ${errorMessage(error)}`,
          ),
        ),
      );
    yield* fileSystem
      .writeFileString(artifactPath, encoded)
      .pipe(
        Effect.mapError((error) =>
          makeFailure(
            "artifact-write",
            artifactPath,
            `could not write semantic artifact: ${errorMessage(error)}`,
          ),
        ),
      );
    return artifactPath;
  });

const formatPremise = (
  premise: ExactOneCapabilityExecutionResult["premises"][number],
): string[] => {
  const lines = [
    `Premise: ${premise.id}`,
    `Statement: ${premise.statement}`,
    `Status: ${premise.status}`,
    `Derivation: ${premise.derivation}`,
    `Provenance: ${premise.provenance.length === 0 ? "none" : premise.provenance.join(", ")}`,
  ];
  if (premise.reason !== undefined) lines.push(`Reason: ${premise.reason}`);
  return lines;
};

const formatObligation = (
  obligation: ExactOneCapabilityExecutionResult["obligations"][number],
): string[] => [
  `Obligation: ${obligation.id}`,
  `Statement: ${obligation.statement}`,
  `Derivation: ${obligation.derivation}`,
  `Evidence: ${obligation.evidence}`,
];

export const formatExplanationReport = (
  result: ExactOneCapabilityExecutionResult,
  artifact: SemanticArtifact,
  artifactPath: string,
): string => {
  const provenance = [...new Set(artifact.provenance.map(({ path }) => path))].toSorted();
  const lines = [
    "M022 versioned theory explanation",
    `Artifact format: ${result.artifactFormat}`,
    `Artifact identity: ${result.artifactId}`,
    `Artifact path: ${artifactPath}`,
    `Material provenance: ${provenance.length === 0 ? "none" : provenance.join(", ")}`,
    `Invalidators: ${result.invalidators.length === 0 ? "none" : result.invalidators.join(", ")}`,
    `Theory: ${result.theory.id} version ${result.theory.version}`,
    `Requirement: ${result.requirementAddress}`,
    `Result: ${result._tag === "Applicable" ? "applicable" : "not-applicable"}`,
    "",
  ];
  for (const premise of result.premises) lines.push(...formatPremise(premise), "");
  if (result.obligations.length === 0) {
    lines.push("Obligations: none", "");
  } else {
    for (const obligation of result.obligations) lines.push(...formatObligation(obligation), "");
  }
  lines.push(`Evidence status: ${result.evidence.status}`);
  lines.push(`Evidence scope: ${result.evidence.scope}`);
  lines.push("Limitations:");
  for (const limitation of result.limitations) lines.push(`- ${limitation}`);
  lines.push(
    "Evidence classification: runtime-checked encoded artifact crossing and theory evaluation.",
  );
  lines.push(
    "Not established: implementation conformance, theory soundness for future constructs, artifact authenticity, and compatibility with future artifact versions.",
  );
  return `${lines.join("\n")}\n`;
};

export interface ExplanationResult {
  readonly selection: ExplainSelection;
  readonly artifactPath: string;
  readonly encodedArtifact: string;
  readonly result: ExactOneCapabilityExecutionResult;
  readonly text: string;
}

const normalizeEncodedArtifact = (encoded: string): string =>
  encoded.endsWith("\n") ? encoded : `${encoded}\n`;

export const compileSelectedExplanation = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  ExplanationResult,
  ExplanationFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedSelectionPath = path.resolve(root, selectionPath);
    const selectionContents = yield* readText(resolvedSelectionPath, "selection");
    const selection = yield* Schema.decodeEffect(ExplainSelectionFromJson)(
      selectionContents,
      parseOptions,
    ).pipe(
      Effect.mapError((issue) =>
        makeFailure(
          "selection",
          resolvedSelectionPath,
          `invalid M022 explanation selection: ${String(issue)}`,
        ),
      ),
    );

    const loaded = yield* loadSources(root, selection.sources);
    const checked: CheckedCoreDocument = yield* validateDocument(
      loaded.document,
      loaded.provenance,
      resolvedSelectionPath,
    );
    const artifact = yield* produceSemanticArtifact(checked, loaded.provenance, selection.id).pipe(
      Effect.mapError((error) =>
        makeFailure(
          "artifact-build",
          resolvedSelectionPath,
          errorMessage(error),
          errorAddress(error),
        ),
      ),
    );
    const encodedArtifact = normalizeEncodedArtifact(encodeSemanticArtifact(artifact));

    const result = yield* consumeExactOneCapabilityExecution(
      encodedArtifact,
      selection.requirement,
    ).pipe(
      Effect.mapError((error) => {
        const reason = errorReason(error);
        const stage =
          reason === "invalid-artifact" || reason === "inconsistent-checked-core"
            ? "artifact-consume"
            : "theory";
        return makeFailure(stage, resolvedSelectionPath, errorMessage(error), errorAddress(error));
      }),
    );
    const artifactPath = yield* writeArtifact(root, selection, encodedArtifact);
    return {
      selection,
      artifactPath,
      encodedArtifact,
      result,
      text: formatExplanationReport(result, artifact, artifactPath),
    };
  });

/** Format one M022 failure without a stack trace or partial report. */
export const formatExplanationFailure = (error: ExplanationFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`];
  if (error.address !== undefined) lines.push(`address: ${error.address}`);
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};
