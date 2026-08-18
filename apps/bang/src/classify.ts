import { consumeSemanticArtifact, type CheckedSemanticArtifact } from "@bang/core";
import {
  checkM018SingleUseCapabilityEvidenceManifest,
  decodeM018SingleUseCapabilityEvidenceManifest,
  verifyM018SingleUseCapabilityEvidenceMaterials,
  type CheckedM018SingleUseCapabilityEvidenceManifest,
} from "@bang/evidence";
import { projectEffectSingleUseOperationRealization } from "@bang/target-effect";
import { projectGleamEntityOperationRealization } from "@bang/target-gleam";
import {
  classifyExactOneCapabilityExecution,
  decodeM023ClassificationResult,
  decodeM023RealizationProfile,
  encodeM023ClassificationResult,
  encodeM023RealizationProfile,
  M023_EXACT_ONE_OBLIGATION_IDS,
  M023RealizationProfileSchema,
} from "@bang/theories";
import type {
  ExactOneCapabilityExecutionResult,
  M023ClassificationResult,
  M023RealizationProfile,
} from "@bang/theories";
import { type Crypto, Effect, FileSystem, Path, Schema } from "effect";

import { compileSelectedExplanation } from "./explain.ts";

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

const ClassificationTargetSchema = Schema.Struct({
  target: Schema.Literals(["effect-typescript", "gleam-beam"]),
  realization: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
}).annotate({ parseOptions });

const ClassificationSelectionSchema = Schema.Struct({
  bangClassification: Schema.Literal(1),
  id: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  explanationSelection: RepositoryRelativePath,
  evidencePath: RepositoryRelativePath,
  targets: Schema.Tuple([ClassificationTargetSchema, ClassificationTargetSchema]),
}).annotate({ parseOptions });

/** Strict JSON input for one M023 classification run. */
export const ClassificationSelectionFromJson = Schema.fromJsonString(ClassificationSelectionSchema);
export type ClassificationSelection = typeof ClassificationSelectionSchema.Type;
export type ClassificationTarget = ClassificationSelection["targets"][number];

export type ClassificationStage =
  | "selection"
  | "artifact"
  | "evidence"
  | "target"
  | "profile"
  | "classification";

const ClassificationStageSchema = Schema.Literals([
  "selection",
  "artifact",
  "evidence",
  "target",
  "profile",
  "classification",
]);

/** A typed failure that prevents M023 from emitting a partial classification report. */
export class ClassificationFailure extends Schema.TaggedError<ClassificationFailure>()(
  "ClassificationFailure",
  {
    stage: ClassificationStageSchema,
    path: Schema.String,
    message: Schema.String,
    reason: Schema.optional(Schema.String),
    address: Schema.optional(Schema.String),
  },
) {}

const makeFailure = (
  stage: ClassificationStage,
  path: string,
  message: string,
  fields: { readonly reason?: string; readonly address?: string } = {},
): ClassificationFailure => new ClassificationFailure({ stage, path, message, ...fields });

const readText = (filePath: string, stage: ClassificationStage) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem
      .readFileString(filePath)
      .pipe(
        Effect.mapError((error) =>
          makeFailure(stage, filePath, error instanceof Error ? error.message : String(error)),
        ),
      );
  });

const resolveSafePath = (
  root: string,
  value: string,
  path: Path.Path,
  stage: ClassificationStage,
): Effect.Effect<string, ClassificationFailure> =>
  isRepositoryRelativePath(value)
    ? Effect.succeed(path.resolve(root, value))
    : Effect.fail(
        makeFailure(stage, value, "unsafe repository-relative path", {
          reason: "unsafe-path",
        }),
      );

const decodeSelection = (contents: string, filePath: string) =>
  Schema.decodeEffect(ClassificationSelectionFromJson)(contents, parseOptions).pipe(
    Effect.mapError((issue) =>
      makeFailure("selection", filePath, `invalid M023 classification selection: ${String(issue)}`),
    ),
  );

const checkTargets = (
  selection: ClassificationSelection,
  selectionPath: string,
): Effect.Effect<void, ClassificationFailure> => {
  const expected = ["effect-typescript", "gleam-beam"] as const;
  const actual = selection.targets.map(({ target }) => target);
  if (
    actual.length !== expected.length ||
    expected.some((target, index) => actual[index] !== target) ||
    new Set(actual).size !== expected.length
  ) {
    return Effect.fail(
      makeFailure(
        "selection",
        selectionPath,
        "M023 selection must contain exactly one effect-typescript target followed by one gleam-beam target",
        { reason: "invalid-target-set" },
      ),
    );
  }
  return Effect.succeed(undefined);
};

const materialReferences = (
  manifest: CheckedM018SingleUseCapabilityEvidenceManifest,
): ReadonlyArray<{ readonly path: string; readonly sha256: string }> =>
  [
    manifest.provenance.coreSource,
    manifest.provenance.generatedBoundary,
    manifest.provenance.realization,
  ]
    .map(({ path, sha256 }) => ({ path, sha256 }))
    .toSorted((left, right) => left.path.localeCompare(right.path));

const theoryResultIdentity = (result: {
  readonly artifactId: string;
  readonly artifactFormat: "bangSemanticArtifact:1";
  readonly theory: { readonly id: "ExactOneCapabilityExecution"; readonly version: 1 };
  readonly requirementAddress: string;
}) => ({
  artifactId: result.artifactId,
  artifactFormat: result.artifactFormat,
  theory: result.theory,
  requirementAddress: result.requirementAddress,
});

const makeProfile = (
  result: Extract<ExactOneCapabilityExecutionResult, { readonly _tag: "Applicable" }>,
  manifest: CheckedM018SingleUseCapabilityEvidenceManifest,
  target: ClassificationTarget,
  assessments: M023RealizationProfile["assessments"],
  targetRejection?: M023RealizationProfile["targetRejection"],
): M023RealizationProfile =>
  M023RealizationProfileSchema.make({
    bangRealizationProfile: 1,
    artifactId: result.artifactId,
    artifactFormat: result.artifactFormat,
    theoryResultIdentity: theoryResultIdentity(result),
    realizationId: target.realization,
    targetId: target.target,
    assessments,
    assumptions: [...manifest.qualification.assumptions].toSorted(),
    weakenings: [...manifest.qualification.weakenings].toSorted(),
    limitations: [...result.limitations].toSorted(),
    lifetime: manifest.qualification.lifetime,
    invalidators: [
      ...new Set([...result.invalidators, ...manifest.qualification.invalidators]),
    ].toSorted(),
    ...(targetRejection === undefined ? {} : { targetRejection }),
  });

type ProfileAssessment = M023RealizationProfile["assessments"][number];

const supportedAssessments = (
  result: Extract<ExactOneCapabilityExecutionResult, { readonly _tag: "Applicable" }>,
  manifest: CheckedM018SingleUseCapabilityEvidenceManifest,
  target: ClassificationTarget,
): M023RealizationProfile["assessments"] => {
  const materials = materialReferences(manifest);
  return M023_EXACT_ONE_OBLIGATION_IDS.map((obligationId) => {
    const evidence: Array<ProfileAssessment["evidence"][number]> = [
      {
        class: "structurally-derived",
        scope: `checked Core ${target.realization} projection`,
        producer: target.target,
        materials,
      },
    ];
    if (obligationId !== "ExactOneCapabilityExecution.obligation.check-before-consumption") {
      evidence.push(
        {
          class: "runtime-checked",
          scope: manifest.observation.scope,
          producer: manifest.producer.identity,
          materials,
        },
        {
          class: "assumed-truthful",
          scope: manifest.producer.trust,
          producer: manifest.producer.identity,
          materials,
        },
      );
    }
    return {
      obligationId,
      disposition: "supported" as const,
      evidence,
    } satisfies ProfileAssessment;
  });
};

const rejectedAssessments = (
  result: Extract<ExactOneCapabilityExecutionResult, { readonly _tag: "Applicable" }>,
  manifest: CheckedM018SingleUseCapabilityEvidenceManifest,
  target: ClassificationTarget,
  reason: string,
): M023RealizationProfile["assessments"] => {
  const materials = [manifest.provenance.coreSource];
  return M023_EXACT_ONE_OBLIGATION_IDS.map(
    (obligationId) =>
      ({
        obligationId,
        disposition: "rejected" as const,
        evidence: [
          {
            class: "unsupported-by-target" as const,
            scope: `${target.target} target projection`,
            producer: target.target,
            materials,
          },
        ],
        reason,
      }) satisfies ProfileAssessment,
  );
};

const formatMaterials = (
  materials: ReadonlyArray<{ readonly path: string; readonly sha256: string }>,
): string =>
  materials.length === 0
    ? "none"
    : materials.map(({ path, sha256 }) => `${path} [${sha256}]`).join("; ");

const formatProfile = (result: M023ClassificationResult): string => {
  const lines = [
    `${result.targetId} -> ${result._tag.toLowerCase()}`,
    `Artifact: ${result.artifactId} (${result.artifactFormat})`,
    `Theory: ${result.theoryResultIdentity.theory.id} v${result.theoryResultIdentity.theory.version}`,
    `Requirement: ${result.theoryResultIdentity.requirementAddress}`,
    `Realization: ${result.realizationId}`,
    "Obligations:",
  ];
  for (const assessment of result.assessments) {
    lines.push(`- ${assessment.obligationId}: ${assessment.disposition}`);
    for (const evidence of assessment.evidence) {
      lines.push(
        `  Evidence: ${evidence.class}; scope=${evidence.scope}; producer=${evidence.producer}; materials=${formatMaterials(evidence.materials)}`,
      );
    }
    if (assessment.reason !== undefined) lines.push(`  Reason: ${assessment.reason}`);
  }
  lines.push(
    `Assumptions: ${result.assumptions.length === 0 ? "none" : result.assumptions.join("; ")}`,
    `Weakenings: ${result.weakenings.length === 0 ? "none" : result.weakenings.join("; ")}`,
    `Limitations: ${result.limitations.length === 0 ? "none" : result.limitations.join("; ")}`,
    `Lifetime: ${result.lifetime}`,
    `Invalidators: ${result.invalidators.length === 0 ? "none" : result.invalidators.join("; ")}`,
  );
  if (result.targetRejection !== undefined) {
    lines.push(
      `Target rejection: adapter=${result.targetRejection.adapter}; address=${result.targetRejection.address}; reason=${result.targetRejection.reason}`,
    );
  }
  return lines.join("\n");
};

export interface ClassificationArtifactCompileResult {
  readonly artifact: CheckedSemanticArtifact;
  readonly evidence: CheckedM018SingleUseCapabilityEvidenceManifest;
  readonly results: ReadonlyArray<M023ClassificationResult>;
  readonly text: string;
}

export interface ClassificationCompileResult extends ClassificationArtifactCompileResult {
  readonly selection: ClassificationSelection;
}

const classifyProfile = (
  profile: M023RealizationProfile,
  result: Extract<ExactOneCapabilityExecutionResult, { readonly _tag: "Applicable" }>,
  path: string,
) =>
  Effect.gen(function* () {
    const encoded = yield* encodeM023RealizationProfile(profile).pipe(
      Effect.mapError((error) =>
        makeFailure("profile", path, error.message, {
          reason: error.reason,
          address: error.identity,
        }),
      ),
    );
    const decoded = yield* decodeM023RealizationProfile(encoded).pipe(
      Effect.mapError((error) =>
        makeFailure("profile", path, error.message, {
          reason: error.reason,
          address: error.identity,
        }),
      ),
    );
    const classified = yield* classifyExactOneCapabilityExecution(decoded, result).pipe(
      Effect.mapError((error) =>
        makeFailure("classification", path, error.message, {
          reason: error.reason,
          address: error.identity,
        }),
      ),
    );
    const encodedResult = yield* encodeM023ClassificationResult(classified).pipe(
      Effect.mapError((error) =>
        makeFailure("classification", path, error.message, {
          reason: error.reason,
          address: error.identity,
        }),
      ),
    );
    return yield* decodeM023ClassificationResult(encodedResult).pipe(
      Effect.mapError((error) =>
        makeFailure("classification", path, error.message, {
          reason: error.reason,
          address: error.identity,
        }),
      ),
    );
  });

const makeEffectProfile = (
  artifact: CheckedSemanticArtifact,
  evidence: CheckedM018SingleUseCapabilityEvidenceManifest,
  result: Extract<ExactOneCapabilityExecutionResult, { readonly _tag: "Applicable" }>,
  target: ClassificationTarget,
  selectionPath: string,
) =>
  Effect.gen(function* () {
    const projection = yield* projectEffectSingleUseOperationRealization(
      artifact.core,
      target.realization,
    ).pipe(
      Effect.mapError((error) =>
        makeFailure("target", selectionPath, error.message, {
          reason: error.reason,
          address: error.source,
        }),
      ),
    );
    if (projection.length === 0) {
      return yield* Effect.fail(
        makeFailure("target", selectionPath, "Effect adapter returned an empty projection", {
          reason: "unsupported-target",
        }),
      );
    }
    const profile = makeProfile(
      result,
      evidence,
      target,
      supportedAssessments(result, evidence, target),
    );
    return yield* classifyProfile(profile, result, selectionPath);
  });

const makeGleamProfile = (
  artifact: CheckedSemanticArtifact,
  evidence: CheckedM018SingleUseCapabilityEvidenceManifest,
  result: Extract<ExactOneCapabilityExecutionResult, { readonly _tag: "Applicable" }>,
  target: ClassificationTarget,
  selectionPath: string,
) =>
  Effect.gen(function* () {
    const realization = artifact.core.declarations.find(
      (
        declaration,
      ): declaration is Extract<
        (typeof artifact.core.declarations)[number],
        { kind: "operationRealization" }
      > => declaration.kind === "operationRealization" && declaration.id === target.realization,
    );
    if (realization === undefined) {
      return yield* Effect.fail(
        makeFailure("target", selectionPath, `missing checked realization ${target.realization}`, {
          reason: "missing-declaration",
        }),
      );
    }
    const projection = projectGleamEntityOperationRealization(
      artifact.core,
      realization.operation.stateMachine,
      target.realization,
    );
    if (projection.ok) {
      return yield* Effect.fail(
        makeFailure(
          "target",
          selectionPath,
          "Gleam adapter unexpectedly accepted exact-one realization",
          { reason: "adapter-contract-violation" },
        ),
      );
    }
    const baseProfile = makeProfile(
      result,
      evidence,
      target,
      rejectedAssessments(result, evidence, target, projection.error.message),
      {
        adapter: target.target,
        address: projection.error.source,
        reason: `${projection.error.reason}: ${projection.error.message}`,
      },
    );
    const profile = M023RealizationProfileSchema.make({
      ...baseProfile,
      assumptions: [],
      weakenings: [],
      lifetime: "valid while the checked Core and Gleam target adapter remain unchanged",
      invalidators: [...result.invalidators].toSorted(),
    });
    return yield* classifyProfile(profile, result, selectionPath);
  });

const targetOrder = (target: ClassificationTarget): number =>
  target.target === "effect-typescript" ? 0 : 1;

/** Compile and classify selected M023 realizations from a checked semantic artifact. */
export const compileClassificationFromArtifact = (
  root: string,
  artifact: CheckedSemanticArtifact,
  result: Extract<ExactOneCapabilityExecutionResult, { readonly _tag: "Applicable" }>,
  evidencePath: string,
  targets: ReadonlyArray<ClassificationTarget>,
  diagnosticPath: string,
): Effect.Effect<
  ClassificationArtifactCompileResult,
  ClassificationFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedEvidencePath = yield* resolveSafePath(root, evidencePath, path, "evidence");
    const requirementMarker = ".requirement:";
    const markerIndex = result.requirementAddress.indexOf(requirementMarker);
    const selectedRealization =
      result.requirementAddress.startsWith("operationRealization:") &&
      markerIndex > "operationRealization:".length
        ? result.requirementAddress.slice("operationRealization:".length, markerIndex)
        : undefined;
    if (
      selectedRealization === undefined ||
      targets.some(({ realization }) => realization !== selectedRealization)
    ) {
      return yield* makeFailure(
        "selection",
        diagnosticPath,
        "selected target realization does not match the applicable M022 requirement",
        {
          reason: "realization-identity-mismatch",
          address: result.requirementAddress,
        },
      );
    }

    const decodedEvidence = yield* decodeM018SingleUseCapabilityEvidenceManifest(
      yield* readText(resolvedEvidencePath, "evidence"),
    ).pipe(
      Effect.mapError((error) =>
        makeFailure("evidence", resolvedEvidencePath, error.message, { reason: error.reason }),
      ),
    );
    const checkedEvidence = yield* checkM018SingleUseCapabilityEvidenceManifest(
      decodedEvidence,
      artifact.core,
    ).pipe(
      Effect.mapError((error) =>
        makeFailure("evidence", resolvedEvidencePath, error.message, { reason: error.reason }),
      ),
    );
    const artifactSourcePaths = new Set(
      artifact.provenance.map(({ path: sourcePath }) => sourcePath),
    );
    if (!artifactSourcePaths.has(checkedEvidence.provenance.coreSource.path)) {
      return yield* makeFailure(
        "evidence",
        checkedEvidence.provenance.coreSource.path,
        "M018 Core material is not a source of the classified semantic artifact",
        { reason: "evidence-source-mismatch" },
      );
    }
    for (const material of materialReferences(checkedEvidence)) {
      if (!isRepositoryRelativePath(material.path)) {
        return yield* makeFailure("evidence", material.path, "unsafe M018 material path", {
          reason: "unsafe-path",
        });
      }
    }
    yield* verifyM018SingleUseCapabilityEvidenceMaterials(checkedEvidence).pipe(
      Effect.mapError((error) =>
        makeFailure("evidence", resolvedEvidencePath, error.message, { reason: error.reason }),
      ),
    );

    const orderedTargets = [...targets].toSorted(
      (left, right) => targetOrder(left) - targetOrder(right),
    );
    const results: M023ClassificationResult[] = [];
    for (const target of orderedTargets) {
      const classified =
        target.target === "effect-typescript"
          ? yield* makeEffectProfile(artifact, checkedEvidence, result, target, diagnosticPath)
          : yield* makeGleamProfile(artifact, checkedEvidence, result, target, diagnosticPath);
      results.push(classified);
    }
    return {
      artifact,
      evidence: checkedEvidence,
      results,
      text: `${results.map(formatProfile).join("\n\n")}\n`,
    };
  });

/** Compile and classify both selected M023 realizations without emitting partial output. */
export const compileSelectedClassification = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  ClassificationCompileResult,
  ClassificationFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedSelectionPath = yield* resolveSafePath(root, selectionPath, path, "selection");
    const selection = yield* decodeSelection(
      yield* readText(resolvedSelectionPath, "selection"),
      resolvedSelectionPath,
    );
    yield* checkTargets(selection, resolvedSelectionPath);
    const explanationSelectionPath = yield* resolveSafePath(
      root,
      selection.explanationSelection,
      path,
      "selection",
    );

    const explanation = yield* compileSelectedExplanation(
      root,
      selection.explanationSelection,
    ).pipe(
      Effect.mapError((error) =>
        makeFailure("artifact", explanationSelectionPath, error.message, {
          reason: error.stage,
          ...(error.address === undefined ? {} : { address: error.address }),
        }),
      ),
    );
    if (explanation.result._tag !== "Applicable") {
      return yield* Effect.fail(
        makeFailure(
          "artifact",
          explanationSelectionPath,
          "selected M022 theory result is not applicable",
          { reason: "inapplicable-theory" },
        ),
      );
    }
    const artifact = yield* consumeSemanticArtifact(explanation.encodedArtifact).pipe(
      Effect.mapError((error) =>
        makeFailure("artifact", explanationSelectionPath, error.message, {
          reason: error.reason,
          ...(error.address === undefined ? {} : { address: error.address }),
        }),
      ),
    );
    if (artifact.id !== explanation.result.artifactId) {
      return yield* Effect.fail(
        makeFailure(
          "artifact",
          explanationSelectionPath,
          "M022 result and consumed semantic artifact identities differ",
          { reason: "artifact-identity-mismatch" },
        ),
      );
    }

    const compiled = yield* compileClassificationFromArtifact(
      root,
      artifact,
      explanation.result,
      selection.evidencePath,
      selection.targets,
      resolvedSelectionPath,
    );
    return { selection, ...compiled };
  });

/** Format one M023 failure without a stack trace or partial report. */
export const formatClassificationFailure = (error: ClassificationFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`];
  if (error.reason !== undefined) lines.push(`reason: ${error.reason}`);
  if (error.address !== undefined) lines.push(`address: ${error.address}`);
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};
