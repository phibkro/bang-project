import { encodeCanonicalJson } from "@bang/core";
import {
  encodeM031TargetQualificationEvidence,
  M031TargetQualificationEvidenceSchema,
  M031TargetQualificationObservations,
} from "@bang/evidence";
import { PlanningReportSchema, PlanningSelectionFromJson } from "@bang/planning";
import {
  consumeExactOneCapabilityExecution,
  ExactOneCapabilityExecutionResultSchema,
  M023ClassificationResultSchema,
} from "@bang/theories";
import { BunServices } from "@effect/platform-bun";
import { Crypto, Effect, Encoding, FileSystem, Path, Schema, Stream, type Scope } from "effect";
import { type PlatformError } from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  type AssemblyFailure,
  AssemblyReportSchema,
  AssemblySelectionFromJson,
  compileSelectedAssembly,
} from "../apps/bang/src/assemble.ts";
import {
  type ClassificationFailure,
  ClassificationSelectionFromJson,
  compileSelectedM031ClassificationStaged,
  M031ProbeObservationFromJson,
  normalizeM031ProbeObservation,
} from "../apps/bang/src/classify.ts";
import {
  type BangSchemaPublicationFailure,
  generateSchemaPublication,
} from "../apps/bang/src/export-schemas.ts";
import {
  compileSelectedExplanationStaged,
  ExplainSelectionFromJson,
  type ExplanationFailure,
} from "../apps/bang/src/explain.ts";
import {
  PublicationFailure,
  publishAtomically,
  type PublicationEntry,
} from "../apps/bang/src/publication.ts";
import { type AuditFailure, runAudit } from "../apps/bang/src/audit.ts";

const parseOptions = { onExcessProperty: "error" } as const;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const CANDIDATE_ID = "clinic-full-compiler-candidate" as const;
const CANDIDATE_SELECTION = "examples/clinic/full-candidate.json" as const;

const CANDIDATE_COMMAND =
  "bun run scripts/m037-full-compiler-candidate.ts examples/clinic/full-candidate.json" as const;
const REPORT_PATH = ".bang/evidence/M037.json" as const;
const REQUIREMENT = "operationRealization:BookAppointmentOnce.requirement:ConfirmBooking" as const;
const ASSEMBLY_SELECTION = "examples/clinic/assemblies/supervised-exact-one.json" as const;
const PLAN_SELECTION = "examples/clinic/plans/supervised-exact-one.json" as const;
const CLASSIFICATION_SELECTION =
  "examples/clinic/realizations/two-qualified-exact-one.json" as const;
const THEORY_SELECTION = "examples/clinic/theories/packaged-exact-one.json" as const;
const DOMAIN_SOURCE = "examples/clinic/clinic.bang" as const;
const THEORY_PACKAGE = "packages/theories/theory-packages/exact-one-capability.json" as const;
const EXTERNAL_CONSUMER = "examples/clinic/external-consumer/consumer.mjs" as const;
const DEPENDENCY_LOCK = "bun.lock" as const;
const ASSEMBLY_ID = "clinic-supervised-exact-one" as const;
const QUALIFICATION_ID = "clinic-two-qualified-exact-one" as const;
const EXPLANATION_ID = "clinic-packaged-exact-one" as const;
const SEMANTIC_ARTIFACT_PATH = ".bang/artifacts/clinic-packaged-exact-one.json" as const;
const EFFECT_EVIDENCE_PATH =
  ".bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/evidence.json" as const;
const GLEAM_EVIDENCE_PATH =
  ".bang/qualifications/clinic-two-qualified-exact-one/gleam-beam/evidence.json" as const;
const THEORY_LOCK_PATH = ".bang/theory-locks/clinic-packaged-exact-one.json" as const;
const CLASSIFICATION_REPORT_PATH =
  ".bang/qualifications/clinic-two-qualified-exact-one/report.json" as const;
const PLAN_REPORT_PATH = ".bang/plans/clinic-supervised-exact-one/report.json" as const;
const ASSEMBLY_REPORT_PATH = ".bang/assemblies/clinic-supervised-exact-one/report.json" as const;
const ARTIFACT_PATH = ".bang/assemblies/clinic-supervised-exact-one/bin/exact_one" as const;
const SCHEMA_MANIFEST_PATH = "dist/schemas/2/manifest.json" as const;
const NIXPKGS_REVISION = "adf428a7cfbb66e9b5cb5cdd2df8a659c2df1052" as const;
const NODE_VERSION = "v24.7.0" as const;

const INPUT_PATHS = [
  { role: "domain-source", path: DOMAIN_SOURCE },
  { role: "theory-selection", path: THEORY_SELECTION },
  { role: "classification-selection", path: CLASSIFICATION_SELECTION },
  { role: "plan-selection", path: PLAN_SELECTION },
  { role: "assembly-selection", path: ASSEMBLY_SELECTION },
  { role: "theory-package", path: THEORY_PACKAGE },
  { role: "external-consumer", path: EXTERNAL_CONSUMER },
] as const;

const PRODUCER_PATHS = [
  SEMANTIC_ARTIFACT_PATH,
  THEORY_LOCK_PATH,
  ".bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/boundary.ts",
  EFFECT_EVIDENCE_PATH,
  ".bang/qualifications/clinic-two-qualified-exact-one/gleam-beam/src/bang/appointment_book_entity.gleam",
  GLEAM_EVIDENCE_PATH,
  CLASSIFICATION_REPORT_PATH,
  PLAN_REPORT_PATH,
  ".bang/assemblies/clinic-supervised-exact-one/gleam.toml",
  ".bang/assemblies/clinic-supervised-exact-one/manifest.toml",
  ".bang/assemblies/clinic-supervised-exact-one/canonicalize_escript.escript",
  ".bang/assemblies/clinic-supervised-exact-one/src/bang/appointment_book_entity.gleam",
  ".bang/assemblies/clinic-supervised-exact-one/src/main.gleam",
  ARTIFACT_PATH,
  ASSEMBLY_REPORT_PATH,
  SCHEMA_MANIFEST_PATH,
  "dist/schemas/2/schemas/bang-semantic-artifact-1.schema.json",
  "dist/schemas/2/schemas/bang-theory-lock-1.schema.json",
  "dist/schemas/2/schemas/bang-target-evidence-1.schema.json",
  "dist/schemas/2/types/consumer.d.ts",
  "dist/schemas/2/types/consumer.js",
] as const;

const OWNED_DIRECTORIES = [
  ".bang/qualifications/clinic-two-qualified-exact-one",
  ".bang/plans/clinic-supervised-exact-one",
  ".bang/assemblies/clinic-supervised-exact-one",
  "dist/schemas/2",
] as const;

const WORKSPACE_SENTINELS = [
  "apps/bang/src",
  "packages",
  DOMAIN_SOURCE,
  ASSEMBLY_REPORT_PATH,
] as const;

const RUN_STAGES = [
  "checkout",
  "setup",
  "explain",
  "classify",
  "plan",
  "assemble",
  "artifact",
  "audit",
  "schema-publication",
  "external-consumer",
] as const;

const isRepositoryRelativePath = (value: string): boolean =>
  value.length > 0 &&
  !value.includes("\\") &&
  !value.includes("\u0000") &&
  !value.startsWith("/") &&
  !/^[A-Za-z]:/u.test(value) &&
  value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
const projectMissionOwnedPath = (root: string, original: string, path: Path.Path): string => {
  if (!path.isAbsolute(original))
    return original === "." || isRepositoryRelativePath(original) ? original : ".";
  const relative = path.relative(path.resolve(root), path.resolve(original)).replaceAll("\\", "/");
  return relative === "" ? "." : isRepositoryRelativePath(relative) ? relative : ".";
};

const RepositoryRelativePathSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(isRepositoryRelativePath, {
      expected: "a repository-relative path without traversal segments",
    }),
  ),
);
const M037MissionOwnedPathSchema = Schema.Union([
  Schema.Literal("."),
  RepositoryRelativePathSchema,
]);
const M037Sha256Schema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^sha256:[0-9a-f]{64}$/u.test(value), {
      expected: "sha256: followed by 64 lowercase hexadecimal characters",
    }),
  ),
);
const M037RawSha256Schema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[0-9a-f]{64}$/u.test(value), {
      expected: "64 lowercase hexadecimal characters",
    }),
  ),
);
const GitVersionSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^git version .+$/u.test(value), {
      expected: "one normalized git version line",
    }),
  ),
);
const BashVersionSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^GNU bash, version .+$/u.test(value), {
      expected: "one normalized GNU Bash version line",
    }),
  ),
);
const NixVersionSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^nix \(Nix\) .+$/u.test(value), {
      expected: "one normalized Nix version line",
    }),
  ),
);
const EscriptRealPathSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^\/nix\/store\/[0-9a-z]+-[^/]+\/bin\/escript$/u.test(value), {
      expected: "an absolute real Nix Erlang-store escript path",
    }),
  ),
);
const RevisionSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[0-9a-f]{40}$/u.test(value), {
      expected: "40 lowercase hexadecimal characters",
    }),
  ),
);

export const M037FullCompilerCandidateSelectionSchema = Schema.Struct({
  bangFullCompilerCandidate: Schema.Literal(1),
  id: Schema.Literal(CANDIDATE_ID),
  assemblySelection: Schema.Literal(ASSEMBLY_SELECTION),
  externalConsumer: Schema.Literal(EXTERNAL_CONSUMER),
}).annotate({ parseOptions });
export const M037FullCompilerCandidateSelectionFromJson = Schema.fromJsonString(
  M037FullCompilerCandidateSelectionSchema,
);
export type M037FullCompilerCandidateSelection =
  typeof M037FullCompilerCandidateSelectionSchema.Type;

const M037SystemErrorTagSchema = Schema.Literals([
  "AlreadyExists",
  "BadResource",
  "Busy",
  "InvalidData",
  "NotFound",
  "PermissionDenied",
  "TimedOut",
  "UnexpectedEof",
  "Unknown",
  "WouldBlock",
  "WriteZero",
]);
const M037BadArgumentReasonSchema = Schema.TaggedStruct("BadArgument", {
  module: Schema.String,
  method: Schema.String,
  description: Schema.optional(Schema.String),
}).annotate({ parseOptions });
const M037SystemReasonSchema = Schema.Struct({
  _tag: M037SystemErrorTagSchema,
  module: Schema.String,
  method: Schema.String,
  description: Schema.optional(Schema.String),
  syscall: Schema.optional(Schema.String),
  pathOrDescriptor: Schema.optional(Schema.Union([Schema.String, Schema.Finite])),
}).annotate({ parseOptions });
const M037PlatformReasonSchema = Schema.Union([
  M037BadArgumentReasonSchema,
  M037SystemReasonSchema,
]);
const namedCauseSchema = <const Tag extends string>(tag: Tag, reasonOptional: boolean) =>
  Schema.Struct({
    _tag: Schema.Literal(tag),
    stage: Schema.String,
    path: Schema.String,
    message: Schema.String,
    ...(reasonOptional ? { reason: Schema.optional(Schema.String) } : { reason: Schema.String }),
    address: Schema.optional(Schema.String),
  }).annotate({ parseOptions });
const ExplanationCauseSchema = namedCauseSchema("ExplanationFailure", true);
const ClassificationCauseSchema = namedCauseSchema("ClassificationFailure", true);
const PlanCauseSchema = namedCauseSchema("PlanFailure", false);
const AssemblyCauseSchema = namedCauseSchema("AssemblyFailure", false);
const AuditCauseSchema = namedCauseSchema("AuditFailure", false);
const PublicationCauseFields = {
  _tag: Schema.Literal("PublicationFailure"),
  stage: Schema.Literal("publication"),
  path: Schema.String,
  message: Schema.String,
} as const;
const PublicationNonRollbackCauseSchema = Schema.Struct({
  ...PublicationCauseFields,
  reason: Schema.Literals([
    "invalid-entry",
    "duplicate-entry",
    "staging-failed",
    "custody-failed",
    "publication-failed",
  ]),
}).annotate({ parseOptions });
const PublicationRollbackCauseSchema = Schema.Struct({
  ...PublicationCauseFields,
  reason: Schema.Literal("rollback-failed"),
}).annotate({ parseOptions });
const PublicationCauseSchema = Schema.Union([
  PublicationNonRollbackCauseSchema,
  PublicationRollbackCauseSchema,
]);
const SchemaPublicationCauseSchema = Schema.Struct({
  _tag: Schema.Literal("BangSchemaPublicationFailure"),
  stage: Schema.String,
  path: Schema.String,
  reason: Schema.String,
  message: Schema.String,
}).annotate({ parseOptions });
const PlatformCauseSchema = Schema.TaggedStruct("PlatformError", {
  message: Schema.String,
  reason: M037PlatformReasonSchema,
}).annotate({ parseOptions });
const ConsumerCauseSchema = Schema.TaggedStruct("M035RejectedVerdict", {
  stage: Schema.String,
  reason: Schema.String,
  message: Schema.String,
  path: Schema.optional(Schema.String),
  identity: Schema.optional(Schema.String),
  expected: Schema.optional(Schema.String),
  observed: Schema.optional(Schema.String),
}).annotate({ parseOptions });
const M037FailureCauseSchema = Schema.Union([
  ExplanationCauseSchema,
  ClassificationCauseSchema,
  PlanCauseSchema,
  AssemblyCauseSchema,
  AuditCauseSchema,
  PublicationCauseSchema,
  SchemaPublicationCauseSchema,
  PlatformCauseSchema,
  ConsumerCauseSchema,
]);
const MissionPlatformCauseSchema = Schema.Union([PublicationCauseSchema, PlatformCauseSchema]);
const M037FailureCommonFields = {
  bangFullCompilerCandidateFailure: Schema.Literal(1),
  path: Schema.optional(M037MissionOwnedPathSchema),
  command: Schema.optional(Schema.String),
  message: Schema.String,
} as const;

const stageFailureSchema = <
  const Stage extends string,
  const Reasons extends ReadonlyArray<string>,
>(
  stage: Stage,
  reasons: Reasons,
) =>
  Schema.Struct({
    ...M037FailureCommonFields,
    stage: Schema.Literal(stage),
    reason: Schema.Literals(reasons),
  }).annotate({ parseOptions });
const optionallyCausedStageFailureSchema = <
  const Stage extends string,
  const Reasons extends ReadonlyArray<string>,
  const Cause extends Schema.Top,
>(
  stage: Stage,
  reasons: Reasons,
  cause: Cause,
) =>
  Schema.Struct({
    ...M037FailureCommonFields,
    stage: Schema.Literal(stage),
    reason: Schema.Literals(reasons),
    cause: Schema.optional(cause),
  }).annotate({ parseOptions });
const causedStageFailureSchema = <
  const Stage extends string,
  const Reasons extends ReadonlyArray<string>,
  const Cause extends Schema.Top,
>(
  stage: Stage,
  reasons: Reasons,
  cause: Cause,
) =>
  Schema.Struct({
    ...M037FailureCommonFields,
    stage: Schema.Literal(stage),
    reason: Schema.Literals(reasons),
    cause,
  }).annotate({ parseOptions });
const digestFailureSchema = <const Stage extends string>(stage: Stage) =>
  causedStageFailureSchema(stage, ["digest-failed"], PlatformCauseSchema);

export const M037CandidateFailureSchema = Schema.Union([
  optionallyCausedStageFailureSchema(
    "selection",
    ["invalid-selection", "unsafe-path", "reference-disagreement"],
    PlatformCauseSchema,
  ),
  digestFailureSchema("selection"),
  optionallyCausedStageFailureSchema(
    "preflight",
    [
      "unsupported-platform",
      "bun-version-unsupported",
      "git-worktree-unavailable",
      "bash-unavailable",
      "just-version-unsupported",
      "nix-unavailable",
    ],
    PlatformCauseSchema,
  ),
  digestFailureSchema("preflight"),
  optionallyCausedStageFailureSchema(
    "checkout",
    ["dirty-worktree", "revision-unavailable", "cleanup-failed"],
    PlatformCauseSchema,
  ),
  digestFailureSchema("checkout"),
  stageFailureSchema("setup", ["process-failed"]),
  causedStageFailureSchema("explain", ["producer-failed"], ExplanationCauseSchema),
  stageFailureSchema("explain", ["result-mismatch"]),
  causedStageFailureSchema("classify", ["producer-failed"], ClassificationCauseSchema),
  stageFailureSchema("classify", ["result-mismatch"]),
  causedStageFailureSchema("plan", ["producer-failed"], PlanCauseSchema),
  stageFailureSchema("plan", ["result-mismatch"]),
  causedStageFailureSchema("assemble", ["producer-failed"], AssemblyCauseSchema),
  stageFailureSchema("assemble", ["result-mismatch"]),
  digestFailureSchema("assemble"),
  causedStageFailureSchema("assemble", ["platform-failed"], MissionPlatformCauseSchema),
  optionallyCausedStageFailureSchema(
    "artifact",
    ["material-missing", "execution-failed", "observation-mismatch", "runtime-boundary-violated"],
    PlatformCauseSchema,
  ),
  digestFailureSchema("artifact"),
  causedStageFailureSchema("audit", ["producer-failed"], AuditCauseSchema),
  stageFailureSchema("audit", ["result-mismatch"]),
  causedStageFailureSchema("schema-publication", ["producer-failed"], SchemaPublicationCauseSchema),
  stageFailureSchema("schema-publication", ["result-mismatch"]),
  digestFailureSchema("schema-publication"),
  causedStageFailureSchema("schema-publication", ["platform-failed"], MissionPlatformCauseSchema),
  stageFailureSchema("external-consumer", ["process-failed"]),
  optionallyCausedStageFailureSchema(
    "external-consumer",
    ["consumer-rejected"],
    ConsumerCauseSchema,
  ),
  optionallyCausedStageFailureSchema(
    "external-consumer",
    ["isolation-violated"],
    PlatformCauseSchema,
  ),
  digestFailureSchema("external-consumer"),
  Schema.Struct({
    ...M037FailureCommonFields,
    stage: Schema.Literal("comparison"),
    reason: Schema.Literal("producer-inventory-diverged"),
    firstDifferingPath: RepositoryRelativePathSchema,
    firstSha256: M037Sha256Schema,
    secondSha256: M037Sha256Schema,
  }).annotate({ parseOptions }),
  stageFailureSchema("comparison", ["result-mismatch"]),
  digestFailureSchema("comparison"),
  optionallyCausedStageFailureSchema(
    "accumulation",
    ["report-invalid", "source-reference-invalid", "unsupported-claim-upgraded"],
    PlatformCauseSchema,
  ),
  digestFailureSchema("accumulation"),
  causedStageFailureSchema(
    "publication",
    ["publication-failed"],
    PublicationNonRollbackCauseSchema,
  ),
  causedStageFailureSchema("publication", ["rollback-failed"], PublicationRollbackCauseSchema),
  optionallyCausedStageFailureSchema("decode", ["report-invalid"], PlatformCauseSchema),
  digestFailureSchema("decode"),
]);
export type M037CandidateFailure = typeof M037CandidateFailureSchema.Type;

export const M037StageSchema = Schema.Literals([
  "selection",
  "preflight",
  ...RUN_STAGES,
  "comparison",
  "accumulation",
]);
const M037SourceRecordPathSchema = Schema.Literals([
  THEORY_LOCK_PATH,
  EFFECT_EVIDENCE_PATH,
  GLEAM_EVIDENCE_PATH,
  CLASSIFICATION_REPORT_PATH,
  PLAN_REPORT_PATH,
  ASSEMBLY_REPORT_PATH,
  SCHEMA_MANIFEST_PATH,
  "embedded/public-host-preflight.json",
  "embedded/input-resolution.json",
  "embedded/artifact-isolation.json",
  "embedded/audit.json",
  "embedded/schema-custody.json",
  "embedded/external-consumer-isolation.json",
  "embedded/producer-inventory-comparison.json",
  "embedded/theory-applicability.json",
]);
const M037SourceSelectorSchema = Schema.Literals([
  "theory:ExactOneCapabilityExecution@1",
  "target:effect-typescript/BookAppointmentOnce",
  "target:gleam-beam/BookAppointmentOnce",
  "qualification:clinic-two-qualified-exact-one",
  "plan:clinic-supervised-exact-one/gleam-beam",
  "assembly:clinic-supervised-exact-one/gleam-beam",
  "schema-publication:2",
  "observation:public-host-preflight",
  "observation:input-resolution",
  "observation:artifact-isolation",
  "observation:audit",
  "observation:schema-custody",
  "observation:external-consumer-isolation",
  "observation:producer-inventory-comparison",
  "observation:theory-applicability",
]);
const M037ClaimSourceReferenceSchema = Schema.Struct({
  path: M037SourceRecordPathSchema,
  sha256: M037Sha256Schema,
  selector: M037SourceSelectorSchema,
  target: Schema.optional(Schema.Literals(["effect-typescript", "gleam-beam"])),
  obligation: Schema.optional(Schema.Literal(REQUIREMENT)),
}).annotate({ parseOptions });
const M037ClaimDispositionSchema = Schema.Struct({
  id: Schema.String,
  claim: Schema.String,
  disposition: Schema.Literals(["warranted", "unsupported"]),
  sourceReferences: Schema.Array(M037ClaimSourceReferenceSchema),
}).annotate({ parseOptions });
const M037HistoricalCitationSchema = Schema.Struct({
  mission: Schema.String,
  label: Schema.Literal("historical-mission-observation-citation"),
}).annotate({ parseOptions });
const M037FamilyScoreSchema = Schema.Struct({
  family: Schema.Literals([
    "refined-data-algebra",
    "state-and-coeffects",
    "capability-and-quantity",
    "actor-and-channel-behavior",
    "laws-and-providers",
    "graded-evidence",
  ]),
  scoreLabel: Schema.Literals([
    "historical-mission-observation-citation",
    "current-digest-bound-evidence-with-historical-citations",
  ]),
  historicalCitations: Schema.Array(M037HistoricalCitationSchema),
  currentSourceReferences: Schema.Array(M037ClaimSourceReferenceSchema),
  currentObservation: Schema.NullOr(Schema.String),
  limit: Schema.String,
}).annotate({ parseOptions });
const InventoryEntrySchema = Schema.Struct({
  path: RepositoryRelativePathSchema,
  sha256: M037Sha256Schema,
}).annotate({ parseOptions });
const InputEntrySchema = Schema.Struct({
  role: Schema.Literals([
    "domain-source",
    "theory-selection",
    "classification-selection",
    "plan-selection",
    "assembly-selection",
    "theory-package",
    "external-consumer",
  ]),
  path: RepositoryRelativePathSchema,
  sha256: M037Sha256Schema,
}).annotate({ parseOptions });
const StageEntrySchema = Schema.Struct({
  stage: M037StageSchema,
  run: Schema.optional(Schema.Literals([1, 2])),
  result: Schema.Literal("passed"),
}).annotate({ parseOptions });
const PublicHostPreflightValueSchema = Schema.Struct({
  executionPlatform: Schema.Literal("x86_64-linux"),
  bunVersion: Schema.Literal("1.3.13"),
  gitVersion: GitVersionSchema,
  gitDetachedWorktreeProbe: Schema.Literal(true),
  bashVersion: BashVersionSchema,
  bashStrictModeProbe: Schema.Literal(true),
  justVersion: Schema.Literal("just 1.58.0"),
  justfileParsed: Schema.Literal(true),
  nixVersion: NixVersionSchema,
  nixCommandEnabled: Schema.Literal(true),
  nixFlakesEnabled: Schema.Literal(true),
  nixPublicCacheConfigured: Schema.Literal(true),
  nixRefreshedNetworkResolution: Schema.Literal(true),
  pinnedNodeClosureResolved: Schema.Literal(true),
}).annotate({ parseOptions });
const InputResolutionValueSchema = Schema.Struct({
  referencesAgree: Schema.Literal(true),
  inputs: Schema.Array(InputEntrySchema),
}).annotate({ parseOptions });
const TheoryApplicabilityValueBaseSchema = Schema.Struct({
  result: ExactOneCapabilityExecutionResultSchema,
  entriesMatchAssembly: Schema.Literal(true),
}).annotate({ parseOptions });
type TheoryApplicabilityValueBase = typeof TheoryApplicabilityValueBaseSchema.Type;
const TheoryApplicabilityValueSchema = TheoryApplicabilityValueBaseSchema.pipe(
  Schema.check(
    Schema.makeFilter(
      (value: TheoryApplicabilityValueBase) =>
        value.result._tag === "Applicable" &&
        value.result.artifactId === EXPLANATION_ID &&
        value.result.theory.id === "ExactOneCapabilityExecution" &&
        value.result.theory.version === 1 &&
        value.result.requirementAddress === REQUIREMENT,
      { expected: "the frozen Clinic exact-one applicability identity" },
    ),
  ),
).annotate({ parseOptions });
const ArtifactIsolationValueBaseSchema = Schema.Struct({
  target: Schema.Literal("gleam-beam"),
  realization: Schema.Literal("BookAppointmentOnce"),
  entity: Schema.Literal("appointment-book-1"),
  requirementAddress: Schema.Literal(REQUIREMENT),
  observation: M031TargetQualificationObservations,
  qualificationMatch: Schema.Literal(true),
  escriptRealPath: EscriptRealPathSchema,
  escriptSha256: M037Sha256Schema,
  arguments: Schema.Tuple([Schema.Literal("exact_one")]),
  cwd: Schema.Literal("artifact-only-temp"),
  environment: Schema.Struct({
    HOME: Schema.Literal("artifact-only-temp"),
    LANG: Schema.Literal("C.UTF-8"),
    PATH: Schema.Literal("erlang-store/bin"),
    ERL_ROOTDIR: Schema.Literal("erlang-store/lib/erlang"),
    ERL_CRASH_DUMP_SECONDS: Schema.Literal("0"),
  }).annotate({ parseOptions }),
  workspaceSentinels: Schema.Tuple([
    Schema.Literal("apps/bang/src"),
    Schema.Literal("packages"),
    Schema.Literal(DOMAIN_SOURCE),
    Schema.Literal(ASSEMBLY_REPORT_PATH),
  ]),
  workspaceResolvableFromCwdOrPath: Schema.Literal(false),
  gleamResolvableFromPath: Schema.Literal(false),
}).annotate({ parseOptions });
type ArtifactIsolationValueBase = typeof ArtifactIsolationValueBaseSchema.Type;
const ArtifactIsolationValueSchema = ArtifactIsolationValueBaseSchema.pipe(
  Schema.check(
    Schema.makeFilter(
      (value: ArtifactIsolationValueBase) =>
        value.observation.target === value.target &&
        value.observation.realization === value.realization &&
        value.observation.entity === value.entity,
      { expected: "artifact observation identities equal the selected Gleam qualification" },
    ),
  ),
).annotate({ parseOptions });
const AuditedMaterialSchema = Schema.Struct({
  path: RepositoryRelativePathSchema,
  role: Schema.String,
  class: Schema.Literals(["decoded", "opaque", "derived"]),
  recordedSha256: Schema.optional(M037RawSha256Schema),
  actualSha256: M037RawSha256Schema,
  citedBy: Schema.Array(Schema.String),
  status: Schema.Literals(["unchanged", "cosmetic", "changed", "deferred"]),
}).annotate({ parseOptions });
const AuditSummarySchema = Schema.Struct({
  assemblyId: Schema.String,
  materials: Schema.Array(AuditedMaterialSchema),
  retiredRecords: Schema.Natural,
}).annotate({ parseOptions });
const SchemaCustodyValueSchema = Schema.Struct({
  version: Schema.Literal(2),
  manifestSha256: M037Sha256Schema,
  manifestDigestedPayloads: Schema.Array(InventoryEntrySchema),
  inventoryDigestedFiles: Schema.Array(InventoryEntrySchema),
}).annotate({ parseOptions });
const VerifiedCoreMaterialSchema = Schema.Struct({
  role: Schema.Literal("core-source"),
  path: Schema.Literal(DOMAIN_SOURCE),
  sha256: M037RawSha256Schema,
}).annotate({ parseOptions });
const VerifiedBoundaryMaterialSchema = Schema.Struct({
  role: Schema.Literal("generated-effect-boundary"),
  path: Schema.Literal(
    ".bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/boundary.ts",
  ),
  sha256: M037RawSha256Schema,
}).annotate({ parseOptions });
const ValidVerdictSchema = Schema.Struct({
  verdict: Schema.Literal("valid"),
  verifiedMaterials: Schema.Tuple([VerifiedCoreMaterialSchema, VerifiedBoundaryMaterialSchema]),
}).annotate({ parseOptions });
const RejectedVerdictSchema = Schema.Union([
  Schema.Struct({
    verdict: Schema.Literal("rejected"),
    stage: Schema.Literal("publication"),
    reason: Schema.Literals(["schema-unavailable", "version-unsupported", "digest-mismatch"]),
    path: Schema.optional(Schema.String),
    expected: Schema.optional(Schema.String),
    observed: Schema.optional(Schema.String),
    message: Schema.String,
  }).annotate({ parseOptions }),
  Schema.Struct({
    verdict: Schema.Literal("rejected"),
    stage: Schema.Literal("decode"),
    reason: Schema.Literal("decode-failed"),
    path: Schema.optional(Schema.String),
    message: Schema.String,
  }).annotate({ parseOptions }),
  Schema.Struct({
    verdict: Schema.Literal("rejected"),
    stage: Schema.Literal("custody"),
    reason: Schema.Literals(["material-missing", "digest-mismatch"]),
    path: Schema.optional(Schema.String),
    expected: Schema.optional(Schema.String),
    observed: Schema.optional(Schema.String),
    message: Schema.String,
  }).annotate({ parseOptions }),
  Schema.Struct({
    verdict: Schema.Literal("rejected"),
    stage: Schema.Literal("agreement"),
    reason: Schema.Literal("identity-disagreement"),
    identity: Schema.optional(Schema.String),
    expected: Schema.optional(Schema.String),
    observed: Schema.optional(Schema.String),
    message: Schema.String,
  }).annotate({ parseOptions }),
]);
const ConsumptionVerdictFromJson = Schema.fromJsonString(
  Schema.Union([ValidVerdictSchema, RejectedVerdictSchema]),
);
type RejectedVerdict = typeof RejectedVerdictSchema.Type;
const ExternalConsumerIsolationValueSchema = Schema.Struct({
  nodeProvisioner: Schema.Literal("nix"),
  nixpkgsRevision: Schema.Literal(NIXPKGS_REVISION),
  nixAttribute: Schema.Literal("nodejs_24"),
  nodeVersion: Schema.Literal(NODE_VERSION),
  nodeExecutable: Schema.Literal("nix-result/bin/node"),
  nodeExecutableSha256: M037Sha256Schema,
  arguments: Schema.Tuple([
    Schema.Literal("--no-warnings"),
    Schema.Literal("--experimental-loader"),
    Schema.Literal("isolation-loader.mjs"),
    Schema.Literal("consumer.mjs"),
  ]),
  environmentKeys: Schema.Tuple([
    Schema.Literal("BANG_M037_MODULE_LOG"),
    Schema.Literal("BANG_M037_SANDBOX_ROOT"),
    Schema.Literal("HOME"),
    Schema.Literal("LANG"),
    Schema.Literal("PATH"),
  ]),
  loaderSha256: M037Sha256Schema,
  moduleLogSha256: M037Sha256Schema,
  loadedFiles: Schema.Tuple([
    Schema.Literal("consumer.mjs"),
    Schema.Literal("publication/types/consumer.js"),
  ]),
  resolvedFiles: Schema.Tuple([
    Schema.Literal("consumer.mjs"),
    Schema.Literal("publication/types/consumer.js"),
  ]),
  resolvedBuiltins: Schema.Tuple([
    Schema.Literal("node:crypto"),
    Schema.Literal("node:fs/promises"),
    Schema.Literal("node:path"),
  ]),
  verdict: ValidVerdictSchema,
}).annotate({ parseOptions });
const ProducerInventoryComparisonValueSchema = Schema.Struct({
  filesPerRun: Schema.Literal(21),
  firstInventorySha256: M037Sha256Schema,
  secondInventorySha256: M037Sha256Schema,
  result: Schema.Literal("equal"),
  observationRecordsPerRun: Schema.Literal(5),
  firstObservationsSha256: M037Sha256Schema,
  secondObservationsSha256: M037Sha256Schema,
  observationsResult: Schema.Literal("equal"),
}).annotate({ parseOptions });
const embeddedRecord = <P extends Schema.Top, V extends Schema.Top>(path: P, value: V) =>
  Schema.Struct({ path, sha256: M037Sha256Schema, value }).annotate({ parseOptions });

const ReportBaseSchema = Schema.Struct({
  bangFullCompilerCandidate: Schema.Literal(1),
  id: Schema.Literal(CANDIDATE_ID),
  revision: RevisionSchema,
  dependencyLock: Schema.Struct({
    path: Schema.Literal(DEPENDENCY_LOCK),
    sha256: M037Sha256Schema,
  }).annotate({ parseOptions }),
  command: Schema.Literal(CANDIDATE_COMMAND),
  executionPlatform: Schema.Literal("x86_64-linux"),
  inputs: Schema.Array(InputEntrySchema),
  stages: Schema.Array(StageEntrySchema),
  producerInventory: Schema.Array(InventoryEntrySchema),
  embeddedRecords: Schema.Struct({
    publicHostPreflight: embeddedRecord(
      Schema.Literal("embedded/public-host-preflight.json"),
      PublicHostPreflightValueSchema,
    ),
    inputResolution: embeddedRecord(
      Schema.Literal("embedded/input-resolution.json"),
      InputResolutionValueSchema,
    ),
    theoryApplicability: embeddedRecord(
      Schema.Literal("embedded/theory-applicability.json"),
      TheoryApplicabilityValueSchema,
    ),
    artifactIsolation: embeddedRecord(
      Schema.Literal("embedded/artifact-isolation.json"),
      ArtifactIsolationValueSchema,
    ),
    audit: embeddedRecord(Schema.Literal("embedded/audit.json"), AuditSummarySchema),
    schemaCustody: embeddedRecord(
      Schema.Literal("embedded/schema-custody.json"),
      SchemaCustodyValueSchema,
    ),
    externalConsumerIsolation: embeddedRecord(
      Schema.Literal("embedded/external-consumer-isolation.json"),
      ExternalConsumerIsolationValueSchema,
    ),
    producerInventoryComparison: embeddedRecord(
      Schema.Literal("embedded/producer-inventory-comparison.json"),
      ProducerInventoryComparisonValueSchema,
    ),
  }).annotate({ parseOptions }),
  schemaPublication: Schema.Struct({
    version: Schema.Literal(2),
    files: Schema.Literal(6),
    manifestSha256: M037Sha256Schema,
    manifestDigestedPayloads: Schema.Literal(4),
    inventoryDigestedFiles: Schema.Literal(6),
    declarationIsManifestDigested: Schema.Literal(false),
    manifestIsSelfDigested: Schema.Literal(false),
  }).annotate({ parseOptions }),
  publicationPlan: Schema.Struct({
    helper: Schema.Literal("publishAtomically"),
    enumeratedFiles: Schema.Literal(22),
    concurrentReaderIsolation: Schema.Literal(false),
    staleMembers: Schema.Array(RepositoryRelativePathSchema),
  }).annotate({ parseOptions }),
  scorecard: Schema.Array(M037FamilyScoreSchema),
  claims: Schema.Array(M037ClaimDispositionSchema),
  cleanRun: Schema.Struct({
    runs: Schema.Literal(2),
    producerFilesPerRun: Schema.Literal(21),
    firstInventorySha256: M037Sha256Schema,
    secondInventorySha256: M037Sha256Schema,
    result: Schema.Literal("equal"),
  }).annotate({ parseOptions }),
  outputInventory: Schema.Array(
    Schema.Union([
      InventoryEntrySchema,
      Schema.Struct({
        path: Schema.Literal(REPORT_PATH),
        sha256: Schema.Null,
        digestDisposition: Schema.Literal("self-digest-not-recorded"),
      }).annotate({ parseOptions }),
    ]),
  ),
}).annotate({ parseOptions });
type M037ReportBase = typeof ReportBaseSchema.Type;

const sameStrings = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const validateReportOrder = (report: M037ReportBase): boolean => {
  if (
    report.inputs.length !== INPUT_PATHS.length ||
    report.inputs.some(
      ({ path, role }, index) =>
        path !== INPUT_PATHS[index]?.path || role !== INPUT_PATHS[index]?.role,
    )
  )
    return false;
  const expectedStages = [
    "selection",
    "preflight",
    ...RUN_STAGES,
    ...RUN_STAGES,
    "comparison",
    "accumulation",
  ];
  if (
    !sameStrings(
      report.stages.map(({ stage }) => stage),
      expectedStages,
    )
  )
    return false;
  if (
    report.stages.some((entry, index) => {
      const expectedRun = index < 2 || index > 21 ? undefined : index < 12 ? 1 : 2;
      return entry.run !== expectedRun;
    })
  )
    return false;
  if (
    !sameStrings(
      report.producerInventory.map(({ path }) => path),
      PRODUCER_PATHS,
    )
  )
    return false;
  const reportInventoryEntry = report.outputInventory[21];
  if (
    report.outputInventory.length !== 22 ||
    encodeCanonicalJson(report.outputInventory.slice(0, 21)) !==
      encodeCanonicalJson(report.producerInventory) ||
    reportInventoryEntry?.path !== REPORT_PATH ||
    reportInventoryEntry.sha256 !== null ||
    report.embeddedRecords.inputResolution.value.referencesAgree !== true ||
    encodeCanonicalJson(report.embeddedRecords.inputResolution.value.inputs) !==
      encodeCanonicalJson(report.inputs)
  )
    return false;
  const staleMembers = report.publicationPlan.staleMembers;
  const sortedUniqueStaleMembers = [...new Set(staleMembers)].toSorted();
  const outputPaths = new Set(report.outputInventory.map(({ path }) => path));
  if (
    !sameStrings(staleMembers, sortedUniqueStaleMembers) ||
    staleMembers.some(
      (member) =>
        !OWNED_DIRECTORIES.some((directory) => member.startsWith(`${directory}/`)) ||
        outputPaths.has(member),
    )
  )
    return false;
  const audit = report.embeddedRecords.audit.value;
  if (
    audit.assemblyId !== ASSEMBLY_ID ||
    audit.retiredRecords !== 0 ||
    audit.materials.some(({ status }) => status === "changed" || status === "cosmetic")
  )
    return false;
  const producerDigest = new Map<string, string>(
    report.producerInventory.map(({ path, sha256 }) => [path, sha256]),
  );
  const embeddedDigest = new Map<string, string>(
    Object.values(report.embeddedRecords).map(({ path, sha256 }) => [path, sha256]),
  );
  const sourceById = new Map<string, typeof M037ClaimSourceReferenceSchema.Type>();
  for (const [id, path, selector, target, obligation] of SOURCE_CATALOG) {
    const sha256 = id.startsWith("R") ? producerDigest.get(path) : embeddedDigest.get(path);
    if (sha256 === undefined) return false;
    sourceById.set(id, {
      path,
      sha256,
      selector,
      ...(target === undefined ? {} : { target }),
      ...(obligation === undefined ? {} : { obligation }),
    });
  }
  const expected = makeClaimsAndScorecard(sourceById);
  if (
    encodeCanonicalJson(report.claims) !== encodeCanonicalJson(expected.claims) ||
    encodeCanonicalJson(report.scorecard) !== encodeCanonicalJson(expected.scorecard)
  )
    return false;
  const comparison = report.embeddedRecords.producerInventoryComparison.value;
  if (
    report.cleanRun.firstInventorySha256 !== report.cleanRun.secondInventorySha256 ||
    report.cleanRun.firstInventorySha256 !== comparison.firstInventorySha256 ||
    report.cleanRun.secondInventorySha256 !== comparison.secondInventorySha256 ||
    comparison.firstObservationsSha256 !== comparison.secondObservationsSha256 ||
    report.schemaPublication.manifestSha256 !==
      report.embeddedRecords.schemaCustody.value.manifestSha256 ||
    report.schemaPublication.manifestSha256 !== producerDigest.get(SCHEMA_MANIFEST_PATH) ||
    `sha256:${report.embeddedRecords.externalConsumerIsolation.value.verdict.verifiedMaterials[0].sha256}` !==
      report.inputs.find(({ path }) => path === DOMAIN_SOURCE)?.sha256 ||
    `sha256:${report.embeddedRecords.externalConsumerIsolation.value.verdict.verifiedMaterials[1].sha256}` !==
      producerDigest.get(
        ".bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/boundary.ts",
      )
  )
    return false;
  const schemaInventory = report.producerInventory.filter(({ path }) =>
    path.startsWith("dist/schemas/2/"),
  );
  const manifestPayloads = schemaInventory.filter(
    ({ path }) => path !== SCHEMA_MANIFEST_PATH && !path.endsWith("types/consumer.d.ts"),
  );
  if (
    encodeCanonicalJson(report.embeddedRecords.schemaCustody.value.inventoryDigestedFiles) !==
      encodeCanonicalJson(schemaInventory) ||
    encodeCanonicalJson(report.embeddedRecords.schemaCustody.value.manifestDigestedPayloads) !==
      encodeCanonicalJson(manifestPayloads)
  )
    return false;
  return report.embeddedRecords.theoryApplicability.value.result._tag === "Applicable";
};

export const M037FullCompilerCandidateReportSchema = ReportBaseSchema.pipe(
  Schema.check(
    Schema.makeFilter(validateReportOrder, {
      expected: "the exact M037 report order, counts, and positive applicability",
    }),
  ),
).annotate({ parseOptions });
export const M037FullCompilerCandidateReportFromJson = Schema.fromJsonString(
  M037FullCompilerCandidateReportSchema,
);
export type M037FullCompilerCandidateReport = typeof M037FullCompilerCandidateReportSchema.Type;

const M037CollectedTheoryIdentitySchema = Schema.Struct({
  id: Schema.Literal("ExactOneCapabilityExecution"),
  version: Schema.Literal(1),
}).annotate({ parseOptions });
const M037CollectedClassificationReportSchema = Schema.Struct({
  bangClassificationReport: Schema.Literal(2),
  selectionId: Schema.String,
  artifactId: Schema.String,
  artifactFormat: Schema.Literal("bangSemanticArtifact:1"),
  theory: M037CollectedTheoryIdentitySchema,
  requirementAddress: Schema.String,
  results: Schema.NonEmptyArray(M023ClassificationResultSchema),
  evidence: Schema.NonEmptyArray(M031TargetQualificationEvidenceSchema),
}).annotate({ parseOptions });
const M037CollectedClassificationReportFromJson = Schema.fromJsonString(
  M037CollectedClassificationReportSchema,
);
const AssemblyReportFromJson = Schema.fromJsonString(AssemblyReportSchema);
const PlanningReportFromJson = Schema.fromJsonString(PlanningReportSchema);
const EvidenceFromJson = Schema.fromJsonString(M031TargetQualificationEvidenceSchema);

const ManifestDocumentSchema = Schema.Struct({
  file: Schema.String,
  format: Schema.String,
  id: Schema.String,
  sha256: M037Sha256Schema,
}).annotate({ parseOptions });
const SchemaManifestSchema = Schema.Struct({
  bangSchemaPublication: Schema.Literal(1),
  documents: Schema.Tuple([ManifestDocumentSchema, ManifestDocumentSchema, ManifestDocumentSchema]),
  types: Schema.Struct({
    entry: Schema.Literal("types/consumer.js"),
    sha256: M037Sha256Schema,
  }).annotate({ parseOptions }),
  version: Schema.Literal(2),
}).annotate({ parseOptions });
const SchemaManifestFromJson = Schema.fromJsonString(SchemaManifestSchema);

export interface RuntimeBoundary {
  readonly platform: string;
  readonly architecture: string;
  readonly bunVersion: string;
  readonly executablePath: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly scriptDirectory: string;
}

interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: ChildProcessSpawner.ExitCode;
}

interface HostTools {
  readonly git: string;
  readonly bash: string;
  readonly just: string;
  readonly nix: string;
  readonly bun: string;
  readonly pathValue: string;
}

interface HostPreflight {
  readonly tools: HostTools;
  readonly value: typeof PublicHostPreflightValueSchema.Type;
  readonly nodeExecutable: string;
  readonly nodeExecutableSha256: `sha256:${string}`;
  readonly nodeEnvironmentPath: string;
  readonly childEnvironment: Readonly<Record<string, string>>;
}

interface RunResult {
  readonly entries: ReadonlyArray<PublicationEntry>;
  readonly inventory: ReadonlyArray<{ readonly path: string; readonly sha256: `sha256:${string}` }>;
  readonly inventorySha256: `sha256:${string}`;
  readonly observations: readonly [
    typeof TheoryApplicabilityValueSchema.Type,
    typeof ArtifactIsolationValueSchema.Type,
    typeof AuditSummarySchema.Type,
    typeof SchemaCustodyValueSchema.Type,
    typeof ExternalConsumerIsolationValueSchema.Type,
  ];
  readonly observationsSha256: `sha256:${string}`;
}

type FailureCause = typeof M037FailureCauseSchema.Type;
type PlatformCause = typeof PlatformCauseSchema.Type;
type ExplanationCause = typeof ExplanationCauseSchema.Type;
type ClassificationCause = typeof ClassificationCauseSchema.Type;
type PlanCause = typeof PlanCauseSchema.Type;
type AssemblyCause = typeof AssemblyCauseSchema.Type;
type AuditCause = typeof AuditCauseSchema.Type;
type SchemaPublicationCause = typeof SchemaPublicationCauseSchema.Type;
type PublicationCause = typeof PublicationCauseSchema.Type;
type PublicationNonRollbackCause = typeof PublicationNonRollbackCauseSchema.Type;
type PublicationRollbackCause = typeof PublicationRollbackCauseSchema.Type;
type MissionPlatformCause = typeof MissionPlatformCauseSchema.Type;
type ConsumerCause = typeof ConsumerCauseSchema.Type;
type OptionalFailureCause = PlatformCause | ConsumerCause;
type OrdinaryFailureReasonByStage = {
  readonly selection: "invalid-selection" | "unsafe-path" | "reference-disagreement";
  readonly preflight:
    | "unsupported-platform"
    | "bun-version-unsupported"
    | "git-worktree-unavailable"
    | "bash-unavailable"
    | "just-version-unsupported"
    | "nix-unavailable";
  readonly checkout: "dirty-worktree" | "revision-unavailable" | "cleanup-failed";
  readonly setup: "process-failed";
  readonly explain: "result-mismatch";
  readonly classify: "result-mismatch";
  readonly plan: "result-mismatch";
  readonly assemble: "result-mismatch";
  readonly artifact:
    | "material-missing"
    | "execution-failed"
    | "observation-mismatch"
    | "runtime-boundary-violated";
  readonly audit: "result-mismatch";
  readonly "schema-publication": "result-mismatch";
  readonly "external-consumer": "process-failed" | "consumer-rejected" | "isolation-violated";
  readonly comparison: "result-mismatch";
  readonly accumulation:
    | "report-invalid"
    | "source-reference-invalid"
    | "unsupported-claim-upgraded";
  readonly decode: "report-invalid";
};
interface CandidateFailureFields {
  readonly path?: string;
  readonly command?: string;
  readonly cause?: OptionalFailureCause;
}
interface RequiredCauseFailureFields<Cause extends FailureCause> {
  readonly path?: string;
  readonly command?: string;
  readonly cause: Cause;
}
type FailureBuilder = (message: string, fields?: CandidateFailureFields) => M037CandidateFailure;

const failureForStage =
  <const Stage extends keyof OrdinaryFailureReasonByStage>(stage: Stage) =>
  (
    reason: OrdinaryFailureReasonByStage[Stage],
    message: string,
    fields: CandidateFailureFields = {},
  ): M037CandidateFailure =>
    ({
      bangFullCompilerCandidateFailure: 1,
      stage,
      reason,
      ...(fields.path === undefined ? {} : { path: fields.path }),
      ...(fields.command === undefined ? {} : { command: fields.command }),
      ...(fields.cause === undefined ? {} : { cause: fields.cause }),
      message,
    }) as M037CandidateFailure;
const requiredCauseFailure = <Cause extends FailureCause>(
  stage: M037CandidateFailure["stage"],
  reason: "producer-failed" | "platform-failed",
  message: string,
  fields: RequiredCauseFailureFields<Cause>,
): M037CandidateFailure =>
  ({
    bangFullCompilerCandidateFailure: 1,
    stage,
    reason,
    ...(fields.path === undefined ? {} : { path: fields.path }),
    ...(fields.command === undefined ? {} : { command: fields.command }),
    cause: fields.cause,
    message,
  }) as M037CandidateFailure;

const candidateFailures = {
  selection: failureForStage("selection"),
  preflight: failureForStage("preflight"),
  checkout: failureForStage("checkout"),
  setup: failureForStage("setup"),
  explain: failureForStage("explain"),
  classify: failureForStage("classify"),
  plan: failureForStage("plan"),
  assemble: failureForStage("assemble"),
  artifact: failureForStage("artifact"),
  audit: failureForStage("audit"),
  schemaPublication: failureForStage("schema-publication"),
  externalConsumer: failureForStage("external-consumer"),
  comparison: failureForStage("comparison"),
  accumulation: failureForStage("accumulation"),
  decode: failureForStage("decode"),
} as const;
const selectionInvalidFailure: FailureBuilder = (message, fields) =>
  candidateFailures.selection("invalid-selection", message, fields);
const selectionReferenceFailure: FailureBuilder = (message, fields) =>
  candidateFailures.selection("reference-disagreement", message, fields);
const selectionUnsafeFailure: FailureBuilder = (message, fields) =>
  candidateFailures.selection("unsafe-path", message, fields);
const decodeReportFailure: FailureBuilder = (message, fields) =>
  candidateFailures.decode("report-invalid", message, fields);
const checkoutRevisionFailure: FailureBuilder = (message, fields) =>
  candidateFailures.checkout("revision-unavailable", message, fields);

export type M037DigestFailureStage =
  | "selection"
  | "preflight"
  | "checkout"
  | "assemble"
  | "artifact"
  | "schema-publication"
  | "external-consumer"
  | "comparison"
  | "accumulation"
  | "decode";
type M037DigestFailureBuilder = (
  message: string,
  fields: RequiredCauseFailureFields<PlatformCause>,
) => M037CandidateFailure;
const digestFailureForStage =
  (stage: M037DigestFailureStage): M037DigestFailureBuilder =>
  (message, fields) =>
    ({
      bangFullCompilerCandidateFailure: 1,
      stage,
      reason: "digest-failed",
      ...(fields.path === undefined ? {} : { path: fields.path }),
      ...(fields.command === undefined ? {} : { command: fields.command }),
      cause: fields.cause,
      message,
    }) as M037CandidateFailure;
const M037_DIGEST_FAILURE_BUILDERS = Object.freeze({
  selection: digestFailureForStage("selection"),
  preflight: digestFailureForStage("preflight"),
  checkout: digestFailureForStage("checkout"),
  assemble: digestFailureForStage("assemble"),
  artifact: digestFailureForStage("artifact"),
  "schema-publication": digestFailureForStage("schema-publication"),
  "external-consumer": digestFailureForStage("external-consumer"),
  comparison: digestFailureForStage("comparison"),
  accumulation: digestFailureForStage("accumulation"),
  decode: digestFailureForStage("decode"),
} satisfies Readonly<Record<M037DigestFailureStage, M037DigestFailureBuilder>>);

const producerInventoryDivergedFailure = (
  message: string,
  firstDifferingPath: string,
  firstSha256: `sha256:${string}`,
  secondSha256: `sha256:${string}`,
): M037CandidateFailure => ({
  bangFullCompilerCandidateFailure: 1,
  stage: "comparison",
  reason: "producer-inventory-diverged",
  firstDifferingPath,
  firstSha256,
  secondSha256,
  message,
});

const projectPlatformCause = (error: PlatformError): PlatformCause => {
  const reason = error.reason;
  return {
    _tag: "PlatformError",
    message: error.message,
    reason: {
      _tag: reason._tag,
      module: reason.module,
      method: reason.method,
      ...(reason.description === undefined ? {} : { description: reason.description }),
      ...("syscall" in reason && reason.syscall !== undefined ? { syscall: reason.syscall } : {}),
      ...("pathOrDescriptor" in reason && reason.pathOrDescriptor !== undefined
        ? { pathOrDescriptor: reason.pathOrDescriptor }
        : {}),
    },
  };
};

const explanationCause = (error: ExplanationFailure): ExplanationCause => ({
  _tag: "ExplanationFailure",
  stage: error.stage,
  path: error.path,
  message: error.message,
  ...(error.reason === undefined ? {} : { reason: error.reason }),
  ...(error.address === undefined ? {} : { address: error.address }),
});
const assemblyCause = (error: AssemblyFailure): AssemblyCause => ({
  _tag: "AssemblyFailure",
  stage: error.stage,
  path: error.path,
  reason: error.reason,
  message: error.message,
  ...(error.address === undefined ? {} : { address: error.address }),
});
const auditCause = (error: AuditFailure): AuditCause => ({
  _tag: "AuditFailure",
  stage: error.stage,
  path: error.path,
  reason: error.reason,
  message: error.message,
  ...(error.address === undefined ? {} : { address: error.address }),
});
const schemaPublicationCause = (error: BangSchemaPublicationFailure): SchemaPublicationCause => ({
  _tag: "BangSchemaPublicationFailure",
  stage: error.stage,
  path: error.path,
  reason: error.reason,
  message: error.message,
});
const decodePublicationCause = Schema.decodeUnknownSync(PublicationCauseSchema);
const publicationCause = (error: PublicationFailure): PublicationCause =>
  decodePublicationCause({
    _tag: "PublicationFailure",
    stage: error.stage,
    path: error.path,
    reason: error.reason,
    message: error.message,
  });
const producerFailures = {
  explain: (message: string, fields: RequiredCauseFailureFields<ExplanationCause>) =>
    requiredCauseFailure("explain", "producer-failed", message, fields),
  classify: (message: string, fields: RequiredCauseFailureFields<ClassificationCause>) =>
    requiredCauseFailure("classify", "producer-failed", message, fields),
  plan: (message: string, fields: RequiredCauseFailureFields<PlanCause>) =>
    requiredCauseFailure("plan", "producer-failed", message, fields),
  assemble: (message: string, fields: RequiredCauseFailureFields<AssemblyCause>) =>
    requiredCauseFailure("assemble", "producer-failed", message, fields),
  audit: (message: string, fields: RequiredCauseFailureFields<AuditCause>) =>
    requiredCauseFailure("audit", "producer-failed", message, fields),
  schemaPublication: (
    message: string,
    fields: RequiredCauseFailureFields<SchemaPublicationCause>,
  ) => requiredCauseFailure("schema-publication", "producer-failed", message, fields),
} as const;
const missionPlatformFailures = {
  assemble: (message: string, fields: RequiredCauseFailureFields<MissionPlatformCause>) =>
    requiredCauseFailure("assemble", "platform-failed", message, fields),
  schemaPublication: (message: string, fields: RequiredCauseFailureFields<MissionPlatformCause>) =>
    requiredCauseFailure("schema-publication", "platform-failed", message, fields),
} as const;
const publicationFailures = {
  publication: (
    message: string,
    fields: RequiredCauseFailureFields<PublicationNonRollbackCause>,
  ): M037CandidateFailure => ({
    bangFullCompilerCandidateFailure: 1,
    stage: "publication",
    reason: "publication-failed",
    ...(fields.path === undefined ? {} : { path: fields.path }),
    ...(fields.command === undefined ? {} : { command: fields.command }),
    cause: fields.cause,
    message,
  }),
  rollback: (
    message: string,
    fields: RequiredCauseFailureFields<PublicationRollbackCause>,
  ): M037CandidateFailure => ({
    bangFullCompilerCandidateFailure: 1,
    stage: "publication",
    reason: "rollback-failed",
    ...(fields.path === undefined ? {} : { path: fields.path }),
    ...(fields.command === undefined ? {} : { command: fields.command }),
    cause: fields.cause,
    message,
  }),
} as const;

const processFailure = (
  failure: FailureBuilder,
  command: string,
  path: string,
  message: string,
): M037CandidateFailure => failure(message, { command, path });

const runProcess = (
  executable: string,
  arguments_: ReadonlyArray<string>,
  options: {
    readonly cwd: string;
    readonly environment: Readonly<Record<string, string>>;
    readonly failure: FailureBuilder;
    readonly command: string;
    readonly path: string;
  },
): Effect.Effect<ProcessResult, M037CandidateFailure, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(executable, [...arguments_], {
        cwd: options.cwd,
        env: { ...options.environment },
        extendEnv: false,
        stdout: "pipe",
        stderr: "pipe",
      }).pipe(
        Effect.mapError(() =>
          processFailure(
            options.failure,
            options.command,
            options.path,
            `could not start ${options.command}`,
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
        Effect.mapError(() =>
          processFailure(
            options.failure,
            options.command,
            options.path,
            `could not collect ${options.command}`,
          ),
        ),
      );
      return { stdout, stderr, exitCode };
    }),
  );

const requireSuccessfulProcess = (
  executable: string,
  arguments_: ReadonlyArray<string>,
  options: Parameters<typeof runProcess>[2],
): Effect.Effect<ProcessResult, M037CandidateFailure, ChildProcessSpawner.ChildProcessSpawner> =>
  runProcess(executable, arguments_, options).pipe(
    Effect.flatMap((result) =>
      result.exitCode === ChildProcessSpawner.ExitCode(0)
        ? Effect.succeed(result)
        : Effect.fail(
            processFailure(
              options.failure,
              options.command,
              options.path,
              `${options.command} exited unsuccessfully`,
            ),
          ),
    ),
  );

const sha256Bytes = (
  bytes: Uint8Array,
  failure: M037DigestFailureBuilder,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const digest = yield* crypto.digest("SHA-256", bytes).pipe(
      Effect.mapError((error) =>
        failure("SHA-256 digest failed", {
          cause: projectPlatformCause(error),
        }),
      ),
    );
    return `sha256:${Encoding.encodeHex(digest)}` as const;
  });

const sha256Canonical = (value: unknown, failure: M037DigestFailureBuilder) =>
  sha256Bytes(textEncoder.encode(encodeCanonicalJson(value)), failure);

export const digestM037SelectionInput = (
  bytes: Uint8Array,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Bytes(bytes, M037_DIGEST_FAILURE_BUILDERS.selection);

export const digestM037CheckoutLock = (
  bytes: Uint8Array,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Bytes(bytes, M037_DIGEST_FAILURE_BUILDERS.checkout);

export const digestM037PreflightNodeExecutable = (
  bytes: Uint8Array,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Bytes(bytes, M037_DIGEST_FAILURE_BUILDERS.preflight);

export const digestM037AssemblyEvidence = (
  bytes: Uint8Array,
): Effect.Effect<string, M037CandidateFailure, Crypto.Crypto> =>
  sha256Bytes(bytes, M037_DIGEST_FAILURE_BUILDERS.assemble).pipe(
    Effect.map((digest) => digest.slice(7)),
  );

export const digestM037ArtifactExecutable = (
  bytes: Uint8Array,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Bytes(bytes, M037_DIGEST_FAILURE_BUILDERS.artifact);

export const digestM037SchemaPublicationEntry = (
  bytes: Uint8Array,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Bytes(bytes, M037_DIGEST_FAILURE_BUILDERS["schema-publication"]);

export const digestM037ExternalConsumerLoader = (
  bytes: Uint8Array,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Bytes(bytes, M037_DIGEST_FAILURE_BUILDERS["external-consumer"]);

export const digestM037ComparisonEntry = (
  bytes: Uint8Array,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Bytes(bytes, M037_DIGEST_FAILURE_BUILDERS.comparison);

export const digestM037ComparisonInventory = (
  inventory: unknown,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Canonical(inventory, M037_DIGEST_FAILURE_BUILDERS.comparison);

export const digestM037ComparisonObservations = (
  observations: unknown,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Canonical(observations, M037_DIGEST_FAILURE_BUILDERS.comparison);

export const digestM037AccumulationRecord = (
  value: unknown,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Canonical(value, M037_DIGEST_FAILURE_BUILDERS.accumulation);

export const digestM037DecodeRecord = (
  value: unknown,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Canonical(value, M037_DIGEST_FAILURE_BUILDERS.decode);

export const digestM037DecodeSourceBytes = (
  bytes: Uint8Array,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Bytes(bytes, M037_DIGEST_FAILURE_BUILDERS.decode);

type M037CanonicalDigest = (
  value: unknown,
) => Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto>;

const readBytes = (
  absolutePath: string,
  diagnosticPath: string,
  failure: FailureBuilder,
): Effect.Effect<Uint8Array, M037CandidateFailure, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem.readFile(absolutePath).pipe(
      Effect.mapError((error) =>
        failure(`could not read ${diagnosticPath}`, {
          path: diagnosticPath,
          cause: projectPlatformCause(error),
        }),
      ),
    );
  });

const writeBytes = (
  absolutePath: string,
  bytes: Uint8Array,
  diagnosticPath: string,
  failure: FailureBuilder,
): Effect.Effect<void, M037CandidateFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fileSystem.makeDirectory(path.dirname(absolutePath), { recursive: true }).pipe(
      Effect.mapError((error) =>
        failure(`could not create the parent for ${diagnosticPath}`, {
          path: diagnosticPath,
          cause: projectPlatformCause(error),
        }),
      ),
    );
    yield* fileSystem.writeFile(absolutePath, bytes).pipe(
      Effect.mapError((error) =>
        failure(`could not write ${diagnosticPath}`, {
          path: diagnosticPath,
          cause: projectPlatformCause(error),
        }),
      ),
    );
  });

const readText = (absolutePath: string, diagnosticPath: string, failure: FailureBuilder) =>
  readBytes(absolutePath, diagnosticPath, failure).pipe(
    Effect.map((bytes) => textDecoder.decode(bytes)),
  );

const resolveExecutable = (
  name: string,
  pathValue: string,
  failure: FailureBuilder,
): Effect.Effect<string, M037CandidateFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const directory of pathValue.split(":")) {
      if (directory.length === 0) continue;
      const candidate = path.join(directory, name);
      const exists = yield* fileSystem.exists(candidate).pipe(
        Effect.mapError((error) =>
          failure(`could not inspect ${name}`, {
            path: name,
            cause: projectPlatformCause(error),
          }),
        ),
      );
      if (!exists) continue;
      return yield* fileSystem.realPath(candidate).pipe(
        Effect.mapError((error) =>
          failure(`could not resolve ${name}`, {
            path: name,
            cause: projectPlatformCause(error),
          }),
        ),
      );
    }
    return yield* Effect.fail(
      failure(`required executable ${name} is unavailable`, {
        path: name,
      }),
    );
  });
const isPathWithin = (root: string, candidate: string): boolean =>
  candidate === root || candidate.startsWith(root.endsWith("/") ? root : `${root}/`);

const arePathsDisjoint = (left: string, right: string): boolean =>
  !isPathWithin(left, right) && !isPathWithin(right, left);

const isSymbolicLink = (
  absolutePath: string,
): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fileSystem) => fileSystem.readLink(absolutePath)),
    Effect.match({
      onFailure: () => false,
      onSuccess: () => true,
    }),
  );

const resolveContainedExistingPath = (
  root: string,
  relativePath: string,
  resolutionFailure: FailureBuilder,
  unsafeFailure: FailureBuilder,
  rejectSymbolicLinkComponents = false,
): Effect.Effect<string, M037CandidateFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absolutePath = path.resolve(root, relativePath);
    if (rejectSymbolicLinkComponents) {
      let componentPath = root;
      for (const segment of relativePath.split("/")) {
        componentPath = path.join(componentPath, segment);
        if (yield* isSymbolicLink(componentPath))
          return yield* Effect.fail(
            unsafeFailure(`${relativePath} contains a symbolic-link path component`, {
              path: relativePath,
            }),
          );
      }
    }
    const realPath = yield* fileSystem.realPath(absolutePath).pipe(
      Effect.mapError((error) =>
        resolutionFailure(`could not resolve ${relativePath}`, {
          path: relativePath,
          cause: projectPlatformCause(error),
        }),
      ),
    );
    if (!isPathWithin(root, realPath))
      return yield* Effect.fail(
        unsafeFailure(`${relativePath} resolves outside the repository root`, {
          path: relativePath,
        }),
      );
    return realPath;
  });

const makeExternalTempDirectory = (
  workspaceRoots: ReadonlyArray<string>,
  ambientTempDirectory: string | undefined,
  prefix: string,
  failure: FailureBuilder,
): Effect.Effect<string, M037CandidateFailure, FileSystem.FileSystem | Path.Path | Scope.Scope> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const candidates = [
      ...(ambientTempDirectory === undefined ? [] : [ambientTempDirectory]),
      "/tmp",
      "/var/tmp",
    ].filter((candidate, index, values) => values.indexOf(candidate) === index);
    for (const candidate of candidates) {
      const canonicalParent = yield* fileSystem.realPath(candidate).pipe(
        Effect.match({
          onFailure: () => undefined,
          onSuccess: (value) => value,
        }),
      );
      if (
        canonicalParent === undefined ||
        workspaceRoots.some((workspaceRoot) => isPathWithin(workspaceRoot, canonicalParent))
      )
        continue;
      const temporaryDirectory = yield* fileSystem
        .makeTempDirectoryScoped({ directory: canonicalParent, prefix })
        .pipe(
          Effect.match({
            onFailure: () => undefined,
            onSuccess: (value) => value,
          }),
        );
      if (temporaryDirectory === undefined) continue;
      const canonicalTemporaryDirectory = yield* fileSystem.realPath(temporaryDirectory).pipe(
        Effect.mapError((error) =>
          failure("could not resolve external temporary directory", {
            cause: projectPlatformCause(error),
          }),
        ),
      );
      if (
        workspaceRoots.every((workspaceRoot) =>
          arePathsDisjoint(canonicalTemporaryDirectory, workspaceRoot),
        )
      )
        return canonicalTemporaryDirectory;
    }
    return yield* Effect.fail(
      failure("no writable external temporary directory is disjoint from the workspace"),
    );
  });

const exactSingleLine = (value: string, pattern: RegExp): string | undefined => {
  const lines = value.trim().split("\n");
  return lines.length === 1 && pattern.test(lines[0] ?? "") ? lines[0] : undefined;
};

export const decodeSelection = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  {
    readonly selection: M037FullCompilerCandidateSelection;
    readonly inputs: ReadonlyArray<typeof InputEntrySchema.Type>;
  },
  M037CandidateFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    if (selectionPath !== CANDIDATE_SELECTION)
      return yield* Effect.fail(
        isRepositoryRelativePath(selectionPath)
          ? selectionInvalidFailure("candidate selection path is not the public M037 selection", {
              path: selectionPath,
            })
          : selectionUnsafeFailure("candidate selection path must be repository-relative"),
      );
    const resolvedSelectionPath = yield* resolveContainedExistingPath(
      root,
      selectionPath,
      selectionInvalidFailure,
      selectionUnsafeFailure,
      true,
    );
    const encoded = yield* readText(resolvedSelectionPath, selectionPath, selectionInvalidFailure);
    const selection = yield* Schema.decodeEffect(M037FullCompilerCandidateSelectionFromJson)(
      encoded,
      parseOptions,
    ).pipe(
      Effect.mapError(() =>
        candidateFailures.selection("invalid-selection", "invalid M037 candidate selection", {
          path: selectionPath,
        }),
      ),
    );
    const assemblyPath = yield* resolveContainedExistingPath(
      root,
      ASSEMBLY_SELECTION,
      selectionReferenceFailure,
      selectionUnsafeFailure,
      true,
    );
    const assemblyText = yield* readText(
      assemblyPath,
      ASSEMBLY_SELECTION,
      selectionReferenceFailure,
    );
    const assembly = yield* Schema.decodeEffect(AssemblySelectionFromJson)(
      assemblyText,
      parseOptions,
    ).pipe(
      Effect.mapError(() =>
        candidateFailures.selection("reference-disagreement", "invalid assembly selection", {
          path: ASSEMBLY_SELECTION,
        }),
      ),
    );
    const planPath = yield* resolveContainedExistingPath(
      root,
      PLAN_SELECTION,
      selectionReferenceFailure,
      selectionUnsafeFailure,
      true,
    );
    const planText = yield* readText(planPath, PLAN_SELECTION, selectionReferenceFailure);
    const plan = yield* Schema.decodeEffect(PlanningSelectionFromJson)(planText, parseOptions).pipe(
      Effect.mapError(() =>
        candidateFailures.selection("reference-disagreement", "invalid plan selection", {
          path: PLAN_SELECTION,
        }),
      ),
    );
    const classificationPath = yield* resolveContainedExistingPath(
      root,
      CLASSIFICATION_SELECTION,
      selectionReferenceFailure,
      selectionUnsafeFailure,
      true,
    );
    const classificationText = yield* readText(
      classificationPath,
      CLASSIFICATION_SELECTION,
      selectionReferenceFailure,
    );
    const classification = yield* Schema.decodeEffect(ClassificationSelectionFromJson)(
      classificationText,
      parseOptions,
    ).pipe(
      Effect.mapError(() =>
        candidateFailures.selection("reference-disagreement", "invalid classification selection", {
          path: CLASSIFICATION_SELECTION,
        }),
      ),
    );
    const theorySelectionPath = yield* resolveContainedExistingPath(
      root,
      THEORY_SELECTION,
      selectionReferenceFailure,
      selectionUnsafeFailure,
      true,
    );
    const explanationText = yield* readText(
      theorySelectionPath,
      THEORY_SELECTION,
      selectionReferenceFailure,
    );
    const explanation = yield* Schema.decodeEffect(ExplainSelectionFromJson)(
      explanationText,
      parseOptions,
    ).pipe(
      Effect.mapError(() =>
        candidateFailures.selection("reference-disagreement", "invalid theory selection", {
          path: THEORY_SELECTION,
        }),
      ),
    );
    const referencesAgree =
      selection.assemblySelection === ASSEMBLY_SELECTION &&
      selection.externalConsumer === EXTERNAL_CONSUMER &&
      assembly.id === ASSEMBLY_ID &&
      assembly.planSelection === PLAN_SELECTION &&
      plan.id === ASSEMBLY_ID &&
      plan.qualificationSelection === CLASSIFICATION_SELECTION &&
      plan.requirementAddress === REQUIREMENT &&
      classification.id === QUALIFICATION_ID &&
      classification.explanationSelection === THEORY_SELECTION &&
      classification.targets.length === 2 &&
      classification.targets[0]?.target === "effect-typescript" &&
      classification.targets[0]?.realization === "BookAppointmentOnce" &&
      classification.targets[1]?.target === "gleam-beam" &&
      classification.targets[1]?.realization === "BookAppointmentOnce" &&
      explanation.id === EXPLANATION_ID &&
      explanation.requirement === REQUIREMENT &&
      explanation.sources.length === 1 &&
      explanation.sources[0]?.path === DOMAIN_SOURCE &&
      explanation.theory?.path === THEORY_PACKAGE &&
      explanation.theory.id === "ExactOneCapabilityExecution" &&
      explanation.theory.version === 1;
    if (!referencesAgree) {
      return yield* Effect.fail(
        candidateFailures.selection(
          "reference-disagreement",
          "candidate references do not resolve to the frozen Clinic chain",
          { path: selectionPath },
        ),
      );
    }
    const inputs = yield* Effect.forEach(INPUT_PATHS, ({ role, path: inputPath }) =>
      Effect.gen(function* () {
        const resolvedInputPath = yield* resolveContainedExistingPath(
          root,
          inputPath,
          selectionReferenceFailure,
          selectionUnsafeFailure,
          true,
        );
        const bytes = yield* readBytes(resolvedInputPath, inputPath, selectionReferenceFailure);
        return {
          role,
          path: inputPath,
          sha256: yield* digestM037SelectionInput(bytes),
        };
      }),
    );
    return { selection, inputs };
  });

export const inspectM037Checkout = (
  root: string,
  git: string,
  environment: Readonly<Record<string, string>>,
): Effect.Effect<
  { readonly revision: string; readonly dependencyLockSha256: `sha256:${string}` },
  M037CandidateFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const status = yield* requireSuccessfulProcess(
      git,
      ["status", "--porcelain", "--untracked-files=no"],
      {
        cwd: root,
        environment,
        failure: (message, fields) =>
          candidateFailures.checkout("revision-unavailable", message, fields),
        command: "git status --porcelain --untracked-files=no",
        path: ".",
      },
    );
    if (status.stdout !== "") {
      return yield* Effect.fail(
        candidateFailures.checkout("dirty-worktree", "tracked worktree is dirty", { path: "." }),
      );
    }
    const head = yield* requireSuccessfulProcess(git, ["rev-parse", "HEAD"], {
      cwd: root,
      environment,
      failure: (message, fields) =>
        candidateFailures.checkout("revision-unavailable", message, fields),
      command: "git rev-parse HEAD",
      path: ".",
    });
    const revision = head.stdout.trim();
    if (!/^[0-9a-f]{40}$/u.test(revision)) {
      return yield* Effect.fail(
        candidateFailures.checkout("revision-unavailable", "HEAD is not one full Git revision", {
          path: ".",
        }),
      );
    }
    const lockPath = yield* resolveContainedExistingPath(
      root,
      DEPENDENCY_LOCK,
      checkoutRevisionFailure,
      selectionUnsafeFailure,
    );
    const lockBytes = yield* readBytes(lockPath, DEPENDENCY_LOCK, checkoutRevisionFailure);
    return {
      revision,
      dependencyLockSha256: yield* digestM037CheckoutLock(lockBytes),
    };
  });

export const preflightHost = (
  root: string,
  runtime: RuntimeBoundary,
  preflightParent: string,
): Effect.Effect<
  HostPreflight,
  M037CandidateFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    if (runtime.platform !== "linux" || runtime.architecture !== "x64") {
      return yield* Effect.fail(
        candidateFailures.preflight("unsupported-platform", "M037 requires x86_64-linux"),
      );
    }
    if (runtime.bunVersion !== "1.3.13") {
      return yield* Effect.fail(
        candidateFailures.preflight("bun-version-unsupported", "M037 requires Bun 1.3.13"),
      );
    }
    const path = yield* Path.Path;
    const ambientPath = runtime.environment.PATH ?? "";
    const git = yield* resolveExecutable("git", ambientPath, (message, fields) =>
      candidateFailures.preflight("git-worktree-unavailable", message, fields),
    );
    const bash = yield* resolveExecutable("bash", ambientPath, (message, fields) =>
      candidateFailures.preflight("bash-unavailable", message, fields),
    );
    const just = yield* resolveExecutable("just", ambientPath, (message, fields) =>
      candidateFailures.preflight("just-version-unsupported", message, fields),
    );
    const nix = yield* resolveExecutable("nix", ambientPath, (message, fields) =>
      candidateFailures.preflight("nix-unavailable", message, fields),
    );
    const bun = yield* FileSystem.FileSystem.pipe(
      Effect.flatMap((fileSystem) => fileSystem.realPath(runtime.executablePath)),
      Effect.mapError((error) =>
        candidateFailures.preflight("bun-version-unsupported", "could not resolve Bun executable", {
          cause: projectPlatformCause(error),
        }),
      ),
    );
    const pathValue = [...new Set([git, bash, just, nix].map((value) => path.dirname(value)))].join(
      ":",
    );
    const preflightHome = path.join(preflightParent, "home");
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem
      .makeDirectory(preflightHome, { recursive: true })
      .pipe(
        Effect.mapError((error) =>
          candidateFailures.preflight(
            "git-worktree-unavailable",
            "could not create preflight HOME",
            { cause: projectPlatformCause(error) },
          ),
        ),
      );
    const childEnvironment = { HOME: preflightHome, LANG: "C.UTF-8", PATH: pathValue } as const;
    const gitVersionResult = yield* requireSuccessfulProcess(git, ["--version"], {
      cwd: root,
      environment: childEnvironment,
      failure: (message, fields) =>
        candidateFailures.preflight("git-worktree-unavailable", message, fields),
      command: "git --version",
      path: ".",
    });
    const gitVersion = exactSingleLine(gitVersionResult.stdout, /^git version .+$/u);
    if (gitVersion === undefined)
      return yield* Effect.fail(
        candidateFailures.preflight(
          "git-worktree-unavailable",
          "git --version returned an unsupported value",
        ),
      );

    const probePath = path.join(preflightParent, "worktree-probe");
    const probeResult = yield* Effect.result(
      requireSuccessfulProcess(
        git,
        ["worktree", "add", "--detach", "--no-checkout", probePath, "HEAD"],
        {
          cwd: root,
          environment: childEnvironment,
          failure: (message, fields) =>
            candidateFailures.preflight("git-worktree-unavailable", message, fields),
          command: "git worktree add --detach --no-checkout <probe> HEAD",
          path: ".",
        },
      ),
    );
    const probeExists = yield* fileSystem
      .exists(probePath)
      .pipe(
        Effect.mapError((error) =>
          candidateFailures.preflight(
            "git-worktree-unavailable",
            "could not inspect detached worktree probe",
            { cause: projectPlatformCause(error) },
          ),
        ),
      );
    if (probeExists)
      yield* requireSuccessfulProcess(git, ["worktree", "remove", "--force", probePath], {
        cwd: root,
        environment: childEnvironment,
        failure: (message, fields) =>
          candidateFailures.preflight("git-worktree-unavailable", message, fields),
        command: "git worktree remove --force <probe>",
        path: ".",
      });
    if (probeResult._tag === "Failure") return yield* Effect.fail(probeResult.failure);

    const bashVersionResult = yield* requireSuccessfulProcess(bash, ["--version"], {
      cwd: root,
      environment: childEnvironment,
      failure: (message, fields) =>
        candidateFailures.preflight("bash-unavailable", message, fields),
      command: "bash --version",
      path: ".",
    });
    const bashVersion = bashVersionResult.stdout.split("\n")[0];
    if (bashVersion === undefined || !/^GNU bash, version .+$/u.test(bashVersion))
      return yield* Effect.fail(
        candidateFailures.preflight(
          "bash-unavailable",
          "bash --version returned an unsupported value",
        ),
      );
    const bashProbe = yield* requireSuccessfulProcess(
      bash,
      ["-euo", "pipefail", "-c", 'printf "m037-bash-ok\\n"'],
      {
        cwd: root,
        environment: childEnvironment,
        failure: (message, fields) =>
          candidateFailures.preflight("bash-unavailable", message, fields),
        command: "bash -euo pipefail -c <probe>",
        path: ".",
      },
    );
    if (bashProbe.stdout !== "m037-bash-ok\n")
      return yield* Effect.fail(
        candidateFailures.preflight("bash-unavailable", "Bash strict-mode token probe failed"),
      );
    const justVersionResult = yield* requireSuccessfulProcess(just, ["--version"], {
      cwd: root,
      environment: childEnvironment,
      failure: (message, fields) =>
        candidateFailures.preflight("just-version-unsupported", message, fields),
      command: "just --version",
      path: ".",
    });
    if (justVersionResult.stdout.trim() !== "just 1.58.0")
      return yield* Effect.fail(
        candidateFailures.preflight("just-version-unsupported", "M037 requires just 1.58.0"),
      );
    yield* requireSuccessfulProcess(just, ["--summary"], {
      cwd: root,
      environment: childEnvironment,
      failure: (message, fields) =>
        candidateFailures.preflight("just-version-unsupported", message, fields),
      command: "just --summary",
      path: "Justfile",
    });
    const nixVersionResult = yield* requireSuccessfulProcess(nix, ["--version"], {
      cwd: root,
      environment: childEnvironment,
      failure: (message, fields) => candidateFailures.preflight("nix-unavailable", message, fields),
      command: "nix --version",
      path: ".",
    });
    const nixVersion = exactSingleLine(nixVersionResult.stdout, /^nix \(Nix\) .+$/u);
    if (nixVersion === undefined)
      return yield* Effect.fail(
        candidateFailures.preflight(
          "nix-unavailable",
          "nix --version returned an unsupported value",
        ),
      );
    const nixFeatures = yield* requireSuccessfulProcess(
      nix,
      ["config", "show", "experimental-features"],
      {
        cwd: root,
        environment: childEnvironment,
        failure: (message, fields) =>
          candidateFailures.preflight("nix-unavailable", message, fields),
        command: "nix config show experimental-features",
        path: ".",
      },
    );
    const featureTokens = new Set(nixFeatures.stdout.split(/[^A-Za-z0-9-]+/u).filter(Boolean));
    if (!featureTokens.has("nix-command") || !featureTokens.has("flakes"))
      return yield* Effect.fail(
        candidateFailures.preflight("nix-unavailable", "Nix requires nix-command and flakes"),
      );
    const nixSubstituters = yield* requireSuccessfulProcess(
      nix,
      ["config", "show", "substituters"],
      {
        cwd: root,
        environment: childEnvironment,
        failure: (message, fields) =>
          candidateFailures.preflight("nix-unavailable", message, fields),
        command: "nix config show substituters",
        path: ".",
      },
    );
    if (!nixSubstituters.stdout.includes("https://cache.nixos.org/"))
      return yield* Effect.fail(
        candidateFailures.preflight("nix-unavailable", "Nix public cache is not configured"),
      );
    const nodeBuild = yield* requireSuccessfulProcess(
      nix,
      [
        "build",
        "--refresh",
        "--no-link",
        "--print-out-paths",
        "--extra-experimental-features",
        "nix-command flakes",
        `github:NixOS/nixpkgs/${NIXPKGS_REVISION}#nodejs_24`,
      ],
      {
        cwd: root,
        environment: childEnvironment,
        failure: (message, fields) =>
          candidateFailures.preflight("nix-unavailable", message, fields),
        command: `nix build --refresh --no-link --print-out-paths --extra-experimental-features "nix-command flakes" github:NixOS/nixpkgs/${NIXPKGS_REVISION}#nodejs_24`,
        path: ".",
      },
    );
    const nodeOutputs = nodeBuild.stdout.trim().split("\n").filter(Boolean);
    if (nodeOutputs.length !== 1 || !nodeOutputs[0]?.startsWith("/nix/store/"))
      return yield* Effect.fail(
        candidateFailures.preflight(
          "nix-unavailable",
          "pinned Node build returned an invalid output path",
        ),
      );
    const nodeExecutable = path.join(nodeOutputs[0], "bin", "node");
    const nodeEnvironmentPath = path.dirname(nodeExecutable);
    const nodeVersionResult = yield* requireSuccessfulProcess(nodeExecutable, ["--version"], {
      cwd: root,
      environment: { HOME: preflightHome, LANG: "C.UTF-8", PATH: nodeEnvironmentPath },
      failure: (message, fields) => candidateFailures.preflight("nix-unavailable", message, fields),
      command: "<pinned-node> --version",
      path: ".",
    });
    if (nodeVersionResult.stdout.trim() !== NODE_VERSION)
      return yield* Effect.fail(
        candidateFailures.preflight("nix-unavailable", "pinned Node version is unsupported"),
      );
    const nodeExecutableBytes = yield* readBytes(
      nodeExecutable,
      "nix-result/bin/node",
      (message, fields) => candidateFailures.preflight("nix-unavailable", message, fields),
    );
    return {
      tools: { git, bash, just, nix, bun, pathValue },
      value: {
        executionPlatform: "x86_64-linux",
        bunVersion: "1.3.13",
        gitVersion,
        gitDetachedWorktreeProbe: true,
        bashVersion,
        bashStrictModeProbe: true,
        justVersion: "just 1.58.0",
        justfileParsed: true,
        nixVersion,
        nixCommandEnabled: true,
        nixFlakesEnabled: true,
        nixPublicCacheConfigured: true,
        nixRefreshedNetworkResolution: true,
        pinnedNodeClosureResolved: true,
      },
      nodeExecutable,
      nodeExecutableSha256: yield* digestM037PreflightNodeExecutable(nodeExecutableBytes),
      nodeEnvironmentPath,
      childEnvironment,
    };
  });

const copyEntryBytes = (
  entries: ReadonlyArray<PublicationEntry>,
): ReadonlyArray<PublicationEntry> =>
  entries.map(({ path, bytes }) => ({ path, bytes: new Uint8Array(bytes) }));

const entryAt = (
  entries: ReadonlyArray<PublicationEntry>,
  entryPath: string,
  failure: FailureBuilder,
): Effect.Effect<PublicationEntry, M037CandidateFailure> => {
  const entry = entries.find(({ path }) => path === entryPath);
  return entry === undefined
    ? Effect.fail(
        failure(`missing producer entry ${entryPath}`, {
          path: entryPath,
        }),
      )
    : Effect.succeed(entry);
};

const classificationCause = (error: ClassificationFailure): ClassificationCause => ({
  _tag: "ClassificationFailure",
  stage: error.stage,
  path: error.path,
  message: error.message,
  ...(error.reason === undefined ? {} : { reason: error.reason }),
  ...(error.address === undefined ? {} : { address: error.address }),
});

export const runM037ClassificationProjection = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  void,
  M037CandidateFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* compileSelectedM031ClassificationStaged(root, selectionPath).pipe(
      Effect.asVoid,
      Effect.mapError((error) =>
        producerFailures.classify(error.message, {
          path: projectMissionOwnedPath(root, selectionPath, path),
          cause: classificationCause(error),
        }),
      ),
    );
  });

const decodeArtifactObservation = (
  stdout: string,
  qualification: typeof M031TargetQualificationEvidenceSchema.Type,
): Effect.Effect<M031TargetQualificationObservations, M037CandidateFailure> =>
  Effect.gen(function* () {
    const prefix = "BANG_M031_RESULT|";
    const encoded = stdout
      .split("\n")
      .findLast((line) => line.startsWith(prefix))
      ?.slice(prefix.length);
    if (encoded === undefined)
      return yield* Effect.fail(
        candidateFailures.artifact("execution-failed", "artifact emitted no M031 observation", {
          path: ARTIFACT_PATH,
        }),
      );
    const raw = yield* Schema.decodeEffect(M031ProbeObservationFromJson)(
      encoded,
      parseOptions,
    ).pipe(
      Effect.mapError(() =>
        candidateFailures.artifact(
          "execution-failed",
          "artifact emitted an invalid M031 observation",
          { path: ARTIFACT_PATH },
        ),
      ),
    );
    const observation = yield* Schema.decodeEffect(M031TargetQualificationObservations)(
      normalizeM031ProbeObservation(raw),
      parseOptions,
    ).pipe(
      Effect.mapError(() =>
        candidateFailures.artifact(
          "execution-failed",
          "artifact observation normalization failed",
          { path: ARTIFACT_PATH },
        ),
      ),
    );
    if (encodeCanonicalJson(observation) !== encodeCanonicalJson(qualification.observations))
      return yield* Effect.fail(
        candidateFailures.artifact(
          "observation-mismatch",
          "artifact observation differs from Gleam qualification",
          { path: ARTIFACT_PATH },
        ),
      );
    return observation;
  });

export interface M037ArtifactInvocation {
  readonly executable: string;
  readonly arguments: ReadonlyArray<string>;
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
}

export const validateM037ArtifactInvocation = (
  invocation: M037ArtifactInvocation,
  artifactDirectory: string,
  erlangBin: string,
  erlangRoot: string,
): Effect.Effect<void, M037CandidateFailure> => {
  const expectedEnvironment = {
    HOME: artifactDirectory,
    LANG: "C.UTF-8",
    PATH: erlangBin,
    ERL_ROOTDIR: erlangRoot,
    ERL_CRASH_DUMP_SECONDS: "0",
  };
  return /^\/nix\/store\/[0-9a-z]+-erlang-[^/]+\/bin\/escript$/u.test(invocation.executable) &&
    sameStrings(invocation.arguments, ["exact_one"]) &&
    invocation.cwd === artifactDirectory &&
    encodeCanonicalJson(invocation.environment) === encodeCanonicalJson(expectedEnvironment)
    ? Effect.void
    : Effect.fail(
        candidateFailures.artifact(
          "runtime-boundary-violated",
          "artifact command boundary differs from the frozen invocation",
          { path: ARTIFACT_PATH },
        ),
      );
};

export const inspectM037ArtifactResolution = (
  artifactDirectory: string,
  erlangBin: string,
): Effect.Effect<void, M037CandidateFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspaceResolvable = yield* Effect.forEach(WORKSPACE_SENTINELS, (sentinel) =>
      Effect.gen(function* () {
        const fromCwd = yield* fileSystem.exists(path.resolve(artifactDirectory, sentinel));
        const fromPath = yield* fileSystem.exists(path.resolve(erlangBin, sentinel));
        return fromCwd || fromPath;
      }),
    ).pipe(
      Effect.mapError((error) =>
        candidateFailures.artifact(
          "runtime-boundary-violated",
          "could not inspect artifact resolution boundary",
          { cause: projectPlatformCause(error) },
        ),
      ),
      Effect.map((values) => values.some(Boolean)),
    );
    const gleamResolvable = yield* fileSystem
      .exists(path.join(erlangBin, "gleam"))
      .pipe(
        Effect.mapError((error) =>
          candidateFailures.artifact(
            "runtime-boundary-violated",
            "could not inspect Erlang-only PATH",
            { cause: projectPlatformCause(error) },
          ),
        ),
      );
    if (workspaceResolvable || gleamResolvable)
      return yield* Effect.fail(
        candidateFailures.artifact(
          "runtime-boundary-violated",
          "artifact resolution boundary exposed workspace or Gleam paths",
        ),
      );
  });

export const executeM037ArtifactProcess = (
  invocation: M037ArtifactInvocation,
): Effect.Effect<ProcessResult, M037CandidateFailure, ChildProcessSpawner.ChildProcessSpawner> =>
  requireSuccessfulProcess(invocation.executable, invocation.arguments, {
    cwd: invocation.cwd,
    environment: invocation.environment,
    failure: (message, fields) => candidateFailures.artifact("execution-failed", message, fields),
    command: "<absolute-erlang-store>/bin/escript exact_one",
    path: ARTIFACT_PATH,
  }).pipe(
    Effect.flatMap((execution) =>
      execution.stderr === ""
        ? Effect.succeed(execution)
        : Effect.fail(
            candidateFailures.artifact("execution-failed", "artifact wrote standard error", {
              path: ARTIFACT_PATH,
            }),
          ),
    ),
  );

const runArtifact = (
  repositoryRoot: string,
  runRoot: string,
  ambientTempDirectory: string | undefined,
  entries: ReadonlyArray<PublicationEntry>,
  gleamEvidence: typeof M031TargetQualificationEvidenceSchema.Type,
  preflight: HostPreflight,
): Effect.Effect<
  typeof ArtifactIsolationValueSchema.Type,
  M037CandidateFailure,
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | ChildProcessSpawner.ChildProcessSpawner
  | Scope.Scope
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const artifactEntry = yield* entryAt(entries, ARTIFACT_PATH, (message, fields) =>
      candidateFailures.artifact("material-missing", message, fields),
    );
    const artifactDirectory = yield* makeExternalTempDirectory(
      [repositoryRoot, runRoot],
      ambientTempDirectory,
      "bang-m037-artifact-",
      (message, fields) => candidateFailures.artifact("runtime-boundary-violated", message, fields),
    );
    const copiedArtifact = path.join(artifactDirectory, "exact_one");
    yield* writeBytes(copiedArtifact, artifactEntry.bytes, "exact_one", (message, fields) =>
      candidateFailures.artifact("runtime-boundary-violated", message, fields),
    );
    const directoryEntries = yield* fileSystem
      .readDirectory(artifactDirectory)
      .pipe(
        Effect.mapError((error) =>
          candidateFailures.artifact(
            "runtime-boundary-violated",
            "could not inspect artifact-only directory",
            { cause: projectPlatformCause(error) },
          ),
        ),
      );
    if (!sameStrings(directoryEntries.toSorted(), ["exact_one"]))
      return yield* Effect.fail(
        candidateFailures.artifact(
          "runtime-boundary-violated",
          "artifact working directory contains unexpected members",
        ),
      );
    const toolchainBuild = yield* requireSuccessfulProcess(
      preflight.tools.nix,
      ["build", "--file", path.join(runRoot, "nix/gleam.nix"), "--no-link", "--print-out-paths"],
      {
        cwd: runRoot,
        environment: preflight.childEnvironment,
        failure: (message, fields) =>
          candidateFailures.artifact("execution-failed", message, fields),
        command: "nix build --file <worktree>/nix/gleam.nix --no-link --print-out-paths",
        path: "nix/gleam.nix",
      },
    );
    const toolchainOutputs = toolchainBuild.stdout.trim().split("\n").filter(Boolean);
    if (toolchainOutputs.length !== 1 || !toolchainOutputs[0]?.startsWith("/nix/store/"))
      return yield* Effect.fail(
        candidateFailures.artifact(
          "runtime-boundary-violated",
          "Gleam toolchain build returned an invalid output path",
          { path: "nix/gleam.nix" },
        ),
      );
    const escriptRealPath = yield* fileSystem
      .realPath(path.join(toolchainOutputs[0], "bin", "escript"))
      .pipe(
        Effect.mapError((error) =>
          candidateFailures.artifact(
            "runtime-boundary-violated",
            "could not resolve Erlang-store escript",
            { cause: projectPlatformCause(error) },
          ),
        ),
      );
    const erlangStore = path.dirname(path.dirname(escriptRealPath));
    const erlangRoot = path.join(erlangStore, "lib", "erlang");
    if (
      !(yield* fileSystem
        .exists(erlangRoot)
        .pipe(
          Effect.mapError((error) =>
            candidateFailures.artifact(
              "runtime-boundary-violated",
              "could not inspect Erlang root",
              { cause: projectPlatformCause(error) },
            ),
          ),
        ))
    )
      return yield* Effect.fail(
        candidateFailures.artifact("runtime-boundary-violated", "Erlang root is unavailable"),
      );
    const erlangBin = path.dirname(escriptRealPath);
    const invocation = {
      executable: escriptRealPath,
      arguments: ["exact_one"],
      cwd: artifactDirectory,
      environment: {
        HOME: artifactDirectory,
        LANG: "C.UTF-8",
        PATH: erlangBin,
        ERL_ROOTDIR: erlangRoot,
        ERL_CRASH_DUMP_SECONDS: "0",
      },
    } as const;
    yield* validateM037ArtifactInvocation(invocation, artifactDirectory, erlangBin, erlangRoot);
    yield* inspectM037ArtifactResolution(artifactDirectory, erlangBin);
    const execution = yield* executeM037ArtifactProcess(invocation);
    const observation = yield* decodeArtifactObservation(execution.stdout, gleamEvidence);
    const escriptBytes = yield* readBytes(
      escriptRealPath,
      "erlang-store/bin/escript",
      (message, fields) => candidateFailures.artifact("runtime-boundary-violated", message, fields),
    );
    return {
      target: "gleam-beam",
      realization: "BookAppointmentOnce",
      entity: "appointment-book-1",
      requirementAddress: REQUIREMENT,
      observation,
      qualificationMatch: true,
      escriptRealPath,
      escriptSha256: yield* digestM037ArtifactExecutable(escriptBytes),
      arguments: ["exact_one"],
      cwd: "artifact-only-temp",
      environment: {
        HOME: "artifact-only-temp",
        LANG: "C.UTF-8",
        PATH: "erlang-store/bin",
        ERL_ROOTDIR: "erlang-store/lib/erlang",
        ERL_CRASH_DUMP_SECONDS: "0",
      },
      workspaceSentinels: [...WORKSPACE_SENTINELS],
      workspaceResolvableFromCwdOrPath: false,
      gleamResolvableFromPath: false,
    };
  });

export const M037_ISOLATION_LOADER_SOURCE = `import { appendFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const sandboxRootValue = process.env.BANG_M037_SANDBOX_ROOT;
const moduleLogPath = process.env.BANG_M037_MODULE_LOG;
if (sandboxRootValue === undefined) throw new Error("missing sandbox root");
if (moduleLogPath === undefined) throw new Error("missing module log path");
const sandboxRoot = realpathSync(sandboxRootValue);
const observe = (entry) => appendFileSync(moduleLogPath, JSON.stringify(entry) + "\\n");
const allowedModule = (url) => {
  if (url.startsWith("node:")) return url;
  if (!url.startsWith("file:")) throw new Error("external module protocol rejected: " + url);
  const filePath = realpathSync(fileURLToPath(url));
  if (filePath !== sandboxRoot && !filePath.startsWith(sandboxRoot + sep)) {
    throw new Error("external file import rejected: " + filePath);
  }
  return relative(sandboxRoot, filePath);
};

export const resolve = async (specifier, context, nextResolve) => {
  if (
    !specifier.startsWith("node:") &&
    !specifier.startsWith("file:") &&
    !specifier.startsWith("./") &&
    !specifier.startsWith("../") &&
    !isAbsolute(specifier)
  ) {
    throw new Error("bare package import rejected: " + specifier);
  }
  const resolution = await nextResolve(specifier, context);
  observe({
    hook: "resolve",
    specifier,
    parent: context.parentURL === undefined ? null : allowedModule(context.parentURL),
    module: allowedModule(resolution.url),
  });
  return resolution;
};

export const load = async (url, context, nextLoad) => {
  const module = allowedModule(url);
  observe({ hook: "load", module });
  return nextLoad(url, context);
};
`;

const ModuleObservationSchema = Schema.Struct({
  hook: Schema.Literals(["resolve", "load"]),
  specifier: Schema.optional(Schema.String),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  module: Schema.String,
}).annotate({ parseOptions });
export type M037ModuleObservation = typeof ModuleObservationSchema.Type;

const normalizeM037ModuleObservations = (
  observations: ReadonlyArray<M037ModuleObservation>,
): ReadonlyArray<M037ModuleObservation> =>
  [
    ...new Map(
      observations.map((observation) => {
        const normalized =
          observation.specifier !== undefined &&
          (observation.specifier.startsWith("file:") || observation.specifier.startsWith("/"))
            ? { ...observation, specifier: observation.module }
            : observation;
        return [encodeCanonicalJson(normalized), normalized] as const;
      }),
    ).values(),
  ].toSorted((left, right) => encodeCanonicalJson(left).localeCompare(encodeCanonicalJson(right)));

export const digestM037ExternalConsumerModuleLog = (
  observations: ReadonlyArray<M037ModuleObservation>,
): Effect.Effect<`sha256:${string}`, M037CandidateFailure, Crypto.Crypto> =>
  sha256Canonical(
    normalizeM037ModuleObservations(observations),
    M037_DIGEST_FAILURE_BUILDERS["external-consumer"],
  );

export const digestM037ExternalConsumer = (
  loaderBytes: Uint8Array,
  observations: ReadonlyArray<M037ModuleObservation>,
): Effect.Effect<
  {
    readonly loaderSha256: `sha256:${string}`;
    readonly moduleLogSha256: `sha256:${string}`;
  },
  M037CandidateFailure,
  Crypto.Crypto
> =>
  Effect.all({
    loaderSha256: digestM037ExternalConsumerLoader(loaderBytes),
    moduleLogSha256: digestM037ExternalConsumerModuleLog(observations),
  });

const copySandboxInput = (
  runRoot: string,
  sandboxRoot: string,
  sourcePath: string,
  destinationPath: string,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const failure: FailureBuilder = (message, fields) =>
      candidateFailures.externalConsumer("isolation-violated", message, fields);
    const resolvedSourcePath = yield* resolveContainedExistingPath(
      runRoot,
      sourcePath,
      failure,
      failure,
    );
    const bytes = yield* readBytes(resolvedSourcePath, sourcePath, failure);
    yield* writeBytes(path.resolve(sandboxRoot, destinationPath), bytes, destinationPath, failure);
  });

export const projectM037ExternalConsumerResult = (
  processResult: ProcessResult,
): Effect.Effect<typeof ValidVerdictSchema.Type, M037CandidateFailure> =>
  Schema.decodeEffect(ConsumptionVerdictFromJson)(processResult.stdout, parseOptions).pipe(
    Effect.match({
      onFailure: () => undefined,
      onSuccess: (verdict) => verdict,
    }),
    Effect.flatMap((decodedVerdict) => {
      if (decodedVerdict?.verdict === "rejected") {
        const rejected: RejectedVerdict = decodedVerdict;
        return Effect.fail(
          candidateFailures.externalConsumer(
            "consumer-rejected",
            "external consumer returned a rejected verdict",
            {
              path: "consumer.mjs",
              cause: {
                _tag: "M035RejectedVerdict",
                stage: rejected.stage,
                reason: rejected.reason,
                message: rejected.message,
                ...("path" in rejected && rejected.path !== undefined
                  ? { path: rejected.path }
                  : {}),
                ...("identity" in rejected && rejected.identity !== undefined
                  ? { identity: rejected.identity }
                  : {}),
                ...("expected" in rejected && rejected.expected !== undefined
                  ? { expected: rejected.expected }
                  : {}),
                ...("observed" in rejected && rejected.observed !== undefined
                  ? { observed: rejected.observed }
                  : {}),
              },
            },
          ),
        );
      }
      if (
        processResult.exitCode !== ChildProcessSpawner.ExitCode(0) ||
        decodedVerdict === undefined
      )
        return Effect.fail(
          processFailure(
            (message, fields) =>
              candidateFailures.externalConsumer("process-failed", message, fields),
            "<pinned-node> --no-warnings --experimental-loader <sandbox>/isolation-loader.mjs <sandbox>/consumer.mjs",
            "consumer.mjs",
            "external consumer process failed or returned an invalid verdict",
          ),
        );
      if (processResult.stderr !== "")
        return Effect.fail(
          candidateFailures.externalConsumer(
            "isolation-violated",
            "external consumer wrote standard error",
            { path: "consumer.mjs" },
          ),
        );
      return Effect.succeed(decodedVerdict);
    }),
  );

const runExternalConsumer = (
  repositoryRoot: string,
  runRoot: string,
  ambientTempDirectory: string | undefined,
  schemaEntries: ReadonlyArray<PublicationEntry>,
  effectEvidence: typeof M031TargetQualificationEvidenceSchema.Type,
  preflight: HostPreflight,
): Effect.Effect<
  typeof ExternalConsumerIsolationValueSchema.Type,
  M037CandidateFailure,
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | ChildProcessSpawner.ChildProcessSpawner
  | Scope.Scope
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const isolationFailure: FailureBuilder = (message, fields) =>
      candidateFailures.externalConsumer("isolation-violated", message, fields);
    const sandboxRoot = yield* makeExternalTempDirectory(
      [repositoryRoot, runRoot],
      ambientTempDirectory,
      "bang-m037-consumer-",
      isolationFailure,
    );
    const consumerPath = yield* resolveContainedExistingPath(
      runRoot,
      EXTERNAL_CONSUMER,
      isolationFailure,
      isolationFailure,
    );
    const consumerBytes = yield* readBytes(consumerPath, EXTERNAL_CONSUMER, isolationFailure);
    yield* writeBytes(
      path.join(sandboxRoot, "consumer.mjs"),
      consumerBytes,
      "consumer.mjs",
      (message, fields) =>
        candidateFailures.externalConsumer("isolation-violated", message, fields),
    );
    const loaderBytes = textEncoder.encode(M037_ISOLATION_LOADER_SOURCE);
    yield* writeBytes(
      path.join(sandboxRoot, "isolation-loader.mjs"),
      loaderBytes,
      "isolation-loader.mjs",
      (message, fields) =>
        candidateFailures.externalConsumer("isolation-violated", message, fields),
    );
    for (const entry of schemaEntries) {
      const relative = entry.path.slice("dist/schemas/2/".length);
      yield* writeBytes(
        path.join(sandboxRoot, "publication", relative),
        entry.bytes,
        `publication/${relative}`,
        (message, fields) =>
          candidateFailures.externalConsumer("isolation-violated", message, fields),
      );
    }
    yield* copySandboxInput(runRoot, sandboxRoot, THEORY_LOCK_PATH, "inputs/clinic.lock.json");
    yield* copySandboxInput(
      runRoot,
      sandboxRoot,
      EFFECT_EVIDENCE_PATH,
      "inputs/effect-typescript.evidence.json",
    );
    for (const material of effectEvidence.materials) {
      yield* copySandboxInput(
        runRoot,
        sandboxRoot,
        material.path,
        `inputs/materials/${material.path}`,
      );
    }
    const moduleLogPath = path.join(sandboxRoot, "module-loads.jsonl");
    const environment = {
      HOME: sandboxRoot,
      LANG: "C.UTF-8",
      PATH: preflight.nodeEnvironmentPath,
      BANG_M037_SANDBOX_ROOT: sandboxRoot,
      BANG_M037_MODULE_LOG: moduleLogPath,
    } as const;
    const processResult = yield* runProcess(
      preflight.nodeExecutable,
      [
        "--no-warnings",
        "--experimental-loader",
        path.join(sandboxRoot, "isolation-loader.mjs"),
        path.join(sandboxRoot, "consumer.mjs"),
      ],
      {
        cwd: sandboxRoot,
        environment,
        failure: (message, fields) =>
          candidateFailures.externalConsumer("process-failed", message, fields),
        command:
          "<pinned-node> --no-warnings --experimental-loader <sandbox>/isolation-loader.mjs <sandbox>/consumer.mjs",
        path: "consumer.mjs",
      },
    );
    const verdict = yield* projectM037ExternalConsumerResult(processResult);
    const moduleLogBytes = yield* readBytes(
      moduleLogPath,
      "module-loads.jsonl",
      (message, fields) =>
        candidateFailures.externalConsumer("isolation-violated", message, fields),
    );
    const observations: Array<M037ModuleObservation> = [];
    for (const line of textDecoder.decode(moduleLogBytes).trim().split("\n")) {
      if (line.length === 0) continue;
      const observation = yield* Schema.decodeEffect(
        Schema.fromJsonString(ModuleObservationSchema),
      )(line, parseOptions).pipe(
        Effect.mapError(() =>
          candidateFailures.externalConsumer(
            "isolation-violated",
            "module log contains an invalid row",
            { path: "module-loads.jsonl" },
          ),
        ),
      );
      observations.push(observation);
    }
    const loadedFiles = [
      ...new Set(
        observations
          .filter(({ hook, module }) => hook === "load" && !module.startsWith("node:"))
          .map(({ module }) => module),
      ),
    ].toSorted();
    const resolvedFiles = [
      ...new Set(
        observations
          .filter(({ hook, module }) => hook === "resolve" && !module.startsWith("node:"))
          .map(({ module }) => module),
      ),
    ].toSorted();
    const resolvedBuiltins = [
      ...new Set(
        observations
          .filter(({ hook, module }) => hook === "resolve" && module.startsWith("node:"))
          .map(({ module }) => module),
      ),
    ].toSorted();
    if (
      !sameStrings(loadedFiles, ["consumer.mjs", "publication/types/consumer.js"]) ||
      !sameStrings(resolvedFiles, ["consumer.mjs", "publication/types/consumer.js"]) ||
      !sameStrings(resolvedBuiltins, ["node:crypto", "node:fs/promises", "node:path"])
    )
      return yield* Effect.fail(
        candidateFailures.externalConsumer(
          "isolation-violated",
          "external consumer module closure differs from the frozen boundary",
          { path: "module-loads.jsonl" },
        ),
      );
    const consumerDigests = yield* digestM037ExternalConsumer(loaderBytes, observations);
    return {
      nodeProvisioner: "nix",
      nixpkgsRevision: NIXPKGS_REVISION,
      nixAttribute: "nodejs_24",
      nodeVersion: NODE_VERSION,
      nodeExecutable: "nix-result/bin/node",
      nodeExecutableSha256: preflight.nodeExecutableSha256,
      arguments: ["--no-warnings", "--experimental-loader", "isolation-loader.mjs", "consumer.mjs"],
      environmentKeys: ["BANG_M037_MODULE_LOG", "BANG_M037_SANDBOX_ROOT", "HOME", "LANG", "PATH"],
      ...consumerDigests,
      loadedFiles: ["consumer.mjs", "publication/types/consumer.js"],
      resolvedFiles: ["consumer.mjs", "publication/types/consumer.js"],
      resolvedBuiltins: ["node:crypto", "node:fs/promises", "node:path"],
      verdict,
    };
  });

export const makeSchemaCustody = (
  schemaEntries: ReadonlyArray<PublicationEntry>,
): Effect.Effect<typeof SchemaCustodyValueSchema.Type, M037CandidateFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    if (schemaEntries.length !== 6)
      return yield* Effect.fail(
        candidateFailures.schemaPublication(
          "result-mismatch",
          "schema publication must contain six files",
        ),
      );
    const manifestEntry = yield* entryAt(schemaEntries, SCHEMA_MANIFEST_PATH, (message, fields) =>
      candidateFailures.schemaPublication("result-mismatch", message, fields),
    );
    const manifest = yield* Schema.decodeEffect(SchemaManifestFromJson)(
      textDecoder.decode(manifestEntry.bytes),
      parseOptions,
    ).pipe(
      Effect.mapError(() =>
        candidateFailures.schemaPublication("result-mismatch", "schema manifest is invalid", {
          path: SCHEMA_MANIFEST_PATH,
        }),
      ),
    );
    const manifestPayloads = [
      ...manifest.documents.map(({ file, sha256 }) => ({ path: `dist/schemas/2/${file}`, sha256 })),
      { path: "dist/schemas/2/types/consumer.js", sha256: manifest.types.sha256 },
    ];
    for (const payload of manifestPayloads) {
      const entry = yield* entryAt(schemaEntries, payload.path, (message, fields) =>
        candidateFailures.schemaPublication("result-mismatch", message, fields),
      );
      if ((yield* digestM037SchemaPublicationEntry(entry.bytes)) !== payload.sha256)
        return yield* Effect.fail(
          candidateFailures.schemaPublication(
            "result-mismatch",
            "schema manifest digest disagrees with payload bytes",
            { path: payload.path },
          ),
        );
    }
    const inventoryDigestedFiles = yield* Effect.forEach(PRODUCER_PATHS.slice(15), (entryPath) =>
      Effect.gen(function* () {
        const entry = yield* entryAt(schemaEntries, entryPath, (message, fields) =>
          candidateFailures.schemaPublication("result-mismatch", message, fields),
        );
        return {
          path: entryPath,
          sha256: yield* digestM037SchemaPublicationEntry(entry.bytes),
        };
      }),
    );
    return {
      version: 2,
      manifestSha256: yield* digestM037SchemaPublicationEntry(manifestEntry.bytes),
      manifestDigestedPayloads: manifestPayloads,
      inventoryDigestedFiles,
    };
  });

const verifyRunRoot = (
  runRoot: string,
  revision: string,
  dependencyLockSha256: `sha256:${string}`,
  expectedInputs: ReadonlyArray<typeof InputEntrySchema.Type>,
  preflight: HostPreflight,
): Effect.Effect<
  void,
  M037CandidateFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const rootResult = yield* requireSuccessfulProcess(
      preflight.tools.git,
      ["-C", runRoot, "rev-parse", "--show-toplevel"],
      {
        cwd: runRoot,
        environment: preflight.childEnvironment,
        failure: (message, fields) =>
          candidateFailures.checkout("revision-unavailable", message, fields),
        command: "git -C <worktree> rev-parse --show-toplevel",
        path: ".",
      },
    );
    const fileSystem = yield* FileSystem.FileSystem;
    const realRoot = yield* fileSystem.realPath(runRoot).pipe(
      Effect.mapError((error) =>
        candidateFailures.checkout("revision-unavailable", "could not resolve worktree root", {
          cause: projectPlatformCause(error),
        }),
      ),
    );
    const observedRoot = yield* fileSystem
      .realPath(rootResult.stdout.trim())
      .pipe(
        Effect.mapError((error) =>
          candidateFailures.checkout(
            "revision-unavailable",
            "could not resolve reported worktree root",
            { cause: projectPlatformCause(error) },
          ),
        ),
      );
    if (realRoot !== observedRoot)
      return yield* Effect.fail(
        candidateFailures.checkout(
          "revision-unavailable",
          "worktree root disagrees with its Git root",
        ),
      );
    const head = yield* requireSuccessfulProcess(
      preflight.tools.git,
      ["-C", runRoot, "rev-parse", "HEAD"],
      {
        cwd: runRoot,
        environment: preflight.childEnvironment,
        failure: (message, fields) =>
          candidateFailures.checkout("revision-unavailable", message, fields),
        command: "git -C <worktree> rev-parse HEAD",
        path: ".",
      },
    );
    if (head.stdout.trim() !== revision)
      return yield* Effect.fail(
        candidateFailures.checkout(
          "revision-unavailable",
          "worktree revision disagrees with candidate HEAD",
        ),
      );
    const status = yield* requireSuccessfulProcess(
      preflight.tools.git,
      ["-C", runRoot, "status", "--porcelain", "--untracked-files=no"],
      {
        cwd: runRoot,
        environment: preflight.childEnvironment,
        failure: (message, fields) =>
          candidateFailures.checkout("revision-unavailable", message, fields),
        command: "git -C <worktree> status --porcelain --untracked-files=no",
        path: ".",
      },
    );
    if (status.stdout !== "")
      return yield* Effect.fail(
        candidateFailures.checkout("revision-unavailable", "detached worktree is not clean"),
      );
    const lockPath = yield* resolveContainedExistingPath(
      realRoot,
      DEPENDENCY_LOCK,
      checkoutRevisionFailure,
      selectionUnsafeFailure,
    );
    const lockBytes = yield* readBytes(lockPath, DEPENDENCY_LOCK, checkoutRevisionFailure);
    if ((yield* digestM037CheckoutLock(lockBytes)) !== dependencyLockSha256)
      return yield* Effect.fail(
        candidateFailures.checkout(
          "revision-unavailable",
          "worktree dependency lock differs from candidate HEAD",
          { path: DEPENDENCY_LOCK },
        ),
      );
    for (const expected of expectedInputs) {
      const inputPath = yield* resolveContainedExistingPath(
        realRoot,
        expected.path,
        checkoutRevisionFailure,
        selectionUnsafeFailure,
      );
      const bytes = yield* readBytes(inputPath, expected.path, checkoutRevisionFailure);
      if ((yield* digestM037CheckoutLock(bytes)) !== expected.sha256)
        return yield* Effect.fail(
          candidateFailures.checkout(
            "revision-unavailable",
            "worktree input differs from candidate HEAD",
            { path: expected.path },
          ),
        );
    }
  });

const runSetup = (
  runRoot: string,
  runtime: RuntimeBoundary,
  preflight: HostPreflight,
): Effect.Effect<void, M037CandidateFailure, Path.Path | ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const environment = {
      ...runtime.environment,
      PATH: `${path.dirname(preflight.tools.bun)}:${runtime.environment.PATH ?? ""}`,
    };
    yield* requireSuccessfulProcess(preflight.tools.just, ["install"], {
      cwd: runRoot,
      environment,
      failure: (message, fields) => candidateFailures.setup("process-failed", message, fields),
      command: "just install",
      path: ".",
    });
    yield* requireSuccessfulProcess(preflight.tools.bun, ["run", "build"], {
      cwd: runRoot,
      environment,
      failure: (message, fields) => candidateFailures.setup("process-failed", message, fields),
      command: "bun run build",
      path: ".",
    });
  });

const compileRun = (
  repositoryRoot: string,
  runRoot: string,
  runtime: RuntimeBoundary,
  revision: string,
  dependencyLockSha256: `sha256:${string}`,
  inputs: ReadonlyArray<typeof InputEntrySchema.Type>,
  preflight: HostPreflight,
): Effect.Effect<
  RunResult,
  M037CandidateFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      yield* verifyRunRoot(runRoot, revision, dependencyLockSha256, inputs, preflight);
      yield* runSetup(runRoot, runtime, preflight);
      const directExplanation = yield* compileSelectedExplanationStaged(
        runRoot,
        THEORY_SELECTION,
      ).pipe(
        Effect.mapError((error) =>
          producerFailures.explain(error.message, {
            path: THEORY_SELECTION,
            cause: explanationCause(error),
          }),
        ),
      );
      if (
        directExplanation.result._tag !== "Applicable" ||
        directExplanation.theoryLock === undefined
      )
        return yield* Effect.fail(
          candidateFailures.explain(
            "result-mismatch",
            "current exact-one theory is not applicable",
            { path: THEORY_SELECTION },
          ),
        );
      let collectedEntries: ReadonlyArray<PublicationEntry> | undefined;
      const assembly = yield* compileSelectedAssembly(runRoot, ASSEMBLY_SELECTION, {
        publish: (publishRoot, entries) =>
          publishRoot === runRoot
            ? Effect.sync(() => {
                collectedEntries = copyEntryBytes(entries);
              })
            : Effect.fail(
                new PublicationFailure({
                  stage: "publication",
                  path: publishRoot,
                  reason: "invalid-entry",
                  message: "assembly collector received an unexpected root",
                }),
              ),
      }).pipe(
        Effect.mapError((error) =>
          producerFailures.assemble(error.message, {
            path: ASSEMBLY_SELECTION,
            cause: assemblyCause(error),
          }),
        ),
      );
      if (collectedEntries === undefined)
        return yield* Effect.fail(
          candidateFailures.assemble("result-mismatch", "assembly publisher returned no entries", {
            path: ASSEMBLY_SELECTION,
          }),
        );
      const assemblyEntries = collectedEntries;
      if (
        assemblyEntries.length !== 15 ||
        !sameStrings(
          assemblyEntries.map(({ path: entryPath }) => entryPath).toSorted(),
          PRODUCER_PATHS.slice(0, 15).toSorted(),
        )
      )
        return yield* Effect.fail(
          candidateFailures.assemble(
            "result-mismatch",
            "assembly producer inventory differs from the frozen 15-file closure",
            { path: ASSEMBLY_SELECTION },
          ),
        );
      const artifactEntry = yield* entryAt(
        assemblyEntries,
        ".bang/artifacts/clinic-packaged-exact-one.json",
        (message, fields) => candidateFailures.explain("result-mismatch", message, fields),
      );
      const lockEntry = yield* entryAt(assemblyEntries, THEORY_LOCK_PATH, (message, fields) =>
        candidateFailures.explain("result-mismatch", message, fields),
      );
      if (
        textDecoder.decode(artifactEntry.bytes) !== directExplanation.encodedArtifact ||
        textDecoder.decode(lockEntry.bytes) !== directExplanation.theoryLock.encodedLock
      )
        return yield* Effect.fail(
          candidateFailures.explain(
            "result-mismatch",
            "direct explanation bytes differ from assembly closure",
            { path: THEORY_SELECTION },
          ),
        );
      const classificationEntry = yield* entryAt(
        assemblyEntries,
        CLASSIFICATION_REPORT_PATH,
        (message, fields) => candidateFailures.classify("result-mismatch", message, fields),
      );
      const classification = yield* Schema.decodeEffect(M037CollectedClassificationReportFromJson)(
        textDecoder.decode(classificationEntry.bytes),
        parseOptions,
      ).pipe(
        Effect.mapError(() =>
          candidateFailures.classify(
            "result-mismatch",
            "collected classification report is invalid",
            { path: CLASSIFICATION_REPORT_PATH },
          ),
        ),
      );
      const expectedTargets = ["effect-typescript", "gleam-beam"] as const;
      const classificationIdentitiesMatch =
        classification.results.length === 2 &&
        classification.evidence.length === 2 &&
        classification.results.every(
          (result, index) =>
            result._tag === "Qualified" &&
            result.targetId === expectedTargets[index] &&
            result.realizationId === "BookAppointmentOnce" &&
            result.artifactId === EXPLANATION_ID &&
            result.artifactFormat === "bangSemanticArtifact:1" &&
            result.theoryResultIdentity.artifactId === EXPLANATION_ID &&
            result.theoryResultIdentity.artifactFormat === "bangSemanticArtifact:1" &&
            result.theoryResultIdentity.requirementAddress === REQUIREMENT &&
            result.theoryResultIdentity.theory.id === "ExactOneCapabilityExecution" &&
            result.theoryResultIdentity.theory.version === 1,
        ) &&
        classification.evidence.every(
          (evidence, index) =>
            evidence.selectionId === QUALIFICATION_ID &&
            evidence.targetId === expectedTargets[index] &&
            evidence.realizationId === "BookAppointmentOnce" &&
            evidence.artifactId === EXPLANATION_ID &&
            evidence.artifactFormat === "bangSemanticArtifact:1" &&
            evidence.requirementAddress === REQUIREMENT &&
            evidence.theory.id === "ExactOneCapabilityExecution" &&
            evidence.theory.version === 1 &&
            evidence.package.id === "ExactOneCapabilityExecution" &&
            evidence.package.version === 1 &&
            evidence.producer.targetId === expectedTargets[index] &&
            evidence.producer.identity ===
              ["BANG M031 Effect exact-one probe", "BANG M031 Gleam BEAM exact-one probe"][index] &&
            evidence.producer.version === "1",
        );
      if (
        classification.selectionId !== QUALIFICATION_ID ||
        classification.artifactId !== EXPLANATION_ID ||
        classification.requirementAddress !== REQUIREMENT ||
        !classificationIdentitiesMatch
      )
        return yield* Effect.fail(
          candidateFailures.classify(
            "result-mismatch",
            "collected classification does not contain the ordered qualified targets",
            { path: CLASSIFICATION_REPORT_PATH },
          ),
        );
      const planEntry = yield* entryAt(assemblyEntries, PLAN_REPORT_PATH, (message, fields) =>
        candidateFailures.plan("result-mismatch", message, fields),
      );
      const planReport = yield* Schema.decodeEffect(PlanningReportFromJson)(
        textDecoder.decode(planEntry.bytes),
        parseOptions,
      ).pipe(
        Effect.mapError(() =>
          candidateFailures.plan("result-mismatch", "collected planning report is invalid", {
            path: PLAN_REPORT_PATH,
          }),
        ),
      );
      const selectedPlanMatches =
        planReport._tag === "Selected" &&
        planReport.selectionId === ASSEMBLY_ID &&
        planReport.qualificationSelection === CLASSIFICATION_SELECTION &&
        planReport.objective.requirementAddress === REQUIREMENT &&
        planReport.objective.demands.length === 3 &&
        planReport.objective.demands[0]?.family === "runtime-model" &&
        planReport.objective.demands[0]?.value === "supervised-actor" &&
        planReport.objective.demands[1]?.family === "restart" &&
        planReport.objective.demands[1]?.value === "supervised-restart" &&
        planReport.objective.demands[2]?.family === "grant-restart" &&
        planReport.objective.demands[2]?.value === "invalidated-on-restart" &&
        planReport.plan.candidate.selectionId === QUALIFICATION_ID &&
        planReport.plan.candidate.target === "gleam-beam" &&
        planReport.plan.candidate.realization === "BookAppointmentOnce" &&
        planReport.plan.candidate.artifactId === EXPLANATION_ID &&
        planReport.plan.candidate.artifactFormat === "bangSemanticArtifact:1" &&
        planReport.plan.candidate.requirementAddress === REQUIREMENT &&
        planReport.plan.candidate.theory.id === "ExactOneCapabilityExecution" &&
        planReport.plan.candidate.theory.version === 1 &&
        planReport.plan.candidate.package.id === "ExactOneCapabilityExecution" &&
        planReport.plan.candidate.package.version === 1 &&
        planReport.plan.candidate.package.semanticDigest ===
          classification.evidence[1]?.package.semanticDigest;
      if (!selectedPlanMatches)
        return yield* Effect.fail(
          candidateFailures.plan("result-mismatch", "explicit objective did not select Gleam", {
            path: PLAN_REPORT_PATH,
          }),
        );
      const gleamEvidenceEntry = yield* entryAt(
        assemblyEntries,
        GLEAM_EVIDENCE_PATH,
        (message, fields) => candidateFailures.artifact("material-missing", message, fields),
      );
      const gleamEvidence = yield* Schema.decodeEffect(EvidenceFromJson)(
        textDecoder.decode(gleamEvidenceEntry.bytes),
        parseOptions,
      ).pipe(
        Effect.mapError(() =>
          candidateFailures.artifact("execution-failed", "Gleam evidence record is invalid", {
            path: GLEAM_EVIDENCE_PATH,
          }),
        ),
      );
      const qualifiedBoundary = gleamEvidence.materials.find(
        ({ role }) => role === "generated-gleam-boundary",
      );
      const gleamEvidenceSha256 = yield* digestM037AssemblyEvidence(gleamEvidenceEntry.bytes);
      const assemblyReportEntry = yield* entryAt(
        assemblyEntries,
        ASSEMBLY_REPORT_PATH,
        (message, fields) => candidateFailures.assemble("result-mismatch", message, fields),
      );
      const assemblyReport = yield* Schema.decodeEffect(AssemblyReportFromJson)(
        textDecoder.decode(assemblyReportEntry.bytes),
        parseOptions,
      ).pipe(
        Effect.mapError(() =>
          candidateFailures.assemble("result-mismatch", "collected assembly report is invalid", {
            path: ASSEMBLY_REPORT_PATH,
          }),
        ),
      );
      if (
        qualifiedBoundary === undefined ||
        assembly.report.id !== assemblyReport.id ||
        assemblyReport.selectedCandidate.target !== "gleam-beam" ||
        assemblyReport.selectedCandidate.realization !== "BookAppointmentOnce" ||
        assemblyReport.selectedCandidate.artifactId !== EXPLANATION_ID ||
        assemblyReport.selectedCandidate.artifactFormat !== "bangSemanticArtifact:1" ||
        assemblyReport.selectedCandidate.requirementAddress !== REQUIREMENT ||
        assemblyReport.qualification.selectionPath !== CLASSIFICATION_SELECTION ||
        assemblyReport.qualification.evidencePath !== GLEAM_EVIDENCE_PATH ||
        assemblyReport.qualification.evidenceSha256 !== gleamEvidenceSha256 ||
        assemblyReport.qualification.generatedBoundaryPath !== qualifiedBoundary.path ||
        assemblyReport.qualification.generatedBoundarySha256 !== qualifiedBoundary.sha256
      )
        return yield* Effect.fail(
          candidateFailures.assemble(
            "result-mismatch",
            "assembly report does not bind the selected Gleam qualification",
            { path: ASSEMBLY_REPORT_PATH },
          ),
        );
      yield* publishAtomically(runRoot, assemblyEntries).pipe(
        Effect.mapError((error) =>
          missionPlatformFailures.assemble(error.message, {
            path: projectMissionOwnedPath(runRoot, error.path, path),
            cause: publicationCause(error),
          }),
        ),
      );
      const artifactIsolation = yield* runArtifact(
        repositoryRoot,
        runRoot,
        runtime.environment.TMPDIR,
        assemblyEntries,
        gleamEvidence,
        preflight,
      );
      const audit = yield* runAudit(runRoot, ASSEMBLY_ID).pipe(
        Effect.mapError((error) =>
          producerFailures.audit(error.message, {
            path: projectMissionOwnedPath(runRoot, error.path, path),
            cause: auditCause(error),
          }),
        ),
      );
      const auditSummary = {
        assemblyId: audit.summary.assemblyId,
        materials: audit.summary.materials.map((material) =>
          material.recordedSha256 === undefined
            ? {
                path: material.path,
                role: material.role,
                class: material.class,
                actualSha256: material.actualSha256,
                citedBy: material.citedBy,
                status: material.status,
              }
            : material,
        ),
        retiredRecords: audit.summary.retiredRecords,
      };
      if (
        auditSummary.retiredRecords !== 0 ||
        auditSummary.materials.some(({ status }) => status === "changed" || status === "cosmetic")
      )
        return yield* Effect.fail(
          candidateFailures.audit(
            "result-mismatch",
            "clean audit found changed material or retired records",
            { path: ASSEMBLY_REPORT_PATH },
          ),
        );
      const schemaPublication = yield* generateSchemaPublication.pipe(
        Effect.mapError((error) =>
          error._tag === "BangSchemaPublicationFailure"
            ? producerFailures.schemaPublication(error.message, {
                path: projectMissionOwnedPath(runRoot, error.path, path),
                cause: schemaPublicationCause(error),
              })
            : M037_DIGEST_FAILURE_BUILDERS["schema-publication"](error.message, {
                cause: projectPlatformCause(error),
              }),
        ),
      );
      const schemaEntries = copyEntryBytes(schemaPublication.entries);
      const schemaCustody = yield* makeSchemaCustody(schemaEntries);
      yield* publishAtomically(runRoot, schemaEntries).pipe(
        Effect.mapError((error) =>
          missionPlatformFailures.schemaPublication(error.message, {
            path: projectMissionOwnedPath(runRoot, error.path, path),
            cause: publicationCause(error),
          }),
        ),
      );
      const effectEvidenceEntry = yield* entryAt(
        assemblyEntries,
        EFFECT_EVIDENCE_PATH,
        (message, fields) =>
          candidateFailures.externalConsumer("consumer-rejected", message, fields),
      );
      const effectEvidence = yield* Schema.decodeEffect(EvidenceFromJson)(
        textDecoder.decode(effectEvidenceEntry.bytes),
        parseOptions,
      ).pipe(
        Effect.mapError(() =>
          candidateFailures.externalConsumer(
            "consumer-rejected",
            "Effect evidence record is invalid",
            { path: EFFECT_EVIDENCE_PATH },
          ),
        ),
      );
      if (
        classification.evidence[1] === undefined ||
        encodeM031TargetQualificationEvidence(classification.evidence[0]) !==
          encodeM031TargetQualificationEvidence(effectEvidence) ||
        encodeM031TargetQualificationEvidence(classification.evidence[1]) !==
          encodeM031TargetQualificationEvidence(gleamEvidence)
      )
        return yield* Effect.fail(
          candidateFailures.classify(
            "result-mismatch",
            "classification evidence does not equal the standalone target records",
            { path: CLASSIFICATION_REPORT_PATH },
          ),
        );
      const externalConsumerIsolation = yield* runExternalConsumer(
        repositoryRoot,
        runRoot,
        runtime.environment.TMPDIR,
        schemaEntries,
        effectEvidence,
        preflight,
      );
      const allEntriesByPath = new Map(
        [...assemblyEntries, ...schemaEntries].map((entry) => [entry.path, entry] as const),
      );
      const entries = PRODUCER_PATHS.map((entryPath) => allEntriesByPath.get(entryPath)).filter(
        (entry): entry is PublicationEntry => entry !== undefined,
      );
      if (entries.length !== 21)
        return yield* Effect.fail(
          candidateFailures.comparison(
            "result-mismatch",
            "run did not produce the exact 21-file closure",
          ),
        );
      const inventory = yield* Effect.forEach(entries, (entry) =>
        digestM037ComparisonEntry(entry.bytes).pipe(
          Effect.map((sha256) => ({ path: entry.path, sha256 })),
        ),
      );
      const observations = [
        { result: directExplanation.result, entriesMatchAssembly: true },
        artifactIsolation,
        auditSummary,
        schemaCustody,
        externalConsumerIsolation,
      ] as const;
      return {
        entries,
        inventory,
        inventorySha256: yield* digestM037ComparisonInventory(inventory),
        observations,
        observationsSha256: yield* digestM037ComparisonObservations(observations),
      };
    }),
  );

const acquireWorktree = (
  root: string,
  worktreePath: string,
  revision: string,
  preflight: HostPreflight,
) =>
  requireSuccessfulProcess(
    preflight.tools.git,
    ["worktree", "add", "--detach", worktreePath, revision],
    {
      cwd: root,
      environment: preflight.childEnvironment,
      failure: (message, fields) =>
        candidateFailures.checkout("revision-unavailable", message, fields),
      command: "git worktree add --detach <worktree> <revision>",
      path: ".",
    },
  ).pipe(Effect.as(worktreePath));

const releaseWorktree = (root: string, worktreePath: string, preflight: HostPreflight) =>
  requireSuccessfulProcess(preflight.tools.git, ["worktree", "remove", "--force", worktreePath], {
    cwd: root,
    environment: preflight.childEnvironment,
    failure: (message, fields) => candidateFailures.checkout("cleanup-failed", message, fields),
    command: "git worktree remove --force <worktree>",
    path: ".",
  }).pipe(Effect.asVoid);

export const scanFiles = (
  root: string,
  relativeDirectory: string,
): Effect.Effect<ReadonlyArray<string>, M037CandidateFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absoluteDirectory = path.resolve(root, relativeDirectory);
    const exists = yield* fileSystem.exists(absoluteDirectory).pipe(
      Effect.mapError((error) =>
        candidateFailures.accumulation("report-invalid", "could not inspect owned directory", {
          path: relativeDirectory,
          cause: projectPlatformCause(error),
        }),
      ),
    );
    if (!exists) return [];
    const result: Array<string> = [];
    const visitedDirectories = new Set<string>();
    const visit = (
      relativePath: string,
    ): Effect.Effect<void, M037CandidateFailure, FileSystem.FileSystem | Path.Path> =>
      Effect.gen(function* () {
        const absolutePath = path.resolve(root, relativePath);
        if (yield* isSymbolicLink(absolutePath)) {
          if (relativePath === relativeDirectory)
            return yield* Effect.fail(
              candidateFailures.accumulation(
                "report-invalid",
                "owned directory must not be a symbolic link",
                { path: relativePath },
              ),
            );
          result.push(relativePath);
          return;
        }
        const info = yield* fileSystem.stat(absolutePath).pipe(
          Effect.mapError((error) =>
            candidateFailures.accumulation("report-invalid", "could not inspect owned member", {
              path: relativePath,
              cause: projectPlatformCause(error),
            }),
          ),
        );
        if (info.type !== "Directory") {
          result.push(relativePath);
          return;
        }
        const canonicalDirectory = yield* fileSystem
          .realPath(absolutePath)
          .pipe(
            Effect.mapError((error) =>
              candidateFailures.accumulation(
                "report-invalid",
                "could not resolve owned directory",
                { path: relativePath, cause: projectPlatformCause(error) },
              ),
            ),
          );
        if (!isPathWithin(root, canonicalDirectory))
          return yield* Effect.fail(
            candidateFailures.accumulation(
              "report-invalid",
              "owned directory resolves outside the repository root",
              { path: relativePath },
            ),
          );
        if (visitedDirectories.has(canonicalDirectory)) return;
        visitedDirectories.add(canonicalDirectory);
        const names = yield* fileSystem.readDirectory(absolutePath).pipe(
          Effect.mapError((error) =>
            candidateFailures.accumulation("report-invalid", "could not read owned directory", {
              path: relativePath,
              cause: projectPlatformCause(error),
            }),
          ),
        );
        yield* Effect.forEach(names.toSorted(), (name) => visit(path.join(relativePath, name)), {
          discard: true,
        });
      });
    yield* visit(relativeDirectory);
    return result.toSorted();
  });

export const validateM037PublicationPaths = (
  root: string,
  entries: ReadonlyArray<PublicationEntry>,
): Effect.Effect<void, M037CandidateFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const entry of entries) {
      const segments = entry.path.split("/");
      let current = root;
      for (const segment of segments) {
        current = path.join(current, segment);
        const exists = yield* fileSystem
          .exists(current)
          .pipe(
            Effect.mapError((error) =>
              candidateFailures.accumulation(
                "report-invalid",
                "could not inspect final publication path",
                { path: entry.path, cause: projectPlatformCause(error) },
              ),
            ),
          );
        if (!exists) break;
        if (yield* isSymbolicLink(current))
          return yield* Effect.fail(
            candidateFailures.accumulation(
              "report-invalid",
              "final publication path contains a symbolic link",
              { path: entry.path },
            ),
          );
      }
    }
  });

const embedded = <P extends string, V>(path: P, value: V, sha256: `sha256:${string}`) => ({
  path,
  sha256,
  value,
});

const SOURCE_CATALOG = [
  ["R01", THEORY_LOCK_PATH, "theory:ExactOneCapabilityExecution@1"],
  [
    "R02",
    EFFECT_EVIDENCE_PATH,
    "target:effect-typescript/BookAppointmentOnce",
    "effect-typescript",
    REQUIREMENT,
  ],
  ["R03", GLEAM_EVIDENCE_PATH, "target:gleam-beam/BookAppointmentOnce", "gleam-beam", REQUIREMENT],
  [
    "R04",
    CLASSIFICATION_REPORT_PATH,
    "qualification:clinic-two-qualified-exact-one",
    undefined,
    REQUIREMENT,
  ],
  [
    "R05",
    PLAN_REPORT_PATH,
    "plan:clinic-supervised-exact-one/gleam-beam",
    "gleam-beam",
    REQUIREMENT,
  ],
  [
    "R06",
    ASSEMBLY_REPORT_PATH,
    "assembly:clinic-supervised-exact-one/gleam-beam",
    "gleam-beam",
    REQUIREMENT,
  ],
  ["R07", SCHEMA_MANIFEST_PATH, "schema-publication:2"],
  ["E01", "embedded/input-resolution.json", "observation:input-resolution", undefined, REQUIREMENT],
  [
    "E02",
    "embedded/artifact-isolation.json",
    "observation:artifact-isolation",
    "gleam-beam",
    REQUIREMENT,
  ],
  ["E03", "embedded/audit.json", "observation:audit", "gleam-beam", REQUIREMENT],
  ["E04", "embedded/schema-custody.json", "observation:schema-custody"],
  [
    "E05",
    "embedded/external-consumer-isolation.json",
    "observation:external-consumer-isolation",
    "effect-typescript",
    REQUIREMENT,
  ],
  [
    "E06",
    "embedded/producer-inventory-comparison.json",
    "observation:producer-inventory-comparison",
  ],
  [
    "E07",
    "embedded/theory-applicability.json",
    "observation:theory-applicability",
    undefined,
    REQUIREMENT,
  ],
  ["E08", "embedded/public-host-preflight.json", "observation:public-host-preflight"],
] as const;

const WARRANTED_CLAIMS = [
  [
    "C01",
    "one supported public host ran one command and resolved the committed Clinic input chain",
    ["E08", "E01"],
  ],
  ["C02", "the current exact-one theory remained applicable", ["E07"]],
  ["C03", "two fresh targets qualified from separate bounded evidence", ["R04", "R02", "R03"]],
  ["C04", "the explicit supervised objective selected Gleam", ["R05", "R03"]],
  ["C05", "assembly retained the selected qualified bytes", ["R03", "R06"]],
  [
    "C06",
    "one copied escript ran from the artifact-only working directory with the Erlang-only `PATH`",
    ["R06", "E02"],
  ],
  ["C07", "one clean audit found no changed material or retired record", ["R06", "E03"]],
  ["C08", "schema major 2 produced six files with exact bounded custody", ["R07", "E04"]],
  ["C09", "one isolated external process returned the strict valid verdict", ["R02", "E05"]],
  [
    "C10",
    "one report linked every current source without copying its evidence grades",
    SOURCE_CATALOG.map(([id]) => id),
  ],
  [
    "C11",
    "two clean runs produced equal 21-file producer inventories and five-record observation projections",
    ["E06"],
  ],
] as const;

const UNSUPPORTED_CLAIMS = [
  "The Clinic domain was authored independently from compiler implementation knowledge.",
  "Core specifies the decrement `available := available - count`.",
  "The candidate proves clinical booking correctness.",
  "Clinic composes a refinement, an algebraic law suite, a bounded channel trace, and a solver or kernel provider.",
  "Exact-one execution is durable or distributed.",
  "Delivery is fair, live, productive, or recoverable.",
  "The external consumer proves implementation conformance or evidence truth.",
  "The six-family scorecard proves universal semantic unification.",
  "The candidate generalizes to an unseen domain, target, provider, or realization shape.",
  "The candidate is production-ready, secure, fast, deployable, or operationally suitable.",
  "The final publication provides concurrent-reader isolation across all paths.",
  "The final publication is one physical filesystem transaction.",
  "Rollback cannot fail or always restores every prior byte.",
  "Unlisted stale members are absent, removed, or part of the enumerated closure.",
  "The final replacement survives process termination at every instruction boundary.",
  "Artifact execution provides filesystem sandboxing or denies absolute host paths.",
] as const;

const historicalCitations = (missions: ReadonlyArray<string>) =>
  missions.map((mission) => ({
    mission,
    label: "historical-mission-observation-citation" as const,
  }));
const makeClaimsAndScorecard = (
  sourceById: ReadonlyMap<string, typeof M037ClaimSourceReferenceSchema.Type>,
) => {
  const refs = (ids: ReadonlyArray<string>) =>
    ids
      .map((id) => sourceById.get(id))
      .filter((value): value is typeof M037ClaimSourceReferenceSchema.Type => value !== undefined);
  const claims = [
    ...WARRANTED_CLAIMS.map(([id, claim, sourceIds]) => ({
      id,
      claim,
      disposition: "warranted" as const,
      sourceReferences: refs(sourceIds),
    })),
    ...UNSUPPORTED_CLAIMS.map((claim, index) => ({
      id: `C${String(index + 12).padStart(2, "0")}`,
      claim,
      disposition: "unsupported" as const,
      sourceReferences: [],
    })),
  ];
  const scorecard = [
    {
      family: "refined-data-algebra" as const,
      scoreLabel: "historical-mission-observation-citation" as const,
      historicalCitations: historicalCitations(["M001", "M002", "M003"]),
      currentSourceReferences: [],
      currentObservation: null,
      limit: "Clinic has no refinement or algebraic law declaration",
    },
    {
      family: "state-and-coeffects" as const,
      scoreLabel: "current-digest-bound-evidence-with-historical-citations" as const,
      historicalCitations: historicalCitations(["M004", "M015", "M036"]),
      currentSourceReferences: refs(["R03", "R06", "E02", "E03"]),
      currentObservation: "checked Clinic state, requirements, invariant, artifact, and audit",
      limit: "no Core state-update law",
    },
    {
      family: "capability-and-quantity" as const,
      scoreLabel: "current-digest-bound-evidence-with-historical-citations" as const,
      historicalCitations: historicalCitations(["M006", "M018", "M030", "M036"]),
      currentSourceReferences: refs(["R04", "R02", "R03"]),
      currentObservation: "two current Qualified dispositions and their separate target evidence",
      limit: "no durable or distributed quantity claim",
    },
    {
      family: "actor-and-channel-behavior" as const,
      scoreLabel: "current-digest-bound-evidence-with-historical-citations" as const,
      historicalCitations: historicalCitations(["M017", "M024", "M036"]),
      currentSourceReferences: refs(["R03", "R06", "E02"]),
      currentObservation: "selected supervised Gleam artifact and restart profile",
      limit: "Clinic has no M024 channel input",
    },
    {
      family: "laws-and-providers" as const,
      scoreLabel: "current-digest-bound-evidence-with-historical-citations" as const,
      historicalCitations: historicalCitations(["M005", "M011", "M016", "M030"]),
      currentSourceReferences: refs(["R01", "E07"]),
      currentObservation: "current package custody and Applicable theory result",
      limit: "no Clinic solver or kernel-provider run",
    },
    {
      family: "graded-evidence" as const,
      scoreLabel: "current-digest-bound-evidence-with-historical-citations" as const,
      historicalCitations: historicalCitations([
        "M007",
        "M010",
        "M012",
        "M031",
        "M032",
        "M033",
        "M034",
        "M035",
        "M036",
      ]),
      currentSourceReferences: refs([
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "E03",
        "E04",
        "E05",
        "E06",
        "E07",
        "E08",
      ]),
      currentObservation: "current records, host preflight, audit, custody, and comparison",
      limit: "no evidence-grade upgrade",
    },
  ];
  return { claims, scorecard };
};

export const validateM037UnsupportedClaims = (
  claims: ReadonlyArray<typeof M037ClaimDispositionSchema.Type>,
): Effect.Effect<void, M037CandidateFailure> => {
  const upgraded = claims
    .slice(WARRANTED_CLAIMS.length)
    .find(
      ({ disposition, sourceReferences }) =>
        disposition !== "unsupported" || sourceReferences.length !== 0,
    );
  return upgraded === undefined
    ? Effect.void
    : Effect.fail(
        candidateFailures.accumulation(
          "unsupported-claim-upgraded",
          `unsupported claim ${upgraded.id} was upgraded without authority`,
        ),
      );
};

type M037ComparableRun = Pick<
  RunResult,
  "inventory" | "inventorySha256" | "observations" | "observationsSha256"
>;

export const validateM037RunComparison = (
  first: M037ComparableRun,
  second: M037ComparableRun,
): Effect.Effect<typeof ProducerInventoryComparisonValueSchema.Type, M037CandidateFailure> => {
  const firstDifferingIndex = first.inventory.findIndex(
    (entry, index) =>
      second.inventory[index]?.path !== entry.path ||
      second.inventory[index]?.sha256 !== entry.sha256,
  );
  if (first.inventory.length !== second.inventory.length || firstDifferingIndex < 0) {
    if (
      first.inventory.length !== second.inventory.length ||
      first.inventorySha256 !== second.inventorySha256
    )
      return Effect.fail(
        candidateFailures.comparison(
          "result-mismatch",
          "clean producer inventory structure differs",
        ),
      );
  } else {
    const firstEntry = first.inventory[firstDifferingIndex];
    const secondEntry = second.inventory[firstDifferingIndex];
    if (
      firstEntry === undefined ||
      secondEntry === undefined ||
      firstEntry.path !== secondEntry.path
    )
      return Effect.fail(
        candidateFailures.comparison("result-mismatch", "clean producer inventory paths differ"),
      );
    return Effect.fail(
      producerInventoryDivergedFailure(
        "clean producer inventories differ",
        firstEntry.path,
        firstEntry.sha256,
        secondEntry.sha256,
      ),
    );
  }
  if (
    encodeCanonicalJson(first.observations) !== encodeCanonicalJson(second.observations) ||
    first.observationsSha256 !== second.observationsSha256
  )
    return Effect.fail(
      candidateFailures.comparison("result-mismatch", "clean observation projections differ"),
    );
  return Effect.succeed({
    filesPerRun: 21,
    firstInventorySha256: first.inventorySha256,
    secondInventorySha256: second.inventorySha256,
    result: "equal",
    observationRecordsPerRun: 5,
    firstObservationsSha256: first.observationsSha256,
    secondObservationsSha256: second.observationsSha256,
    observationsResult: "equal",
  });
};

const makeReport = (
  revision: string,
  dependencyLockSha256: `sha256:${string}`,
  inputs: ReadonlyArray<typeof InputEntrySchema.Type>,
  preflight: HostPreflight,
  first: RunResult,
  second: RunResult,
  staleMembers: ReadonlyArray<string>,
): Effect.Effect<M037FullCompilerCandidateReport, M037CandidateFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const comparisonValue = yield* validateM037RunComparison(first, second);
    const inputResolutionValue = { referencesAgree: true as const, inputs };
    const embeddedRecords = {
      publicHostPreflight: embedded(
        "embedded/public-host-preflight.json" as const,
        preflight.value,
        yield* digestM037AccumulationRecord(preflight.value),
      ),
      inputResolution: embedded(
        "embedded/input-resolution.json" as const,
        inputResolutionValue,
        yield* digestM037AccumulationRecord(inputResolutionValue),
      ),
      theoryApplicability: embedded(
        "embedded/theory-applicability.json" as const,
        first.observations[0],
        yield* digestM037AccumulationRecord(first.observations[0]),
      ),
      artifactIsolation: embedded(
        "embedded/artifact-isolation.json" as const,
        first.observations[1],
        yield* digestM037AccumulationRecord(first.observations[1]),
      ),
      audit: embedded(
        "embedded/audit.json" as const,
        first.observations[2],
        yield* digestM037AccumulationRecord(first.observations[2]),
      ),
      schemaCustody: embedded(
        "embedded/schema-custody.json" as const,
        first.observations[3],
        yield* digestM037AccumulationRecord(first.observations[3]),
      ),
      externalConsumerIsolation: embedded(
        "embedded/external-consumer-isolation.json" as const,
        first.observations[4],
        yield* digestM037AccumulationRecord(first.observations[4]),
      ),
      producerInventoryComparison: embedded(
        "embedded/producer-inventory-comparison.json" as const,
        comparisonValue,
        yield* digestM037AccumulationRecord(comparisonValue),
      ),
    };
    const producerDigest = new Map<string, `sha256:${string}`>(
      first.inventory.map(({ path, sha256 }) => [path, sha256]),
    );
    const embeddedDigest = new Map<string, `sha256:${string}`>(
      Object.values(embeddedRecords).map(({ path, sha256 }) => [path, sha256]),
    );
    const sourceById = new Map<string, typeof M037ClaimSourceReferenceSchema.Type>();
    for (const [id, path, selector, target, obligation] of SOURCE_CATALOG) {
      const sha256 = id.startsWith("R") ? producerDigest.get(path) : embeddedDigest.get(path);
      if (sha256 === undefined)
        return yield* Effect.fail(
          candidateFailures.accumulation(
            "source-reference-invalid",
            `source reference ${id} has no digest`,
            { path },
          ),
        );
      sourceById.set(id, {
        path,
        sha256,
        selector,
        ...(target === undefined ? {} : { target }),
        ...(obligation === undefined ? {} : { obligation }),
      });
    }
    const { claims, scorecard } = makeClaimsAndScorecard(sourceById);
    yield* validateM037UnsupportedClaims(claims);
    if (
      claims.length !== 27 ||
      claims.some(
        ({ sourceReferences }, index) =>
          index < 11 && sourceReferences.length !== WARRANTED_CLAIMS[index]?.[2].length,
      )
    )
      return yield* Effect.fail(
        candidateFailures.accumulation(
          "source-reference-invalid",
          "claim source references are incomplete",
        ),
      );
    const manifestSha256 = first.observations[3].manifestSha256;
    const stages = [
      { stage: "selection" as const, result: "passed" as const },
      { stage: "preflight" as const, result: "passed" as const },
      ...RUN_STAGES.map((stage) => ({ stage, run: 1 as const, result: "passed" as const })),
      ...RUN_STAGES.map((stage) => ({ stage, run: 2 as const, result: "passed" as const })),
      { stage: "comparison" as const, result: "passed" as const },
      { stage: "accumulation" as const, result: "passed" as const },
    ];
    const reportValue = {
      bangFullCompilerCandidate: 1 as const,
      id: CANDIDATE_ID,
      revision,
      dependencyLock: { path: DEPENDENCY_LOCK, sha256: dependencyLockSha256 },
      command: CANDIDATE_COMMAND,
      executionPlatform: "x86_64-linux" as const,
      inputs,
      stages,
      producerInventory: first.inventory,
      embeddedRecords,
      schemaPublication: {
        version: 2 as const,
        files: 6 as const,
        manifestSha256,
        manifestDigestedPayloads: 4 as const,
        inventoryDigestedFiles: 6 as const,
        declarationIsManifestDigested: false as const,
        manifestIsSelfDigested: false as const,
      },
      publicationPlan: {
        helper: "publishAtomically" as const,
        enumeratedFiles: 22 as const,
        concurrentReaderIsolation: false as const,
        staleMembers,
      },
      scorecard,
      claims,
      cleanRun: {
        runs: 2 as const,
        producerFilesPerRun: 21 as const,
        firstInventorySha256: first.inventorySha256,
        secondInventorySha256: second.inventorySha256,
        result: "equal" as const,
      },
      outputInventory: [
        ...first.inventory,
        { path: REPORT_PATH, sha256: null, digestDisposition: "self-digest-not-recorded" as const },
      ],
    };
    return yield* Schema.decodeEffect(M037FullCompilerCandidateReportSchema)(
      reportValue,
      parseOptions,
    ).pipe(
      Effect.mapError(() =>
        candidateFailures.accumulation("report-invalid", "accumulated M037 report is invalid", {
          path: REPORT_PATH,
        }),
      ),
    );
  });

const validateM037ReportDigests = (
  report: M037FullCompilerCandidateReport,
  digestCanonical: M037CanonicalDigest,
): Effect.Effect<void, M037CandidateFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    for (const record of Object.values(report.embeddedRecords)) {
      if ((yield* digestCanonical(record.value)) !== record.sha256)
        return yield* Effect.fail(
          candidateFailures.decode("report-invalid", "embedded record digest is invalid", {
            path: record.path,
          }),
        );
    }
    const producerByPath = new Map<string, string>(
      report.producerInventory.map(({ path, sha256 }) => [path, sha256]),
    );
    const embeddedByPath = new Map<string, string>(
      Object.values(report.embeddedRecords).map(({ path, sha256 }) => [path, sha256]),
    );
    for (const claim of report.claims) {
      for (const reference of claim.sourceReferences) {
        const expected = reference.path.startsWith("embedded/")
          ? embeddedByPath.get(reference.path)
          : producerByPath.get(reference.path);
        if (expected !== reference.sha256)
          return yield* Effect.fail(
            candidateFailures.decode(
              "report-invalid",
              "claim source digest disagrees with its authority",
              { path: reference.path },
            ),
          );
      }
    }
    const inventorySha256 = yield* digestCanonical(report.producerInventory);
    const observationSha256 = yield* digestCanonical([
      report.embeddedRecords.theoryApplicability.value,
      report.embeddedRecords.artifactIsolation.value,
      report.embeddedRecords.audit.value,
      report.embeddedRecords.schemaCustody.value,
      report.embeddedRecords.externalConsumerIsolation.value,
    ]);
    const comparison = report.embeddedRecords.producerInventoryComparison.value;
    if (
      report.cleanRun.firstInventorySha256 !== inventorySha256 ||
      report.cleanRun.secondInventorySha256 !== inventorySha256 ||
      comparison.firstInventorySha256 !== inventorySha256 ||
      comparison.secondInventorySha256 !== inventorySha256 ||
      comparison.firstObservationsSha256 !== observationSha256 ||
      comparison.secondObservationsSha256 !== observationSha256
    )
      return yield* Effect.fail(
        candidateFailures.decode(
          "report-invalid",
          "clean-run inventory or observation digest is invalid",
          { path: REPORT_PATH },
        ),
      );
  });

export const decodeM037ReportDigests = (
  report: M037FullCompilerCandidateReport,
): Effect.Effect<void, M037CandidateFailure, Crypto.Crypto> =>
  validateM037ReportDigests(report, digestM037DecodeRecord);

const validateM037ReportSources = (
  root: string,
  report: M037FullCompilerCandidateReport,
): Effect.Effect<void, M037CandidateFailure, FileSystem.FileSystem | Path.Path | Crypto.Crypto> =>
  Effect.gen(function* () {
    const dependencyLockPath = yield* resolveContainedExistingPath(
      root,
      DEPENDENCY_LOCK,
      decodeReportFailure,
      decodeReportFailure,
      true,
    );
    const dependencyLockBytes = yield* readBytes(
      dependencyLockPath,
      DEPENDENCY_LOCK,
      decodeReportFailure,
    );
    const dependencyLockSha256 = yield* digestM037DecodeSourceBytes(dependencyLockBytes);
    if (dependencyLockSha256 !== report.dependencyLock.sha256)
      return yield* Effect.fail(
        decodeReportFailure("live dependency lock digest differs from report", {
          path: DEPENDENCY_LOCK,
        }),
      );

    for (const [index, { path: inputPath }] of INPUT_PATHS.entries()) {
      const resolvedInputPath = yield* resolveContainedExistingPath(
        root,
        inputPath,
        decodeReportFailure,
        decodeReportFailure,
        true,
      );
      const bytes = yield* readBytes(resolvedInputPath, inputPath, decodeReportFailure);
      const digest = yield* digestM037DecodeSourceBytes(bytes);
      if (digest !== report.inputs[index]!.sha256)
        return yield* Effect.fail(
          decodeReportFailure("live input digest differs from report", { path: inputPath }),
        );
    }

    let gleamEvidenceBytes: Uint8Array | undefined;
    let semanticArtifactBytes: Uint8Array | undefined;
    for (const [index, producerPath] of PRODUCER_PATHS.entries()) {
      const resolvedProducerPath = yield* resolveContainedExistingPath(
        root,
        producerPath,
        decodeReportFailure,
        decodeReportFailure,
        true,
      );
      const bytes = yield* readBytes(resolvedProducerPath, producerPath, decodeReportFailure);
      const digest = yield* digestM037DecodeSourceBytes(bytes);
      if (digest !== report.producerInventory[index]!.sha256)
        return yield* Effect.fail(
          decodeReportFailure("live producer digest differs from report", {
            path: producerPath,
          }),
        );
      if (producerPath === GLEAM_EVIDENCE_PATH) gleamEvidenceBytes = bytes;
      if (producerPath === SEMANTIC_ARTIFACT_PATH) semanticArtifactBytes = bytes;
    }

    if (gleamEvidenceBytes === undefined)
      return yield* Effect.fail(
        decodeReportFailure("live Gleam evidence producer is absent", {
          path: GLEAM_EVIDENCE_PATH,
        }),
      );
    const gleamEvidence = yield* Schema.decodeEffect(EvidenceFromJson)(
      textDecoder.decode(gleamEvidenceBytes),
      parseOptions,
    ).pipe(
      Effect.mapError(() =>
        decodeReportFailure("live Gleam evidence producer is invalid", {
          path: GLEAM_EVIDENCE_PATH,
        }),
      ),
    );
    if (
      encodeCanonicalJson(gleamEvidence.observations) !==
      encodeCanonicalJson(report.embeddedRecords.artifactIsolation.value.observation)
    )
      return yield* Effect.fail(
        decodeReportFailure("embedded artifact observation differs from live Gleam evidence", {
          path: "embedded/artifact-isolation.json",
        }),
      );

    if (semanticArtifactBytes === undefined)
      return yield* Effect.fail(
        decodeReportFailure("live semantic artifact producer is absent", {
          path: SEMANTIC_ARTIFACT_PATH,
        }),
      );
    const applicability = yield* consumeExactOneCapabilityExecution(
      textDecoder.decode(semanticArtifactBytes),
      REQUIREMENT,
    ).pipe(
      Effect.mapError(() =>
        decodeReportFailure("live semantic artifact producer is invalid", {
          path: SEMANTIC_ARTIFACT_PATH,
        }),
      ),
    );
    if (
      encodeCanonicalJson(applicability) !==
      encodeCanonicalJson(report.embeddedRecords.theoryApplicability.value.result)
    )
      return yield* Effect.fail(
        decodeReportFailure("embedded theory applicability differs from live semantic artifact", {
          path: "embedded/theory-applicability.json",
        }),
      );
  });

const decodeReportMode = (
  root: string,
  reportPath: string,
): Effect.Effect<string, M037CandidateFailure, FileSystem.FileSystem | Path.Path | Crypto.Crypto> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const canonicalRoot = yield* fileSystem.realPath(root).pipe(
      Effect.mapError((error) =>
        decodeReportFailure("could not resolve repository root", {
          cause: projectPlatformCause(error),
        }),
      ),
    );
    if (reportPath !== REPORT_PATH) {
      const repositoryRelative = isRepositoryRelativePath(reportPath);
      return yield* Effect.fail(
        decodeReportFailure(
          repositoryRelative
            ? "report path is not the public M037 report"
            : "report path must be repository-relative",
          repositoryRelative ? { path: reportPath } : undefined,
        ),
      );
    }
    const resolvedReportPath = yield* resolveContainedExistingPath(
      canonicalRoot,
      reportPath,
      decodeReportFailure,
      decodeReportFailure,
      true,
    );
    const encoded = yield* readText(resolvedReportPath, reportPath, decodeReportFailure);
    const report = yield* Schema.decodeEffect(M037FullCompilerCandidateReportFromJson)(
      encoded,
      parseOptions,
    ).pipe(
      Effect.mapError(() =>
        candidateFailures.decode("report-invalid", "strict report decoder rejected the document", {
          path: reportPath,
        }),
      ),
    );
    yield* decodeM037ReportDigests(report);
    yield* validateM037ReportSources(canonicalRoot, report);
    return `${reportPath}: valid`;
  });

export const publishM037Entries = (
  root: string,
  entries: ReadonlyArray<PublicationEntry>,
): Effect.Effect<void, M037CandidateFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* publishAtomically(root, entries).pipe(
      Effect.mapError((error) => {
        const cause = publicationCause(error);
        const projectedPath = projectMissionOwnedPath(root, error.path, path);
        return cause.reason === "rollback-failed"
          ? publicationFailures.rollback(error.message, {
              path: projectedPath,
              cause,
            })
          : publicationFailures.publication(error.message, {
              path: projectedPath,
              cause,
            });
      }),
    );
  });

const candidateProgram = (
  runtime: RuntimeBoundary,
  selectionPath: string,
): Effect.Effect<
  string,
  M037CandidateFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fileSystem = yield* FileSystem.FileSystem;
      const root = yield* fileSystem.realPath(path.resolve(runtime.scriptDirectory, "..")).pipe(
        Effect.mapError((error) =>
          selectionUnsafeFailure("could not resolve repository root", {
            cause: projectPlatformCause(error),
          }),
        ),
      );
      const decoded = yield* decodeSelection(root, selectionPath);
      const ambientPath = runtime.environment.PATH ?? "";
      const initialGit = yield* resolveExecutable("git", ambientPath, (message, fields) =>
        candidateFailures.preflight("git-worktree-unavailable", message, fields),
      );
      const caller = yield* inspectM037Checkout(root, initialGit, runtime.environment);
      const temporaryParent = yield* makeExternalTempDirectory(
        [root],
        runtime.environment.TMPDIR,
        "bang-m037-candidate-",
        (message, fields) =>
          candidateFailures.preflight("git-worktree-unavailable", message, fields),
      );
      const preflight = yield* preflightHost(
        root,
        runtime,
        path.join(temporaryParent, "preflight"),
      );
      const firstPath = path.join(temporaryParent, "run-1");
      const secondPath = path.join(temporaryParent, "run-2");
      const [first, second] = yield* Effect.acquireUseRelease(
        acquireWorktree(root, firstPath, caller.revision, preflight),
        () =>
          Effect.acquireUseRelease(
            acquireWorktree(root, secondPath, caller.revision, preflight),
            () =>
              Effect.gen(function* () {
                const run1 = yield* compileRun(
                  root,
                  firstPath,
                  runtime,
                  caller.revision,
                  caller.dependencyLockSha256,
                  decoded.inputs,
                  preflight,
                );
                const run2 = yield* compileRun(
                  root,
                  secondPath,
                  runtime,
                  caller.revision,
                  caller.dependencyLockSha256,
                  decoded.inputs,
                  preflight,
                );
                return [run1, run2] as const;
              }),
            () => releaseWorktree(root, secondPath, preflight),
          ),
        () => releaseWorktree(root, firstPath, preflight),
      );
      const expected = new Set(PRODUCER_PATHS);
      const ownedFiles = yield* Effect.forEach(OWNED_DIRECTORIES, (directory) =>
        scanFiles(root, directory),
      ).pipe(Effect.map((groups) => groups.flat().toSorted()));
      const staleMembers = ownedFiles.filter(
        (member) => !expected.has(member as (typeof PRODUCER_PATHS)[number]),
      );
      const report = yield* makeReport(
        caller.revision,
        caller.dependencyLockSha256,
        decoded.inputs,
        preflight,
        first,
        second,
        staleMembers,
      );
      yield* validateM037ReportDigests(report, digestM037AccumulationRecord).pipe(
        Effect.mapError((error) =>
          error.reason === "digest-failed"
            ? error
            : candidateFailures.accumulation("report-invalid", error.message, {
                ...(error.path === undefined ? {} : { path: error.path }),
                ...(error.command === undefined ? {} : { command: error.command }),
              }),
        ),
      );
      const reportBytes = textEncoder.encode(`${encodeCanonicalJson(report)}\n`);
      const reloaded = yield* Schema.decodeEffect(M037FullCompilerCandidateReportFromJson)(
        textDecoder.decode(reportBytes),
        parseOptions,
      ).pipe(
        Effect.mapError((error) =>
          candidateFailures.accumulation(
            "report-invalid",
            `canonical report bytes failed strict reload: ${String(error)}`,
            { path: REPORT_PATH },
          ),
        ),
      );
      yield* validateM037ReportDigests(reloaded, digestM037AccumulationRecord).pipe(
        Effect.mapError((error) =>
          error.reason === "digest-failed"
            ? error
            : candidateFailures.accumulation("report-invalid", error.message, {
                ...(error.path === undefined ? {} : { path: error.path }),
                ...(error.command === undefined ? {} : { command: error.command }),
              }),
        ),
      );
      const finalEntries = [...first.entries, { path: REPORT_PATH, bytes: reportBytes }];
      if (finalEntries.length !== 22)
        return yield* Effect.fail(
          candidateFailures.accumulation(
            "report-invalid",
            "final publication is not the exact 22-file batch",
          ),
        );
      yield* validateM037PublicationPaths(root, finalEntries);
      yield* publishM037Entries(root, finalEntries);
      return REPORT_PATH;
    }),
  );

const runtimeBoundary = (): RuntimeBoundary => ({
  platform: process.platform,
  architecture: process.arch,
  bunVersion: Bun.version,
  executablePath: process.execPath,
  environment: Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ),
  scriptDirectory: import.meta.dir,
});
export interface M037FailureProcessProjection {
  readonly exitCode: 1;
  readonly stdout: "";
  readonly stderr: string;
}

export const projectM037FailureProcess = (
  failure: M037CandidateFailure,
): Effect.Effect<M037FailureProcessProjection, Schema.SchemaError> =>
  Schema.decodeEffect(M037CandidateFailureSchema)(failure, parseOptions).pipe(
    Effect.map((decoded) => ({
      exitCode: 1 as const,
      stdout: "" as const,
      stderr: `${encodeCanonicalJson(decoded)}\n`,
    })),
  );

const runMain = async (): Promise<void> => {
  const runtime = runtimeBoundary();
  const args = process.argv.slice(2);
  const program =
    args[0] === "--decode" && args.length === 2
      ? decodeReportMode(runtime.scriptDirectory.replace(/\/scripts$/u, ""), args[1]!)
      : args.length === 1
        ? candidateProgram(runtime, args[0]!)
        : Effect.fail(
            candidateFailures.selection(
              "invalid-selection",
              "expected one selection path or --decode followed by one report path",
            ),
          );
  const result = await Effect.runPromise(
    Effect.match(program, {
      onFailure: (failure) => ({ _tag: "Failure" as const, failure }),
      onSuccess: (value) => ({ _tag: "Success" as const, value }),
    }).pipe(
      // The direct script is the sole composition root for Bun platform services.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(BunServices.layer),
    ),
  );
  if (result._tag === "Failure") {
    const failure = await Effect.runPromise(projectM037FailureProcess(result.failure));
    process.stdout.write(failure.stdout);
    process.stderr.write(failure.stderr);
    process.exitCode = failure.exitCode;
    return;
  }
  process.stdout.write(`${result.value}\n`);
};

if (import.meta.main) await runMain();
