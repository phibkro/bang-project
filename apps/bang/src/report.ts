import {
  CoreDocumentFromJson,
  type CoreDocument,
  type CheckedCoreDocument,
  validateCore,
} from "@bang/core";
import {
  M012SystemSelectionFromJson,
  PropertyTestEvidenceRecordFromJson,
  RuntimeTraceEvidenceRecordFromJson,
  compileM012SystemReport,
  decodeM005BridgeEvidenceManifest,
  decodeM009PortabilityEvidenceManifest,
  decodeM010ReplayManifest,
  decodeM011SolverEvidenceManifest,
  formatM012SystemReport,
  type M012SystemReportError,
  type M009PortabilityEvidenceManifest,
  type M010ReplayManifest,
  type M011SolverEvidenceManifest,
  type M012SystemReport,
  type M012SystemSelection,
  type PropertyTestEvidenceRecord,
  type RuntimeTraceEvidenceRecord,
} from "@bang/evidence";
import { sourceToCore } from "@bang/surface";
import type { SourceParseError } from "@bang/surface";
import { Effect, FileSystem, Path, Schema } from "effect";

const SourcePositionSchema = Schema.Struct({
  offset: Schema.Natural,
  line: Schema.Natural.check(Schema.isGreaterThan(0)),
  column: Schema.Natural.check(Schema.isGreaterThan(0)),
});

const SourceSpanSchema = Schema.Struct({
  start: SourcePositionSchema,
  end: SourcePositionSchema,
}).check(
  Schema.makeFilter(({ start, end }) => start.offset <= end.offset, {
    expected: "a source span whose start offset is at most its end offset",
  }),
);

export type BangReportStage =
  | "selection"
  | "refinement-source"
  | "state-source"
  | "bridge-source"
  | "core-validation"
  | "bridge-evidence"
  | "property-evidence"
  | "runtime-evidence"
  | "portability-evidence"
  | "replay-evidence"
  | "solver-evidence";

const BangReportStageSchema = Schema.Literals([
  "selection",
  "refinement-source",
  "state-source",
  "bridge-source",
  "core-validation",
  "bridge-evidence",
  "property-evidence",
  "runtime-evidence",
  "portability-evidence",
  "replay-evidence",
  "solver-evidence",
]);

/** A typed failure while loading or checking one selected report input. */
export class BangReportInputError extends Schema.TaggedError<BangReportInputError>()(
  "BangReportInputError",
  {
    stage: BangReportStageSchema,
    path: Schema.String,
    message: Schema.String,
    span: Schema.optional(SourceSpanSchema),
    found: Schema.optional(Schema.String),
    expected: Schema.optional(Schema.NonEmptyArray(Schema.String)),
  },
) {}

export type BangReportFailure = BangReportInputError | M012SystemReportError;

export interface BangReportResult {
  readonly selection: M012SystemSelection;
  readonly report: M012SystemReport;
  readonly text: string;
}

const inputError = (stage: BangReportStage, path: string, message: string): BangReportInputError =>
  new BangReportInputError({ stage, path, message });

const sourceInputError = (stage: BangReportStage, path: string, error: SourceParseError) =>
  new BangReportInputError({
    stage,
    path,
    message: error.message,
    ...(error.span === undefined ? {} : { span: error.span }),
    ...(error.found === undefined ? {} : { found: error.found }),
    ...(error.expected === undefined ? {} : { expected: error.expected }),
  });

const readText = (filePath: string, stage: BangReportStage) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem
      .readFileString(filePath)
      .pipe(
        Effect.mapError((error) =>
          inputError(stage, filePath, error instanceof Error ? error.message : String(error)),
        ),
      );
  });

const decodeSelection = (contents: string, filePath: string) =>
  Schema.decodeEffect(M012SystemSelectionFromJson)(contents, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      inputError("selection", filePath, `invalid system selection: ${String(issue)}`),
    ),
  );

const decodeCoreDocument = (
  contents: string,
  filePath: string,
  stage: "refinement-source" | "bridge-source",
) =>
  Schema.decodeEffect(CoreDocumentFromJson)(contents, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      inputError(stage, filePath, `invalid Core document: ${String(issue)}`),
    ),
  );

const parseStateSource = (contents: string, filePath: string) =>
  Effect.fromResult(sourceToCore(contents)).pipe(
    Effect.mapError((error) => sourceInputError("state-source", filePath, error)),
  );

const mergeCoreDocuments = (documents: ReadonlyArray<CoreDocument>): CoreDocument => ({
  bangCore: 1,
  declarations: documents.flatMap(({ declarations }) => declarations),
});

const decodePropertyEvidence = (contents: string, filePath: string) =>
  Schema.decodeEffect(PropertyTestEvidenceRecordFromJson)(contents, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      inputError("property-evidence", filePath, `invalid property evidence: ${String(issue)}`),
    ),
  );

const decodeRuntimeEvidence = (contents: string, filePath: string) =>
  Schema.decodeEffect(RuntimeTraceEvidenceRecordFromJson)(contents, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      inputError("runtime-evidence", filePath, `invalid runtime evidence: ${String(issue)}`),
    ),
  );

const decodeBridgeEvidence = (contents: string, filePath: string) =>
  decodeM005BridgeEvidenceManifest(contents).pipe(
    Effect.mapError((error) => inputError("bridge-evidence", filePath, error.message)),
  );

const decodePortabilityEvidence = (contents: string, filePath: string) =>
  decodeM009PortabilityEvidenceManifest(contents).pipe(
    Effect.mapError((error) => inputError("portability-evidence", filePath, error.message)),
  );

const decodeReplayEvidence = (contents: string, filePath: string) =>
  decodeM010ReplayManifest(contents).pipe(
    Effect.mapError((error) => inputError("replay-evidence", filePath, error.message)),
  );

const decodeSolverEvidence = (contents: string, filePath: string) =>
  decodeM011SolverEvidenceManifest(contents).pipe(
    Effect.mapError((error) => inputError("solver-evidence", filePath, error.message)),
  );

/** Load the selected sources and evidence, then compile the existing M012 report. */
export const compileSelectedSystemReport = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  BangReportResult,
  BangReportInputError | M012SystemReportError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedSelectionPath = path.resolve(root, selectionPath);
    const selectionContents = yield* readText(resolvedSelectionPath, "selection");
    const selection = yield* decodeSelection(selectionContents, resolvedSelectionPath);

    const refinementPath = path.resolve(root, selection.sources.refinement.path);
    const statePath = path.resolve(root, selection.sources.state.path);
    const bridgePath = path.resolve(root, selection.sources.bridge.path);

    const refinementContents = yield* readText(refinementPath, "refinement-source");
    const stateContents = yield* readText(statePath, "state-source");
    const bridgeContents = yield* readText(bridgePath, "bridge-source");

    const refinement = yield* decodeCoreDocument(
      refinementContents,
      refinementPath,
      "refinement-source",
    );
    const state = yield* parseStateSource(stateContents, statePath);
    const bridge = yield* decodeCoreDocument(bridgeContents, bridgePath, "bridge-source");

    const checkedCore: CheckedCoreDocument = yield* validateCore(
      mergeCoreDocuments([refinement, state, bridge]),
    ).pipe(
      Effect.mapError((error) =>
        inputError("core-validation", resolvedSelectionPath, error.message),
      ),
    );

    const bridgeEvidencePath = path.resolve(root, selection.evidence.bridge);
    const propertyEvidencePath = path.resolve(root, selection.evidence.property);
    const runtimeEvidencePath = path.resolve(root, selection.evidence.runtime);
    const portabilityEvidencePath = path.resolve(root, selection.evidence.portability);
    const replayEvidencePath = path.resolve(root, selection.evidence.replay);
    const solverEvidencePath = path.resolve(root, selection.evidence.solver);

    const bridgeEvidence = yield* decodeBridgeEvidence(
      yield* readText(bridgeEvidencePath, "bridge-evidence"),
      bridgeEvidencePath,
    );
    const propertyEvidence: PropertyTestEvidenceRecord = yield* decodePropertyEvidence(
      yield* readText(propertyEvidencePath, "property-evidence"),
      propertyEvidencePath,
    );
    const runtimeEvidence: RuntimeTraceEvidenceRecord = yield* decodeRuntimeEvidence(
      yield* readText(runtimeEvidencePath, "runtime-evidence"),
      runtimeEvidencePath,
    );
    const portabilityEvidence: M009PortabilityEvidenceManifest = yield* decodePortabilityEvidence(
      yield* readText(portabilityEvidencePath, "portability-evidence"),
      portabilityEvidencePath,
    );
    const replayEvidence: M010ReplayManifest = yield* decodeReplayEvidence(
      yield* readText(replayEvidencePath, "replay-evidence"),
      replayEvidencePath,
    );
    const solverEvidence: M011SolverEvidenceManifest = yield* decodeSolverEvidence(
      yield* readText(solverEvidencePath, "solver-evidence"),
      solverEvidencePath,
    );

    const report = yield* compileM012SystemReport({
      selection,
      checkedCore,
      bridgeEvidence,
      propertyEvidence,
      runtimeEvidence,
      portabilityEvidence,
      replayEvidence,
      solverEvidence,
    });

    return {
      selection,
      report,
      text: formatM012SystemReport(report),
    };
  });

/** Format a report boundary or M012 composition failure without a stack trace. */
export const formatBangReportFailure = (error: BangReportFailure): string => {
  if (error instanceof BangReportInputError) {
    const lines = [`stage: ${error.stage}`, `path: ${error.path}`, `message: ${error.message}`];
    if (error.span !== undefined) {
      lines.push(
        `line: ${error.span.start.line}`,
        `column: ${error.span.start.column}`,
        `end-line: ${error.span.end.line}`,
        `end-column: ${error.span.end.column}`,
      );
    }
    if (error.found !== undefined) {
      lines.push(`found: ${error.found}`);
    }
    if (error.expected !== undefined) {
      lines.push(`expected: ${error.expected.join(", ")}`);
    }
    return lines.join("\n");
  }

  return [
    `reason: ${error.reason}`,
    `identity: ${error.identity}`,
    `message: ${error.message}`,
  ].join("\n");
};
