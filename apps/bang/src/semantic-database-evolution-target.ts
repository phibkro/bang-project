import {
  NormalizedDependencySchema,
  type ComparisonResult,
  type NormalizedCoreComparison,
} from "@bang/core";
import type { M027TransferPlan } from "./semantic-database-transfer-target.ts";
import { Effect, Schema } from "effect";

const parseOptions = { onExcessProperty: "error" } as const;

const isRepositoryRelativePath = (value: string): boolean => {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\u0000") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value)
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

const PublicIdentity = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[A-Za-z][A-Za-z0-9._-]*$/u.test(value), {
      expected: "a public identity without path separators",
    }),
  ),
);

const NonNegativeDecimalInteger = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^(?:0|[1-9][0-9]*)$/u.test(value), {
      expected: "a nonnegative canonical decimal integer",
    }),
  ),
);

const PositiveDecimalInteger = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[1-9][0-9]*$/u.test(value), {
      expected: "a positive canonical decimal integer",
    }),
  ),
);

const Digest = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[0-9a-f]{64}$/u.test(value), {
      expected: "a lowercase SHA-256 digest",
    }),
  ),
);

const Address = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => value.length > 0 && !value.includes("\u0000"), {
      expected: "a non-empty normalized construct address",
    }),
  ),
);

const M028SemanticEvolutionSelectionSchemaBase = Schema.Struct({
  bangSemanticEvolution: Schema.Literal(1),
  id: PublicIdentity,
  service: RepositoryRelativePath,
  baselineVersion: Schema.Literal(1),
  candidateVersion: Schema.Literal(2),
  candidate: Schema.Struct({
    project: RepositoryRelativePath,
    accountSource: RepositoryRelativePath,
  }).annotate({ parseOptions }),
  compatibility: Schema.Struct({
    kind: Schema.Literal("selected-service-closure"),
  }).annotate({ parseOptions }),
  migration: Schema.Struct({
    kind: Schema.Literal("reuse-schema"),
  }).annotate({ parseOptions }),
  scenario: Schema.Struct({
    postEvolutionTransferAmount: PositiveDecimalInteger,
  }).annotate({ parseOptions }),
}).annotate({ parseOptions });

type M028SemanticEvolutionSelectionValue = typeof M028SemanticEvolutionSelectionSchemaBase.Type;

/** Strict M028 version-one-to-version-two semantic evolution selection. */
export const M028SemanticEvolutionSelectionSchema = M028SemanticEvolutionSelectionSchemaBase.check(
  Schema.makeFilter(
    (selection: M028SemanticEvolutionSelectionValue) =>
      selection.baselineVersion === 1 && selection.candidateVersion === 2,
    { expected: "an M028 evolution from semantic version 1 to version 2" },
  ),
);

/** JSON string codec for strict M028 evolution selections. */
export const M028SemanticEvolutionSelectionFromJson = Schema.fromJsonString(
  M028SemanticEvolutionSelectionSchema,
);

export type M028SemanticEvolutionSelection = typeof M028SemanticEvolutionSelectionSchema.Type;

export type M028TargetStage =
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

const M028TargetStageSchema = Schema.Literals([
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
]);

export type M028TargetFailureReason =
  | "schema"
  | "unsafe-path"
  | "invalid-version"
  | "invalid-scenario"
  | "invalid-artifact"
  | "candidate-identity-mismatch"
  | "candidate-address-mismatch"
  | "missing-selected-address"
  | "changed-selected-address"
  | "clean-parity"
  | "incompatible-service"
  | "sql-bytes-mismatch"
  | "binding-bytes-mismatch"
  | "digest-mismatch"
  | "evidence-invalid"
  | "report-schema";

const M028TargetFailureReasonSchema = Schema.Literals([
  "schema",
  "unsafe-path",
  "invalid-version",
  "invalid-scenario",
  "invalid-artifact",
  "candidate-identity-mismatch",
  "candidate-address-mismatch",
  "missing-selected-address",
  "changed-selected-address",
  "clean-parity",
  "incompatible-service",
  "sql-bytes-mismatch",
  "binding-bytes-mismatch",
  "digest-mismatch",
  "evidence-invalid",
  "report-schema",
]);

/** Typed M028 failure retaining stage, source path, reason, and diagnostics. */
export class M028TargetFailure extends Schema.TaggedError<M028TargetFailure>()(
  "M028TargetFailure",
  {
    stage: M028TargetStageSchema,
    path: Schema.String,
    reason: M028TargetFailureReasonSchema,
    message: Schema.String,
    identity: Schema.optional(Schema.String),
    invalidatingAddresses: Schema.optional(Schema.Array(Address)),
  },
) {}

const makeM028Failure = (
  stage: M028TargetStage,
  path: string,
  reason: M028TargetFailureReason,
  message: string,
  identity?: string,
  invalidatingAddresses?: ReadonlyArray<string>,
): M028TargetFailure =>
  new M028TargetFailure({
    stage,
    path,
    reason,
    message,
    ...(identity === undefined ? {} : { identity }),
    ...(invalidatingAddresses === undefined ? {} : { invalidatingAddresses }),
  });

const failM028 = (
  stage: M028TargetStage,
  path: string,
  reason: M028TargetFailureReason,
  message: string,
  identity?: string,
  invalidatingAddresses?: ReadonlyArray<string>,
): Effect.Effect<never, M028TargetFailure> =>
  Effect.fail(makeM028Failure(stage, path, reason, message, identity, invalidatingAddresses));

/** Decode one strict M028 selection and retain its source path in failures. */
export const decodeM028SemanticEvolutionSelection = Effect.fn(
  "decodeM028SemanticEvolutionSelection",
)(function* (
  encoded: string,
  path: string,
): Effect.fn.Return<M028SemanticEvolutionSelection, M028TargetFailure> {
  return yield* Schema.decodeEffect(M028SemanticEvolutionSelectionFromJson)(
    encoded,
    parseOptions,
  ).pipe(
    Effect.mapError((issue) => {
      const message = String(issue);
      const reason: M028TargetFailureReason = message.includes("repository-relative path")
        ? "unsafe-path"
        : message.includes("positive canonical decimal integer")
          ? "invalid-scenario"
          : "schema";
      return makeM028Failure(
        "selection",
        path,
        reason,
        `invalid M028 semantic evolution selection: ${message}`,
      );
    }),
  );
});

export type M028SelectedServiceClosureKind =
  | "state-machine"
  | "initializer"
  | "state"
  | "state-field"
  | "invariant"
  | "refinement"
  | "bridge"
  | "shared-sort";

export interface M028SelectedServiceClosureEntry {
  readonly address: string;
  readonly kind: M028SelectedServiceClosureKind;
}

export interface M028SelectedServiceClosure {
  readonly addresses: ReadonlyArray<string>;
  readonly entries: ReadonlyArray<M028SelectedServiceClosureEntry>;
}

/** Derive the normalized addresses that make up the selected M027 transfer service. */
export const deriveM028SelectedServiceClosure = (
  plan: M027TransferPlan,
): M028SelectedServiceClosure => {
  const entries: ReadonlyArray<M028SelectedServiceClosureEntry> = [
    { address: plan.addresses.stateMachine, kind: "state-machine" },
    { address: plan.addresses.initializer, kind: "initializer" },
    { address: plan.addresses.state, kind: "state" },
    ...plan.addresses.fields.map((address) => ({ address, kind: "state-field" as const })),
    { address: plan.addresses.invariant, kind: "invariant" },
    { address: plan.addresses.refinement, kind: "refinement" },
    { address: plan.addresses.bridge, kind: "bridge" },
    { address: plan.addresses.sharedSort, kind: "shared-sort" },
  ];
  return {
    addresses: entries.map(({ address }) => address),
    entries,
  };
};

export type M028SelectedClosureDisposition = "reused" | "invalidated";

export interface M028SelectedClosureResult {
  readonly address: string;
  readonly kind: M028SelectedServiceClosureKind;
  readonly disposition: M028SelectedClosureDisposition;
  readonly invalidatedBy: ReadonlyArray<string>;
}

export interface M028CompatibilityClassification {
  readonly classification: "compatible" | "incompatible";
  readonly scope: "selected-service-closure";
  readonly changedConstructs: ReadonlyArray<ComparisonResult>;
  readonly selectedClosure: ReadonlyArray<M028SelectedClosureResult>;
  readonly invalidatingAddresses: ReadonlyArray<string>;
  readonly cleanParity: boolean;
  readonly reasons: ReadonlyArray<string>;
}

const unique = (values: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(values)];

/**
 * Classify one M021 comparison for the selected M027 service closure.
 * Changes outside the closure remain visible in changedConstructs but do not invalidate it.
 */
export const classifyM028Compatibility = (
  comparison: NormalizedCoreComparison,
  closure: M028SelectedServiceClosure,
): M028CompatibilityClassification => {
  const resultsByAddress = new Map(comparison.results.map((result) => [result.address, result]));
  const changedConstructs = comparison.results
    .filter((result) => result.status !== "reused")
    .toSorted((left, right) => left.address.localeCompare(right.address));
  const selectedClosure = closure.entries.map((entry) => {
    const result = resultsByAddress.get(entry.address);
    if (result === undefined) {
      return {
        ...entry,
        disposition: "invalidated" as const,
        invalidatedBy: [entry.address],
      };
    }
    return {
      ...entry,
      disposition: result.status === "reused" ? ("reused" as const) : ("invalidated" as const),
      invalidatedBy: result.invalidatedBy.map(({ target }) => target).toSorted(),
    };
  });
  const invalidatingAddresses = unique(
    selectedClosure
      .filter(({ disposition }) => disposition === "invalidated")
      .flatMap(({ address, invalidatedBy }) => [address].concat(invalidatedBy)),
  ).toSorted();
  const reasons: Array<string> = [];
  if (!comparison.cleanParity) reasons.push("M021 clean-run parity was not established");
  if (invalidatingAddresses.length > 0) {
    reasons.push("one or more selected service constructs were changed or removed");
  }
  if (reasons.length === 0 && changedConstructs.length > 0) {
    reasons.push("changed constructs are outside the selected service closure");
  }
  if (reasons.length === 0) reasons.push("all selected service constructs were reused");
  return {
    classification:
      comparison.cleanParity && invalidatingAddresses.length === 0 ? "compatible" : "incompatible",
    scope: "selected-service-closure",
    changedConstructs,
    selectedClosure,
    invalidatingAddresses,
    cleanParity: comparison.cleanParity,
    reasons,
  };
};

const sameStringArray = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const samePlanAddresses = (baseline: M027TransferPlan, candidate: M027TransferPlan): boolean => {
  const baselineAddresses = baseline.addresses;
  const candidateAddresses = candidate.addresses;
  return (
    baselineAddresses.entity === candidateAddresses.entity &&
    baselineAddresses.stateMachine === candidateAddresses.stateMachine &&
    baselineAddresses.initializer === candidateAddresses.initializer &&
    baselineAddresses.state === candidateAddresses.state &&
    sameStringArray(baselineAddresses.fields, candidateAddresses.fields) &&
    baselineAddresses.invariant === candidateAddresses.invariant &&
    baselineAddresses.refinement === candidateAddresses.refinement &&
    baselineAddresses.bridge === candidateAddresses.bridge &&
    baselineAddresses.sharedSort === candidateAddresses.sharedSort &&
    sameStringArray(baselineAddresses.compositionLinks, candidateAddresses.compositionLinks) &&
    baselineAddresses.obligation === candidateAddresses.obligation &&
    baselineAddresses.evidence === candidateAddresses.evidence &&
    baselineAddresses.command === candidateAddresses.command &&
    baselineAddresses.rejection === candidateAddresses.rejection &&
    baselineAddresses.accountQuery === candidateAddresses.accountQuery &&
    baselineAddresses.totalQuery === candidateAddresses.totalQuery &&
    baselineAddresses.accountSubscription === candidateAddresses.accountSubscription &&
    baselineAddresses.totalSubscription === candidateAddresses.totalSubscription
  );
};

const samePlanIdentities = (baseline: M027TransferPlan, candidate: M027TransferPlan): boolean =>
  baseline.serviceId === candidate.serviceId &&
  baseline.projectId === candidate.projectId &&
  baseline.artifactId === candidate.artifactId &&
  baseline.entity.id === candidate.entity.id &&
  baseline.entity.stateMachineId === candidate.entity.stateMachineId &&
  baseline.entity.initializerId === candidate.entity.initializerId &&
  baseline.entity.invariantId === candidate.entity.invariantId &&
  baseline.entity.identityField === candidate.entity.identityField &&
  baseline.entity.balanceField === candidate.entity.balanceField &&
  baseline.refinement.id === candidate.refinement.id &&
  baseline.bridge.id === candidate.bridge.id &&
  baseline.bridge.sharedSort === candidate.bridge.sharedSort &&
  baseline.constructIds.entity === candidate.constructIds.entity &&
  baseline.constructIds.stateMachine === candidate.constructIds.stateMachine &&
  baseline.constructIds.initializer === candidate.constructIds.initializer &&
  baseline.constructIds.invariant === candidate.constructIds.invariant &&
  baseline.constructIds.refinement === candidate.constructIds.refinement &&
  baseline.constructIds.bridge === candidate.constructIds.bridge &&
  baseline.constructIds.sharedSort === candidate.constructIds.sharedSort &&
  baseline.constructIds.obligation === candidate.constructIds.obligation &&
  baseline.constructIds.evidence === candidate.constructIds.evidence &&
  baseline.constructIds.command === candidate.constructIds.command &&
  baseline.constructIds.rejection === candidate.constructIds.rejection &&
  baseline.constructIds.accountQuery === candidate.constructIds.accountQuery &&
  baseline.constructIds.totalQuery === candidate.constructIds.totalQuery &&
  baseline.constructIds.accountSubscription === candidate.constructIds.accountSubscription &&
  baseline.constructIds.totalSubscription === candidate.constructIds.totalSubscription;

export interface M028CandidatePlanConfirmation {
  readonly classification: "candidate-plan-match";
  readonly serviceId: string;
  readonly projectId: string;
  readonly matchedAddresses: ReadonlyArray<string>;
}

/** Confirm that a candidate M027 plan preserves selected service identities and addresses. */
export const confirmM028CandidatePlan = Effect.fn("confirmM028CandidatePlan")(function* (
  baseline: M027TransferPlan,
  candidate: M027TransferPlan,
  path = candidate.projectPath,
): Effect.fn.Return<M028CandidatePlanConfirmation, M028TargetFailure> {
  if (!samePlanIdentities(baseline, candidate)) {
    return yield* failM028(
      "candidate",
      path,
      "candidate-identity-mismatch",
      "candidate M027 plan does not preserve the baseline service identities",
      candidate.serviceId,
    );
  }
  if (!samePlanAddresses(baseline, candidate)) {
    const baselineClosure = deriveM028SelectedServiceClosure(baseline).addresses;
    return yield* failM028(
      "candidate",
      path,
      "candidate-address-mismatch",
      "candidate M027 plan does not preserve the selected service addresses",
      candidate.serviceId,
      baselineClosure,
    );
  }
  return {
    classification: "candidate-plan-match",
    serviceId: baseline.serviceId,
    projectId: baseline.projectId,
    matchedAddresses: deriveM028SelectedServiceClosure(baseline).addresses,
  };
});

export interface M028ProjectionConfirmation {
  readonly classification: "projection-match";
  readonly sql: "byte-equal";
  readonly binding: "byte-equal";
}

/** Confirm byte equality of the deterministic SQL and Effect boundary projections. */
export const confirmM028Projection = Effect.fn("confirmM028Projection")(function* (
  baselineSql: string,
  candidateSql: string,
  baselineBinding: string,
  candidateBinding: string,
  path = "<M028 projection>",
): Effect.fn.Return<M028ProjectionConfirmation, M028TargetFailure> {
  if (baselineSql !== candidateSql) {
    return yield* failM028(
      "projection",
      path,
      "sql-bytes-mismatch",
      "candidate SQLite schema bytes differ under reuse-schema",
      "sqlite-schema",
    );
  }
  if (baselineBinding !== candidateBinding) {
    return yield* failM028(
      "projection",
      path,
      "binding-bytes-mismatch",
      "candidate Effect binding bytes differ under reuse-schema",
      "effect-binding",
    );
  }
  return {
    classification: "projection-match",
    sql: "byte-equal",
    binding: "byte-equal",
  };
});

const M028ChangedConstructSchema = Schema.Struct({
  address: Address,
  status: Schema.Literals(["changed", "added", "removed"]),
  baselineFingerprint: Schema.optional(Schema.String),
  candidateFingerprint: Schema.optional(Schema.String),
  invalidatedBy: Schema.Array(NormalizedDependencySchema),
}).annotate({ parseOptions });

const M028SelectedClosureResultSchema = Schema.Struct({
  address: Address,
  kind: Schema.Literals([
    "state-machine",
    "initializer",
    "state",
    "state-field",
    "invariant",
    "refinement",
    "bridge",
    "shared-sort",
  ]),
  disposition: Schema.Literals(["reused", "invalidated"]),
  invalidatedBy: Schema.Array(Address),
}).annotate({ parseOptions });

const M028CompatibilitySchema = Schema.Struct({
  classification: Schema.Literals(["compatible", "incompatible"]),
  scope: Schema.Literal("selected-service-closure"),
  changedConstructs: Schema.Array(M028ChangedConstructSchema),
  selectedClosure: Schema.NonEmptyArray(M028SelectedClosureResultSchema),
  invalidatingAddresses: Schema.Array(Address),
  cleanParity: Schema.Boolean,
  reasons: Schema.NonEmptyArray(Schema.String),
}).annotate({ parseOptions });

const M028ConstructDispositionSchema = Schema.Struct({
  address: Address,
  disposition: Schema.Literals(["reused", "invalidated"]),
  invalidatingAddresses: Schema.Array(Address),
}).annotate({ parseOptions });

const M028EvidenceDispositionSchema = Schema.Struct({
  identity: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  path: RepositoryRelativePath,
  disposition: Schema.Literals(["reused", "invalidated"]),
  invalidatingAddresses: Schema.Array(Address),
}).annotate({ parseOptions });

const M028ProjectDispositionSchema = Schema.Struct({
  identity: PublicIdentity,
  path: RepositoryRelativePath,
  disposition: Schema.Literals(["reused", "rebuilt", "invalidated"]),
  reason: Schema.String,
}).annotate({ parseOptions });

const M028TargetDispositionSchema = Schema.Struct({
  kind: Schema.Literals(["sqlite-schema", "effect-binding"]),
  path: RepositoryRelativePath,
  disposition: Schema.Literals(["reused", "invalidated"]),
  sha256: Digest,
}).annotate({ parseOptions });

const M028GeneratedArtifactSchema = Schema.Struct({
  kind: Schema.Literals(["sqlite-schema", "effect-binding"]),
  path: RepositoryRelativePath,
  sha256: Digest,
}).annotate({ parseOptions });

const M028DigestSchema = Schema.Struct({
  artifactSha256: Digest,
  normalizedSha256: Digest,
}).annotate({ parseOptions });

const M028StoredSemanticVersionSchema = Schema.Struct({
  serviceId: PublicIdentity,
  semanticVersion: Schema.Literals([1, 2]),
  artifactSha256: Digest,
  normalizedSha256: Digest,
}).annotate({ parseOptions });
export type M028StoredSemanticVersion = typeof M028StoredSemanticVersionSchema.Type;

const M028AccountObservationSchema = Schema.Struct({
  accountId: PublicIdentity,
  revision: NonNegativeDecimalInteger,
  balance: NonNegativeDecimalInteger,
}).annotate({ parseOptions });

const M028TotalObservationSchema = Schema.Struct({
  revision: NonNegativeDecimalInteger,
  total: NonNegativeDecimalInteger,
}).annotate({ parseOptions });

const M028SnapshotObservationSchema = Schema.Struct({
  source: M028AccountObservationSchema,
  target: M028AccountObservationSchema,
  total: M028TotalObservationSchema,
}).annotate({ parseOptions });

const M028ObservationJourneySchema = Schema.Struct({
  beforeCutover: M028SnapshotObservationSchema,
  afterCutover: M028SnapshotObservationSchema,
  afterTransfer: M028SnapshotObservationSchema,
  finalReopen: M028SnapshotObservationSchema,
}).annotate({ parseOptions });

const M028SemanticEvolutionReportSchemaBase = Schema.Struct({
  bangSemanticEvolutionReport: Schema.Literal(1),
  id: PublicIdentity,
  serviceId: PublicIdentity,
  baselineVersion: Schema.Literal(1),
  candidateVersion: Schema.Literal(2),
  baselineProjectPath: RepositoryRelativePath,
  candidateProjectPath: RepositoryRelativePath,
  digests: Schema.Struct({
    baseline: M028DigestSchema,
    candidate: M028DigestSchema,
  }).annotate({ parseOptions }),
  changedConstructs: Schema.Array(M028ChangedConstructSchema),
  selectedServiceClosure: Schema.NonEmptyArray(Address),
  compatibility: M028CompatibilitySchema,
  constructDispositions: Schema.NonEmptyArray(M028ConstructDispositionSchema),
  evidenceDispositions: Schema.NonEmptyArray(M028EvidenceDispositionSchema),
  projectDispositions: Schema.NonEmptyArray(M028ProjectDispositionSchema),
  targetDispositions: Schema.Tuple([M028TargetDispositionSchema, M028TargetDispositionSchema]),
  generatedArtifacts: Schema.Tuple([M028GeneratedArtifactSchema, M028GeneratedArtifactSchema]),
  storedVersionBefore: M028StoredSemanticVersionSchema,
  storedVersionAfter: M028StoredSemanticVersionSchema,
  observations: M028ObservationJourneySchema,
  postEvolutionTransferAmount: PositiveDecimalInteger,
  cleanParity: Schema.Boolean,
  limitations: Schema.NonEmptyArray(Schema.String),
}).annotate({ parseOptions });

type M028SemanticEvolutionReportValue = typeof M028SemanticEvolutionReportSchemaBase.Type;

const sameM028Observation = (
  left: M028SemanticEvolutionReportValue["observations"]["beforeCutover"],
  right: M028SemanticEvolutionReportValue["observations"]["beforeCutover"],
): boolean =>
  left.source.accountId === right.source.accountId &&
  left.source.revision === right.source.revision &&
  left.source.balance === right.source.balance &&
  left.target.accountId === right.target.accountId &&
  left.target.revision === right.target.revision &&
  left.target.balance === right.target.balance &&
  left.total.revision === right.total.revision &&
  left.total.total === right.total.total;

const sameM028AccountIdentity = (
  left: M028SemanticEvolutionReportValue["observations"]["beforeCutover"],
  right: M028SemanticEvolutionReportValue["observations"]["beforeCutover"],
): boolean =>
  left.source.accountId === right.source.accountId &&
  left.target.accountId === right.target.accountId;

const reportIsConsistent = (report: M028SemanticEvolutionReportValue): boolean => {
  if (
    report.baselineVersion === 1 &&
    report.candidateVersion === 2 &&
    report.storedVersionBefore.serviceId === report.serviceId &&
    report.storedVersionAfter.serviceId === report.serviceId &&
    report.storedVersionBefore.semanticVersion === 1 &&
    report.storedVersionAfter.semanticVersion === 2 &&
    report.storedVersionBefore.artifactSha256 === report.digests.baseline.artifactSha256 &&
    report.storedVersionBefore.normalizedSha256 === report.digests.baseline.normalizedSha256 &&
    report.storedVersionAfter.artifactSha256 === report.digests.candidate.artifactSha256 &&
    report.storedVersionAfter.normalizedSha256 === report.digests.candidate.normalizedSha256
  ) {
    // continue with the structural checks below
  } else {
    return false;
  }

  const selectedAddresses = new Set(report.selectedServiceClosure);
  if (
    selectedAddresses.size !== report.selectedServiceClosure.length ||
    report.compatibility.scope !== "selected-service-closure" ||
    report.compatibility.cleanParity !== report.cleanParity ||
    report.compatibility.selectedClosure.length !== report.selectedServiceClosure.length ||
    report.compatibility.selectedClosure.some(
      (entry, index) => entry.address !== report.selectedServiceClosure[index],
    )
  ) {
    return false;
  }

  const changedAddresses = new Set<string>();
  for (const construct of report.changedConstructs) {
    if (changedAddresses.has(construct.address)) return false;
    changedAddresses.add(construct.address);
  }
  if (
    report.compatibility.changedConstructs.length !== report.changedConstructs.length ||
    report.compatibility.changedConstructs.some(
      (construct, index) =>
        construct.address !== report.changedConstructs[index]?.address ||
        construct.status !== report.changedConstructs[index]?.status,
    )
  ) {
    return false;
  }

  const selectedDispositions = new Map(
    report.compatibility.selectedClosure.map((entry) => [entry.address, entry]),
  );
  if (
    report.constructDispositions.length !== report.selectedServiceClosure.length ||
    report.constructDispositions.some((entry) => {
      const selected = selectedDispositions.get(entry.address);
      return (
        selected === undefined ||
        selected.disposition !== entry.disposition ||
        entry.invalidatingAddresses.some(
          (address) => !report.compatibility.invalidatingAddresses.includes(address),
        )
      );
    })
  ) {
    return false;
  }

  if (report.compatibility.classification === "compatible") {
    if (
      !report.cleanParity ||
      report.compatibility.invalidatingAddresses.length > 0 ||
      report.compatibility.selectedClosure.some(({ disposition }) => disposition !== "reused") ||
      report.targetDispositions.some(({ disposition }) => disposition !== "reused") ||
      report.evidenceDispositions.some(({ disposition }) => disposition !== "reused")
    ) {
      return false;
    }
  } else if (report.compatibility.invalidatingAddresses.length === 0 && report.cleanParity) {
    return false;
  }

  const targetKinds = report.targetDispositions.map(({ kind }) => kind);
  const generatedKinds = report.generatedArtifacts.map(({ kind }) => kind);
  if (
    new Set(targetKinds).size !== 2 ||
    new Set(generatedKinds).size !== 2 ||
    !targetKinds.every((kind) => generatedKinds.includes(kind)) ||
    report.targetDispositions.some((target, index) => {
      const generated = report.generatedArtifacts.find(({ kind }) => kind === target.kind);
      return (
        generated === undefined ||
        generated.path !== target.path ||
        generated.sha256 !== target.sha256 ||
        target.kind !== (index === 0 ? "sqlite-schema" : "effect-binding")
      );
    })
  ) {
    return false;
  }

  if (
    !sameM028AccountIdentity(report.observations.beforeCutover, report.observations.afterCutover) ||
    !sameM028AccountIdentity(
      report.observations.beforeCutover,
      report.observations.afterTransfer,
    ) ||
    !sameM028AccountIdentity(report.observations.beforeCutover, report.observations.finalReopen) ||
    report.observations.beforeCutover.source.accountId ===
      report.observations.beforeCutover.target.accountId ||
    report.observations.beforeCutover.total.total !==
      report.observations.afterCutover.total.total ||
    report.observations.beforeCutover.total.total !==
      report.observations.afterTransfer.total.total ||
    report.observations.beforeCutover.total.total !== report.observations.finalReopen.total.total ||
    !sameM028Observation(report.observations.afterTransfer, report.observations.finalReopen)
  ) {
    return false;
  }

  return true;
};

/** Strict deterministic M028 evolution report with reuse and invalidation detail. */
export const M028SemanticEvolutionReportSchema = M028SemanticEvolutionReportSchemaBase.check(
  Schema.makeFilter(reportIsConsistent, {
    expected: "an internally consistent M028 semantic evolution report",
  }),
);
export type M028SemanticEvolutionReport = typeof M028SemanticEvolutionReportSchema.Type;

/** JSON string codec for strict deterministic M028 evolution reports. */
export const M028SemanticEvolutionReportFromJson = Schema.fromJsonString(
  M028SemanticEvolutionReportSchema,
);
