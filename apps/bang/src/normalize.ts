import {
  CoreDocumentFromJson,
  compareNormalizedCore,
  normalizeCore,
  type CheckedCoreDocument,
  type CoreDocument,
  type NormalizationProvenance,
  type ComparisonResult,
  type NormalizedConstruct,
  type NormalizedCore,
  type NormalizedCoreComparison,
  type NormalizedDependency,
  validateCore,
} from "@bang/core";
import { sourceToCore } from "@bang/surface";
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

const NormalizationSource = Schema.Struct({
  path: RepositoryRelativePath,
  format: Schema.Literals(["bang-source", "core-json"]),
});

const NormalizationSourceSet = Schema.Struct({
  sources: Schema.NonEmptyArray(NormalizationSource),
});

export const NormalizationSelection = Schema.Struct({
  bangNormalization: Schema.Literal(1),
  baseline: NormalizationSourceSet,
  candidate: NormalizationSourceSet,
});

export const NormalizationSelectionFromJson = Schema.fromJsonString(NormalizationSelection);
export type NormalizationSelection = typeof NormalizationSelection.Type;
export type NormalizationSource = typeof NormalizationSource.Type;

export type NormalizationStage =
  | "selection"
  | "source-read"
  | "source-decode"
  | "core-validation"
  | "normalization"
  | "clean-parity";

const NormalizationStageSchema = Schema.Literals([
  "selection",
  "source-read",
  "source-decode",
  "core-validation",
  "normalization",
  "clean-parity",
]);

/** A typed failure at one frozen M021 application boundary. */
export class NormalizationFailure extends Schema.TaggedError<NormalizationFailure>()(
  "NormalizationFailure",
  {
    stage: NormalizationStageSchema,
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

const makeFailure = (
  stage: NormalizationStage,
  path: string,
  message: string,
  address?: string,
): NormalizationFailure =>
  new NormalizationFailure({
    stage,
    path,
    message,
    ...(address === undefined ? {} : { address }),
  });

const readText = (filePath: string, stage: NormalizationStage) =>
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

const decodeSource = (source: NormalizationSource, contents: string, sourcePath: string) =>
  source.format === "core-json"
    ? decodeCoreSource(contents, sourcePath)
    : decodeBangSource(contents, sourcePath);

interface LoadedSource {
  readonly document: CoreDocument;
  readonly provenance: NormalizationProvenance;
}

const loadSource = (root: string, source: NormalizationSource) =>
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

interface LoadedSourceSet {
  readonly document: CoreDocument;
  readonly provenance: NormalizationProvenance;
}

const loadSourceSet = (root: string, sources: ReadonlyArray<NormalizationSource>) =>
  Effect.gen(function* () {
    const loaded: Array<LoadedSource> = [];
    for (const source of sources) loaded.push(yield* loadSource(root, source));
    return {
      document: mergeDocuments(loaded.map(({ document }) => document)),
      provenance: loaded.flatMap(({ provenance }) => provenance),
    } satisfies LoadedSourceSet;
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

const normalizeDocument = (
  document: CheckedCoreDocument,
  provenance: NormalizationProvenance,
  selectionPath: string,
) =>
  normalizeCore(document, provenance).pipe(
    Effect.mapError((error) =>
      makeFailure("normalization", selectionPath, errorMessage(error), errorAddress(error)),
    ),
  );

export interface NormalizationResult {
  readonly selection: NormalizationSelection;
  readonly baseline: NormalizedCore;
  readonly candidate: NormalizedCore;
  readonly comparison: NormalizedCoreComparison;
  readonly text: string;
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const formatDependency = (dependency: NormalizedDependency): string =>
  `${dependency.type}->${dependency.target}`;

const formatDependencyList = (dependencies: ReadonlyArray<NormalizedDependency>): string =>
  dependencies.map(formatDependency).toSorted(compareText).join(", ") || "none";

const formatProvenance = (paths: ReadonlyArray<string>): string =>
  paths.toSorted(compareText).join(", ") || "none";

const nodeForResult = (
  result: ComparisonResult,
  baseline: NormalizedCore,
  candidate: NormalizedCore,
): NormalizedConstruct | undefined => {
  const candidateNode = candidate.nodes.find((node) => node.address === result.address);
  if (candidateNode !== undefined) return candidateNode;
  return baseline.nodes.find((node) => node.address === result.address);
};

const formatResult = (
  result: ComparisonResult,
  baseline: NormalizedCore,
  candidate: NormalizedCore,
): ReadonlyArray<string> => {
  const node = nodeForResult(result, baseline, candidate);
  const lines = [
    `Address: ${result.address}`,
    `Status: ${result.status}`,
    `Kind: ${node?.kind ?? "unknown"}`,
    `Baseline fingerprint: ${result.baselineFingerprint ?? "none"}`,
    `Candidate fingerprint: ${result.candidateFingerprint ?? "none"}`,
    `Direct dependencies: ${formatDependencyList(node?.directDependencies ?? [])}`,
    `Dependency closure: ${formatDependencyList(node?.dependencyClosure ?? [])}`,
    `Material provenance: ${formatProvenance(node?.materialProvenance ?? [])}`,
  ];
  if (result.invalidatedBy.length > 0) {
    lines.push(`Invalidated by: ${formatDependencyList(result.invalidatedBy)}`);
  }
  return lines;
};

export const formatNormalizationReport = (
  selection: NormalizationSelection,
  baseline: NormalizedCore,
  candidate: NormalizedCore,
  comparison: NormalizedCoreComparison,
): string => {
  const lines = [
    "M021 construct-addressed normalization",
    `Baseline sources: ${selection.baseline.sources
      .map(({ path }) => path)
      .toSorted(compareText)
      .join(", ")}`,
    `Candidate sources: ${selection.candidate.sources
      .map(({ path }) => path)
      .toSorted(compareText)
      .join(", ")}`,
  ];
  const results = comparison.results.toSorted((left, right) =>
    compareText(left.address, right.address),
  );
  for (const result of results) lines.push(...formatResult(result, baseline, candidate), "");
  lines.push("Evidence scope: runtime-checked comparison evidence for the selected source sets.");
  lines.push(`Clean parity: ${comparison.cleanParity ? "match" : "mismatch"}`);
  return lines.join("\n");
};

export const compileSelectedNormalization = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  NormalizationResult,
  NormalizationFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedSelectionPath = path.resolve(root, selectionPath);
    const selectionContents = yield* readText(resolvedSelectionPath, "selection");
    const selection = yield* Schema.decodeEffect(NormalizationSelectionFromJson)(
      selectionContents,
      parseOptions,
    ).pipe(
      Effect.mapError((issue) =>
        makeFailure(
          "selection",
          resolvedSelectionPath,
          `invalid normalization selection: ${String(issue)}`,
        ),
      ),
    );

    const baselineLoaded = yield* loadSourceSet(root, selection.baseline.sources);
    const candidateLoaded = yield* loadSourceSet(root, selection.candidate.sources);
    const baselineChecked = yield* validateDocument(
      baselineLoaded.document,
      baselineLoaded.provenance,
      resolvedSelectionPath,
    );
    const candidateChecked = yield* validateDocument(
      candidateLoaded.document,
      candidateLoaded.provenance,
      resolvedSelectionPath,
    );
    const baseline = yield* normalizeDocument(
      baselineChecked,
      baselineLoaded.provenance,
      resolvedSelectionPath,
    );
    const candidate = yield* normalizeDocument(
      candidateChecked,
      candidateLoaded.provenance,
      resolvedSelectionPath,
    );
    const comparison = yield* compareNormalizedCore(baseline, candidate).pipe(
      Effect.mapError((error) =>
        makeFailure(
          optionalErrorField(error, "reason") === "clean-parity" ? "clean-parity" : "normalization",
          resolvedSelectionPath,
          errorMessage(error),
          errorAddress(error),
        ),
      ),
    );

    const normalizedBaseline: NormalizedCore = baseline;
    const normalizedCandidate: NormalizedCore = candidate;
    const normalizedComparison: NormalizedCoreComparison = comparison;
    return {
      selection,
      baseline: normalizedBaseline,
      candidate: normalizedCandidate,
      comparison: normalizedComparison,
      text: formatNormalizationReport(
        selection,
        normalizedBaseline,
        normalizedCandidate,
        normalizedComparison,
      ),
    };
  });

/** Format one M021 failure without a stack trace or partial report. */
export const formatNormalizationFailure = (error: NormalizationFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`];
  if (error.address !== undefined) lines.push(`address: ${error.address}`);
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};
