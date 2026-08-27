import {
  consumeSemanticArtifact,
  encodeCanonicalJson,
  type CheckedSemanticArtifact,
  type OperationRealizationDeclaration,
  type StateMachineDeclaration,
  type StateOperation,
  type StatePredicate,
  type StateValue,
} from "@bang/core";
import {
  checkM018SingleUseCapabilityEvidenceManifest,
  decodeM018SingleUseCapabilityEvidenceManifest,
  verifyM018SingleUseCapabilityEvidenceMaterials,
  checkM031TargetQualificationEvidence,
  checkM031TargetQualificationEvidenceSet,
  decodeM031TargetQualificationEvidence,
  encodeM031TargetQualificationEvidence,
  verifyM031TargetQualificationEvidenceMaterialBytes,
  verifyM031TargetQualificationEvidencePackageDigest,
  type CheckedM018SingleUseCapabilityEvidenceManifest,
  type CheckedM031TargetQualificationEvidence,
} from "@bang/evidence";
import {
  projectEffectSingleUseOperationRealization,
  projectEffectSingleUseOperationRealizationMaterials,
} from "@bang/target-effect";
import {
  projectGleamEntityOperationRealization,
  projectGleamExactOneOperationRealization,
} from "@bang/target-gleam";
import {
  classifyExactOneCapabilityExecution,
  decodeM023ClassificationResult,
  decodeM023RealizationProfile,
  encodeExactOneCapabilityExecutionPackage,
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
import { Crypto, Effect, Encoding, FileSystem, Path, Schema, Stream, type Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { publishAtomically, type PublicationEntry } from "./publication.ts";
export { PublicationEntrySchema, PublicationFailure, publishAtomically } from "./publication.ts";
export type { PublicationEntry } from "./publication.ts";
import {
  compileSelectedExplanation,
  compileSelectedExplanationStaged,
  type StagedExplanationResult,
} from "./explain.ts";

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

const ClassificationTargetV1Schema = Schema.Struct({
  target: Schema.Literals(["effect-typescript", "gleam-beam"]),
  realization: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
}).annotate({ parseOptions });

const ClassificationTargetV2Schema = Schema.Struct({
  target: Schema.Literals(["effect-typescript", "gleam-beam"]),
  realization: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  probe: Schema.Literal("fresh"),
}).annotate({ parseOptions });

const ClassificationSelectionV1Schema = Schema.Struct({
  bangClassification: Schema.Literal(1),
  id: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  explanationSelection: RepositoryRelativePath,
  evidencePath: RepositoryRelativePath,
  targets: Schema.Tuple([ClassificationTargetV1Schema, ClassificationTargetV1Schema]),
}).annotate({ parseOptions });

const ClassificationSelectionV2Schema = Schema.Struct({
  bangClassification: Schema.Literal(2),
  id: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  explanationSelection: RepositoryRelativePath,
  targets: Schema.Tuple([ClassificationTargetV2Schema, ClassificationTargetV2Schema]),
}).annotate({ parseOptions });

const ClassificationSelectionSchema = Schema.Union([
  ClassificationSelectionV1Schema,
  ClassificationSelectionV2Schema,
]).annotate({ parseOptions });

/** Strict JSON input for one M023 or M031 classification run. */
export const ClassificationSelectionFromJson = Schema.fromJsonString(ClassificationSelectionSchema);
export type ClassificationSelectionV1 = typeof ClassificationSelectionV1Schema.Type;
export type ClassificationSelectionV2 = typeof ClassificationSelectionV2Schema.Type;
export type ClassificationSelection = typeof ClassificationSelectionSchema.Type;
export type ClassificationTarget = ClassificationSelection["targets"][number];

export type ClassificationStage =
  | "selection"
  | "artifact"
  | "package"
  | "evidence"
  | "target"
  | "execution"
  | "profile"
  | "classification"
  | "publication";

const ClassificationStageSchema = Schema.Literals([
  "selection",
  "artifact",
  "package",
  "evidence",
  "target",
  "execution",
  "profile",
  "classification",
  "publication",
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
      makeFailure(
        "selection",
        filePath,
        `invalid M023/M031 classification selection: ${String(issue)}`,
      ),
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
        `${selection.bangClassification === 2 ? "M031" : "M023"} selection must contain exactly one effect-typescript target followed by one gleam-beam target`,
        { reason: "invalid-target-set" },
      ),
    );
  }
  if (selection.bangClassification === 2) {
    const realizations = new Set(selection.targets.map(({ realization }) => realization));
    if (realizations.size !== 1 || selection.targets.some(({ probe }) => probe !== "fresh")) {
      return Effect.fail(
        makeFailure(
          "selection",
          selectionPath,
          "M031 selection must use the same fresh realization probe for both targets",
          { reason: "invalid-target-selection" },
        ),
      );
    }
  }
  return Effect.succeed(undefined);
};
interface M031QualificationSubject {
  readonly machine: StateMachineDeclaration;
  readonly initializer: StateOperation;
  readonly operation: StateOperation;
  readonly realization: OperationRealizationDeclaration;
  readonly capability: string;
  readonly stateField: string;
  readonly initializerParameter: string;
  readonly operationParameter: string;
  readonly entityId: string;
  readonly wrongEntityId: string;
  readonly gleamModule: string;
}

const identifierWords = (value: string): ReadonlyArray<string> =>
  value
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .toLowerCase()
    .split("-");

const matchesStateValue = (
  value: StateValue,
  kind: StateValue["kind"],
  identity: string,
): boolean => {
  switch (kind) {
    case "parameter":
      return value.kind === kind && value.id === identity;
    case "stateField":
      return value.kind === kind && value.field === identity;
    case "integerLiteral":
      return value.kind === kind && value.value === identity;
  }
};

const matchesStatePredicate = (
  predicate: StatePredicate,
  leftKind: StateValue["kind"],
  leftIdentity: string,
  rightKind: StateValue["kind"],
  rightIdentity: string,
): boolean =>
  matchesStateValue(predicate.left, leftKind, leftIdentity) &&
  matchesStateValue(predicate.right, rightKind, rightIdentity);

const resolveM031QualificationSubject = (
  core: CheckedSemanticArtifact["core"],
  realizationId: string,
  requirementAddress: string,
  diagnosticPath: string,
): Effect.Effect<M031QualificationSubject, ClassificationFailure> => {
  const unsupported = (
    message: string,
    address: string,
  ): Effect.Effect<never, ClassificationFailure> =>
    Effect.fail(
      makeFailure("target", diagnosticPath, message, {
        reason: "unsupported-target",
        address,
      }),
    );
  const realization = core.declarations.find(
    (declaration) =>
      declaration.kind === "operationRealization" && declaration.id === realizationId,
  );
  if (realization?.kind !== "operationRealization") {
    return Effect.fail(
      makeFailure("target", diagnosticPath, `missing checked realization ${realizationId}`, {
        reason: "missing-declaration",
        address: `operationRealization:${realizationId}`,
      }),
    );
  }
  const requirement = realization.requires[0];
  if (
    realization.requires.length !== 1 ||
    requirement === undefined ||
    requirement.quantity.kind !== "exactly" ||
    requirement.quantity.uses !== "1"
  ) {
    return unsupported(
      `M031 requires one exactly-1 capability requirement on ${realization.id}`,
      `operationRealization:${realization.id}`,
    );
  }
  const expectedRequirementAddress = `operationRealization:${realization.id}.requirement:${requirement.capability}`;
  if (requirementAddress !== expectedRequirementAddress) {
    return Effect.fail(
      makeFailure(
        "selection",
        diagnosticPath,
        "M031 selection realization does not match the applicable theory requirement",
        {
          reason: "invalid-target-selection",
          address: requirementAddress,
        },
      ),
    );
  }
  const capability = core.declarations.find(
    (declaration) => declaration.kind === "capability" && declaration.id === requirement.capability,
  );
  if (capability?.kind !== "capability") {
    return Effect.fail(
      makeFailure(
        "target",
        diagnosticPath,
        `missing checked capability ${requirement.capability}`,
        {
          reason: "missing-declaration",
          address: `capability:${requirement.capability}`,
        },
      ),
    );
  }
  const machine = core.declarations.find(
    (declaration) =>
      declaration.kind === "stateMachine" && declaration.id === realization.operation.stateMachine,
  );
  if (machine?.kind !== "stateMachine") {
    return Effect.fail(
      makeFailure(
        "target",
        diagnosticPath,
        `missing checked state machine ${realization.operation.stateMachine}`,
        {
          reason: "missing-declaration",
          address: `stateMachine:${realization.operation.stateMachine}`,
        },
      ),
    );
  }
  const operation = machine.transitions.find(({ id }) => id === realization.operation.operation);
  if (operation === undefined) {
    return Effect.fail(
      makeFailure(
        "target",
        diagnosticPath,
        `missing checked operation ${machine.id}.${realization.operation.operation}`,
        {
          reason: "missing-declaration",
          address: `operation:${machine.id}.${realization.operation.operation}`,
        },
      ),
    );
  }
  const stateField = machine.state.fields[0];
  const initializer = machine.initializers[0];
  const initializerParameter = initializer?.parameters[0];
  const operationParameter = operation.parameters[0];
  const invariant = machine.invariants[0];
  if (
    machine.state.fields.length !== 1 ||
    stateField?.type !== "Integer" ||
    machine.initializers.length !== 1 ||
    initializer === undefined ||
    initializer.parameters.length !== 1 ||
    initializerParameter?.type !== "Integer" ||
    machine.transitions.length !== 1 ||
    operation.parameters.length !== 1 ||
    operationParameter?.type !== "Integer" ||
    machine.invariants.length !== 1 ||
    invariant === undefined
  ) {
    return unsupported(
      `M031 target profile does not support the checked shape of ${machine.id}`,
      `stateMachine:${machine.id}`,
    );
  }
  if (
    initializer.requires.length !== 1 ||
    !matchesStatePredicate(
      initializer.requires[0]!,
      "parameter",
      initializerParameter.id,
      "integerLiteral",
      "0",
    )
  ) {
    return unsupported(
      `M031 target profile does not support initializer predicate ${initializer.id}`,
      `stateMachine:${machine.id}.initializer:${initializer.id}`,
    );
  }
  if (
    operation.requires.length !== 2 ||
    !operation.requires.some((predicate) =>
      matchesStatePredicate(predicate, "parameter", operationParameter.id, "integerLiteral", "0"),
    ) ||
    !operation.requires.some((predicate) =>
      matchesStatePredicate(
        predicate,
        "stateField",
        stateField.id,
        "parameter",
        operationParameter.id,
      ),
    )
  ) {
    return unsupported(
      `M031 target profile does not support transition predicates ${operation.id}`,
      `stateMachine:${machine.id}.transition:${operation.id}`,
    );
  }
  if (
    !matchesStatePredicate(
      invariant.proposition,
      "stateField",
      stateField.id,
      "integerLiteral",
      "0",
    )
  ) {
    return unsupported(
      `M031 target profile does not support invariant ${invariant.id}`,
      `stateMachine:${machine.id}.invariant:${invariant.id}`,
    );
  }
  const words = identifierWords(machine.id);
  const entityBase = words.join("-");
  return Effect.succeed({
    machine,
    initializer,
    operation,
    realization,
    capability: capability.id,
    stateField: stateField.id,
    initializerParameter: initializerParameter.id,
    operationParameter: operationParameter.id,
    entityId: `${entityBase}-1`,
    wrongEntityId: `${entityBase}-2`,
    gleamModule: `${words.join("_")}_entity`,
  });
};

const M031ActorRestartSchema = Schema.Struct({
  oldGrantRejected: Schema.Boolean,
  freshGrantDistinct: Schema.Boolean,
  replacementGrantAccepted: Schema.Boolean,
}).annotate({ parseOptions });

const M031TraceSchema = Schema.Struct({
  valid: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  reuse: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  competing: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  wrongDestination: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  disabled: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  defect: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  stale: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  replacement: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
}).annotate({ parseOptions });

export const M031ProbeObservationSchema = Schema.Struct({
  target: Schema.Literals(["effect-typescript", "gleam-beam"]),
  realization: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  entity: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  validCall: Schema.Boolean,
  reuse: Schema.Boolean,
  competing: Schema.Boolean,
  competingSuccesses: Schema.Natural,
  competingRejections: Schema.Natural,
  wrongDestination: Schema.Boolean,
  disabled: Schema.Boolean,
  defect: Schema.Boolean,
  stateTrace: M031TraceSchema,
  remainingTrace: M031TraceSchema,
  actorRestart: Schema.optional(M031ActorRestartSchema),
  supervised: Schema.optional(Schema.Boolean),
}).annotate({ parseOptions });
export const M031ProbeObservationFromJson = Schema.fromJsonString(M031ProbeObservationSchema);
export type M031ProbeObservation = typeof M031ProbeObservationSchema.Type;
export const normalizeM031ProbeObservation = (observation: M031ProbeObservation) => ({
  target: observation.target,
  realization: observation.realization,
  entity: observation.entity,
  validCall: observation.validCall,
  reuse: observation.reuse,
  competing: observation.competing,
  competingSuccesses: observation.competingSuccesses,
  competingRejections: observation.competingRejections,
  wrongDestination: observation.wrongDestination,
  disabled: observation.disabled,
  defect: observation.defect,
  stateTrace: observation.stateTrace,
  remainingTrace: observation.remainingTrace,
  ...(observation.actorRestart === undefined
    ? {}
    : {
        actorRestart: {
          ...observation.actorRestart,
          supervised: observation.supervised ?? true,
        },
      }),
});

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

const runM031Process = (
  application: string,
  arguments_: ReadonlyArray<string>,
  cwd: string,
  diagnosticPath: string,
): Effect.Effect<
  string,
  ClassificationFailure,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make(application, [...arguments_], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    }).pipe(
      Effect.mapError((error) =>
        makeFailure(
          "execution",
          diagnosticPath,
          `could not start ${application}: ${String(error)}`,
          {
            reason: "process-start-failed",
          },
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
        makeFailure(
          "execution",
          diagnosticPath,
          `could not collect ${application}: ${String(error)}`,
          {
            reason: "process-output-failed",
          },
        ),
      ),
    );
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* Effect.fail(
        makeFailure(
          "execution",
          diagnosticPath,
          stderr.trim() || `${application} exited ${exitCode}`,
          { reason: "process-failed" },
        ),
      );
    }
    return stdout;
  });

const gleamProbeRunnerSource = (moduleName: string): string => `
import bang/${moduleName}
import gleam/io

pub fn main() {
  io.println(${moduleName}.run_exact_one_probe())
}
`;

const decodeM031ProbeOutput = (
  output: string,
  target: ClassificationTarget,
  diagnosticPath: string,
): Effect.Effect<M031ProbeObservation, ClassificationFailure> => {
  const marker = "BANG_M031_RESULT|";
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(marker));
  const payload =
    target.target === "gleam-beam" ? lines.at(-1)?.slice(marker.length) : output.trim();
  if (payload === undefined || payload.length === 0) {
    return Effect.fail(
      makeFailure("execution", diagnosticPath, "target probe emitted no M031 result", {
        reason: "malformed-target-output",
      }),
    );
  }
  return Schema.decodeEffect(M031ProbeObservationFromJson)(payload, parseOptions).pipe(
    Effect.mapError((issue) =>
      makeFailure("execution", diagnosticPath, `invalid M031 target output: ${String(issue)}`, {
        reason: "malformed-target-output",
      }),
    ),
  );
};

interface M031TargetRun {
  readonly target: ClassificationTarget;
  readonly projection: string;
  readonly generatedPath: string;
  readonly generatedBytes: Uint8Array;
  readonly observation: M031ProbeObservation;
}

const m031DigestBytes = Effect.fn("bangM031.digestBytes")(function* (bytes: Uint8Array) {
  const crypto = yield* Crypto.Crypto;
  const digest = yield* crypto.digest("SHA-256", bytes).pipe(
    Effect.mapError((error) =>
      makeFailure("evidence", "M031 material", `could not digest M031 material: ${String(error)}`, {
        reason: "material-digest-failed",
      }),
    ),
  );
  return Encoding.encodeHex(digest);
});

const m031ReadMaterial = (
  root: string,
  materialPath: string,
): Effect.Effect<
  { readonly path: string; readonly bytes: Uint8Array; readonly sha256: string },
  ClassificationFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const bytes = yield* fileSystem.readFile(path.resolve(root, materialPath)).pipe(
      Effect.mapError((error) =>
        makeFailure("evidence", materialPath, `could not read M031 material: ${String(error)}`, {
          reason: "material-unavailable",
        }),
      ),
    );
    return { path: materialPath, bytes, sha256: yield* m031DigestBytes(bytes) };
  });

const makeM031Evidence = (
  root: string,
  staged: StagedExplanationResult,
  core: CheckedSemanticArtifact["core"],
  subject: M031QualificationSubject,
  selection: ClassificationSelectionV2,
  targetRun: M031TargetRun,
  diagnosticPath: string,
): Effect.Effect<
  {
    readonly checked: CheckedM031TargetQualificationEvidence;
    readonly encoded: string;
    readonly materials: Readonly<Record<string, Uint8Array>>;
  },
  ClassificationFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const packageResolution = staged.packageResolution;
    if (packageResolution === undefined) {
      return yield* Effect.fail(
        makeFailure("package", diagnosticPath, "M031 requires a resolved packaged explanation", {
          reason: "missing-package",
        }),
      );
    }
    const coreSourcePath = staged.artifact.provenance[0]?.path;
    if (coreSourcePath === undefined) {
      return yield* Effect.fail(
        makeFailure("evidence", diagnosticPath, "M031 artifact has no Core source provenance", {
          reason: "missing-core-material",
        }),
      );
    }
    const coreMaterial = yield* m031ReadMaterial(root, coreSourcePath);
    const targetMaterial = {
      path: targetRun.generatedPath,
      bytes: targetRun.generatedBytes,
      sha256: yield* m031DigestBytes(targetRun.generatedBytes),
    };
    const observations = normalizeM031ProbeObservation(targetRun.observation);
    const raw = {
      bangTargetQualificationEvidence: 1 as const,
      selectionId: selection.id,
      targetId: targetRun.target.target,
      realizationId: subject.realization.id,
      artifactId: staged.result.artifactId,
      artifactFormat: staged.result.artifactFormat,
      theory: staged.result.theory,
      package: {
        id: packageResolution.resolved.package.identity.id,
        version: packageResolution.resolved.package.identity.version,
        semanticDigest: packageResolution.resolved.semanticDigest,
      },
      requirementAddress: staged.result.requirementAddress,
      observations,
      materials: [
        { role: "core-source", path: coreMaterial.path, sha256: coreMaterial.sha256 },
        {
          role:
            targetRun.target.target === "effect-typescript"
              ? "generated-effect-boundary"
              : "generated-gleam-boundary",
          path: targetMaterial.path,
          sha256: targetMaterial.sha256,
        },
      ],
      producer: {
        identity:
          targetRun.target.target === "effect-typescript"
            ? "BANG M031 Effect exact-one probe"
            : "BANG M031 Gleam BEAM exact-one probe",
        version: "1",
        targetId: targetRun.target.target,
      },
      assumptions:
        targetRun.target.target === "effect-typescript"
          ? [
              "the staged generated Effect boundary and independent implementation are the executed target",
              "the diagnostic process reports the generated boundary without an unobserved bypass",
            ]
          : [
              "the staged generated Gleam actor and real BEAM supervisor are the executed target",
              "actor incarnation is target state and is not a Core capability identity",
            ],
      weakenings:
        targetRun.target.target === "effect-typescript"
          ? [
              "TypeScript and Effect cannot make the grant universally unforgeable",
              "this runtime journey observes one grant in one process and does not prove distributed exactly-once delivery",
            ]
          : [
              "BEAM supervision and actor incarnation are target-local lifecycle behavior",
              "this runtime journey does not establish durable grants across host or node failure",
            ],
      limitations: [
        "termination, productivity, memory, and work bounds are not established",
        "fairness and message delivery are not established",
        "distributed exactly-once execution is not established",
      ],
      lifetime:
        targetRun.target.target === "effect-typescript"
          ? "valid for the scoped fresh Effect probe while checked and generated materials remain unchanged"
          : "valid for the supervised fresh Gleam probe while checked, generated, and toolchain materials remain unchanged",
      invalidators:
        targetRun.target.target === "effect-typescript"
          ? [
              "checked Core declaration, quantity, or failure identity changes",
              "generated Effect boundary, implementation, or runtime order changes",
            ]
          : [
              "checked Core declaration, quantity, or failure identity changes",
              "generated Gleam actor, supervisor lifecycle, or toolchain changes",
            ],
    };
    const decoded = yield* decodeM031TargetQualificationEvidence(JSON.stringify(raw)).pipe(
      Effect.mapError((error) =>
        makeFailure("evidence", diagnosticPath, error.message, {
          reason: error.reason,
        }),
      ),
    );
    const checked = yield* checkM031TargetQualificationEvidence(decoded, {
      selectionId: selection.id,
      targetId: targetRun.target.target,
      realizationId: subject.realization.id,
      artifactId: staged.result.artifactId,
      artifactFormat: staged.result.artifactFormat,
      theory: staged.result.theory,
      package: raw.package,
      requirementAddress: staged.result.requirementAddress,
      result: {
        artifactId: staged.result.artifactId,
        artifactFormat: staged.result.artifactFormat,
        theory: staged.result.theory,
        requirementAddress: staged.result.requirementAddress,
      },
      core,
    }).pipe(
      Effect.mapError((error) =>
        makeFailure("evidence", diagnosticPath, error.message, {
          reason: error.reason,
        }),
      ),
    );
    const encoded = encodeM031TargetQualificationEvidence(decoded);
    const materials = {
      [coreMaterial.path]: coreMaterial.bytes,
      [targetMaterial.path]: targetMaterial.bytes,
    };
    yield* verifyM031TargetQualificationEvidenceMaterialBytes(decoded, materials).pipe(
      Effect.mapError((error) =>
        makeFailure("evidence", diagnosticPath, error.message, {
          reason: error.reason,
        }),
      ),
    );
    return { checked, encoded, materials };
  });

const compileM031TargetRuns = (
  root: string,
  staged: StagedExplanationResult,
  core: CheckedSemanticArtifact["core"],
  subject: M031QualificationSubject,
  selection: ClassificationSelectionV2,
  qualificationBase: string,
  diagnosticPath: string,
): Effect.Effect<
  ReadonlyArray<M031TargetRun>,
  ClassificationFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temporaryRoot = yield* fileSystem
        .makeTempDirectoryScoped({
          directory: root,
          prefix: ".m031-qualification-",
        })
        .pipe(
          Effect.mapError((error) =>
            makeFailure(
              "target",
              diagnosticPath,
              `could not create M031 temp directory: ${String(error)}`,
              {
                reason: "temporary-directory-failed",
              },
            ),
          ),
        );
      const runs: Array<M031TargetRun> = [];
      for (const target of selection.targets) {
        const generatedPath =
          target.target === "effect-typescript"
            ? `${qualificationBase}/effect-typescript/boundary.ts`
            : `${qualificationBase}/gleam-beam/src/bang/${subject.gleamModule}.gleam`;
        let generatedBytes: Uint8Array;
        let projection: string;
        if (target.target === "effect-typescript") {
          const effectMaterials = yield* projectEffectSingleUseOperationRealizationMaterials(
            core,
            target.realization,
          ).pipe(
            Effect.mapError((error) =>
              makeFailure("target", diagnosticPath, error.message, {
                reason: error.reason,
                address: error.source,
              }),
            ),
          );
          projection = effectMaterials.boundary;
          generatedBytes = new TextEncoder().encode(projection);
          const targetDirectory = path.join(temporaryRoot, "effect-typescript");
          yield* fileSystem.makeDirectory(targetDirectory, { recursive: true }).pipe(
            Effect.mapError((error) =>
              makeFailure(
                "target",
                diagnosticPath,
                `could not create Effect target directory: ${String(error)}`,
                {
                  reason: "target-directory-failed",
                },
              ),
            ),
          );
          const boundaryPath = path.join(targetDirectory, "boundary.ts");
          const runnerPath = path.join(targetDirectory, "probe.ts");
          yield* fileSystem.writeFile(boundaryPath, generatedBytes).pipe(
            Effect.mapError((error) =>
              makeFailure(
                "target",
                diagnosticPath,
                `could not write Effect boundary: ${String(error)}`,
                {
                  reason: "projection-write-failed",
                },
              ),
            ),
          );
          yield* fileSystem.writeFileString(runnerPath, effectMaterials.probe).pipe(
            Effect.mapError((error) =>
              makeFailure(
                "execution",
                diagnosticPath,
                `could not write Effect probe: ${String(error)}`,
                {
                  reason: "probe-write-failed",
                },
              ),
            ),
          );
          const output = yield* runM031Process(
            "bun",
            ["run", runnerPath],
            targetDirectory,
            diagnosticPath,
          );
          const observation = yield* decodeM031ProbeOutput(output, target, diagnosticPath);
          runs.push({ target, projection, generatedPath, generatedBytes, observation });
        } else {
          const realization = core.declarations.find(
            (declaration) =>
              declaration.kind === "operationRealization" && declaration.id === target.realization,
          );
          if (realization?.kind !== "operationRealization") {
            return yield* Effect.fail(
              makeFailure(
                "target",
                diagnosticPath,
                `missing checked realization ${target.realization}`,
                {
                  reason: "missing-declaration",
                },
              ),
            );
          }
          const projected = projectGleamExactOneOperationRealization(core, realization.id);
          if (!projected.ok) {
            return yield* Effect.fail(
              makeFailure("target", diagnosticPath, projected.error.message, {
                reason: projected.error.reason,
                address: projected.error.source,
              }),
            );
          }
          projection = projected.value;
          generatedBytes = new TextEncoder().encode(projection);
          const gleamRoot = path.join(temporaryRoot, "gleam-beam");
          const sourceDirectory = path.join(gleamRoot, "src", "bang");
          yield* fileSystem.makeDirectory(sourceDirectory, { recursive: true }).pipe(
            Effect.mapError((error) =>
              makeFailure(
                "target",
                diagnosticPath,
                `could not create Gleam target directory: ${String(error)}`,
                {
                  reason: "target-directory-failed",
                },
              ),
            ),
          );
          yield* fileSystem
            .writeFile(path.join(sourceDirectory, `${subject.gleamModule}.gleam`), generatedBytes)
            .pipe(
              Effect.mapError((error) =>
                makeFailure(
                  "target",
                  diagnosticPath,
                  `could not write Gleam boundary: ${String(error)}`,
                  {
                    reason: "projection-write-failed",
                  },
                ),
              ),
            );
          yield* fileSystem
            .writeFileString(
              path.join(gleamRoot, "gleam.toml"),
              [
                'name = "bang_m031_probe"',
                'version = "0.1.0"',
                'target = "erlang"',
                'gleam = ">= 1.18.1 and < 2.0.0"',
                "",
                "[dependencies]",
                'gleam_erlang = ">= 1.3.0 and < 2.0.0"',
                'gleam_otp = ">= 1.3.0 and < 2.0.0"',
                'gleam_stdlib = ">= 1.0.0 and < 2.0.0"',
                "",
              ].join("\n"),
            )
            .pipe(
              Effect.mapError((error) =>
                makeFailure(
                  "execution",
                  diagnosticPath,
                  `could not write Gleam toolchain manifest: ${String(error)}`,
                  {
                    reason: "toolchain-manifest-failed",
                  },
                ),
              ),
            );
          yield* fileSystem
            .writeFileString(
              path.join(gleamRoot, "src", "main.gleam"),
              gleamProbeRunnerSource(subject.gleamModule),
            )
            .pipe(
              Effect.mapError((error) =>
                makeFailure(
                  "execution",
                  diagnosticPath,
                  `could not write Gleam probe: ${String(error)}`,
                  {
                    reason: "probe-write-failed",
                  },
                ),
              ),
            );
          const output = yield* runM031Process(
            "nix",
            [
              "shell",
              "-f",
              path.join(root, "nix", "gleam.nix"),
              "-c",
              "gleam",
              "run",
              "-m",
              "main",
            ],
            gleamRoot,
            diagnosticPath,
          );
          const observation = yield* decodeM031ProbeOutput(output, target, diagnosticPath);
          runs.push({ target, projection, generatedPath, generatedBytes, observation });
        }
      }
      return runs;
    }),
  );

const makeM031Profile = (
  result: Extract<ExactOneCapabilityExecutionResult, { readonly _tag: "Applicable" }>,
  evidence: CheckedM031TargetQualificationEvidence,
  target: ClassificationTarget,
): M023RealizationProfile =>
  M023RealizationProfileSchema.make({
    bangRealizationProfile: 1,
    artifactId: result.artifactId,
    artifactFormat: result.artifactFormat,
    theoryResultIdentity: theoryResultIdentity(result),
    realizationId: target.realization,
    targetId: target.target,
    assessments: M023_EXACT_ONE_OBLIGATION_IDS.map((obligationId) => ({
      obligationId,
      disposition: "supported" as const,
      evidence: [
        {
          class: "structurally-derived" as const,
          scope: `checked Core ${target.realization} projection`,
          producer: target.target,
          materials: evidence.materials.map(({ path, sha256 }) => ({ path, sha256 })),
        },
        {
          class: "runtime-checked" as const,
          scope: `M031 fresh ${target.target} exact-one probe`,
          producer: evidence.producer.identity,
          materials: evidence.materials.map(({ path, sha256 }) => ({ path, sha256 })),
        },
        {
          class: "assumed-truthful" as const,
          scope: `M031 producer ${evidence.producer.version}`,
          producer: evidence.producer.identity,
          materials: evidence.materials.map(({ path, sha256 }) => ({ path, sha256 })),
        },
      ],
    })),
    assumptions: [...evidence.assumptions].toSorted(),
    weakenings: [...evidence.weakenings].toSorted(),
    limitations: [...evidence.limitations].toSorted(),
    lifetime: evidence.lifetime,
    invalidators: [...evidence.invalidators].toSorted(),
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
export interface M031ClassificationCompileResult {
  readonly selection: ClassificationSelectionV2;
  readonly artifact: CheckedSemanticArtifact;
  readonly evidence: ReadonlyArray<CheckedM031TargetQualificationEvidence>;
  readonly results: ReadonlyArray<M023ClassificationResult>;
  readonly text: string;
  readonly publicationEntries: ReadonlyArray<PublicationEntry>;
}

const formatM031ClassificationReport = (
  results: ReadonlyArray<M023ClassificationResult>,
): string => `M031 two-target exact-one qualification
${results.map(formatProfile).join("\n\n")}
`;

const makeM031PublicationEntries = (
  root: string,
  staged: StagedExplanationResult,
  runs: ReadonlyArray<M031TargetRun>,
  evidence: ReadonlyArray<{
    readonly checked: CheckedM031TargetQualificationEvidence;
    readonly encoded: string;
  }>,
  qualificationBase: string,
  reportEncoded: string,
): Effect.Effect<ReadonlyArray<PublicationEntry>, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const entries: Array<PublicationEntry> = [];
    const resolvedRoot = path.resolve(root);
    const artifactPath = path
      .relative(resolvedRoot, path.resolve(staged.artifactPath))
      .replaceAll("\\", "/");
    entries.push({
      path: artifactPath,
      bytes: new TextEncoder().encode(staged.encodedArtifact),
    });
    if (staged.theoryLock !== undefined) {
      entries.push({
        path: staged.theoryLock.lockPath,
        bytes: new TextEncoder().encode(staged.theoryLock.encodedLock),
      });
    }
    for (const run of runs) {
      entries.push({
        path: run.generatedPath,
        bytes: new Uint8Array(run.generatedBytes),
      });
    }
    for (const record of evidence) {
      entries.push({
        path: `${qualificationBase}/${record.checked.targetId}/evidence.json`,
        bytes: new TextEncoder().encode(`${record.encoded}\n`),
      });
    }
    entries.push({
      path: `${qualificationBase}/report.json`,
      bytes: new TextEncoder().encode(reportEncoded),
    });
    return entries.toSorted((left, right) => left.path.localeCompare(right.path));
  });

const compileSelectedM031Classification = (
  root: string,
  selection: ClassificationSelectionV2,
  resolvedSelectionPath: string,
): Effect.Effect<
  M031ClassificationCompileResult,
  ClassificationFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      if (!/^[A-Za-z][A-Za-z0-9._-]*$/u.test(selection.id)) {
        return yield* Effect.fail(
          makeFailure(
            "selection",
            resolvedSelectionPath,
            "M031 selection id is not a safe identity",
            {
              reason: "unsafe-selection-id",
            },
          ),
        );
      }
      const explanationSelectionPath = yield* resolveSafePath(
        root,
        selection.explanationSelection,
        yield* Path.Path,
        "selection",
      );
      const staged = yield* compileSelectedExplanationStaged(
        root,
        selection.explanationSelection,
      ).pipe(
        Effect.mapError((error) =>
          makeFailure(
            error.stage === "package" ? "package" : "artifact",
            explanationSelectionPath,
            error.message,
            {
              reason: error.reason ?? error.stage,
              ...(error.address === undefined ? {} : { address: error.address }),
            },
          ),
        ),
      );
      if (staged.packageResolution === undefined || staged.theoryLock === undefined) {
        return yield* Effect.fail(
          makeFailure(
            "package",
            explanationSelectionPath,
            "M031 explanation did not resolve a theory package",
            {
              reason: "missing-package",
            },
          ),
        );
      }
      if (staged.result._tag !== "Applicable") {
        return yield* Effect.fail(
          makeFailure(
            "artifact",
            explanationSelectionPath,
            "selected M022 theory result is not applicable",
            {
              reason: "inapplicable-theory",
            },
          ),
        );
      }
      const artifact = yield* consumeSemanticArtifact(staged.encodedArtifact).pipe(
        Effect.mapError((error) =>
          makeFailure("artifact", explanationSelectionPath, error.message, {
            reason: error.reason,
            ...(error.address === undefined ? {} : { address: error.address }),
          }),
        ),
      );
      if (artifact.id !== staged.result.artifactId) {
        return yield* Effect.fail(
          makeFailure(
            "artifact",
            explanationSelectionPath,
            "M031 result and artifact identities differ",
            {
              reason: "artifact-identity-mismatch",
            },
          ),
        );
      }
      const subject = yield* resolveM031QualificationSubject(
        artifact.core,
        selection.targets[0].realization,
        staged.result.requirementAddress,
        resolvedSelectionPath,
      );
      const packageEncoded = encodeExactOneCapabilityExecutionPackage(
        staged.packageResolution.resolved.package,
      );
      yield* verifyM031TargetQualificationEvidencePackageDigest(
        packageEncoded,
        staged.packageResolution.resolved.semanticDigest,
      ).pipe(
        Effect.mapError((error) =>
          makeFailure("package", explanationSelectionPath, error.message, {
            reason: error.reason,
          }),
        ),
      );
      const qualificationBase = `.bang/qualifications/${selection.id}`;
      const runs = yield* compileM031TargetRuns(
        root,
        staged,
        artifact.core,
        subject,
        selection,
        qualificationBase,
        resolvedSelectionPath,
      );
      const evidenceRecords: Array<{
        readonly checked: CheckedM031TargetQualificationEvidence;
        readonly encoded: string;
      }> = [];
      for (const run of runs) {
        const record = yield* makeM031Evidence(
          root,
          staged,
          artifact.core,
          subject,
          selection,
          run,
          resolvedSelectionPath,
        );
        evidenceRecords.push(record);
      }
      const checkedEvidence = yield* checkM031TargetQualificationEvidenceSet(
        evidenceRecords.map(({ checked }) => checked),
        {
          selectionId: selection.id,
          artifactId: staged.result.artifactId,
          artifactFormat: staged.result.artifactFormat,
          theory: staged.result.theory,
          package: {
            id: staged.packageResolution.resolved.package.identity.id,
            version: staged.packageResolution.resolved.package.identity.version,
            semanticDigest: staged.packageResolution.resolved.semanticDigest,
          },
          requirementAddress: staged.result.requirementAddress,
          result: {
            artifactId: staged.result.artifactId,
            artifactFormat: staged.result.artifactFormat,
            theory: staged.result.theory,
            requirementAddress: staged.result.requirementAddress,
          },
          core: artifact.core,
        },
      ).pipe(
        Effect.mapError((error) =>
          makeFailure("evidence", resolvedSelectionPath, error.message, {
            reason: error.reason,
            address: error.identity,
          }),
        ),
      );
      const checkedEvidenceRecords = evidenceRecords.map((record, index) =>
        Object.assign(record, { checked: checkedEvidence[index]! }),
      );
      const results: M023ClassificationResult[] = [];
      for (const record of checkedEvidenceRecords) {
        const selectedTarget = selection.targets.find(
          ({ target: targetId }) => targetId === record.checked.targetId,
        );
        if (selectedTarget === undefined) {
          return yield* Effect.fail(
            makeFailure("profile", resolvedSelectionPath, "M031 evidence target is not selected", {
              reason: "target-mismatch",
            }),
          );
        }
        const profile = makeM031Profile(staged.result, record.checked, selectedTarget);
        results.push(yield* classifyProfile(profile, staged.result, resolvedSelectionPath));
      }
      const reportValue = {
        bangClassificationReport: 2 as const,
        selectionId: selection.id,
        artifactId: staged.result.artifactId,
        artifactFormat: staged.result.artifactFormat,
        theory: staged.result.theory,
        requirementAddress: staged.result.requirementAddress,
        results,
        evidence: checkedEvidenceRecords.map(({ checked }) => checked),
      };
      const reportEncoded = `${encodeCanonicalJson(reportValue)}\n`;
      const text = formatM031ClassificationReport(results);
      const publicationEntries = yield* makeM031PublicationEntries(
        root,
        staged,
        runs,
        checkedEvidenceRecords,
        qualificationBase,
        reportEncoded,
      );
      return {
        selection,
        artifact,
        evidence: checkedEvidenceRecords.map(({ checked }) => checked),
        results,
        text,
        publicationEntries,
      };
    }),
  );

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

/** Compile and classify a selected M031 realization pair without persistent writes. */
export const compileSelectedM031ClassificationStaged = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  M031ClassificationCompileResult,
  ClassificationFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedSelectionPath = yield* resolveSafePath(root, selectionPath, path, "selection");
    const selection = yield* decodeSelection(
      yield* readText(resolvedSelectionPath, "selection"),
      resolvedSelectionPath,
    );
    yield* checkTargets(selection, resolvedSelectionPath);
    if (selection.bangClassification !== 2) {
      return yield* Effect.fail(
        makeFailure(
          "selection",
          resolvedSelectionPath,
          "M031 staged classification requires a bangClassification: 2 selection",
          { reason: "invalid-classification-version" },
        ),
      );
    }
    return yield* compileSelectedM031Classification(root, selection, resolvedSelectionPath);
  });

/** Compile and classify both selected M023 realizations without emitting partial output. */
export const compileSelectedClassification = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  ClassificationCompileResult | M031ClassificationCompileResult,
  ClassificationFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedSelectionPath = yield* resolveSafePath(root, selectionPath, path, "selection");
    const selection = yield* decodeSelection(
      yield* readText(resolvedSelectionPath, "selection"),
      resolvedSelectionPath,
    );
    yield* checkTargets(selection, resolvedSelectionPath);
    if (selection.bangClassification === 2) {
      const staged = yield* compileSelectedM031Classification(
        root,
        selection,
        resolvedSelectionPath,
      );
      yield* publishAtomically(root, staged.publicationEntries).pipe(
        Effect.mapError((error) =>
          makeFailure("publication", error.path, error.message, {
            reason: error.reason,
          }),
        ),
      );
      return staged;
    }
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
export const formatClassificationFailure = (error: ClassificationFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`];
  if (error.reason !== undefined) lines.push(`reason: ${error.reason}`);
  if (error.address !== undefined) lines.push(`address: ${error.address}`);
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};
