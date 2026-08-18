import {
  consumeSemanticArtifact,
  type CapabilityRequirement,
  type CheckedSemanticArtifact,
  type OperationRealizationDeclaration,
} from "@bang/core";
import { type Crypto, Effect, Schema } from "effect";

const TheoryIdentitySchema = Schema.Struct({
  id: Schema.Literal("ExactOneCapabilityExecution"),
  version: Schema.Literal(1),
});

export const ExactOneCapabilityExecutionTheory = {
  id: "ExactOneCapabilityExecution",
  version: 1,
} as const;

export type ExactOneCapabilityExecutionDerivation =
  | "authored"
  | "structurally-derived"
  | "theory-derived";

const DerivationSchema = Schema.Literals(["authored", "structurally-derived", "theory-derived"]);

const PremiseSchema = Schema.Struct({
  id: Schema.String,
  statement: Schema.String,
  status: Schema.Literals(["satisfied", "failed"]),
  provenance: Schema.Array(Schema.String),
  derivation: DerivationSchema,
  reason: Schema.optional(Schema.String),
});

const SatisfiedPremiseSchema = Schema.Struct({
  id: Schema.String,
  statement: Schema.String,
  status: Schema.Literal("satisfied"),
  provenance: Schema.Array(Schema.String),
  derivation: DerivationSchema,
  reason: Schema.optional(Schema.String),
});

export type ExactOneCapabilityExecutionPremise = typeof PremiseSchema.Type;
export const ExactOneCapabilityExecutionPremiseSchema = PremiseSchema;

const ObligationSchema = Schema.Struct({
  id: Schema.String,
  statement: Schema.String,
  provenance: Schema.Literal("theory-derived"),
  derivation: Schema.Literal("theory-derived"),
  evidence: Schema.Literal("unresolved"),
});

export type ExactOneCapabilityExecutionObligation = typeof ObligationSchema.Type;
export const ExactOneCapabilityExecutionObligationSchema = ObligationSchema;

const EvidenceSchema = Schema.Struct({
  status: Schema.Literal("unresolved"),
  scope: Schema.Literal("theory-derived-obligations"),
});

export type ExactOneCapabilityExecutionEvidence = typeof EvidenceSchema.Type;
export const ExactOneCapabilityExecutionEvidenceSchema = EvidenceSchema;

const limitationStatements = [
  "termination is not established",
  "productivity is not established",
  "memory or work bounds are not established",
  "capability lifetime is not established",
  "fairness is not established",
  "message delivery is not established",
  "distributed exactly-once execution is not established",
] as const;

const LimitationsSchema = Schema.Array(Schema.String);

export type ExactOneCapabilityExecutionLimitations = typeof LimitationsSchema.Type;
export const ExactOneCapabilityExecutionLimitationsSchema = LimitationsSchema;

const resultIdentityFields = {
  artifactId: Schema.String,
  artifactFormat: Schema.Literal("bangSemanticArtifact:1"),
  theory: TheoryIdentitySchema,
  requirementAddress: Schema.String,
  evidence: EvidenceSchema,
  limitations: LimitationsSchema,
  invalidators: Schema.Array(Schema.String),
};

const applicableResultFields = {
  ...resultIdentityFields,
  premises: Schema.Array(SatisfiedPremiseSchema),
  obligations: Schema.NonEmptyArray(ObligationSchema),
};

const notApplicableResultFields = {
  ...resultIdentityFields,
  premises: Schema.Array(PremiseSchema),
  obligations: Schema.Tuple([]),
};

export const ExactOneCapabilityExecutionResultSchema = Schema.TaggedUnion({
  Applicable: applicableResultFields,
  NotApplicable: notApplicableResultFields,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type ExactOneCapabilityExecutionResult = typeof ExactOneCapabilityExecutionResultSchema.Type;
export const ExactOneCapabilityExecutionResultFromJson = Schema.fromJsonString(
  ExactOneCapabilityExecutionResultSchema,
);

const errorReasons = Schema.Literals([
  "invalid-artifact",
  "unknown-requirement-address",
  "ambiguous-requirement-address",
  "inconsistent-checked-core",
]);

export class ExactOneCapabilityExecutionError extends Schema.TaggedError<ExactOneCapabilityExecutionError>()(
  "ExactOneCapabilityExecutionError",
  {
    reason: errorReasons,
    address: Schema.String,
    message: Schema.String,
  },
) {}

const artifactFailure = (address: string, message: string): ExactOneCapabilityExecutionError =>
  new ExactOneCapabilityExecutionError({
    reason: "invalid-artifact",
    address,
    message,
  });

const unknownAddressFailure = (address: string): ExactOneCapabilityExecutionError =>
  new ExactOneCapabilityExecutionError({
    reason: "unknown-requirement-address",
    address,
    message: `unknown capability requirement address ${address}`,
  });

const ambiguousAddressFailure = (address: string): ExactOneCapabilityExecutionError =>
  new ExactOneCapabilityExecutionError({
    reason: "ambiguous-requirement-address",
    address,
    message: `ambiguous capability requirement address ${address}`,
  });

const inconsistentCoreFailure = (
  address: string,
  message: string,
): ExactOneCapabilityExecutionError =>
  new ExactOneCapabilityExecutionError({
    reason: "inconsistent-checked-core",
    address,
    message,
  });

interface RequirementSelection {
  readonly realization: OperationRealizationDeclaration;
  readonly requirement: CapabilityRequirement;
  readonly operationBinding: "initializer" | "transition" | undefined;
}

interface RequirementResolution {
  readonly selection?: RequirementSelection;
  readonly ambiguous: boolean;
}

const requirementAddressPrefix = "operationRealization:";
const requirementAddressSegment = ".requirement:";

const resolveRequirement = (
  artifact: CheckedSemanticArtifact,
  address: string,
): RequirementResolution => {
  if (!address.startsWith(requirementAddressPrefix)) return { ambiguous: false };
  const realizationStart = requirementAddressPrefix.length;
  const requirementSeparator = address.indexOf(requirementAddressSegment, realizationStart);
  if (requirementSeparator < 0) return { ambiguous: false };

  const realizationId = address.slice(realizationStart, requirementSeparator);
  const capabilityId = address.slice(requirementSeparator + requirementAddressSegment.length);
  if (realizationId.length === 0 || capabilityId.length === 0) return { ambiguous: false };

  const realization = artifact.core.declarations.find(
    (declaration): declaration is OperationRealizationDeclaration =>
      declaration.kind === "operationRealization" && declaration.id === realizationId,
  );
  if (realization === undefined) return { ambiguous: false };

  const requirements = realization.requires.filter(
    (requirement) => requirement.capability === capabilityId,
  );
  if (requirements.length === 0) return { ambiguous: false };
  if (requirements.length > 1) return { ambiguous: true };

  const stateMachine = artifact.core.declarations.find(
    (declaration) =>
      declaration.kind === "stateMachine" && declaration.id === realization.operation.stateMachine,
  );
  const operationBinding =
    stateMachine?.kind !== "stateMachine"
      ? undefined
      : stateMachine.initializers.some(
            (operation) => operation.id === realization.operation.operation,
          )
        ? "initializer"
        : stateMachine.transitions.some(
              (operation) => operation.id === realization.operation.operation,
            )
          ? "transition"
          : undefined;

  return {
    selection: {
      realization,
      requirement: requirements[0]!,
      operationBinding,
    },
    ambiguous: false,
  };
};

const premise = <Status extends "satisfied" | "failed">(
  id: string,
  statement: string,
  status: Status,
  derivation: "authored" | "structurally-derived",
  provenance: ReadonlyArray<string>,
  reason?: string,
): ExactOneCapabilityExecutionPremise & { readonly status: Status } => ({
  id,
  statement,
  status,
  provenance,
  derivation,
  ...(reason === undefined ? {} : { reason }),
});

type SatisfiedPremise = typeof SatisfiedPremiseSchema.Type;
type ApplicableResult = Extract<ExactOneCapabilityExecutionResult, { readonly _tag: "Applicable" }>;
type NotApplicableResult = Extract<
  ExactOneCapabilityExecutionResult,
  { readonly _tag: "NotApplicable" }
>;

const obligations: readonly [
  ExactOneCapabilityExecutionObligation,
  ...ExactOneCapabilityExecutionObligation[],
] = [
  {
    id: "ExactOneCapabilityExecution.obligation.check-before-consumption",
    statement: "check the destination and transition before consumption",
    provenance: "theory-derived",
    derivation: "theory-derived",
    evidence: "unresolved",
  },
  {
    id: "ExactOneCapabilityExecution.obligation.consume-atomically-before-execution",
    statement: "consume one use atomically before operation execution",
    provenance: "theory-derived",
    derivation: "theory-derived",
    evidence: "unresolved",
  },
  {
    id: "ExactOneCapabilityExecution.obligation.reject-reuse-before-execution",
    statement: "reject reuse before operation execution",
    provenance: "theory-derived",
    derivation: "theory-derived",
    evidence: "unresolved",
  },
  {
    id: "ExactOneCapabilityExecution.obligation.no-restore-after-start",
    statement: "do not restore a use after an execution attempt starts",
    provenance: "theory-derived",
    derivation: "theory-derived",
    evidence: "unresolved",
  },
];

const limitations = [...limitationStatements];
const evidence: ExactOneCapabilityExecutionEvidence = {
  status: "unresolved",
  scope: "theory-derived-obligations",
};

const invalidatorsFor = (
  premises: ReadonlyArray<ExactOneCapabilityExecutionPremise>,
): ReadonlyArray<string> =>
  [...new Set(premises.flatMap(({ provenance }) => provenance))].toSorted();

const resultBase = (
  artifact: CheckedSemanticArtifact,
  requirementAddress: string,
  invalidators: ReadonlyArray<string>,
) => ({
  artifactId: artifact.id,
  artifactFormat: "bangSemanticArtifact:1" as const,
  theory: ExactOneCapabilityExecutionTheory,
  requirementAddress,
  evidence: { ...evidence },
  limitations: [...limitations],
  invalidators,
});

const makeApplicableResult = (
  artifact: CheckedSemanticArtifact,
  requirementAddress: string,
  premises: ReadonlyArray<SatisfiedPremise>,
): ApplicableResult => ({
  ...resultBase(artifact, requirementAddress, invalidatorsFor(premises)),
  _tag: "Applicable",
  premises,
  obligations,
});

const makeNotApplicableResult = (
  artifact: CheckedSemanticArtifact,
  requirementAddress: string,
  premises: ReadonlyArray<ExactOneCapabilityExecutionPremise>,
): NotApplicableResult => ({
  ...resultBase(artifact, requirementAddress, invalidatorsFor(premises)),
  _tag: "NotApplicable",
  premises,
  obligations: [] as const,
});

const encodeResult = (
  result: ExactOneCapabilityExecutionResult,
  requirementAddress: string,
): Effect.Effect<ExactOneCapabilityExecutionResult, ExactOneCapabilityExecutionError, never> =>
  Schema.encodeEffect(ExactOneCapabilityExecutionResultSchema)(result).pipe(
    Effect.mapError((issue) =>
      artifactFailure(requirementAddress, `invalid theory result: ${String(issue)}`),
    ),
  );

/**
 * Consume an encoded semantic artifact and explain exact-one applicability for one requirement.
 * Core artifact validation, clean normalization, and parity are delegated to @bang/core.
 */
export const consumeExactOneCapabilityExecution = (
  encodedArtifact: string,
  requirementAddress: string,
): Effect.Effect<
  ExactOneCapabilityExecutionResult,
  ExactOneCapabilityExecutionError,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    const artifact: CheckedSemanticArtifact = yield* consumeSemanticArtifact(encodedArtifact).pipe(
      Effect.mapError((error) => artifactFailure(requirementAddress, error.message)),
    );
    const resolution = resolveRequirement(artifact, requirementAddress);
    if (resolution.ambiguous) {
      return yield* Effect.fail(ambiguousAddressFailure(requirementAddress));
    }
    if (resolution.selection === undefined) {
      return yield* Effect.fail(unknownAddressFailure(requirementAddress));
    }

    const { realization, requirement, operationBinding } = resolution.selection;
    const capabilityChecked = artifact.core.declarations.some(
      (declaration) =>
        declaration.kind === "capability" && declaration.id === requirement.capability,
    );
    if (operationBinding === undefined || !capabilityChecked) {
      return yield* Effect.fail(
        inconsistentCoreFailure(
          requirementAddress,
          `checked Core does not establish the operation binding and capability for ${requirementAddress}`,
        ),
      );
    }

    const structuralPremises: Array<SatisfiedPremise> = [
      premise(
        "ExactOneCapabilityExecution.premise.realization-exists",
        `operation realization ${realization.id} exists in checked Core`,
        "satisfied",
        "structurally-derived",
        [`operationRealization:${realization.id}`],
      ),
      premise(
        "ExactOneCapabilityExecution.premise.operation-binding-checked",
        `operation realization ${realization.id} binds a checked operation`,
        "satisfied",
        "structurally-derived",
        [
          `operationRealization:${realization.id}.operation`,
          `stateMachine:${realization.operation.stateMachine}.${operationBinding}:${realization.operation.operation}`,
        ],
      ),
      premise(
        "ExactOneCapabilityExecution.premise.capability-exists",
        `capability ${requirement.capability} exists in checked Core`,
        "satisfied",
        "structurally-derived",
        [`capability:${requirement.capability}`],
      ),
    ];
    const normalizedAddresses = new Set(artifact.normalized.nodes.map(({ address }) => address));
    const exactOne = requirement.quantity.kind === "exactly" && requirement.quantity.uses === "1";
    if (exactOne) {
      const premises: Array<SatisfiedPremise> = [
        ...structuralPremises,
        premise(
          "ExactOneCapabilityExecution.premise.exact-one-authored-quantity",
          `requirement ${requirementAddress} is authored with quantity exactly 1`,
          "satisfied",
          "authored",
          [requirementAddress],
        ),
      ];
      const missingAddress = invalidatorsFor(premises).find(
        (address) => !normalizedAddresses.has(address),
      );
      if (missingAddress !== undefined) {
        return yield* Effect.fail(
          inconsistentCoreFailure(
            requirementAddress,
            `checked Core normalization is missing premise provenance address ${missingAddress}`,
          ),
        );
      }
      return yield* encodeResult(
        makeApplicableResult(artifact, requirementAddress, premises),
        requirementAddress,
      );
    }

    const premises: Array<ExactOneCapabilityExecutionPremise> = [
      ...structuralPremises,
      premise(
        "ExactOneCapabilityExecution.premise.exact-one-authored-quantity",
        `requirement ${requirementAddress} is not authored with quantity exactly 1`,
        "failed",
        "authored",
        [requirementAddress],
        "the requirement quantity is unbounded or is not exactly 1",
      ),
    ];
    const missingAddress = invalidatorsFor(premises).find(
      (address) => !normalizedAddresses.has(address),
    );
    if (missingAddress !== undefined) {
      return yield* Effect.fail(
        inconsistentCoreFailure(
          requirementAddress,
          `checked Core normalization is missing premise provenance address ${missingAddress}`,
        ),
      );
    }
    return yield* encodeResult(
      makeNotApplicableResult(artifact, requirementAddress, premises),
      requirementAddress,
    );
  });
/**
 * M023 realization profiles are deliberately owned by the theory boundary.
 * They describe one target's evidence for the obligations derived by M022;
 * they do not add semantic authority to Core or the theory.
 */
export const M023_EXACT_ONE_OBLIGATION_IDS = [
  "ExactOneCapabilityExecution.obligation.check-before-consumption",
  "ExactOneCapabilityExecution.obligation.consume-atomically-before-execution",
  "ExactOneCapabilityExecution.obligation.reject-reuse-before-execution",
  "ExactOneCapabilityExecution.obligation.no-restore-after-start",
] as const;

/** Stable M022 obligation identities consumed by the M023 classifier. */
export const M023ExactOneCapabilityExecutionObligationIds = M023_EXACT_ONE_OBLIGATION_IDS;

const M023IdentifierSchema = Schema.String.pipe(Schema.check(Schema.isNonEmpty()));
const M023Sha256Schema = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/)));
const M023RepositoryPathSchema = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.check(
    Schema.makeFilter(
      (path) =>
        !path.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/.test(path) &&
        !path.includes("\\") &&
        !path.includes("\u0000") &&
        !path.split("/").some((segment) => segment === ".."),
      { expected: "a repository-relative path without traversal, backslashes, or NUL" },
    ),
  ),
);

const M023TheoryResultIdentitySchema = Schema.Struct({
  artifactId: M023IdentifierSchema,
  artifactFormat: Schema.Literal("bangSemanticArtifact:1"),
  theory: TheoryIdentitySchema,
  requirementAddress: M023IdentifierSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M023TheoryResultIdentity = typeof M023TheoryResultIdentitySchema.Type;
export const M023TheoryResultIdentity = M023TheoryResultIdentitySchema;

const M023MaterialReferenceSchema = Schema.Struct({
  path: M023RepositoryPathSchema,
  sha256: M023Sha256Schema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M023MaterialReference = typeof M023MaterialReferenceSchema.Type;
export const M023MaterialReference = M023MaterialReferenceSchema;

const M023EvidenceClassSchema = Schema.Literals([
  "structurally-derived",
  "runtime-checked",
  "assumed-truthful",
  "unsupported-by-target",
  "unresolved",
]);

export type M023EvidenceClass = typeof M023EvidenceClassSchema.Type;
export const M023EvidenceClass = M023EvidenceClassSchema;

const M023EvidenceReferenceSchema = Schema.Struct({
  class: M023EvidenceClassSchema,
  scope: M023IdentifierSchema,
  producer: M023IdentifierSchema,
  materials: Schema.Array(M023MaterialReferenceSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M023EvidenceReference = typeof M023EvidenceReferenceSchema.Type;
export const M023EvidenceReference = M023EvidenceReferenceSchema;

const M023DispositionSchema = Schema.Literals(["supported", "rejected", "unresolved"]);
export type M023AssessmentDisposition = typeof M023DispositionSchema.Type;

const M023AssessmentSchema = Schema.Struct({
  obligationId: Schema.Literals(M023_EXACT_ONE_OBLIGATION_IDS),
  disposition: M023DispositionSchema,
  evidence: Schema.Array(M023EvidenceReferenceSchema),
  reason: Schema.optional(M023IdentifierSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M023RealizationAssessment = typeof M023AssessmentSchema.Type;
export const M023RealizationAssessmentSchema = M023AssessmentSchema;

const hasExactlyOneActualObligationEach = (
  assessments: ReadonlyArray<Pick<M023RealizationAssessment, "obligationId">>,
): boolean => {
  if (assessments.length !== M023_EXACT_ONE_OBLIGATION_IDS.length) return false;
  const ids = new Set(assessments.map(({ obligationId }) => obligationId));
  return (
    ids.size === M023_EXACT_ONE_OBLIGATION_IDS.length &&
    M023_EXACT_ONE_OBLIGATION_IDS.every((obligationId) => ids.has(obligationId))
  );
};

const M023AssessmentListSchema = Schema.Array(M023AssessmentSchema).check(
  Schema.makeFilter(
    (assessments) =>
      hasExactlyOneActualObligationEach(assessments) &&
      assessments.every(({ disposition, evidence: assessmentEvidence }) =>
        disposition === "supported"
          ? assessmentEvidence.length > 0 &&
            assessmentEvidence.every(
              ({ class: evidenceClass }) =>
                evidenceClass !== "unsupported-by-target" && evidenceClass !== "unresolved",
            )
          : disposition === "rejected"
            ? assessmentEvidence.some(
                ({ class: evidenceClass }) => evidenceClass === "unsupported-by-target",
              )
            : assessmentEvidence.every(
                ({ class: evidenceClass }) => evidenceClass !== "unsupported-by-target",
              ),
      ),
    {
      expected:
        "one assessment for each derived exact-one obligation and valid evidence for each disposition",
    },
  ),
);

const M023SupportedAssessmentListSchema = M023AssessmentListSchema.check(
  Schema.makeFilter(
    (assessments) => assessments.every(({ disposition }) => disposition === "supported"),
    {
      expected: "every classification assessment must be supported",
    },
  ),
);

const M023RejectedAssessmentListSchema = M023AssessmentListSchema.check(
  Schema.makeFilter(
    (assessments) => assessments.some(({ disposition }) => disposition === "rejected"),
    {
      expected: "a rejected assessment",
    },
  ),
);

const M023UnknownAssessmentListSchema = M023AssessmentListSchema.check(
  Schema.makeFilter(
    (assessments) =>
      assessments.some(({ disposition }) => disposition === "unresolved") &&
      assessments.every(({ disposition }) => disposition !== "rejected"),
    {
      expected: "an unresolved assessment and no rejected assessment",
    },
  ),
);

const M023TargetRejectionSchema = Schema.Struct({
  adapter: M023IdentifierSchema,
  address: M023IdentifierSchema,
  reason: M023IdentifierSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M023TargetRejection = typeof M023TargetRejectionSchema.Type;
export const M023TargetRejection = M023TargetRejectionSchema;

const M023ProfileFields = {
  bangRealizationProfile: Schema.Literal(1),
  artifactId: M023IdentifierSchema,
  artifactFormat: Schema.Literal("bangSemanticArtifact:1"),
  theoryResultIdentity: M023TheoryResultIdentitySchema,
  realizationId: M023IdentifierSchema,
  targetId: M023IdentifierSchema,
  assessments: M023AssessmentListSchema,
  assumptions: Schema.Array(Schema.String),
  weakenings: Schema.Array(Schema.String),
  limitations: Schema.Array(Schema.String),
  lifetime: M023IdentifierSchema,
  invalidators: Schema.Array(Schema.String),
  targetRejection: Schema.optional(M023TargetRejectionSchema),
};

const M023RealizationProfileSchema = Schema.Struct(M023ProfileFields)
  .check(
    Schema.makeFilter(
      (profile) =>
        profile.artifactId === profile.theoryResultIdentity.artifactId &&
        profile.artifactFormat === profile.theoryResultIdentity.artifactFormat &&
        requirementRealizationId(profile.theoryResultIdentity.requirementAddress) ===
          profile.realizationId &&
        (profile.assessments.some(({ disposition }) => disposition === "rejected")
          ? profile.targetRejection !== undefined
          : profile.targetRejection === undefined),
      {
        expected:
          "profile identity must agree and target rejection details must match rejected assessments",
      },
    ),
  )
  .annotate({
    parseOptions: { onExcessProperty: "error" },
  });

export type M023RealizationProfile = typeof M023RealizationProfileSchema.Type;
export { M023RealizationProfileSchema };
export const M023RealizationProfileFromJson = Schema.fromJsonString(M023RealizationProfileSchema);

const M023ClassificationFields = {
  bangClassification: Schema.Literal(1),
  artifactId: M023IdentifierSchema,
  artifactFormat: Schema.Literal("bangSemanticArtifact:1"),
  theoryResultIdentity: M023TheoryResultIdentitySchema,
  realizationId: M023IdentifierSchema,
  targetId: M023IdentifierSchema,
  assessments: M023AssessmentListSchema,
  assumptions: Schema.Array(Schema.String),
  weakenings: Schema.Array(Schema.String),
  limitations: Schema.Array(Schema.String),
  lifetime: M023IdentifierSchema,
  invalidators: Schema.Array(Schema.String),
  targetRejection: Schema.optional(M023TargetRejectionSchema),
};

const M023ClassificationResultSchemaRaw = Schema.TaggedUnion({
  Admissible: {
    ...M023ClassificationFields,
    assessments: M023SupportedAssessmentListSchema,
  },
  Qualified: {
    ...M023ClassificationFields,
    assessments: M023SupportedAssessmentListSchema,
  },
  Rejected: {
    ...M023ClassificationFields,
    assessments: M023RejectedAssessmentListSchema,
  },
  Unknown: {
    ...M023ClassificationFields,
    assessments: M023UnknownAssessmentListSchema,
  },
}).check(
  Schema.makeFilter(
    (result) => {
      const hasRejected = result.assessments.some(({ disposition }) => disposition === "rejected");
      const hasUnresolved = result.assessments.some(
        ({ disposition }) => disposition === "unresolved",
      );
      const hasQualification =
        result.assumptions.length > 0 ||
        result.weakenings.length > 0 ||
        result.assessments.some(({ evidence: assessmentEvidence }) =>
          assessmentEvidence.some(
            ({ class: evidenceClass }) =>
              evidenceClass === "runtime-checked" || evidenceClass === "assumed-truthful",
          ),
        );

      if (
        result.artifactId !== result.theoryResultIdentity.artifactId ||
        result.artifactFormat !== result.theoryResultIdentity.artifactFormat ||
        requirementRealizationId(result.theoryResultIdentity.requirementAddress) !==
          result.realizationId
      ) {
        return false;
      }
      switch (result._tag) {
        case "Admissible":
          return (
            !hasRejected &&
            !hasUnresolved &&
            !hasQualification &&
            result.targetRejection === undefined
          );
        case "Qualified":
          return (
            !hasRejected &&
            !hasUnresolved &&
            hasQualification &&
            result.targetRejection === undefined
          );
        case "Rejected":
          return hasRejected && result.targetRejection !== undefined;
        case "Unknown":
          return hasUnresolved && !hasRejected && result.targetRejection === undefined;
      }
    },
    {
      expected:
        "classification tag must agree with dispositions, target rejection, identity, and qualification",
    },
  ),
);

export type M023ClassificationResult = typeof M023ClassificationResultSchemaRaw.Type;
export { M023ClassificationResultSchemaRaw as M023ClassificationResultSchema };
export const M023ClassificationResultFromJson = Schema.fromJsonString(
  M023ClassificationResultSchemaRaw,
);

export type M023RealizationClassificationFailureReason =
  | "invalid-profile"
  | "invalid-theory-result"
  | "inapplicable-theory-result"
  | "identity-mismatch"
  | "unknown-obligation"
  | "missing-obligation"
  | "duplicate-obligation"
  | "invalid-assessment"
  | "invalid-classification";

/** Typed failures at the M023 profile and classification boundary. */
export class M023RealizationClassificationError extends Schema.TaggedError<M023RealizationClassificationError>()(
  "M023RealizationClassificationError",
  {
    reason: Schema.Literals([
      "invalid-profile",
      "invalid-theory-result",
      "inapplicable-theory-result",
      "identity-mismatch",
      "unknown-obligation",
      "missing-obligation",
      "duplicate-obligation",
      "invalid-assessment",
      "invalid-classification",
    ]),
    identity: M023IdentifierSchema,
    message: Schema.String,
  },
) {}

const m023Failure = (
  reason: M023RealizationClassificationFailureReason,
  identity: string,
  message: string,
): M023RealizationClassificationError =>
  new M023RealizationClassificationError({ reason, identity, message });

const decodeM023ProfileValue = (
  input: unknown,
): Effect.Effect<M023RealizationProfile, M023RealizationClassificationError> =>
  Schema.decodeUnknownEffect(M023RealizationProfileSchema)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      m023Failure("invalid-profile", "M023RealizationProfile", String(issue)),
    ),
  );

/** Decode a parsed profile or its strict JSON representation. */
export const decodeM023RealizationProfile = (
  input: unknown,
): Effect.Effect<M023RealizationProfile, M023RealizationClassificationError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M023RealizationProfileFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          m023Failure("invalid-profile", "M023RealizationProfile", String(issue)),
        ),
      )
    : decodeM023ProfileValue(input);

const decodeM023ClassificationValue = (
  input: unknown,
): Effect.Effect<M023ClassificationResult, M023RealizationClassificationError> =>
  Schema.decodeUnknownEffect(M023ClassificationResultSchemaRaw)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      m023Failure("invalid-classification", "M023ClassificationResult", String(issue)),
    ),
  );

/** Decode a parsed classification result or its strict JSON representation. */
export const decodeM023ClassificationResult = (
  input: unknown,
): Effect.Effect<M023ClassificationResult, M023RealizationClassificationError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M023ClassificationResultFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          m023Failure("invalid-classification", "M023ClassificationResult", String(issue)),
        ),
      )
    : decodeM023ClassificationValue(input);

/** Encode a profile through the public strict JSON codec. */
export const encodeM023RealizationProfile = (
  profile: M023RealizationProfile,
): Effect.Effect<string, M023RealizationClassificationError> =>
  Schema.encodeEffect(M023RealizationProfileFromJson)(profile).pipe(
    Effect.mapError((issue) =>
      m023Failure("invalid-profile", "M023RealizationProfile", String(issue)),
    ),
  );

/** Encode a classification result through the public strict JSON codec. */
export const encodeM023ClassificationResult = (
  result: M023ClassificationResult,
): Effect.Effect<string, M023RealizationClassificationError> =>
  Schema.encodeEffect(M023ClassificationResultFromJson)(result).pipe(
    Effect.mapError((issue) =>
      m023Failure("invalid-classification", "M023ClassificationResult", String(issue)),
    ),
  );

const actualObligationIndex = new Map(
  M023_EXACT_ONE_OBLIGATION_IDS.map((obligationId, index) => [obligationId, index] as const),
);
const actualObligationIds = new Set<string>(M023_EXACT_ONE_OBLIGATION_IDS);

const validateTheoryObligationCoverage = (
  result: ApplicableResult,
): Effect.Effect<void, M023RealizationClassificationError> => {
  if (result.obligations.length !== M023_EXACT_ONE_OBLIGATION_IDS.length) {
    return Effect.fail(
      m023Failure(
        "missing-obligation",
        result.requirementAddress,
        "Applicable M022 result must contain exactly four derived obligations",
      ),
    );
  }
  const seen = new Set<string>();
  for (const obligation of result.obligations) {
    if (!actualObligationIds.has(obligation.id)) {
      return Effect.fail(
        m023Failure(
          "unknown-obligation",
          obligation.id,
          `Applicable M022 result contains unknown obligation ${obligation.id}`,
        ),
      );
    }
    if (seen.has(obligation.id)) {
      return Effect.fail(
        m023Failure(
          "duplicate-obligation",
          obligation.id,
          `Applicable M022 result contains duplicate obligation ${obligation.id}`,
        ),
      );
    }
    seen.add(obligation.id);
  }
  if (M023_EXACT_ONE_OBLIGATION_IDS.some((obligationId) => !seen.has(obligationId))) {
    return Effect.fail(
      m023Failure(
        "missing-obligation",
        result.requirementAddress,
        "Applicable M022 result is missing one or more derived exact-one obligations",
      ),
    );
  }
  return Effect.void;
};

const requirementRealizationId = (address: string): string | undefined => {
  if (!address.startsWith(requirementAddressPrefix)) return undefined;
  const separator = address.indexOf(requirementAddressSegment, requirementAddressPrefix.length);
  if (separator <= requirementAddressPrefix.length) return undefined;
  const realizationId = address.slice(requirementAddressPrefix.length, separator);
  return realizationId.length === 0 ? undefined : realizationId;
};

const sortStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> => values.toSorted();

const canonicalizeProfile = (profile: M023RealizationProfile): M023RealizationProfile => ({
  ...profile,
  assessments: profile.assessments.toSorted(
    (left, right) =>
      actualObligationIndex.get(left.obligationId)! -
      actualObligationIndex.get(right.obligationId)!,
  ),
  assumptions: sortStrings(profile.assumptions),
  weakenings: sortStrings(profile.weakenings),
  limitations: sortStrings(profile.limitations),
  invalidators: sortStrings(profile.invalidators),
});

const resultFromProfile = (
  profile: M023RealizationProfile,
  tag: "Admissible" | "Qualified" | "Rejected" | "Unknown",
): Record<string, unknown> => ({
  bangClassification: 1,
  _tag: tag,
  artifactId: profile.artifactId,
  artifactFormat: profile.artifactFormat,
  theoryResultIdentity: profile.theoryResultIdentity,
  realizationId: profile.realizationId,
  targetId: profile.targetId,
  assessments: profile.assessments,
  assumptions: profile.assumptions,
  weakenings: profile.weakenings,
  limitations: profile.limitations,
  lifetime: profile.lifetime,
  invalidators: profile.invalidators,
  ...(profile.targetRejection === undefined ? {} : { targetRejection: profile.targetRejection }),
});

/**
 * Classify one realization against the applicable M022 exact-one theory result.
 *
 * The function has no runtime requirements. It validates both public values,
 * retains evidence qualifications, and derives the lattice precedence:
 * rejected > unknown > qualified > admissible.
 */
export const classifyExactOneCapabilityExecution = (
  profile: M023RealizationProfile,
  theoryResult: ExactOneCapabilityExecutionResult,
): Effect.Effect<M023ClassificationResult, M023RealizationClassificationError> =>
  Effect.gen(function* () {
    const checkedProfile = yield* decodeM023ProfileValue(profile);
    const checkedTheoryResult = yield* Schema.decodeUnknownEffect(
      ExactOneCapabilityExecutionResultSchema,
    )(theoryResult, { onExcessProperty: "error" }).pipe(
      Effect.mapError((issue) =>
        m023Failure("invalid-theory-result", "ExactOneCapabilityExecutionResult", String(issue)),
      ),
    );
    if (checkedTheoryResult._tag !== "Applicable") {
      return yield* Effect.fail(
        m023Failure(
          "inapplicable-theory-result",
          checkedProfile.theoryResultIdentity.requirementAddress,
          "M023 classification requires an Applicable ExactOneCapabilityExecutionResult",
        ),
      );
    }

    yield* validateTheoryObligationCoverage(checkedTheoryResult);
    const identity = checkedProfile.theoryResultIdentity;
    if (
      checkedProfile.artifactId !== checkedTheoryResult.artifactId ||
      checkedProfile.artifactFormat !== checkedTheoryResult.artifactFormat ||
      identity.artifactId !== checkedTheoryResult.artifactId ||
      identity.artifactFormat !== checkedTheoryResult.artifactFormat ||
      identity.theory.id !== checkedTheoryResult.theory.id ||
      identity.theory.version !== checkedTheoryResult.theory.version ||
      identity.requirementAddress !== checkedTheoryResult.requirementAddress
    ) {
      return yield* Effect.fail(
        m023Failure(
          "identity-mismatch",
          checkedTheoryResult.requirementAddress,
          "realization profile identity does not agree with the Applicable M022 result",
        ),
      );
    }
    const selectedRealizationId = requirementRealizationId(checkedTheoryResult.requirementAddress);
    if (
      selectedRealizationId === undefined ||
      selectedRealizationId !== checkedProfile.realizationId
    ) {
      return yield* Effect.fail(
        m023Failure(
          "identity-mismatch",
          checkedTheoryResult.requirementAddress,
          "realization profile identity does not agree with the M022 requirement address",
        ),
      );
    }

    const normalizedProfile = canonicalizeProfile(checkedProfile);
    const hasRejected = normalizedProfile.assessments.some(
      ({ disposition }) => disposition === "rejected",
    );
    const hasUnresolved = normalizedProfile.assessments.some(
      ({ disposition }) => disposition === "unresolved",
    );
    const hasQualification =
      normalizedProfile.assumptions.length > 0 ||
      normalizedProfile.weakenings.length > 0 ||
      normalizedProfile.assessments.some(({ evidence: assessmentEvidence }) =>
        assessmentEvidence.some(
          ({ class: evidenceClass }) =>
            evidenceClass === "runtime-checked" || evidenceClass === "assumed-truthful",
        ),
      );
    const tag = hasRejected
      ? "Rejected"
      : hasUnresolved
        ? "Unknown"
        : hasQualification
          ? "Qualified"
          : "Admissible";
    const candidate = resultFromProfile(normalizedProfile, tag);
    return yield* decodeM023ClassificationValue(candidate);
  });

export type RealizationProfile = M023RealizationProfile;
export type ClassificationResult = M023ClassificationResult;
export const RealizationProfileSchema = M023RealizationProfileSchema;
export const RealizationProfileFromJson = M023RealizationProfileFromJson;
export const ClassificationResultSchema = M023ClassificationResultSchemaRaw;
export const ClassificationResultFromJson = M023ClassificationResultFromJson;
export const RealizationClassificationError = M023RealizationClassificationError;
export const classifyRealization = classifyExactOneCapabilityExecution;

/**
 * M024 is intentionally a mission-local protocol theory.  It does not add
 * channels, owners, or temporal constructs to Core; it checks one encoded
 * bounded protocol and evaluates the finite observations produced by its
 * deterministic scheduler.
 */
const M024IdentifierSchema = Schema.String.pipe(Schema.check(Schema.isNonEmpty())).annotate({
  identifier: "M024Identifier",
});

const M024VersionSchema = Schema.Literal(1);

const M024ResultClassSchema = Schema.Literals(["Satisfied", "Violated", "Unresolved"]);
export type M024ChannelResultClass = typeof M024ResultClassSchema.Type;
export const M024ChannelResultClassSchema = M024ResultClassSchema;

export const M024_CHANNEL_OBLIGATION_IDS = [
  "BoundedChannelProtocol.obligation.logical-message-identity",
  "BoundedChannelProtocol.obligation.handle-after-causal-parent",
  "BoundedChannelProtocol.obligation.at-most-once-state-mutation",
  "BoundedChannelProtocol.obligation.acknowledged-coordination",
  "BoundedChannelProtocol.obligation.loss-remains-unresolved",
] as const;

export type M024ChannelObligationId = (typeof M024_CHANNEL_OBLIGATION_IDS)[number];

const M024ChannelObligationIdSchema = Schema.Literals([...M024_CHANNEL_OBLIGATION_IDS]);

const M024ChannelOperationSchema = Schema.Literals(["Prepare", "Commit", "Ack"]);
export type M024ChannelOperation = typeof M024ChannelOperationSchema.Type;

const M024ChannelLogicalMessageSchema = Schema.Struct({
  id: M024IdentifierSchema,
  operation: M024ChannelOperationSchema,

  transaction: M024IdentifierSchema,
  sender: M024IdentifierSchema,
  receiver: M024IdentifierSchema,
  amount: Schema.optional(Schema.Int),
  causalParent: Schema.optional(M024IdentifierSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M024ChannelLogicalMessage = typeof M024ChannelLogicalMessageSchema.Type;
export const M024ChannelLogicalMessage = M024ChannelLogicalMessageSchema;
export const M024ChannelLogicalMessageFromJson = Schema.fromJsonString(
  M024ChannelLogicalMessageSchema,
);

const M024ChannelProtocolSchema = Schema.Struct({
  id: M024IdentifierSchema,
  version: M024VersionSchema,
  owners: Schema.Tuple([M024IdentifierSchema, M024IdentifierSchema]),
  messages: Schema.Array(M024ChannelLogicalMessageSchema).pipe(
    Schema.check(
      Schema.makeFilter((messages) => messages.length === 3, {
        expected: "the M024 protocol must declare exactly three logical messages",
      }),
    ),
  ),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M024ChannelProtocol = typeof M024ChannelProtocolSchema.Type;
export { M024ChannelProtocolSchema };
export const M024ChannelProtocolFromJson = Schema.fromJsonString(M024ChannelProtocolSchema);

const M024DeliverStepSchema = Schema.Struct({
  action: Schema.Literal("deliver"),
  attemptId: M024IdentifierSchema,
  messageId: M024IdentifierSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M024DropStepSchema = Schema.Struct({
  action: Schema.Literal("drop"),
  attemptId: M024IdentifierSchema,
  messageId: M024IdentifierSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M024CompleteStepSchema = Schema.Struct({
  action: Schema.Literal("complete"),
  ownerId: M024IdentifierSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const M024ChannelScheduleStepSchema = Schema.Union([
  M024DeliverStepSchema,
  M024DropStepSchema,
  M024CompleteStepSchema,
]).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M024ChannelScheduleStep = typeof M024ChannelScheduleStepSchema.Type;
export const M024ChannelScheduleStepFromJson = Schema.fromJsonString(M024ChannelScheduleStepSchema);

const M024ChannelScheduleSchema = Schema.Struct({
  id: M024IdentifierSchema,
  steps: Schema.Array(M024ChannelScheduleStepSchema).pipe(
    Schema.check(
      Schema.makeFilter((steps) => steps.length > 0, {
        expected: "an M024 schedule must contain at least one step",
      }),
    ),
  ),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M024ChannelSchedule = typeof M024ChannelScheduleSchema.Type;
export { M024ChannelScheduleSchema };
export const M024ChannelScheduleFromJson = Schema.fromJsonString(M024ChannelScheduleSchema);

const M024ChannelSelectionSchemaRaw = Schema.Struct({
  bangChannelSelection: M024VersionSchema,
  protocol: M024ChannelProtocolSchema,
  schedules: Schema.Array(M024ChannelScheduleSchema).pipe(
    Schema.check(
      Schema.makeFilter((schedules) => schedules.length > 0, {
        expected: "an M024 selection must contain at least one schedule",
      }),
    ),
  ),
  limitations: Schema.Array(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M024ChannelSelection = typeof M024ChannelSelectionSchemaRaw.Type;
export { M024ChannelSelectionSchemaRaw as M024ChannelSelectionSchema };
export const M024ChannelSelectionFromJson = Schema.fromJsonString(M024ChannelSelectionSchemaRaw);

const M024ObservationIdentityFields = {
  sequence: Schema.Natural,
  attemptId: M024IdentifierSchema,
  messageId: M024IdentifierSchema,
} as const;

const M024HandledObservationFields = {
  ...M024ObservationIdentityFields,
  ownerId: M024IdentifierSchema,
} as const;

const M024RejectedReasonSchema = Schema.Literals([
  "causal-parent-not-handled",
  "wrong-state",
  "wrong-recipient",
  "duplicate-attempt",
  "unknown-message",
]);

export type M024ChannelRejectedReason = typeof M024RejectedReasonSchema.Type;
export const M024ChannelRejectedReasonSchema = M024RejectedReasonSchema;

export const M024ChannelObservationSchema = Schema.TaggedUnion({
  Sent: M024ObservationIdentityFields,
  Delivered: M024ObservationIdentityFields,
  Handled: M024HandledObservationFields,
  Rejected: {
    ...M024HandledObservationFields,
    reason: M024RejectedReasonSchema,
  },
  Dropped: M024ObservationIdentityFields,
  DuplicateIgnored: M024HandledObservationFields,
  ForcedCompletion: {
    sequence: Schema.Natural,
    ownerId: M024IdentifierSchema,
    previousState: Schema.Literal("waiting"),
    nextState: Schema.Literal("complete"),
  },
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M024ChannelObservation = typeof M024ChannelObservationSchema.Type;
export const M024ChannelObservationFromJson = Schema.fromJsonString(M024ChannelObservationSchema);

const M024OwnerAStateSchema = Schema.Literals(["waiting", "complete"]);
const M024OwnerBStateSchema = Schema.Literals(["idle", "prepared", "committed"]);

const M024ChannelFinalStatesSchema = Schema.Struct({
  ownerA: M024OwnerAStateSchema,
  ownerB: M024OwnerBStateSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M024ChannelFinalStates = typeof M024ChannelFinalStatesSchema.Type;
export const M024ChannelFinalStates = M024ChannelFinalStatesSchema;

const M024ChannelPerScheduleTraceSchema = Schema.Struct({
  scheduleId: M024IdentifierSchema,
  observations: Schema.Array(M024ChannelObservationSchema),
  finalStates: M024ChannelFinalStatesSchema,
  stateMutations: Schema.Natural,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M024ChannelPerScheduleTrace = typeof M024ChannelPerScheduleTraceSchema.Type;
export const M024ChannelPerScheduleTrace = M024ChannelPerScheduleTraceSchema;

const M024ChannelTraceSchemaRaw = Schema.Struct({
  bangChannelTrace: M024VersionSchema,
  protocolId: M024IdentifierSchema,
  protocolVersion: M024VersionSchema,
  schedules: Schema.Array(M024ChannelPerScheduleTraceSchema).pipe(
    Schema.check(
      Schema.makeFilter((schedules) => schedules.length > 0, {
        expected: "an M024 trace must contain at least one schedule trace",
      }),
    ),
  ),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M024ChannelTrace = typeof M024ChannelTraceSchemaRaw.Type;
export { M024ChannelTraceSchemaRaw as M024ChannelTraceSchema };
export const M024ChannelTraceFromJson = Schema.fromJsonString(M024ChannelTraceSchemaRaw);

const M024ChannelCounterexampleSchema = Schema.Struct({
  detail: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  observationSequence: Schema.optional(Schema.Natural),
  attemptId: Schema.optional(M024IdentifierSchema),
  messageId: Schema.optional(M024IdentifierSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type M024ChannelCounterexample = typeof M024ChannelCounterexampleSchema.Type;
export const M024ChannelCounterexample = M024ChannelCounterexampleSchema;

const M024ChannelObligationResultSchemaRaw = Schema.Struct({
  obligationId: M024ChannelObligationIdSchema,
  status: M024ResultClassSchema,
  reason: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  counterexample: Schema.optional(M024ChannelCounterexampleSchema),
})
  .check(
    Schema.makeFilter(
      ({ status, counterexample }) =>
        status === "Violated" ? counterexample !== undefined : counterexample === undefined,
      {
        expected: "only a violated obligation may carry a counterexample",
      },
    ),
  )
  .annotate({
    parseOptions: { onExcessProperty: "error" },
  });

export type M024ChannelObligationResult = typeof M024ChannelObligationResultSchemaRaw.Type;
export { M024ChannelObligationResultSchemaRaw as M024ChannelObligationResultSchema };
export const M024ChannelObligationResultFromJson = Schema.fromJsonString(
  M024ChannelObligationResultSchemaRaw,
);

const M024ChannelPerScheduleReportSchema = Schema.Struct({
  scheduleId: M024IdentifierSchema,
  result: M024ResultClassSchema,
  obligations: Schema.Array(M024ChannelObligationResultSchemaRaw).pipe(
    Schema.check(
      Schema.makeFilter(
        (results) =>
          results.length === M024_CHANNEL_OBLIGATION_IDS.length &&
          new Set(results.map(({ obligationId }) => obligationId)).size ===
            M024_CHANNEL_OBLIGATION_IDS.length,
        {
          expected: "one result for each distinct M024 obligation",
        },
      ),
    ),
  ),
  observations: Schema.Array(M024ChannelObservationSchema),
  finalStates: M024ChannelFinalStatesSchema,
  stateMutations: Schema.Natural,
})
  .check(
    Schema.makeFilter(
      ({ result, obligations: scheduleObligations }) => {
        const statuses = new Set(scheduleObligations.map(({ status }) => status));
        const expected = statuses.has("Violated")
          ? "Violated"
          : statuses.has("Unresolved")
            ? "Unresolved"
            : "Satisfied";
        return result === expected;
      },
      {
        expected: "the schedule result must obey Violated > Unresolved > Satisfied precedence",
      },
    ),
  )
  .annotate({
    parseOptions: { onExcessProperty: "error" },
  });

export type M024ChannelPerScheduleReport = typeof M024ChannelPerScheduleReportSchema.Type;
export const M024ChannelPerScheduleReport = M024ChannelPerScheduleReportSchema;

const M024ChannelReportSchemaRaw = Schema.Struct({
  bangChannelReport: M024VersionSchema,
  protocolId: M024IdentifierSchema,
  protocolVersion: M024VersionSchema,
  schedules: Schema.Array(M024ChannelPerScheduleReportSchema).pipe(
    Schema.check(
      Schema.makeFilter((schedules) => schedules.length > 0, {
        expected: "an M024 report must contain at least one schedule report",
      }),
    ),
  ),
  limitations: Schema.Array(Schema.String),
})
  .check(
    Schema.makeFilter(
      ({ schedules }) =>
        new Set(schedules.map(({ scheduleId }) => scheduleId)).size === schedules.length,
      {
        expected: "an M024 report must contain distinct schedule identities",
      },
    ),
  )
  .annotate({
    parseOptions: { onExcessProperty: "error" },
  });

export type M024ChannelReport = typeof M024ChannelReportSchemaRaw.Type;
export { M024ChannelReportSchemaRaw as M024ChannelReportSchema };
export const M024ChannelReportFromJson = Schema.fromJsonString(M024ChannelReportSchemaRaw);

export type M024ChannelFailureReason =
  | "schema"
  | "version"
  | "owner"
  | "duplicate-owner"
  | "duplicate-message"
  | "duplicate-schedule"
  | "duplicate-attempt"
  | "message"
  | "unknown-sender"
  | "unknown-receiver"
  | "self-sender"
  | "unknown-message"
  | "unknown-causal-parent"
  | "missing-causal-parent"
  | "invalid-causal-parent"
  | "self-causality"
  | "invalid-step"
  | "protocol-mismatch"
  | "trace-schedule-mismatch"
  | "observation-reference"
  | "observation-order"
  | "observation-attempt-mismatch"
  | "invalid-report";

const M024ChannelFailureReasonSchema = Schema.Literals([
  "schema",
  "version",
  "owner",
  "duplicate-owner",
  "duplicate-message",
  "duplicate-schedule",
  "duplicate-attempt",
  "message",
  "unknown-sender",
  "unknown-receiver",
  "self-sender",
  "unknown-message",
  "unknown-causal-parent",
  "missing-causal-parent",
  "invalid-causal-parent",
  "self-causality",
  "invalid-step",
  "protocol-mismatch",
  "trace-schedule-mismatch",
  "observation-reference",
  "observation-order",
  "observation-attempt-mismatch",
  "invalid-report",
]);

export class M024ChannelError extends Schema.TaggedError<M024ChannelError>()("M024ChannelError", {
  reason: M024ChannelFailureReasonSchema,
  path: Schema.String,
  message: Schema.String,
}) {}

const m024Failure = (
  reason: M024ChannelFailureReason,
  path: string,
  message: string,
): M024ChannelError => new M024ChannelError({ reason, path, message });

const m024Distinct = (values: ReadonlyArray<string>): boolean =>
  new Set(values).size === values.length;

const m024OperationByMessage = (
  messages: ReadonlyArray<M024ChannelLogicalMessage>,
): Map<string, M024ChannelLogicalMessage> =>
  new Map(messages.map((message) => [message.id, message]));

const m024ValidateProtocol = (
  protocol: M024ChannelProtocol,
): Effect.Effect<void, M024ChannelError> => {
  if (protocol.version !== 1) {
    return Effect.fail(
      m024Failure("version", "protocol.version", "M024 protocol version must be 1"),
    );
  }
  if (protocol.owners.length !== 2 || !m024Distinct(protocol.owners)) {
    return Effect.fail(
      m024Failure("owner", "protocol.owners", "M024 requires exactly two distinct owners"),
    );
  }
  if (!m024Distinct(protocol.messages.map(({ id }) => id))) {
    return Effect.fail(
      m024Failure(
        "duplicate-message",
        "protocol.messages",
        "logical message identities must be unique",
      ),
    );
  }

  const ownerSet = new Set(protocol.owners);
  const messageById = m024OperationByMessage(protocol.messages);
  const operationSet = new Set<M024ChannelOperation>();
  for (const [index, message] of protocol.messages.entries()) {
    const path = `protocol.messages[${index}]`;
    if (!ownerSet.has(message.sender)) {
      return Effect.fail(
        m024Failure("unknown-sender", `${path}.sender`, `unknown sender ${message.sender}`),
      );
    }
    if (!ownerSet.has(message.receiver)) {
      return Effect.fail(
        m024Failure("unknown-receiver", `${path}.receiver`, `unknown receiver ${message.receiver}`),
      );
    }
    if (message.sender === message.receiver) {
      return Effect.fail(
        m024Failure("self-sender", path, "sender and receiver must be distinct owners"),
      );
    }
    const expectedSender = message.operation === "Ack" ? protocol.owners[1] : protocol.owners[0];
    const expectedReceiver = message.operation === "Ack" ? protocol.owners[0] : protocol.owners[1];
    if (message.sender !== expectedSender || message.receiver !== expectedReceiver) {
      return Effect.fail(
        m024Failure(
          "message",
          path,
          `${message.operation} must use the frozen owner-a/owner-b direction`,
        ),
      );
    }
    if (operationSet.has(message.operation)) {
      return Effect.fail(
        m024Failure("message", `${path}.operation`, "each M024 operation must occur once"),
      );
    }
    operationSet.add(message.operation);
    const expectedParentOperation =
      message.operation === "Prepare"
        ? undefined
        : message.operation === "Commit"
          ? "Prepare"
          : "Commit";
    if (expectedParentOperation === undefined) {
      if (message.causalParent !== undefined) {
        return Effect.fail(
          m024Failure(
            "invalid-causal-parent",
            `${path}.causalParent`,
            "prepare-t1 must not have a causal parent",
          ),
        );
      }
      if (message.amount === undefined) {
        return Effect.fail(
          m024Failure("message", `${path}.amount`, "prepare-t1 requires an amount"),
        );
      }
    } else {
      if (message.causalParent === undefined) {
        return Effect.fail(
          m024Failure(
            "missing-causal-parent",
            `${path}.causalParent`,
            `${message.operation.toLowerCase()} requires its causal parent`,
          ),
        );
      }
      if (message.amount !== undefined) {
        return Effect.fail(
          m024Failure("message", `${path}.amount`, "only prepare-t1 may carry an amount"),
        );
      }
      if (message.causalParent === message.id) {
        return Effect.fail(
          m024Failure("self-causality", `${path}.causalParent`, "a message cannot cause itself"),
        );
      }
      const parent = messageById.get(message.causalParent);
      if (parent === undefined) {
        return Effect.fail(
          m024Failure(
            "unknown-causal-parent",
            `${path}.causalParent`,
            `unknown causal parent ${message.causalParent}`,
          ),
        );
      }
      if (
        parent.operation !== expectedParentOperation ||
        parent.transaction !== message.transaction
      ) {
        return Effect.fail(
          m024Failure(
            "invalid-causal-parent",
            `${path}.causalParent`,
            `${message.operation} must causally follow ${expectedParentOperation} for the same transaction`,
          ),
        );
      }
    }
  }
  if (!operationSet.has("Prepare") || !operationSet.has("Commit") || !operationSet.has("Ack")) {
    return Effect.fail(
      m024Failure(
        "message",
        "protocol.messages",
        "M024 requires one Prepare, one Commit, and one Ack message",
      ),
    );
  }

  return Effect.succeed(undefined);
};

const m024ValidateSchedules = (
  selection: M024ChannelSelection,
): Effect.Effect<void, M024ChannelError> => {
  const { protocol, schedules } = selection;
  if (!m024Distinct(schedules.map(({ id }) => id))) {
    return Effect.fail(
      m024Failure("duplicate-schedule", "schedules", "schedule identities must be unique"),
    );
  }
  const messageIds = new Set(protocol.messages.map(({ id }) => id));
  for (const [scheduleIndex, schedule] of schedules.entries()) {
    const attemptIds = new Set<string>();
    for (const [stepIndex, step] of schedule.steps.entries()) {
      const path = `schedules[${scheduleIndex}].steps[${stepIndex}]`;
      if (step.action === "complete") {
        if (step.ownerId !== protocol.owners[0]) {
          return Effect.fail(
            m024Failure(
              "invalid-step",
              `${path}.ownerId`,
              "the complete step must force the first owner (owner-a) only",
            ),
          );
        }
        continue;
      }
      if (attemptIds.has(step.attemptId)) {
        return Effect.fail(
          m024Failure(
            "duplicate-attempt",
            `${path}.attemptId`,
            `duplicate delivery-attempt identity ${step.attemptId}`,
          ),
        );
      }
      attemptIds.add(step.attemptId);
      if (!messageIds.has(step.messageId)) {
        return Effect.fail(
          m024Failure(
            "unknown-message",
            `${path}.messageId`,
            `unknown logical message ${step.messageId}`,
          ),
        );
      }
    }
  }
  return Effect.succeed(undefined);
};

export const validateM024ChannelSelection = (
  selection: M024ChannelSelection,
): Effect.Effect<M024ChannelSelection, M024ChannelError> =>
  Effect.gen(function* () {
    if (selection.bangChannelSelection !== 1) {
      return yield* Effect.fail(
        m024Failure("version", "bangChannelSelection", "M024 selection version must be 1"),
      );
    }
    yield* m024ValidateProtocol(selection.protocol);
    yield* m024ValidateSchedules(selection);
    return selection;
  });

const decodeM024SelectionValue = (
  input: unknown,
): Effect.Effect<M024ChannelSelection, M024ChannelError> =>
  Schema.decodeUnknownEffect(M024ChannelSelectionSchemaRaw)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) => m024Failure("schema", "M024ChannelSelection", String(issue))),
    Effect.flatMap(validateM024ChannelSelection),
  );

export const decodeM024ChannelSelection = (
  input: unknown,
): Effect.Effect<M024ChannelSelection, M024ChannelError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M024ChannelSelectionFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) => m024Failure("schema", "M024ChannelSelection", String(issue))),
        Effect.flatMap(validateM024ChannelSelection),
      )
    : decodeM024SelectionValue(input);

const m024DecodeTraceValue = (input: unknown): Effect.Effect<M024ChannelTrace, M024ChannelError> =>
  Schema.decodeUnknownEffect(M024ChannelTraceSchemaRaw)(input, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError((issue) => m024Failure("schema", "M024ChannelTrace", String(issue))));

export const decodeM024ChannelTrace = (
  input: unknown,
): Effect.Effect<M024ChannelTrace, M024ChannelError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M024ChannelTraceFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError((issue) => m024Failure("schema", "M024ChannelTrace", String(issue))))
    : m024DecodeTraceValue(input);

const m024DecodeReportValue = (
  input: unknown,
): Effect.Effect<M024ChannelReport, M024ChannelError> =>
  Schema.decodeUnknownEffect(M024ChannelReportSchemaRaw)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) => m024Failure("invalid-report", "M024ChannelReport", String(issue))),
  );

export const decodeM024ChannelReport = (
  input: unknown,
): Effect.Effect<M024ChannelReport, M024ChannelError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M024ChannelReportFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          m024Failure("invalid-report", "M024ChannelReport", String(issue)),
        ),
      )
    : m024DecodeReportValue(input);

const m024StepByAttempt = (
  schedule: M024ChannelSchedule,
): Map<string, Exclude<M024ChannelScheduleStep, { readonly action: "complete" }>> =>
  new Map(
    schedule.steps
      .filter(
        (step): step is Exclude<M024ChannelScheduleStep, { readonly action: "complete" }> =>
          step.action !== "complete",
      )
      .map((step) => [step.attemptId, step]),
  );

const m024ValidateTraceAgainstSelection = (
  selection: M024ChannelSelection,
  trace: M024ChannelTrace,
): Effect.Effect<void, M024ChannelError> => {
  if (
    trace.bangChannelTrace !== 1 ||
    trace.protocolId !== selection.protocol.id ||
    trace.protocolVersion !== selection.protocol.version
  ) {
    return Effect.fail(
      m024Failure(
        "protocol-mismatch",
        "trace",
        "trace protocol identity and version must match the selection",
      ),
    );
  }
  const scheduleById = new Map(selection.schedules.map((schedule) => [schedule.id, schedule]));
  const seenSchedules = new Set<string>();
  const messageById = m024OperationByMessage(selection.protocol.messages);
  for (const [scheduleIndex, record] of trace.schedules.entries()) {
    const schedule = scheduleById.get(record.scheduleId);
    if (schedule === undefined || seenSchedules.has(record.scheduleId)) {
      return Effect.fail(
        m024Failure(
          "trace-schedule-mismatch",
          `schedules[${scheduleIndex}].scheduleId`,
          `trace contains unknown or duplicate schedule ${record.scheduleId}`,
        ),
      );
    }
    seenSchedules.add(record.scheduleId);
    const stepByAttempt = m024StepByAttempt(schedule);
    const completeSteps = schedule.steps.filter((step) => step.action === "complete").length;
    let forcedCompletions = 0;
    const eventByAttempt = new Map<
      string,
      { messageId: string; sent: boolean; delivered: boolean; terminal: boolean }
    >();
    const handled = new Set<string>();
    for (const [eventIndex, event] of record.observations.entries()) {
      const path = `schedules[${scheduleIndex}].observations[${eventIndex}]`;
      if (event._tag === "ForcedCompletion") {
        if (
          event.ownerId !== selection.protocol.owners[0] ||
          event.previousState !== "waiting" ||
          event.nextState !== "complete"
        ) {
          return Effect.fail(
            m024Failure(
              "observation-reference",
              path,
              "ForcedCompletion must move the first owner from waiting to complete",
            ),
          );
        }
        forcedCompletions += 1;
        continue;
      }
      const step = stepByAttempt.get(event.attemptId);
      if (step === undefined) {
        return Effect.fail(
          m024Failure(
            "observation-reference",
            `${path}.attemptId`,
            `observation references an undeclared delivery attempt`,
          ),
        );
      }
      if (step.messageId !== event.messageId) {
        return Effect.fail(
          m024Failure(
            "observation-attempt-mismatch",
            path,
            `attempt ${event.attemptId} refers to ${step.messageId}, not ${event.messageId}`,
          ),
        );
      }
      const message = messageById.get(event.messageId);
      if (message === undefined) {
        return Effect.fail(
          m024Failure(
            "unknown-message",
            `${path}.messageId`,
            `unknown logical message ${event.messageId}`,
          ),
        );
      }
      const state = eventByAttempt.get(event.attemptId) ?? {
        messageId: event.messageId,
        sent: false,
        delivered: false,
        terminal: false,
      };
      if (event._tag === "Sent") {
        if (state.sent || state.delivered || state.terminal) {
          return Effect.fail(
            m024Failure(
              "observation-order",
              path,
              "Sent must occur once before terminal observations for an attempt",
            ),
          );
        }
        state.sent = true;
      } else if (event._tag === "Delivered") {
        if (step.action !== "deliver" || !state.sent || state.delivered || state.terminal) {
          return Effect.fail(
            m024Failure(
              "observation-order",
              path,
              "a delivery attempt may be delivered once after Sent",
            ),
          );
        }
        state.delivered = true;
      } else if (event._tag === "Dropped") {
        if (step.action !== "drop" || !state.sent || state.terminal) {
          return Effect.fail(
            m024Failure(
              "observation-order",
              path,
              "only a dropped attempt may emit Dropped after Sent",
            ),
          );
        }
        state.terminal = true;
      } else {
        const destination = message.receiver;
        if (
          event.ownerId !== destination ||
          !state.sent ||
          (event._tag === "Handled" && !state.delivered) ||
          (event._tag === "Rejected" && !state.delivered) ||
          (event._tag === "DuplicateIgnored" && (!state.delivered || !handled.has(event.messageId)))
        ) {
          return Effect.fail(
            m024Failure(
              "observation-reference",
              path,
              "handling observations must reach the declared receiver after delivery",
            ),
          );
        }
        if (event._tag === "Handled") {
          handled.add(event.messageId);
          state.terminal = true;
        } else if (event._tag === "DuplicateIgnored") {
          state.terminal = true;
        } else {
          state.terminal = true;
        }
      }
      eventByAttempt.set(event.attemptId, state);
    }
    if (forcedCompletions !== completeSteps) {
      return Effect.fail(
        m024Failure(
          "observation-reference",
          `schedules[${scheduleIndex}].observations`,
          "each complete schedule step must emit exactly one ForcedCompletion observation",
        ),
      );
    }
  }
  if (seenSchedules.size !== selection.schedules.length) {
    return Effect.fail(
      m024Failure(
        "trace-schedule-mismatch",
        "schedules",
        "trace must contain exactly one per-schedule trace for every selected schedule",
      ),
    );
  }
  return Effect.succeed(undefined);
};

const m024Counterexample = (
  detail: string,
  event?: M024ChannelObservation,
): M024ChannelCounterexample => ({
  detail,
  ...(event === undefined ? {} : { observationSequence: event.sequence }),
  ...(event === undefined || !("attemptId" in event)
    ? {}
    : {
        attemptId: event.attemptId,
        messageId: event.messageId,
      }),
});

const m024MakeObligationResult = (
  obligationId: M024ChannelObligationId,
  status: M024ChannelResultClass,
  reason: string,
  counterexample?: M024ChannelCounterexample,
): M024ChannelObligationResult => ({
  obligationId,
  status,
  reason,
  ...(counterexample === undefined ? {} : { counterexample }),
});

const m024EvaluateSchedule = (
  protocol: M024ChannelProtocol,
  scheduleTrace: M024ChannelPerScheduleTrace,
): M024ChannelPerScheduleReport => {
  const messageById = m024OperationByMessage(protocol.messages);
  const handled = new Set<string>();
  let forcedCompletions = 0;
  let forcedCompletionEvent: M024ChannelObservation | undefined;
  let causalViolation: M024ChannelCounterexample | undefined;
  let atMostOnceViolation: M024ChannelCounterexample | undefined;
  let droppedAck = false;
  let ackHandled = false;
  let commitHandled = false;
  for (const event of scheduleTrace.observations) {
    if (event._tag === "ForcedCompletion") {
      forcedCompletions += 1;
      forcedCompletionEvent ??= event;
      continue;
    }
    const message = messageById.get(event.messageId);
    if (message === undefined) continue;
    if (event._tag === "Dropped" && message.operation === "Ack") {
      droppedAck = true;
    }
    if (event._tag === "Rejected" && event.reason === "causal-parent-not-handled") {
      causalViolation ??= m024Counterexample(
        "a message was rejected before its causal parent was handled",
        event,
      );
    }
    if (event._tag === "Handled") {
      if (message.causalParent !== undefined && !handled.has(message.causalParent)) {
        causalViolation ??= m024Counterexample(
          `handled ${message.id} before causal parent ${message.causalParent}`,
          event,
        );
      }
      if (handled.has(message.id)) {
        atMostOnceViolation ??= m024Counterexample(
          `logical message ${message.id} mutated state more than once`,
          event,
        );
      } else {
        handled.add(message.id);
      }
      if (message.operation === "Ack") ackHandled = true;
      if (message.operation === "Commit") commitHandled = true;
    }
  }
  const expectedMutations = handled.size + forcedCompletions;
  if (scheduleTrace.stateMutations !== expectedMutations) {
    atMostOnceViolation ??= m024Counterexample(
      `trace declares ${scheduleTrace.stateMutations} state mutations for ${expectedMutations} handled or forced transitions`,
    );
  }
  const ownerA = protocol.owners[0];
  const ownerB = protocol.owners[1];
  const ackMessage = protocol.messages.find(({ operation }) => operation === "Ack")!;
  const commitMessage = protocol.messages.find(({ operation }) => operation === "Commit")!;
  const ownerACompletedWithoutAck = scheduleTrace.finalStates.ownerA === "complete" && !ackHandled;
  const coordinationViolation =
    (scheduleTrace.finalStates.ownerB === "committed" && !commitHandled) ||
    ownerACompletedWithoutAck
      ? m024Counterexample(
          ownerACompletedWithoutAck
            ? `${ownerA} reached complete without handling ${ackMessage.id}`
            : `${ownerB} reached committed without handling ${commitMessage.id}`,
          ownerACompletedWithoutAck ? forcedCompletionEvent : undefined,
        )
      : undefined;
  const lossStatus =
    droppedAck && !ackHandled && scheduleTrace.finalStates.ownerA === "complete"
      ? {
          status: "Violated" as const,
          reason: `${ownerA} completed even though ${ackMessage.id} delivery was dropped`,
          counterexample: m024Counterexample(
            "dropped acknowledgement did not remain unresolved",
            forcedCompletionEvent,
          ),
        }
      : !ackHandled
        ? {
            status: "Unresolved" as const,
            reason: droppedAck
              ? `${ackMessage.id} was dropped and ${ownerA} remained waiting`
              : `the finite trace did not observe ${ackMessage.id} handling`,
          }
        : {
            status: "Satisfied" as const,
            reason: `${ackMessage.id} handling was observed`,
          };
  const scheduleObligationResults = [
    m024MakeObligationResult(
      M024_CHANNEL_OBLIGATION_IDS[0],
      "Satisfied",
      "all decoded observations refer to declared logical messages and delivery attempts",
    ),
    m024MakeObligationResult(
      M024_CHANNEL_OBLIGATION_IDS[1],
      causalViolation === undefined ? "Satisfied" : "Violated",
      causalViolation === undefined
        ? "every handled message followed its declared causal parent"
        : causalViolation.detail,
      causalViolation,
    ),
    m024MakeObligationResult(
      M024_CHANNEL_OBLIGATION_IDS[2],
      atMostOnceViolation === undefined ? "Satisfied" : "Violated",
      atMostOnceViolation === undefined
        ? "repeated attempts did not cause repeated state mutation"
        : atMostOnceViolation.detail,
      atMostOnceViolation,
    ),
    m024MakeObligationResult(
      M024_CHANNEL_OBLIGATION_IDS[3],
      coordinationViolation === undefined ? "Satisfied" : "Violated",
      coordinationViolation === undefined
        ? "owner-a and owner-b reached states only after their required message handling"
        : coordinationViolation.detail,
      coordinationViolation,
    ),
    m024MakeObligationResult(
      M024_CHANNEL_OBLIGATION_IDS[4],
      lossStatus.status,
      lossStatus.reason,
      "counterexample" in lossStatus ? lossStatus.counterexample : undefined,
    ),
  ] satisfies ReadonlyArray<M024ChannelObligationResult>;
  const result = scheduleObligationResults.some(({ status }) => status === "Violated")
    ? "Violated"
    : scheduleObligationResults.some(({ status }) => status === "Unresolved")
      ? "Unresolved"
      : "Satisfied";
  // Causality is derived from handled-message history, never sequence position.
  return {
    scheduleId: scheduleTrace.scheduleId,
    result,
    obligations: scheduleObligationResults,
    observations: scheduleTrace.observations,
    finalStates: scheduleTrace.finalStates,
    stateMutations: scheduleTrace.stateMutations,
  };
};

export const evaluateM024ChannelTrace = (
  selection: M024ChannelSelection,
  trace: M024ChannelTrace,
): Effect.Effect<M024ChannelReport, M024ChannelError> =>
  Effect.gen(function* () {
    const checkedSelection = yield* decodeM024SelectionValue(selection);
    const checkedTrace = yield* m024DecodeTraceValue(trace);
    yield* m024ValidateTraceAgainstSelection(checkedSelection, checkedTrace);
    const scheduleReports = checkedSelection.schedules.map((schedule) => {
      const scheduleTrace = checkedTrace.schedules.find(
        ({ scheduleId }) => scheduleId === schedule.id,
      )!;
      return m024EvaluateSchedule(checkedSelection.protocol, scheduleTrace);
    });
    const report: M024ChannelReport = {
      bangChannelReport: 1,
      protocolId: checkedSelection.protocol.id,
      protocolVersion: checkedSelection.protocol.version,
      schedules: scheduleReports,
      limitations: [...checkedSelection.limitations],
    };
    return yield* m024DecodeReportValue(report);
  });
