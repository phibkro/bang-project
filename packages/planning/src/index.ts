import { encodeCanonicalJson } from "@bang/core";
import {
  checkM031TargetQualificationEvidence,
  type CheckedM031TargetQualificationEvidence,
  M031TargetQualificationEvidenceSchema,
} from "@bang/evidence";
import { M023ClassificationResultSchema, type M023ClassificationResult } from "@bang/theories";
import { Effect, Schema } from "effect";

const parseOptions = { onExcessProperty: "error" } as const;
const nonEmpty = Schema.String.pipe(Schema.check(Schema.isNonEmpty()));
const identifier = nonEmpty.pipe(
  Schema.check(
    Schema.makeFilter((value) => !value.includes("\u0000") && !value.includes("/"), {
      expected: "a non-empty identifier without path separators or NUL",
    }),
  ),
);
const safeIdentity = nonEmpty.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value), {
      expected: "a safe selection identity",
    }),
  ),
);
const repositoryPath = nonEmpty.pipe(
  Schema.check(
    Schema.makeFilter(
      (value) =>
        !value.includes("\\") &&
        !value.includes("\u0000") &&
        !value.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/u.test(value) &&
        value
          .split("/")
          .every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
      { expected: "a repository-relative path without traversal" },
    ),
  ),
);
const sha256 = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u)));
const semanticDigest = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^sha256:[0-9a-f]{64}$/u.test(value), {
      expected: "a sha256-prefixed lowercase hexadecimal digest",
    }),
  ),
);

const targetId = Schema.Literals(["effect-typescript", "gleam-beam"]);
export type PlanningTargetId = typeof targetId.Type;
export const PlanningTargetIdSchema = targetId;

const demandFamily = Schema.Literals(["runtime-model", "restart", "grant-restart"]);
export type PlanningDemandFamily = typeof demandFamily.Type;
export const PlanningDemandFamilySchema = demandFamily;

const runtimeDemandSchema = Schema.Struct({
  family: Schema.Literal("runtime-model"),
  value: Schema.Literals(["in-process", "supervised-actor"]),
}).annotate({ parseOptions });
const restartDemandSchema = Schema.Struct({
  family: Schema.Literal("restart"),
  value: Schema.Literal("supervised-restart"),
}).annotate({ parseOptions });
const grantRestartDemandSchema = Schema.Struct({
  family: Schema.Literal("grant-restart"),
  value: Schema.Literals(["invalidated-on-restart", "survives-restart"]),
}).annotate({ parseOptions });

export const ObjectiveDemandSchema = Schema.Union([
  runtimeDemandSchema,
  restartDemandSchema,
  grantRestartDemandSchema,
]).annotate({ parseOptions });
export type ObjectiveDemand = typeof ObjectiveDemandSchema.Type;
export const PlanningDemandSchema = ObjectiveDemandSchema;
export type PlanningDemand = ObjectiveDemand;

const demandRank = (family: PlanningDemandFamily): number => {
  switch (family) {
    case "runtime-model":
      return 0;
    case "restart":
      return 1;
    case "grant-restart":
      return 2;
  }
};

const isCanonicalDemandOrder = (demands: ReadonlyArray<ObjectiveDemand>): boolean => {
  const families = demands.map(({ family }) => family);
  const unique = new Set(families);
  return (
    unique.size === families.length &&
    families.every(
      (family, index) => index === 0 || demandRank(family) > demandRank(families[index - 1]!),
    )
  );
};

const demandListSchema = Schema.Array(ObjectiveDemandSchema).check(
  Schema.makeFilter(isCanonicalDemandOrder, {
    expected: "objective demands must use each family at most once in canonical order",
  }),
);

export const PlanningSelectionSchema = Schema.Struct({
  bangPlanning: Schema.Literal(1),
  id: safeIdentity,
  qualificationSelection: repositoryPath,
  requirementAddress: identifier,
  demands: demandListSchema,
}).annotate({ parseOptions });
export type PlanningSelection = typeof PlanningSelectionSchema.Type;
export const PlanningSelectionFromJson = Schema.fromJsonString(PlanningSelectionSchema);

export const PlanningObjectiveSchema = Schema.Struct({
  requirementAddress: identifier,
  demands: demandListSchema,
}).annotate({ parseOptions });
export type PlanningObjective = typeof PlanningObjectiveSchema.Type;
export const ObjectiveSchema = PlanningObjectiveSchema;

const theoryIdentitySchema = Schema.Struct({
  id: identifier,
  version: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
}).annotate({ parseOptions });
export const PlanningTheoryIdentitySchema = theoryIdentitySchema;
export type PlanningTheoryIdentity = typeof theoryIdentitySchema.Type;

const packageIdentitySchema = Schema.Struct({
  id: identifier,
  version: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  semanticDigest,
}).annotate({ parseOptions });
export const PlanningPackageIdentitySchema = packageIdentitySchema;
export type PlanningPackageIdentity = typeof packageIdentitySchema.Type;

const materialReferenceSchema = Schema.Struct({
  path: repositoryPath,
  sha256,
}).annotate({ parseOptions });
export const PlanningMaterialReferenceSchema = materialReferenceSchema;
export type PlanningMaterialReference = typeof materialReferenceSchema.Type;
export const MaterialReferenceSchema = materialReferenceSchema;
export type MaterialReference = PlanningMaterialReference;

const targetMaterialReferenceSchema = Schema.Struct({
  role: identifier,
  path: repositoryPath,
  sha256,
}).annotate({ parseOptions });
export const TargetMaterialReferenceSchema = targetMaterialReferenceSchema;
export type TargetMaterialReference = typeof targetMaterialReferenceSchema.Type;

const evidenceClassSchema = Schema.Literals([
  "structurally-derived",
  "runtime-checked",
  "assumed-truthful",
  "unsupported-by-target",
  "unresolved",
]);
export type PlanningEvidenceClass = typeof evidenceClassSchema.Type;
export const PlanningEvidenceClassSchema = evidenceClassSchema;

export const EvidenceReferenceSchema = Schema.Struct({
  class: evidenceClassSchema,
  scope: identifier,
  producer: identifier,
  materials: Schema.Array(materialReferenceSchema),
}).annotate({ parseOptions });
export type EvidenceReference = typeof EvidenceReferenceSchema.Type;
export const PlanningEvidenceReferenceSchema = EvidenceReferenceSchema;
export type PlanningEvidenceReference = EvidenceReference;

const actorRestartSchema = Schema.Struct({
  oldGrantRejected: Schema.Boolean,
  freshGrantDistinct: Schema.Boolean,
  replacementGrantAccepted: Schema.Boolean,
  supervised: Schema.Boolean,
}).annotate({ parseOptions });
export const StructuredActorRestartObservationSchema = actorRestartSchema;
export type StructuredActorRestartObservation = typeof actorRestartSchema.Type;

const candidateIdentitySchema = Schema.Struct({
  target: targetId,
  realization: identifier,
  selectionId: identifier,
  artifactId: identifier,
  artifactFormat: Schema.Literal("bangSemanticArtifact:1"),
  theory: theoryIdentitySchema,
  package: packageIdentitySchema,
  requirementAddress: identifier,
}).annotate({ parseOptions });
export const PlanningCandidateIdentitySchema = candidateIdentitySchema;
export type PlanningCandidateIdentity = typeof candidateIdentitySchema.Type;

const contributionClaimSchema = Schema.Union([
  Schema.Struct({
    family: demandFamily,
    disposition: Schema.Literal("established"),
    value: Schema.Literals([
      "in-process",
      "supervised-actor",
      "supervised-restart",
      "invalidated-on-restart",
      "survives-restart",
    ]),
  }).annotate({ parseOptions }),
  Schema.Struct({
    family: demandFamily,
    disposition: Schema.Literal("unresolved"),
    reason: nonEmpty,
  }).annotate({ parseOptions }),
]).annotate({ parseOptions });
export type PlanningContributionClaim = typeof contributionClaimSchema.Type;
export const PlanningContributionClaimSchema = contributionClaimSchema;

const contributionEntrySchemaRaw = Schema.Union([
  Schema.Struct({
    family: demandFamily,
    disposition: Schema.Literal("established"),
    value: Schema.Literals([
      "in-process",
      "supervised-actor",
      "supervised-restart",
      "invalidated-on-restart",
      "survives-restart",
    ]),
    evidenceReferences: Schema.NonEmptyArray(EvidenceReferenceSchema),
  }).annotate({ parseOptions }),
  Schema.Struct({
    family: demandFamily,
    disposition: Schema.Literal("unresolved"),
    reason: nonEmpty,
    evidenceReferences: Schema.NonEmptyArray(EvidenceReferenceSchema),
  }).annotate({ parseOptions }),
]);
const valueMatchesFamily = (family: PlanningDemandFamily, value: string): boolean =>
  (family === "runtime-model" && (value === "in-process" || value === "supervised-actor")) ||
  (family === "restart" && value === "supervised-restart") ||
  (family === "grant-restart" &&
    (value === "invalidated-on-restart" || value === "survives-restart"));
const contributionEntrySchema = contributionEntrySchemaRaw
  .check(
    Schema.makeFilter(
      (entry) =>
        entry.disposition === "unresolved" || valueMatchesFamily(entry.family, entry.value),
      { expected: "established contribution values must belong to their demand family" },
    ),
  )
  .annotate({ parseOptions });
export const PlanningContributionEntrySchema = contributionEntrySchema;
export type PlanningContributionEntry = typeof contributionEntrySchema.Type;
export const EstablishedContributionSchema = Schema.Struct({
  family: demandFamily,
  disposition: Schema.Literal("established"),
  value: Schema.Literals([
    "in-process",
    "supervised-actor",
    "supervised-restart",
    "invalidated-on-restart",
    "survives-restart",
  ]),
  evidenceReferences: Schema.NonEmptyArray(EvidenceReferenceSchema),
}).annotate({ parseOptions });
export const UnresolvedContributionSchema = Schema.Struct({
  family: demandFamily,
  disposition: Schema.Literal("unresolved"),
  reason: nonEmpty,
  evidenceReferences: Schema.NonEmptyArray(EvidenceReferenceSchema),
}).annotate({ parseOptions });

const contributionEntriesSchema = Schema.Tuple([
  contributionEntrySchema,
  contributionEntrySchema,
  contributionEntrySchema,
]).check(
  Schema.makeFilter(
    (entries) =>
      entries[0].family === "runtime-model" &&
      entries[1].family === "restart" &&
      entries[2].family === "grant-restart",
    { expected: "contributions must contain runtime-model, restart, and grant-restart entries" },
  ),
);

const premiseSchema = Schema.Struct({
  id: identifier,
  statement: nonEmpty,
}).annotate({ parseOptions });
const obligationSchema = Schema.Struct({
  id: identifier,
  evidenceReferences: Schema.Array(EvidenceReferenceSchema),
}).annotate({ parseOptions });

export const PlanningContributionSchema = Schema.Struct({
  bangPlanningContribution: Schema.Literal(1),
  candidate: candidateIdentitySchema,
  qualification: M023ClassificationResultSchema,
  demands: contributionEntriesSchema,
  evidenceReferences: Schema.NonEmptyArray(EvidenceReferenceSchema),
  targetMaterials: Schema.NonEmptyArray(targetMaterialReferenceSchema),
  premises: Schema.Array(premiseSchema),
  obligations: Schema.NonEmptyArray(obligationSchema),
  assumptions: Schema.Array(nonEmpty),
  weakenings: Schema.Array(nonEmpty),
  limitations: Schema.Array(nonEmpty),
  lifetime: nonEmpty,
  invalidators: Schema.Array(nonEmpty),
  actorRestart: Schema.optional(actorRestartSchema),
})
  .check(
    Schema.makeFilter(
      (contribution) =>
        contribution.qualification._tag === "Qualified" &&
        contribution.qualification.targetId === contribution.candidate.target &&
        contribution.qualification.realizationId === contribution.candidate.realization &&
        contribution.qualification.artifactId === contribution.candidate.artifactId &&
        contribution.qualification.artifactFormat === contribution.candidate.artifactFormat &&
        contribution.qualification.theoryResultIdentity.requirementAddress ===
          contribution.candidate.requirementAddress,
      { expected: "qualified contribution identity must agree with its candidate" },
    ),
  )
  .annotate({ parseOptions });
export type PlanningContribution = typeof PlanningContributionSchema.Type;
export const PlanningContributionFromJson = Schema.fromJsonString(PlanningContributionSchema);

const dispositionBase = {
  demand: ObjectiveDemandSchema,
  expected: Schema.Literals([
    "in-process",
    "supervised-actor",
    "supervised-restart",
    "invalidated-on-restart",
    "survives-restart",
  ]),
};
const satisfiedDispositionSchema = Schema.Struct({
  ...dispositionBase,
  disposition: Schema.Literal("satisfied"),
  established: Schema.Literals([
    "in-process",
    "supervised-actor",
    "supervised-restart",
    "invalidated-on-restart",
    "survives-restart",
  ]),
  evidenceReferences: Schema.NonEmptyArray(EvidenceReferenceSchema),
}).annotate({ parseOptions });
const contradictedDispositionSchema = Schema.Struct({
  ...dispositionBase,
  disposition: Schema.Literal("contradicted"),
  established: Schema.Literals([
    "in-process",
    "supervised-actor",
    "supervised-restart",
    "invalidated-on-restart",
    "survives-restart",
  ]),
  evidenceReferences: Schema.NonEmptyArray(EvidenceReferenceSchema),
}).annotate({ parseOptions });
const unresolvedDispositionSchema = Schema.Struct({
  ...dispositionBase,
  disposition: Schema.Literal("unresolved"),
  reason: nonEmpty,
  evidenceReferences: Schema.NonEmptyArray(EvidenceReferenceSchema),
}).annotate({ parseOptions });
const candidateDispositionSchema = Schema.Union([
  satisfiedDispositionSchema,
  contradictedDispositionSchema,
  unresolvedDispositionSchema,
]).check(
  Schema.makeFilter(
    (disposition) =>
      valueMatchesFamily(disposition.demand.family, disposition.demand.value) &&
      valueMatchesFamily(disposition.demand.family, disposition.expected) &&
      (disposition.disposition === "unresolved" ||
        valueMatchesFamily(disposition.demand.family, disposition.established)),
    { expected: "candidate disposition values must match their demand family" },
  ),
);
export const CandidateDispositionSchema = candidateDispositionSchema;
export type CandidateDisposition = typeof candidateDispositionSchema.Type;

const candidateEvaluationSchema = Schema.Struct({
  objectiveId: Schema.optional(safeIdentity),
  candidate: candidateIdentitySchema,
  qualification: M023ClassificationResultSchema,
  dispositions: Schema.Array(candidateDispositionSchema),
  feasible: Schema.Boolean,
  premises: Schema.Array(premiseSchema),
  obligations: Schema.NonEmptyArray(obligationSchema),
  evidenceReferences: Schema.NonEmptyArray(EvidenceReferenceSchema),
  targetMaterials: Schema.NonEmptyArray(targetMaterialReferenceSchema),
  assumptions: Schema.Array(nonEmpty),
  weakenings: Schema.Array(nonEmpty),
  limitations: Schema.Array(nonEmpty),
  lifetime: nonEmpty,
  invalidators: Schema.Array(nonEmpty),
})
  .check(
    Schema.makeFilter(
      (evaluation) =>
        evaluation.dispositions.length === 0 ||
        isCanonicalDemandOrder(evaluation.dispositions.map(({ demand }) => demand)),
      { expected: "candidate dispositions use canonical objective demand order" },
    ),
  )
  .annotate({ parseOptions });
export const CandidateEvaluationSchema = candidateEvaluationSchema;
export type CandidateEvaluation = typeof candidateEvaluationSchema.Type;

const reportBase = {
  bangPlanning: Schema.Literal(1),
  objective: PlanningObjectiveSchema,
  selectionId: Schema.optional(safeIdentity),
  qualificationSelection: Schema.optional(repositoryPath),
};
const selectedReportSchema = Schema.Struct({
  ...reportBase,
  _tag: Schema.Literal("Selected"),
  plan: candidateEvaluationSchema,
}).annotate({ parseOptions });
const incomparableReportSchema = Schema.Struct({
  ...reportBase,
  _tag: Schema.Literal("Incomparable"),
  plans: Schema.NonEmptyArray(candidateEvaluationSchema),
})
  .check(
    Schema.makeFilter((report) => report.plans.length >= 2, {
      expected: "Incomparable must contain at least two feasible plans",
    }),
  )
  .annotate({ parseOptions });
const noPlanReportSchema = Schema.Struct({
  ...reportBase,
  _tag: Schema.Literal("NoPlan"),
  evaluations: Schema.Array(candidateEvaluationSchema),
}).annotate({ parseOptions });
export const PlanningReportSchema = Schema.Union([
  selectedReportSchema,
  incomparableReportSchema,
  noPlanReportSchema,
]).annotate({ parseOptions });
export type PlanningReport = typeof PlanningReportSchema.Type;
export const PlanningReportFromJson = Schema.fromJsonString(PlanningReportSchema);
export type SelectedPlan = Extract<PlanningReport, { readonly _tag: "Selected" }>;
export type IncomparablePlan = Extract<PlanningReport, { readonly _tag: "Incomparable" }>;
export type NoPlan = Extract<PlanningReport, { readonly _tag: "NoPlan" }>;
export const SelectedReportSchema = selectedReportSchema;
export const IncomparableReportSchema = incomparableReportSchema;
export const NoPlanReportSchema = noPlanReportSchema;

const failureStages = Schema.Literals([
  "selection",
  "qualification",
  "objective",
  "contribution",
  "planning",
  "publication",
]);
export type PlanningFailureStage = typeof failureStages.Type;
export const PlanningFailureStageSchema = failureStages;
const failureReasons = Schema.Literals([
  "unsafe-selection-identity",
  "non-m031-qualification-selection",
  "requirement-mismatch",
  "duplicate-demand-family",
  "unknown-demand",
  "non-qualified-candidate",
  "invalid-evidence-set",
  "contribution-identity-mismatch",
  "unsupported-contribution-claim",
  "contribution-evidence-missing",
  "changed-material",
  "target-execution-failure",
  "publication-failure",
  "invalid-selection",
  "invalid-objective",
  "invalid-contribution",
]);
export type PlanningFailureReason = typeof failureReasons.Type;
export const PlanningFailureReasonSchema = failureReasons;
export class PlanningError extends Schema.TaggedError<PlanningError>()("PlanningError", {
  stage: failureStages,
  path: nonEmpty,
  reason: failureReasons,
  message: nonEmpty,
  address: Schema.optional(nonEmpty),
}) {}

const planningFailure = (
  stage: PlanningFailureStage,
  path: string,
  reason: PlanningFailureReason,
  message: string,
  address?: string,
): PlanningError =>
  new PlanningError({
    stage,
    path,
    reason,
    message,
    ...(address === undefined ? {} : { address }),
  });

const decodeSelection = (input: unknown): Effect.Effect<PlanningSelection, PlanningError> =>
  Schema.decodeUnknownEffect(PlanningSelectionSchema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError((issue) => {
      const demands =
        typeof input === "object" &&
        input !== null &&
        "demands" in input &&
        Array.isArray(input.demands)
          ? input.demands
          : [];
      const families = demands.flatMap((demand) =>
        typeof demand === "object" &&
        demand !== null &&
        "family" in demand &&
        typeof demand.family === "string"
          ? [demand.family]
          : [],
      );
      const duplicate = families.find((family, index) => families.indexOf(family) !== index);
      return planningFailure(
        "selection",
        "selection",
        duplicate === undefined ? "invalid-selection" : "duplicate-demand-family",
        duplicate === undefined
          ? `invalid planning selection: ${String(issue)}`
          : `objective demand family ${duplicate} occurs more than once`,
      );
    }),
  );

export const decodePlanningSelection = decodeSelection;
export const decodePlanningSelectionEffect = decodeSelection;
export const decodePlanningObjective = (
  input: unknown,
): Effect.Effect<PlanningObjective, PlanningError> =>
  Schema.decodeUnknownEffect(PlanningObjectiveSchema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError((issue) =>
      planningFailure("objective", "objective", "invalid-objective", String(issue)),
    ),
  );

const decodeContribution = (input: unknown): Effect.Effect<PlanningContribution, PlanningError> =>
  Schema.decodeUnknownEffect(PlanningContributionSchema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError((issue) => {
      let qualificationTag: unknown;
      if (
        typeof input === "object" &&
        input !== null &&
        "qualification" in input &&
        typeof input.qualification === "object" &&
        input.qualification !== null &&
        "_tag" in input.qualification
      ) {
        qualificationTag = input.qualification._tag;
      }
      return planningFailure(
        "contribution",
        "contribution",
        qualificationTag !== undefined && qualificationTag !== "Qualified"
          ? "non-qualified-candidate"
          : "invalid-contribution",
        String(issue),
      );
    }),
  );
export const decodePlanningContribution = decodeContribution;

export const encodePlanningSelection = (selection: PlanningSelection): string =>
  encodeCanonicalJson(Schema.decodeUnknownSync(PlanningSelectionSchema)(selection));
export const encodePlanningObjective = (objective: PlanningObjective): string =>
  encodeCanonicalJson(Schema.decodeUnknownSync(PlanningObjectiveSchema)(objective));
export const encodePlanningContribution = (contribution: PlanningContribution): string =>
  encodeCanonicalJson(Schema.decodeUnknownSync(PlanningContributionSchema)(contribution));
export const decodePlanningReport = (
  input: unknown,
): Effect.Effect<PlanningReport, PlanningError> =>
  Schema.decodeUnknownEffect(PlanningReportSchema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError((issue) =>
      planningFailure("planning", "report", "invalid-contribution", String(issue)),
    ),
  );
export const encodePlanningReport = (report: PlanningReport): string =>
  encodeCanonicalJson(Schema.decodeUnknownSync(PlanningReportSchema)(report));

const m023EvidenceToPlanningReference = (
  qualification: M023ClassificationResult,
): ReadonlyArray<EvidenceReference> =>
  qualification.assessments.flatMap((assessment) =>
    assessment.evidence.map((reference) => ({
      class: reference.class,
      scope: reference.scope,
      producer: reference.producer,
      materials: [...reference.materials].toSorted((left, right) =>
        left.path.localeCompare(right.path),
      ),
    })),
  );
const m031EvidenceToPlanningReference = (
  evidence: CheckedM031TargetQualificationEvidence,
): EvidenceReference => ({
  class: "runtime-checked",
  scope: `${evidence.targetId}.m031-qualification-observations`,
  producer: evidence.producer.identity,
  materials: evidence.materials
    .map(({ path, sha256: digest }) => ({ path, sha256: digest }))
    .toSorted((left, right) => left.path.localeCompare(right.path)),
});
const deduplicateReferences = (
  references: ReadonlyArray<EvidenceReference>,
): ReadonlyArray<EvidenceReference> => {
  const byKey = new Map<string, EvidenceReference>();
  for (const reference of references) {
    const materials = [...reference.materials].toSorted((left, right) =>
      left.path.localeCompare(right.path),
    );
    const normalized = { ...reference, materials };
    byKey.set(encodeCanonicalJson(normalized), normalized);
  }
  return [...byKey.values()].toSorted(
    (left, right) =>
      left.scope.localeCompare(right.scope) ||
      left.producer.localeCompare(right.producer) ||
      left.class.localeCompare(right.class),
  );
};

export interface PlanningContributionInput {
  readonly qualification: M023ClassificationResult;
  readonly evidence: CheckedM031TargetQualificationEvidence;
  readonly target: PlanningTargetId;
  readonly claims: ReadonlyArray<PlanningContributionClaim>;
  readonly actorRestart?: StructuredActorRestartObservation;
  readonly premises?: ReadonlyArray<{ readonly id: string; readonly statement: string }>;
}

const expectedFamilies: ReadonlyArray<PlanningDemandFamily> = [
  "runtime-model",
  "restart",
  "grant-restart",
];

/** Build a target-owned contribution after rechecking M031 and M023 identity. */
export const makePlanningContribution = (
  input: PlanningContributionInput,
): Effect.Effect<PlanningContribution, PlanningError> =>
  Effect.gen(function* () {
    const qualification = yield* Schema.decodeUnknownEffect(M023ClassificationResultSchema)(
      input.qualification,
      { onExcessProperty: "error" },
    ).pipe(
      Effect.mapError((issue) =>
        planningFailure("qualification", "qualification", "invalid-contribution", String(issue)),
      ),
    );
    if (qualification._tag !== "Qualified") {
      return yield* Effect.fail(
        planningFailure(
          "qualification",
          "qualification._tag",
          "non-qualified-candidate",
          "planning requires a Qualified M023 classification result",
        ),
      );
    }
    const evidence = yield* checkM031TargetQualificationEvidence(input.evidence, {
      targetId: input.target,
      artifactId: qualification.artifactId,
      artifactFormat: qualification.artifactFormat,
      theory: qualification.theoryResultIdentity.theory,
      package: input.evidence.package,
      requirementAddress: qualification.theoryResultIdentity.requirementAddress,
    }).pipe(
      Effect.mapError((error) =>
        planningFailure("contribution", "evidence", "invalid-evidence-set", error.message),
      ),
    );
    if (
      qualification.targetId !== input.target ||
      qualification.realizationId !== evidence.realizationId ||
      qualification.artifactId !== evidence.artifactId ||
      qualification.artifactFormat !== evidence.artifactFormat ||
      qualification.theoryResultIdentity.requirementAddress !== evidence.requirementAddress ||
      qualification.theoryResultIdentity.theory.id !== evidence.theory.id ||
      qualification.theoryResultIdentity.theory.version !== evidence.theory.version ||
      qualification.theoryResultIdentity.artifactId !== evidence.artifactId
    ) {
      return yield* Effect.fail(
        planningFailure(
          "contribution",
          "candidate",
          "contribution-identity-mismatch",
          "M023 qualification and checked M031 evidence identities disagree",
          evidence.requirementAddress,
        ),
      );
    }
    if (input.claims.length !== expectedFamilies.length) {
      return yield* Effect.fail(
        planningFailure(
          "contribution",
          "demands",
          "unsupported-contribution-claim",
          "a contribution must provide one claim for each supported demand family",
        ),
      );
    }
    const claimsByFamily = new Map<PlanningDemandFamily, PlanningContributionClaim>();
    for (const claim of input.claims) {
      if (claimsByFamily.has(claim.family)) {
        return yield* Effect.fail(
          planningFailure(
            "contribution",
            "demands",
            "unsupported-contribution-claim",
            `contribution family ${claim.family} occurs more than once`,
          ),
        );
      }
      claimsByFamily.set(claim.family, claim);
    }
    if (expectedFamilies.some((family) => !claimsByFamily.has(family))) {
      return yield* Effect.fail(
        planningFailure(
          "contribution",
          "demands",
          "unsupported-contribution-claim",
          "contribution claims must cover runtime-model, restart, and grant-restart",
        ),
      );
    }
    const allReferences = deduplicateReferences([
      ...m023EvidenceToPlanningReference(qualification),
      m031EvidenceToPlanningReference(evidence),
    ]);
    const entries = expectedFamilies.map((family) => {
      const claim = claimsByFamily.get(family)!;
      return { ...claim, evidenceReferences: allReferences };
    });
    const candidate: PlanningCandidateIdentity = {
      target: input.target,
      realization: evidence.realizationId,
      selectionId: evidence.selectionId,
      artifactId: evidence.artifactId,
      artifactFormat: evidence.artifactFormat,
      theory: evidence.theory,
      package: evidence.package,
      requirementAddress: evidence.requirementAddress,
    };
    const targetMaterials = evidence.materials
      .map(({ role, path, sha256: digest }) => ({ role, path, sha256: digest }))
      .toSorted(
        (left, right) => left.path.localeCompare(right.path) || left.role.localeCompare(right.role),
      );
    const contribution = {
      bangPlanningContribution: 1,
      candidate,
      qualification,
      demands: entries,
      evidenceReferences: allReferences,
      targetMaterials,
      premises: input.premises === undefined ? [] : [...input.premises],
      obligations: qualification.assessments.map(({ obligationId, evidence: references }) => ({
        id: obligationId,
        evidenceReferences: references,
      })),
      assumptions: [...qualification.assumptions, ...evidence.assumptions],
      weakenings: [...qualification.weakenings, ...evidence.weakenings],
      limitations: [...qualification.limitations, ...evidence.limitations],
      lifetime: evidence.lifetime,
      invalidators: [...qualification.invalidators, ...evidence.invalidators],
      ...(input.actorRestart === undefined ? {} : { actorRestart: input.actorRestart }),
    };
    return yield* Schema.decodeUnknownEffect(PlanningContributionSchema)(contribution, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError((issue) =>
        planningFailure("contribution", "contribution", "invalid-contribution", String(issue)),
      ),
    );
  });

const samePlanningBasis = (
  left: PlanningCandidateIdentity,
  right: PlanningCandidateIdentity,
): boolean =>
  left.selectionId === right.selectionId &&
  left.artifactId === right.artifactId &&
  left.artifactFormat === right.artifactFormat &&
  left.theory.id === right.theory.id &&
  left.theory.version === right.theory.version &&
  left.package.id === right.package.id &&
  left.package.version === right.package.version &&
  left.package.semanticDigest === right.package.semanticDigest &&
  left.requirementAddress === right.requirementAddress &&
  left.realization === right.realization;

const expectedTargetClaims: Record<
  PlanningTargetId,
  Readonly<Record<PlanningDemandFamily, PlanningContributionClaim>>
> = {
  "effect-typescript": {
    "runtime-model": { family: "runtime-model", disposition: "established", value: "in-process" },
    restart: {
      family: "restart",
      disposition: "unresolved",
      reason: "M031 does not observe a restart",
    },
    "grant-restart": {
      family: "grant-restart",
      disposition: "unresolved",
      reason: "M031 does not observe a restart",
    },
  },
  "gleam-beam": {
    "runtime-model": {
      family: "runtime-model",
      disposition: "established",
      value: "supervised-actor",
    },
    restart: { family: "restart", disposition: "established", value: "supervised-restart" },
    "grant-restart": {
      family: "grant-restart",
      disposition: "established",
      value: "invalidated-on-restart",
    },
  },
};

const claimsAgree = (target: PlanningTargetId, contribution: PlanningContribution): boolean => {
  const expected = expectedTargetClaims[target];
  return expectedFamilies.every((family, index) => {
    const actual = contribution.demands[index]!;
    const expectedClaim = expected[family];
    if (actual.family !== family || actual.disposition !== expectedClaim.disposition) return false;
    if (actual.disposition === "established" && expectedClaim.disposition === "established") {
      return actual.value === expectedClaim.value;
    }
    return true;
  });
};

const actorRestartSupportsGleam = (contribution: PlanningContribution): boolean =>
  contribution.candidate.target === "gleam-beam" &&
  contribution.actorRestart !== undefined &&
  contribution.actorRestart.oldGrantRejected &&
  contribution.actorRestart.freshGrantDistinct &&
  contribution.actorRestart.replacementGrantAccepted &&
  contribution.actorRestart.supervised;

const dispositionForDemand = (
  demand: ObjectiveDemand,
  contribution: PlanningContribution,
): CandidateDisposition => {
  const entry = contribution.demands[demandRank(demand.family)]!;
  if (entry.disposition === "unresolved") {
    return {
      demand,
      expected: demand.value,
      disposition: "unresolved",
      reason: entry.reason,
      evidenceReferences: entry.evidenceReferences,
    };
  }
  return entry.value === demand.value
    ? {
        demand,
        expected: demand.value,
        established: entry.value,
        disposition: "satisfied",
        evidenceReferences: entry.evidenceReferences,
      }
    : {
        demand,
        expected: demand.value,
        established: entry.value,
        disposition: "contradicted",
        evidenceReferences: entry.evidenceReferences,
      };
};

const candidateEvaluation = (
  objective: PlanningObjective,
  selectionId: string | undefined,
  contribution: PlanningContribution,
): CandidateEvaluation => {
  const dispositions = objective.demands.map((demand) =>
    dispositionForDemand(demand, contribution),
  );
  return {
    ...(selectionId === undefined ? {} : { objectiveId: selectionId }),
    candidate: contribution.candidate,
    qualification: contribution.qualification,
    dispositions,
    feasible: dispositions.every(({ disposition }) => disposition === "satisfied"),
    premises: contribution.premises,
    obligations: contribution.obligations,
    evidenceReferences: contribution.evidenceReferences,
    targetMaterials: contribution.targetMaterials,
    assumptions: contribution.assumptions,
    weakenings: contribution.weakenings,
    limitations: contribution.limitations,
    lifetime: contribution.lifetime,
    invalidators: contribution.invalidators,
  };
};

const reportBaseValue = (selection: PlanningSelection) => ({
  bangPlanning: 1 as const,
  objective: {
    requirementAddress: selection.requirementAddress,
    demands: selection.demands,
  },
  selectionId: selection.id,
  qualificationSelection: selection.qualificationSelection,
});

/** Deterministically match an explicit objective against target-owned contributions. */
export const planObjective = (
  input: PlanningSelection,
  contributions: ReadonlyArray<PlanningContribution>,
): Effect.Effect<PlanningReport, PlanningError> =>
  Effect.gen(function* () {
    const selection = yield* decodeSelection(input);
    const objective = yield* decodePlanningObjective({
      requirementAddress: selection.requirementAddress,
      demands: selection.demands,
    });
    const checkedContributions: Array<PlanningContribution> = [];
    for (const contribution of contributions)
      checkedContributions.push(yield* decodeContribution(contribution));
    const ordered = [...checkedContributions].toSorted(
      (left, right) =>
        (left.candidate.target === "effect-typescript" ? 0 : 1) -
        (right.candidate.target === "effect-typescript" ? 0 : 1),
    );
    const seenTargets = new Set<PlanningTargetId>();
    for (const contribution of ordered) {
      const target = contribution.candidate.target;
      if (seenTargets.has(target)) {
        return yield* Effect.fail(
          planningFailure(
            "planning",
            "contributions",
            "invalid-evidence-set",
            `duplicate ${target} contribution`,
          ),
        );
      }
      seenTargets.add(target);
      if (!claimsAgree(target, contribution)) {
        return yield* Effect.fail(
          planningFailure(
            "contribution",
            `contributions.${target}`,
            "unsupported-contribution-claim",
            `target ${target} contribution claims do not match its adapter policy`,
          ),
        );
      }
      if (target === "gleam-beam" && !actorRestartSupportsGleam(contribution)) {
        return yield* Effect.fail(
          planningFailure(
            "contribution",
            `contributions.${target}.actorRestart`,
            "contribution-evidence-missing",
            "Gleam restart claims require structured supervised actorRestart observations",
          ),
        );
      }
      if (target === "effect-typescript" && contribution.actorRestart !== undefined) {
        return yield* Effect.fail(
          planningFailure(
            "contribution",
            `contributions.${target}.actorRestart`,
            "unsupported-contribution-claim",
            "Effect contributions cannot claim target-owned actor restart evidence",
          ),
        );
      }
      if (contribution.candidate.requirementAddress !== objective.requirementAddress) {
        return yield* Effect.fail(
          planningFailure(
            "planning",
            `contributions.${target}.candidate.requirementAddress`,
            "requirement-mismatch",
            "candidate requirement does not match the planning objective",
            objective.requirementAddress,
          ),
        );
      }
      if (
        contribution.qualification.theoryResultIdentity.requirementAddress !==
          objective.requirementAddress ||
        contribution.qualification.theoryResultIdentity.artifactId !==
          contribution.candidate.artifactId
      ) {
        return yield* Effect.fail(
          planningFailure(
            "planning",
            `contributions.${target}.qualification`,
            "contribution-identity-mismatch",
            "candidate qualification identity does not match its contribution",
          ),
        );
      }
    }
    for (let index = 1; index < ordered.length; index += 1) {
      if (!samePlanningBasis(ordered[0]!.candidate, ordered[index]!.candidate)) {
        return yield* Effect.fail(
          planningFailure(
            "planning",
            "contributions",
            "contribution-identity-mismatch",
            "candidate contributions do not share one checked artifact, package, and requirement basis",
          ),
        );
      }
    }
    const targetSpecificPaths = new Map<string, PlanningTargetId>();
    for (const contribution of ordered) {
      for (const material of contribution.targetMaterials) {
        const role = material.role.toLowerCase();
        if (role.includes("core") || role.includes("package") || role.includes("theory")) continue;
        const prior = targetSpecificPaths.get(material.path);
        if (prior !== undefined && prior !== contribution.candidate.target) {
          return yield* Effect.fail(
            planningFailure(
              "planning",
              `contributions.${contribution.candidate.target}.targetMaterials`,
              "invalid-evidence-set",
              `target-specific M031 material ${material.path} is shared by ${prior} and ${contribution.candidate.target}`,
            ),
          );
        }
        targetSpecificPaths.set(material.path, contribution.candidate.target);
      }
    }
    const evaluations = ordered.map((contribution) =>
      candidateEvaluation(objective, selection.id, contribution),
    );
    const feasible = evaluations.filter(({ feasible: isFeasible }) => isFeasible);
    const base = reportBaseValue(selection);
    const report =
      feasible.length === 0
        ? { ...base, _tag: "NoPlan" as const, evaluations }
        : feasible.length === 1
          ? { ...base, _tag: "Selected" as const, plan: feasible[0]! }
          : { ...base, _tag: "Incomparable" as const, plans: feasible };
    return yield* Schema.decodeUnknownEffect(PlanningReportSchema)(report, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError((issue) =>
        planningFailure("planning", "report", "invalid-objective", String(issue)),
      ),
    );
  });

/** Alias for callers that prefer an explicitly Effect-named planning operation. */
export const planObjectiveEffect = planObjective;

/** The checked M031 schema is re-exported for adapter consumers at this boundary. */
export { M031TargetQualificationEvidenceSchema };
