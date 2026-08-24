import {
  consumeSemanticArtifact,
  CoreDocumentFromJson,
  encodeSemanticArtifact,
  NormalizationProvenanceSchema,
  produceSemanticArtifact,
  validateCore,
  type CheckedSemanticArtifact,
  type CoreDocument,
  type NormalizationProvenance,
} from "@bang/core";
import {
  ExactOneCapabilityExecutionResultSchema,
  M023ClassificationResultSchema,
  M024ChannelReportSchema,
  type ExactOneCapabilityExecutionResult,
  type M023ClassificationResult,
  consumeExactOneCapabilityExecution,
} from "@bang/theories";
import { sourceToCore, type SourceParseError, type SourceSpan } from "@bang/surface";
import { type Crypto, Effect, FileSystem, Path, Schema } from "effect";

import {
  compileClassificationFromArtifact,
  type ClassificationFailure,
  type ClassificationTarget,
} from "./classify.ts";
import { compileSelectedTrace, type TraceFailure } from "./trace.ts";

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

const ProjectIdentity = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[A-Za-z][A-Za-z0-9._-]*$/u.test(value), {
      expected: "a project-local identity without path separators",
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
const ProjectSourceSchema = Schema.Struct({
  id: ProjectIdentity,
  path: RepositoryRelativePath,
  format: Schema.Literals(["bang-source", "core-json"]),
}).annotate({ parseOptions });

const ExactOneTheoryIdentitySchema = Schema.Struct({
  id: Schema.Literal("ExactOneCapabilityExecution"),
  version: Schema.Literal(1),
}).annotate({ parseOptions });

const BoundedChannelTheoryIdentitySchema = Schema.Struct({
  id: Schema.Literal("BoundedChannelProtocol"),
  version: Schema.Literal(1),
}).annotate({ parseOptions });

const ProjectTheoryApplicationSchema = Schema.Struct({
  id: ProjectIdentity,
  theory: ExactOneTheoryIdentitySchema,
  source: ProjectIdentity,
  requirement: RequirementAddress,
}).annotate({ parseOptions });

const ProjectTargetSchema = Schema.Struct({
  id: ProjectIdentity,
  adapter: Schema.Literals(["effect-typescript", "gleam-beam"]),
}).annotate({ parseOptions });

const ProjectRealizationProfileSchema = Schema.Struct({
  id: ProjectIdentity,
  theory: ProjectIdentity,
  target: ProjectIdentity,
  realization: ProjectIdentity,
  evidence: ProjectIdentity,
}).annotate({ parseOptions });

const ProjectEvidenceInputSchema = Schema.Struct({
  id: ProjectIdentity,
  kind: Schema.Literal("m018-single-use-capability"),
  path: RepositoryRelativePath,
}).annotate({ parseOptions });

const ProjectChannelAnalysisSchema = Schema.Struct({
  id: ProjectIdentity,
  theory: BoundedChannelTheoryIdentitySchema,
  selection: RepositoryRelativePath,
}).annotate({ parseOptions });

const ProjectEvidencePolicySchema = Schema.Struct({
  assumptions: Schema.Literals(["report", "reject"]),
  unresolved: Schema.Literals(["report", "reject"]),
  unsupportedByTarget: Schema.Literals(["report", "reject"]),
}).annotate({ parseOptions });

const unique = (values: ReadonlyArray<string>): boolean => new Set(values).size === values.length;

const uniqueSources = (sources: ReadonlyArray<typeof ProjectSourceSchema.Type>): boolean =>
  unique(sources.map(({ id }) => id)) && unique(sources.map(({ path }) => path));

const hasValidProjectSelectionShape = (selection: {
  readonly sources: ReadonlyArray<typeof ProjectSourceSchema.Type>;
  readonly theories: ReadonlyArray<typeof ProjectTheoryApplicationSchema.Type>;
  readonly targets: ReadonlyArray<typeof ProjectTargetSchema.Type>;
  readonly realizationProfiles: ReadonlyArray<typeof ProjectRealizationProfileSchema.Type>;
  readonly evidence: ReadonlyArray<typeof ProjectEvidenceInputSchema.Type>;
  readonly channels: ReadonlyArray<typeof ProjectChannelAnalysisSchema.Type>;
}): boolean => {
  const targetAdapters = selection.targets.map(({ adapter }) => adapter);
  return (
    uniqueSources(selection.sources) &&
    unique(selection.theories.map(({ id }) => id)) &&
    unique(selection.targets.map(({ id }) => id)) &&
    unique(selection.realizationProfiles.map(({ id }) => id)) &&
    unique(selection.evidence.map(({ id }) => id)) &&
    unique(selection.channels.map(({ id }) => id)) &&
    targetAdapters.length === 2 &&
    new Set(targetAdapters).size === 2 &&
    targetAdapters.includes("effect-typescript") &&
    targetAdapters.includes("gleam-beam") &&
    selection.realizationProfiles.length === selection.targets.length &&
    selection.evidence.length === 1 &&
    selection.channels.length === 1
  );
};

const hasResolvedProjectReferences = (selection: {
  readonly sources: ReadonlyArray<typeof ProjectSourceSchema.Type>;
  readonly theories: ReadonlyArray<typeof ProjectTheoryApplicationSchema.Type>;
  readonly targets: ReadonlyArray<typeof ProjectTargetSchema.Type>;
  readonly realizationProfiles: ReadonlyArray<typeof ProjectRealizationProfileSchema.Type>;
  readonly evidence: ReadonlyArray<typeof ProjectEvidenceInputSchema.Type>;
}): boolean => {
  const sourceIds = new Set(selection.sources.map(({ id }) => id));
  const theoryIds = new Set(selection.theories.map(({ id }) => id));
  const targetIds = new Set(selection.targets.map(({ id }) => id));
  const evidenceIds = new Set(selection.evidence.map(({ id }) => id));
  return (
    selection.theories.every(({ source }) => sourceIds.has(source)) &&
    selection.realizationProfiles.every(
      ({ theory, target, evidence }) =>
        theoryIds.has(theory) && targetIds.has(target) && evidenceIds.has(evidence),
    )
  );
};

const hasOneProfilePerTarget = (selection: M025ProjectSelection): boolean =>
  selection.targets.every(
    (target) =>
      selection.realizationProfiles.filter(({ target: targetId }) => targetId === target.id)
        .length === 1,
  );

const ProjectSelectionSchemaBase = Schema.Struct({
  bangProject: Schema.Literal(1),
  id: ProjectIdentity,
  sources: Schema.NonEmptyArray(ProjectSourceSchema),
  theories: Schema.Tuple([ProjectTheoryApplicationSchema]),
  targets: Schema.Tuple([ProjectTargetSchema, ProjectTargetSchema]),
  realizationProfiles: Schema.Tuple([
    ProjectRealizationProfileSchema,
    ProjectRealizationProfileSchema,
  ]),
  evidence: Schema.Tuple([ProjectEvidenceInputSchema]),
  channels: Schema.Tuple([ProjectChannelAnalysisSchema]),
  evidencePolicy: ProjectEvidencePolicySchema,
}).annotate({ parseOptions });

type ProjectSelectionValue = typeof ProjectSelectionSchemaBase.Type;

/** Strict M025 version-one project selection. */
export const M025ProjectSelectionSchema = ProjectSelectionSchemaBase.check(
  Schema.makeFilter(
    (selection: ProjectSelectionValue) => hasValidProjectSelectionShape(selection),
    {
      expected: "a project selection with unique identities and required target adapters",
    },
  ),
);

/** The JSON string codec for strict M025 project selections. */
export const M025ProjectSelectionFromJson = Schema.fromJsonString(M025ProjectSelectionSchema);
export type M025ProjectSelection = typeof M025ProjectSelectionSchema.Type;

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

export type M025ProjectStage =
  | "project"
  | "source-read"
  | "source-decode"
  | "core-validation"
  | "artifact"
  | "theory"
  | "evidence"
  | "target"
  | "classification"
  | "channel"
  | "policy"
  | "report";

const M025ProjectStageSchema = Schema.Literals([
  "project",
  "source-read",
  "source-decode",
  "core-validation",
  "artifact",
  "theory",
  "evidence",
  "target",
  "classification",
  "channel",
  "policy",
  "report",
]);

/** A typed M025 failure. A failed composition never returns a partial report. */
export class M025ProjectFailure extends Schema.TaggedError<M025ProjectFailure>()(
  "M025ProjectFailure",
  {
    stage: M025ProjectStageSchema,
    path: Schema.String,
    reason: Schema.optional(Schema.String),
    identity: Schema.optional(Schema.String),
    message: Schema.String,
    span: Schema.optional(SourceSpanSchema),
  },
) {}

const makeFailure = (
  stage: M025ProjectStage,
  path: string,
  message: string,
  fields: {
    readonly reason?: string;
    readonly identity?: string;
    readonly span?: SourceSpan;
  } = {},
): M025ProjectFailure =>
  new M025ProjectFailure({
    stage,
    path,
    message,
    ...(fields.reason === undefined ? {} : { reason: fields.reason }),
    ...(fields.identity === undefined ? {} : { identity: fields.identity }),
    ...(fields.span === undefined ? {} : { span: fields.span }),
  });

const errorField = (error: unknown, field: string): unknown => {
  if (typeof error !== "object" || error === null) return undefined;
  return Object.getOwnPropertyDescriptor(error, field)?.value;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  const message = errorField(error, "message");
  return typeof message === "string" ? message : String(error);
};

const readText = (filePath: string, stage: M025ProjectStage) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem
      .readFileString(filePath)
      .pipe(
        Effect.mapError((error) =>
          makeFailure(stage, filePath, errorMessage(error), { reason: "read-failed" }),
        ),
      );
  });

const resolveSafePath = (
  root: string,
  value: string,
  path: Path.Path,
  stage: M025ProjectStage,
  identity?: string,
): Effect.Effect<string, M025ProjectFailure> =>
  isRepositoryRelativePath(value)
    ? Effect.succeed(path.resolve(root, value))
    : Effect.fail(
        makeFailure(stage, value, "unsafe repository-relative path", {
          reason: "unsafe-path",
          ...(identity === undefined ? {} : { identity }),
        }),
      );

const decodeProjectSelection = (contents: string, filePath: string) =>
  Schema.decodeEffect(M025ProjectSelectionFromJson)(contents, parseOptions).pipe(
    Effect.mapError((issue) => {
      const message = String(issue);
      const reason = message.includes("repository-relative path")
        ? "unsafe-path"
        : message.includes("unique identities")
          ? "duplicate-identity"
          : "schema";
      return makeFailure("project", filePath, `invalid M025 project selection: ${message}`, {
        reason,
      });
    }),
  );

const sourceParseFailure = (
  source: M025ProjectSelection["sources"][number],
  path: string,
  error: SourceParseError,
): M025ProjectFailure =>
  error.span === undefined
    ? makeFailure("source-decode", path, error.message, {
        reason: "parse-error",
        identity: source.id,
      })
    : makeFailure("source-decode", path, error.message, {
        reason: "parse-error",
        identity: source.id,
        span: error.span,
      });

const decodeSource = (
  source: M025ProjectSelection["sources"][number],
  contents: string,
  path: string,
): Effect.Effect<CoreDocument, M025ProjectFailure> =>
  source.format === "core-json"
    ? Schema.decodeEffect(CoreDocumentFromJson)(contents, parseOptions).pipe(
        Effect.mapError((issue) =>
          makeFailure("source-decode", path, `invalid Core document: ${String(issue)}`, {
            reason: "schema",
            identity: source.id,
          }),
        ),
      )
    : Effect.fromResult(sourceToCore(contents)).pipe(
        Effect.mapError((error) => sourceParseFailure(source, path, error)),
      );

interface LoadedSource {
  readonly document: CoreDocument;
  readonly provenance: NormalizationProvenance;
}

const loadSource = (
  root: string,
  source: M025ProjectSelection["sources"][number],
): Effect.Effect<LoadedSource, M025ProjectFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedPath = yield* resolveSafePath(root, source.path, path, "source-read", source.id);
    const contents = yield* readText(resolvedPath, "source-read").pipe(
      Effect.mapError((error) =>
        makeFailure("source-read", resolvedPath, error.message, {
          ...(error.reason === undefined ? {} : { reason: error.reason }),
          identity: source.id,
          ...(error.span === undefined ? {} : { span: error.span }),
        }),
      ),
    );
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

const requirementRealizationId = (address: string): string | undefined => {
  const prefix = "operationRealization:";
  const marker = ".requirement:";
  const markerIndex = address.indexOf(marker);
  if (!address.startsWith(prefix) || markerIndex <= prefix.length) return undefined;
  return address.slice(prefix.length, markerIndex);
};

const classificationStage = (stage: ClassificationFailure["stage"]): M025ProjectStage => {
  switch (stage) {
    case "evidence":
      return "evidence";
    case "target":
    case "profile":
      return "target";
    case "classification":
      return "classification";
    case "artifact":
      return "artifact";
    default:
      return "project";
  }
};

const mapClassificationFailure = (error: ClassificationFailure): M025ProjectFailure =>
  makeFailure(classificationStage(error.stage), error.path, error.message, {
    ...(error.reason === undefined ? {} : { reason: error.reason }),
    ...(error.address === undefined ? {} : { identity: error.address }),
  });

const mapTraceFailure = (error: TraceFailure, identity: string): M025ProjectFailure =>
  makeFailure("channel", error.path, error.message, {
    ...(error.reason === undefined ? {} : { reason: error.reason }),
    identity,
  });

const targetById = (
  selection: M025ProjectSelection,
): ReadonlyMap<string, M025ProjectSelection["targets"][number]> =>
  new Map(selection.targets.map((target) => [target.id, target]));

const sourceById = (
  selection: M025ProjectSelection,
): ReadonlyMap<string, M025ProjectSelection["sources"][number]> =>
  new Map(selection.sources.map((source) => [source.id, source]));

const theoryById = (
  selection: M025ProjectSelection,
): ReadonlyMap<string, M025ProjectSelection["theories"][number]> =>
  new Map(selection.theories.map((theory) => [theory.id, theory]));

const evidenceById = (
  selection: M025ProjectSelection,
): ReadonlyMap<string, M025ProjectSelection["evidence"][number]> =>
  new Map(selection.evidence.map((evidence) => [evidence.id, evidence]));

const makeArtifactReport = (
  selection: M025ProjectSelection,
  artifact: CheckedSemanticArtifact,
) => ({
  id: artifact.id,
  format: "bangSemanticArtifact:1" as const,
  sources: selection.sources,
  provenance: artifact.provenance,
});

const M025ProjectArtifactSchema = Schema.Struct({
  id: ProjectIdentity,
  format: Schema.Literal("bangSemanticArtifact:1"),
  sources: Schema.NonEmptyArray(ProjectSourceSchema),
  provenance: NormalizationProvenanceSchema,
}).annotate({ parseOptions });

const M025TheoryApplicationReportSchema = Schema.Struct({
  id: ProjectIdentity,
  theory: ExactOneTheoryIdentitySchema,
  source: ProjectIdentity,
  result: ExactOneCapabilityExecutionResultSchema,
}).annotate({ parseOptions });

const M025RealizationProfileReportSchema = Schema.Struct({
  id: ProjectIdentity,
  theory: ProjectIdentity,
  target: ProjectIdentity,
  evidence: ProjectIdentity,
  result: M023ClassificationResultSchema,
}).annotate({ parseOptions });

const M025ChannelAnalysisReportSchema = Schema.Struct({
  id: ProjectIdentity,
  theory: BoundedChannelTheoryIdentitySchema,
  selection: RepositoryRelativePath,
  report: M024ChannelReportSchema,
}).annotate({ parseOptions });

const M025PolicyConditionSchema = Schema.Struct({
  kind: Schema.Literals(["assumptions", "unsupported-by-target", "unresolved"]),
  disposition: Schema.Literal("reported"),
  subjects: Schema.NonEmptyArray(ProjectIdentity),
}).annotate({ parseOptions });

const M025PolicyDecisionSchema = Schema.Struct({
  status: Schema.Literal("Accepted"),
  conditions: Schema.Array(M025PolicyConditionSchema),
}).annotate({ parseOptions });

const M025ProjectReportSchemaBase = Schema.Struct({
  bangProjectReport: Schema.Literal(1),
  projectId: ProjectIdentity,
  artifact: M025ProjectArtifactSchema,
  targets: Schema.Tuple([ProjectTargetSchema, ProjectTargetSchema]),
  evidence: Schema.Tuple([ProjectEvidenceInputSchema]),
  theoryApplications: Schema.Tuple([M025TheoryApplicationReportSchema]),
  realizationProfiles: Schema.Tuple([
    M025RealizationProfileReportSchema,
    M025RealizationProfileReportSchema,
  ]),
  channelAnalyses: Schema.Tuple([M025ChannelAnalysisReportSchema]),
  evidencePolicy: ProjectEvidencePolicySchema,
  policyDecision: M025PolicyDecisionSchema,
}).annotate({ parseOptions });
type TheoryApplicationReportValue = typeof M025TheoryApplicationReportSchema.Type;
type ProjectReportValue = typeof M025ProjectReportSchemaBase.Type;

const resultIdentityMatchesTheory = (
  result: ExactOneCapabilityExecutionResult,
  theory: TheoryApplicationReportValue,
  artifactId: string,
): boolean =>
  result.artifactId === artifactId &&
  result.artifactFormat === "bangSemanticArtifact:1" &&
  result.theory.id === theory.theory.id &&
  result.theory.version === theory.theory.version;
const classificationIdentityMatchesTheory = (
  result: M023ClassificationResult,
  theory: TheoryApplicationReportValue,
  artifactId: string,
): boolean =>
  result.artifactId === artifactId &&
  result.artifactFormat === "bangSemanticArtifact:1" &&
  result.theoryResultIdentity.artifactId === artifactId &&
  result.theoryResultIdentity.artifactFormat === "bangSemanticArtifact:1" &&
  result.theoryResultIdentity.theory.id === theory.theory.id &&
  result.theoryResultIdentity.theory.version === theory.theory.version;

const reportIsConsistent = (report: ProjectReportValue): boolean => {
  if (
    report.projectId !== report.artifact.id ||
    !report.artifact.provenance.every(({ path }) =>
      report.artifact.sources.some((source) => source.path === path),
    )
  ) {
    return false;
  }
  const theoryApplication = report.theoryApplications[0];
  const channelAnalysis = report.channelAnalyses[0];
  if (theoryApplication === undefined || channelAnalysis === undefined) return false;
  const theoryResult = theoryApplication.result;
  if (
    theoryResult._tag !== "Applicable" ||
    !resultIdentityMatchesTheory(theoryResult, theoryApplication, report.artifact.id)
  ) {
    return false;
  }
  const theoryIds = report.theoryApplications.map(({ id }) => id);
  const profileTargetIds = report.realizationProfiles.map(({ target }) => target);
  const profileIds = report.realizationProfiles.map(({ id }) => id);
  const sourceIds = report.artifact.sources.map(({ id }) => id);
  const sourcePaths = report.artifact.sources.map(({ path }) => path);
  const declaredTargetIds = report.targets.map(({ id }) => id);
  const declaredTargetAdapters = report.targets.map(({ adapter }) => adapter);
  const evidenceIds = report.evidence.map(({ id }) => id);
  const evidencePaths = report.evidence.map(({ path }) => path);
  const provenanceDeclarations = report.artifact.provenance.map(({ declaration }) => declaration);
  const channelIds = report.channelAnalyses.map(({ id }) => id);
  if (!sourceIds.includes(theoryApplication.source)) return false;
  if (
    !unique(theoryIds) ||
    !unique(profileTargetIds) ||
    !unique(profileIds) ||
    !unique(sourceIds) ||
    !unique(sourcePaths) ||
    !unique(declaredTargetIds) ||
    !unique(declaredTargetAdapters) ||
    !unique(evidenceIds) ||
    !unique(evidencePaths) ||
    !unique(channelIds) ||
    !unique(provenanceDeclarations) ||
    declaredTargetAdapters[0] !== "effect-typescript" ||
    declaredTargetAdapters[1] !== "gleam-beam" ||
    report.realizationProfiles[0]?.result.targetId !== "effect-typescript" ||
    report.realizationProfiles[1]?.result.targetId !== "gleam-beam"
  ) {
    return false;
  }
  for (const profile of report.realizationProfiles) {
    const target = report.targets.find(({ id }) => id === profile.target);
    const evidence = report.evidence.find(({ id }) => id === profile.evidence);
    if (
      profile.theory !== theoryApplication.id ||
      target === undefined ||
      target.adapter !== profile.result.targetId ||
      evidence === undefined ||
      !classificationIdentityMatchesTheory(profile.result, theoryApplication, report.artifact.id) ||
      profile.result.realizationId !==
        requirementRealizationId(theoryApplication.result.requirementAddress)
    ) {
      return false;
    }
  }
  if (
    report.realizationProfiles.some(
      ({ result }) =>
        result.theoryResultIdentity.requirementAddress !==
        theoryApplication.result.requirementAddress,
    )
  ) {
    return false;
  }

  const conditionKinds = report.policyDecision.conditions.map(({ kind }) => kind);
  if (
    !unique(conditionKinds) ||
    conditionKinds.some(
      (kind) =>
        report.evidencePolicy[kind === "unsupported-by-target" ? "unsupportedByTarget" : kind] !==
        "report",
    ) ||
    conditionKinds.some(
      (kind, index) =>
        index > 0 &&
        ["assumptions", "unsupported-by-target", "unresolved"].indexOf(kind) <
          ["assumptions", "unsupported-by-target", "unresolved"].indexOf(
            conditionKinds[index - 1] ?? kind,
          ),
    )
  ) {
    return false;
  }
  const expectedConditions = makePolicyConditions(
    report.realizationProfiles,
    report.channelAnalyses,
  );
  if (
    expectedConditions.length !== report.policyDecision.conditions.length ||
    expectedConditions.some((expected, index) => {
      const actual = report.policyDecision.conditions[index];
      return (
        actual === undefined ||
        actual.kind !== expected.kind ||
        actual.disposition !== expected.disposition ||
        actual.subjects.length !== expected.subjects.length ||
        actual.subjects.some((subject, subjectIndex) => subject !== expected.subjects[subjectIndex])
      );
    })
  ) {
    return false;
  }
  if (
    channelAnalysis.report.protocolVersion !== channelAnalysis.theory.version ||
    channelAnalysis.report.schedules.length === 0
  ) {
    return false;
  }
  return true;
};

/** Strict M025 version-one project report. */
export const M025ProjectReportSchema = M025ProjectReportSchemaBase.check(
  Schema.makeFilter((report: ProjectReportValue) => reportIsConsistent(report), {
    expected: "a project report with consistent child identities and accepted policy",
  }),
);

/** The JSON string codec for strict M025 project reports. */
export const M025ProjectReportFromJson = Schema.fromJsonString(M025ProjectReportSchema);
export type M025ProjectReport = typeof M025ProjectReportSchema.Type;

export interface M025ProjectCompileResult {
  readonly selection: M025ProjectSelection;
  readonly artifact: CheckedSemanticArtifact;
  readonly report: M025ProjectReport;
  readonly text: string;
}

const formatTheoryResult = (
  application: M025ProjectReport["theoryApplications"][number],
): ReadonlyArray<string> => {
  const result = application.result;
  const lines = [
    `Theory application: ${application.id}`,
    `Theory: ${application.theory.id} v${application.theory.version}`,
    `Source: ${application.source}`,
    `Result: ${result._tag}`,
    `Artifact: ${result.artifactId} (${result.artifactFormat})`,
    `Requirement: ${result.requirementAddress}`,
    "Obligations:",
  ];
  for (const obligation of result.obligations)
    lines.push(`- ${obligation.id}: ${obligation.evidence}`);
  return lines;
};

const formatProjectReport = (
  report: M025ProjectReport,
  classificationText: string,
  channelText: string,
): string => {
  const sourceText = report.artifact.sources
    .map(({ id, path, format }) => `- ${id}: ${path} (${format})`)
    .join("\n");
  const provenanceText = report.artifact.provenance
    .map(({ declaration, path }) => `- ${declaration}: ${path}`)
    .join("\n");
  const conditionText = report.policyDecision.conditions.map(
    ({ kind, disposition, subjects }) =>
      `Policy condition: ${kind} -> ${disposition}; subjects=${subjects.join(", ")}`,
  );
  const lines = [
    "M025 single-authority project report",
    `Project: ${report.projectId}`,
    `Artifact: ${report.artifact.id} (${report.artifact.format})`,
    "Sources:",
    sourceText,
    "Artifact provenance:",
    provenanceText.length === 0 ? "- none" : provenanceText,
    "",
    ...formatTheoryResult(report.theoryApplications[0]),
    "",
    "Realization classifications:",
    classificationText.trimEnd(),
    "",
    "Bounded channel analysis:",
    channelText.trimEnd(),
    "",
    `Evidence policy: assumptions=${report.evidencePolicy.assumptions}; unsupportedByTarget=${report.evidencePolicy.unsupportedByTarget}; unresolved=${report.evidencePolicy.unresolved}`,
    ...conditionText,
    `Project policy: ${report.policyDecision.status}`,
  ];
  return `${lines.join("\n")}\n`;
};

const makePolicyConditions = (
  profiles: ReadonlyArray<M025ProjectReport["realizationProfiles"][number]>,
  channels: ReadonlyArray<M025ProjectReport["channelAnalyses"][number]>,
): ReadonlyArray<{
  readonly kind: "assumptions" | "unsupported-by-target" | "unresolved";
  readonly disposition: "reported";
  readonly subjects: ReadonlyArray<string>;
}> => {
  const assumptions = profiles
    .filter(({ result }) => result.assumptions.length > 0)
    .map(({ id }) => id);
  const unsupported = profiles
    .filter(
      ({ result }) =>
        result._tag === "Rejected" ||
        result.assessments.some(({ evidence }) =>
          evidence.some(({ class: evidenceClass }) => evidenceClass === "unsupported-by-target"),
        ),
    )
    .map(({ id }) => id);
  const unresolved = [
    ...profiles
      .filter(
        ({ result }) =>
          result._tag === "Unknown" ||
          result.assessments.some(({ disposition }) => disposition === "unresolved"),
      )
      .map(({ id }) => id),
    ...channels
      .filter(({ report }) => report.schedules.some(({ result }) => result === "Unresolved"))
      .map(({ id }) => id),
  ];
  const conditions: Array<{
    readonly kind: "assumptions" | "unsupported-by-target" | "unresolved";
    readonly disposition: "reported";
    readonly subjects: ReadonlyArray<string>;
  }> = [];
  if (assumptions.length > 0) {
    conditions.push({
      kind: "assumptions",
      disposition: "reported",
      subjects: [...new Set(assumptions)].toSorted(),
    });
  }
  if (unsupported.length > 0) {
    conditions.push({
      kind: "unsupported-by-target",
      disposition: "reported",
      subjects: [...new Set(unsupported)].toSorted(),
    });
  }
  if (unresolved.length > 0) {
    conditions.push({
      kind: "unresolved",
      disposition: "reported",
      subjects: [...new Set(unresolved)].toSorted(),
    });
  }
  return conditions;
};

const policyFieldFor = (
  kind: "assumptions" | "unsupported-by-target" | "unresolved",
): keyof M025ProjectSelection["evidencePolicy"] =>
  kind === "unsupported-by-target" ? "unsupportedByTarget" : kind;

const enforcePolicy = (
  selection: M025ProjectSelection,
  conditions: ReadonlyArray<{
    readonly kind: "assumptions" | "unsupported-by-target" | "unresolved";
    readonly subjects: ReadonlyArray<string>;
  }>,
  selectionPath: string,
): Effect.Effect<void, M025ProjectFailure> => {
  for (const condition of conditions) {
    if (selection.evidencePolicy[policyFieldFor(condition.kind)] === "reject") {
      const subject = condition.subjects[0];
      return Effect.fail(
        makeFailure("policy", selectionPath, `evidence policy rejected ${condition.kind}`, {
          reason: "policy-rejected",
          ...(subject === undefined ? {} : { identity: subject }),
        }),
      );
    }
  }
  return Effect.succeed(undefined);
};

const checkProjectReferences = (
  selection: M025ProjectSelection,
  selectionPath: string,
): Effect.Effect<void, M025ProjectFailure> => {
  if (!hasResolvedProjectReferences(selection)) {
    return Effect.fail(
      makeFailure("project", selectionPath, "project identities or references are invalid", {
        reason: "unresolved-reference",
        identity: selection.id,
      }),
    );
  }
  if (!hasOneProfilePerTarget(selection)) {
    return Effect.fail(
      makeFailure("project", selectionPath, "project must select one profile for each target", {
        reason: "profile-identity-mismatch",
        identity: selection.id,
      }),
    );
  }
  return Effect.succeed(undefined);
};

const checkTheoryOwnership = (
  selection: M025ProjectSelection,
  artifact: CheckedSemanticArtifact,
  theoryApplication: M025ProjectSelection["theories"][number],
  selectionPath: string,
): Effect.Effect<void, M025ProjectFailure> =>
  Effect.gen(function* () {
    const realizationId = requirementRealizationId(theoryApplication.requirement);
    if (realizationId === undefined) {
      return yield* Effect.fail(
        makeFailure("theory", selectionPath, "invalid exact-one requirement address", {
          reason: "unknown-requirement-address",
          identity: theoryApplication.requirement,
        }),
      );
    }
    const realization = artifact.core.declarations.find(
      (declaration) =>
        declaration.kind === "operationRealization" && declaration.id === realizationId,
    );
    if (realization === undefined) {
      return yield* Effect.fail(
        makeFailure("theory", selectionPath, `missing selected realization ${realizationId}`, {
          reason: "unknown-requirement-address",
          identity: realizationId,
        }),
      );
    }
    const source = sourceById(selection).get(theoryApplication.source);
    if (source === undefined) {
      return yield* Effect.fail(
        makeFailure("project", selectionPath, `missing theory source ${theoryApplication.source}`, {
          reason: "unresolved-reference",
          identity: theoryApplication.source,
        }),
      );
    }
    const provenance = artifact.provenance.find(({ declaration }) => declaration === realizationId);
    if (provenance === undefined || provenance.path !== source.path) {
      return yield* Effect.fail(
        makeFailure(
          "theory",
          selectionPath,
          "selected realization is not owned by the theory source",
          {
            reason: "source-identity-mismatch",
            identity: realizationId,
          },
        ),
      );
    }
  });

const decodeReport = (
  report: unknown,
  path: string,
): Effect.Effect<M025ProjectReport, M025ProjectFailure> =>
  Schema.decodeUnknownEffect(M025ProjectReportSchema)(report, parseOptions).pipe(
    Effect.mapError((issue) =>
      makeFailure("report", path, `invalid reconstructed M025 project report: ${String(issue)}`, {
        reason: "report-schema",
      }),
    ),
  );

export interface M025ProjectArtifactCompileResult {
  readonly selection: M025ProjectSelection;
  readonly artifact: CheckedSemanticArtifact;
  readonly encodedArtifact: string;
  readonly resolvedSelectionPath: string;
}

/**
 * Compile and independently consume one project semantic artifact without applying
 * project-level theory, target, or evidence policies.
 */
export const compileSelectedProjectArtifact = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  M025ProjectArtifactCompileResult,
  M025ProjectFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedSelectionPath = yield* resolveSafePath(root, selectionPath, path, "project");
    const selection = yield* decodeProjectSelection(
      yield* readText(resolvedSelectionPath, "project"),
      resolvedSelectionPath,
    );
    yield* checkProjectReferences(selection, resolvedSelectionPath);

    const loaded: Array<LoadedSource> = [];
    for (const source of selection.sources) loaded.push(yield* loadSource(root, source));
    const checkedCore = yield* validateCore(
      mergeDocuments(loaded.map(({ document }) => document)),
    ).pipe(
      Effect.mapError((error) =>
        makeFailure("core-validation", resolvedSelectionPath, error.message, {
          reason: "core-invalid",
          identity: selection.id,
        }),
      ),
    );
    const provenance = loaded.flatMap(({ provenance: sourceProvenance }) => sourceProvenance);
    const artifact = yield* produceSemanticArtifact(checkedCore, provenance, selection.id).pipe(
      Effect.mapError((error) =>
        makeFailure("artifact", resolvedSelectionPath, error.message, {
          reason: error.reason,
          ...(error.address === undefined ? {} : { identity: error.address }),
        }),
      ),
    );
    const encodedArtifact = encodeSemanticArtifact(artifact);
    const consumedArtifact = yield* consumeSemanticArtifact(encodedArtifact).pipe(
      Effect.mapError((error) =>
        makeFailure("artifact", resolvedSelectionPath, error.message, {
          reason: error.reason,
          ...(error.address === undefined ? {} : { identity: error.address }),
        }),
      ),
    );
    if (
      consumedArtifact.id !== artifact.id ||
      consumedArtifact.id !== selection.id ||
      encodeSemanticArtifact(consumedArtifact) !== encodedArtifact
    ) {
      return yield* Effect.fail(
        makeFailure("artifact", resolvedSelectionPath, "semantic artifact identity parity failed", {
          reason: "artifact-identity-mismatch",
          identity: selection.id,
        }),
      );
    }
    return {
      selection,
      artifact: consumedArtifact,
      encodedArtifact,
      resolvedSelectionPath,
    };
  });

/** Compile one project-owned M025 selection without loading child M022/M023 selections. */
export const compileSelectedProject = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  M025ProjectCompileResult,
  M025ProjectFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const {
      selection,
      artifact: consumedArtifact,
      encodedArtifact,
      resolvedSelectionPath,
    } = yield* compileSelectedProjectArtifact(root, selectionPath);

    const theoryApplication = selection.theories[0];
    if (theoryApplication === undefined) {
      return yield* Effect.fail(
        makeFailure(
          "project",
          resolvedSelectionPath,
          "project has no exact-one theory application",
          {
            reason: "missing-theory",
            identity: selection.id,
          },
        ),
      );
    }
    yield* checkTheoryOwnership(
      selection,
      consumedArtifact,
      theoryApplication,
      resolvedSelectionPath,
    );
    const theoryResult = yield* consumeExactOneCapabilityExecution(
      encodedArtifact,
      theoryApplication.requirement,
    ).pipe(
      Effect.mapError((error) =>
        makeFailure(
          error.reason === "invalid-artifact" || error.reason === "inconsistent-checked-core"
            ? "artifact"
            : "theory",
          resolvedSelectionPath,
          error.message,
          {
            reason: error.reason,
            ...(error.address === undefined ? {} : { identity: error.address }),
          },
        ),
      ),
    );
    if (theoryResult._tag !== "Applicable") {
      return yield* Effect.fail(
        makeFailure(
          "theory",
          resolvedSelectionPath,
          "selected exact-one theory is not applicable",
          {
            reason: "inapplicable-theory",
            identity: theoryApplication.id,
          },
        ),
      );
    }
    if (
      theoryResult.artifactId !== consumedArtifact.id ||
      theoryResult.theory.id !== theoryApplication.theory.id ||
      theoryResult.theory.version !== theoryApplication.theory.version ||
      theoryResult.requirementAddress !== theoryApplication.requirement
    ) {
      return yield* Effect.fail(
        makeFailure("theory", resolvedSelectionPath, "exact-one theory result identity mismatch", {
          reason: "theory-identity-mismatch",
          identity: theoryApplication.id,
        }),
      );
    }

    const targetMap = targetById(selection);
    const evidenceMap = evidenceById(selection);
    const theoryMap = theoryById(selection);
    const classificationTargets: ClassificationTarget[] = [];
    for (const profile of selection.realizationProfiles) {
      const target = targetMap.get(profile.target);
      const evidence = evidenceMap.get(profile.evidence);
      const theory = theoryMap.get(profile.theory);
      if (target === undefined || evidence === undefined || theory === undefined) {
        return yield* Effect.fail(
          makeFailure(
            "project",
            resolvedSelectionPath,
            "realization profile reference is unresolved",
            {
              reason: "unresolved-reference",
              identity: profile.id,
            },
          ),
        );
      }
      if (theory.id !== theoryApplication.id || evidence.kind !== "m018-single-use-capability") {
        return yield* Effect.fail(
          makeFailure(
            "project",
            resolvedSelectionPath,
            "realization profile is bound to the wrong input",
            {
              reason: "profile-identity-mismatch",
              identity: profile.id,
            },
          ),
        );
      }
      const selectedRealization = requirementRealizationId(theoryResult.requirementAddress);
      if (selectedRealization !== profile.realization) {
        return yield* Effect.fail(
          makeFailure(
            "target",
            resolvedSelectionPath,
            "selected realization does not match theory requirement",
            {
              reason: "realization-identity-mismatch",
              identity: profile.realization,
            },
          ),
        );
      }
      classificationTargets.push({ target: target.adapter, realization: profile.realization });
    }

    const evidenceInput = selection.evidence[0];
    if (evidenceInput === undefined) {
      return yield* Effect.fail(
        makeFailure("project", resolvedSelectionPath, "project has no M018 evidence input", {
          reason: "missing-evidence",
          identity: selection.id,
        }),
      );
    }
    const classification = yield* compileClassificationFromArtifact(
      root,
      consumedArtifact,
      theoryResult,
      evidenceInput.path,
      classificationTargets,
      resolvedSelectionPath,
    ).pipe(Effect.mapError(mapClassificationFailure));
    const resultByTarget = new Map(
      classification.results.map((result) => [result.targetId, result]),
    );
    const realizationProfiles: Array<{
      readonly id: string;
      readonly theory: string;
      readonly target: string;
      readonly evidence: string;
      readonly result: M023ClassificationResult;
    }> = [];
    for (const profile of [...selection.realizationProfiles].toSorted((left, right) => {
      const leftAdapter = targetMap.get(left.target)?.adapter;
      const rightAdapter = targetMap.get(right.target)?.adapter;
      return (
        (leftAdapter === "effect-typescript" ? 0 : 1) -
        (rightAdapter === "effect-typescript" ? 0 : 1)
      );
    })) {
      const target = targetMap.get(profile.target);
      const result = target === undefined ? undefined : resultByTarget.get(target.adapter);
      if (result === undefined) {
        return yield* Effect.fail(
          makeFailure("classification", resolvedSelectionPath, "missing classification result", {
            reason: "missing-target-result",
            identity: profile.id,
          }),
        );
      }
      realizationProfiles.push({
        id: profile.id,
        theory: profile.theory,
        target: profile.target,
        evidence: profile.evidence,
        result,
      });
    }

    const channelAnalysis = selection.channels[0];
    if (channelAnalysis === undefined) {
      return yield* Effect.fail(
        makeFailure("project", resolvedSelectionPath, "project has no bounded channel analysis", {
          reason: "missing-channel",
          identity: selection.id,
        }),
      );
    }
    const trace = yield* compileSelectedTrace(root, channelAnalysis.selection).pipe(
      Effect.mapError((error) => mapTraceFailure(error, channelAnalysis.id)),
    );
    if (
      trace.report.protocolVersion !== channelAnalysis.theory.version ||
      trace.report.schedules.length === 0
    ) {
      return yield* Effect.fail(
        makeFailure(
          "channel",
          channelAnalysis.selection,
          "bounded channel report identity mismatch",
          {
            reason: "channel-identity-mismatch",
            identity: channelAnalysis.id,
          },
        ),
      );
    }

    const reportUnknown = {
      bangProjectReport: 1 as const,
      projectId: selection.id,
      artifact: makeArtifactReport(selection, consumedArtifact),
      targets: [...selection.targets].toSorted(
        (left, right) =>
          (left.adapter === "effect-typescript" ? 0 : 1) -
          (right.adapter === "effect-typescript" ? 0 : 1),
      ),
      evidence: selection.evidence,
      theoryApplications: [
        {
          id: theoryApplication.id,
          theory: theoryApplication.theory,
          source: theoryApplication.source,
          result: theoryResult,
        },
      ],
      realizationProfiles,
      channelAnalyses: [
        {
          id: channelAnalysis.id,
          theory: channelAnalysis.theory,
          selection: channelAnalysis.selection,
          report: trace.report,
        },
      ],
      evidencePolicy: selection.evidencePolicy,
      policyDecision: {
        status: "Accepted" as const,
        conditions: makePolicyConditions(realizationProfiles, [
          {
            id: channelAnalysis.id,
            theory: channelAnalysis.theory,
            selection: channelAnalysis.selection,
            report: trace.report,
          },
        ]),
      },
    };
    yield* enforcePolicy(selection, reportUnknown.policyDecision.conditions, resolvedSelectionPath);
    const report = yield* decodeReport(reportUnknown, resolvedSelectionPath);
    return {
      selection,
      artifact: consumedArtifact,
      report,
      text: formatProjectReport(report, classification.text, trace.text),
    };
  });

/** Format an M025 failure without a stack trace or partial report. */
export const formatProjectFailure = (error: M025ProjectFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`];
  if (error.reason !== undefined) lines.push(`reason: ${error.reason}`);
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
