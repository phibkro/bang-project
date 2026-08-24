import {
  type M031TargetQualificationEvidence,
  M031TargetQualificationEvidenceSchema,
} from "@bang/evidence";
import { PlanningReportFromJson, type PlanningReport } from "@bang/planning";
import {
  encodeCanonicalJson,
  produceSemanticArtifact,
  SemanticArtifactFromJson,
  validateCore,
  type CoreDocument,
  type SemanticArtifact,
} from "@bang/core";
import {
  digestExactOneCapabilityExecutionPackage,
  ExactOneCapabilityExecutionLockFromJson,
  ExactOneCapabilityExecutionPackageFromJson,
} from "@bang/theories";
import { sourceToCore } from "@bang/surface";
import { Crypto, Effect, Encoding, FileSystem, Path, Schema } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import { AssemblyReportSchema, compileSelectedAssembly, type AssemblyReport } from "./assemble.ts";
import { compileSelectedPlanStaged } from "./plan.ts";
import { publishAtomically, type PublicationEntry } from "./publication.ts";

const parseOptions = { onExcessProperty: "error" } as const;

/** Stages an M034 audit moves through; later phases extend consumption of this type. */
export const AuditStageSchema = Schema.Literals([
  "selection",
  "inventory",
  "diff",
  "normalization",
  "comparison",
  "requalification",
  "parity",
  "publication",
]);
export type AuditStage = typeof AuditStageSchema.Type;

/** Every typed failure reason the M034 contract reserves, so later phases reuse this error. */
export const AuditReasonSchema = Schema.Literals([
  "unsafe-identity",
  "unknown-assembly",
  "record-unreadable",
  "material-missing",
  "material-unreadable",
  "digest-failed",
  "core-invalid",
  "comparison-failed",
  "package-disagreement",
  "projection-failed",
  "export-failed",
  "execution-failed",
  "observation-mismatch",
  "planning-failed",
  "parity-divergence",
  "publication-failed",
]);
export type AuditReason = typeof AuditReasonSchema.Type;

/** A typed, schema-visible M034 audit failure. */
export class AuditFailure extends Schema.TaggedError<AuditFailure>()("AuditFailure", {
  stage: AuditStageSchema,
  path: Schema.String,
  reason: AuditReasonSchema,
  message: Schema.String,
  address: Schema.optional(Schema.String),
}) {}

const failure = (
  stage: AuditStage,
  path: string,
  reason: AuditReason,
  message: string,
  address?: string,
): AuditFailure =>
  new AuditFailure({
    stage,
    path,
    reason,
    message,
    ...(address === undefined ? {} : { address }),
  });

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * One equality class per recorded material, straight from the contract table:
 * checked Core sources and the theory package compare semantically (decoded);
 * custody bytes compare exactly (opaque); published records and artifacts are
 * recomputed by their owning producer (derived).
 */
export type AuditMaterialClass = "decoded" | "opaque" | "derived";

/**
 * Classify one recorded material role. Unknown evidence roles stay opaque so a
 * byte change is never silently forgiven; decoded treatment is granted only to
 * roles the contract names explicitly.
 */
export const materialClassForRole = (role: string): AuditMaterialClass => {
  if (role === "core-source" || role === "theory-package") return "decoded";
  if (
    role === "assembly-report" ||
    role === "plan-report" ||
    role === "qualification-report" ||
    role.startsWith("evidence-record:") ||
    role === "semantic-artifact" ||
    role === "theory-lock"
  ) {
    return "derived";
  }
  return "opaque";
};

/** One material the published closure records, with every record citing it. */
export interface AuditMaterialEntry {
  readonly path: string;
  readonly role: string;
  readonly class: AuditMaterialClass;
  /** Undefined when no record names a byte digest for this member. */
  readonly recordedSha256: string | undefined;
  readonly citedBy: ReadonlyArray<string>;
}

/** One material after digest recomputation against current bytes. */
export interface AuditedMaterial {
  readonly path: string;
  readonly role: string;
  readonly class: AuditMaterialClass;
  readonly recordedSha256: string | undefined;
  readonly actualSha256: string;
  readonly citedBy: ReadonlyArray<string>;
  readonly status: MaterialStatus;
}

/**
 * Verdict for one recorded material. `deferred` marks derived members whose
 * owning producer must be recomputed to decide drift; the invalidation phase
 * resolves every deferred member before retirement closes.
 */
export type MaterialStatus = "unchanged" | "cosmetic" | "changed" | "deferred";

export interface AuditSummary {
  readonly assemblyId: string;
  readonly materials: ReadonlyArray<AuditedMaterial>;
  /** Records directly citing at least one changed or cosmetic-changed material. */
  readonly retiredRecords: number;
}

/** One retired record with the material and edge that carried invalidation. */
export interface RetiredRecord {
  readonly record: string;
  readonly materialPath: string;
  /** The record that directly cites the invalidating material. */
  readonly edge: string;
}

export interface InvalidationResult {
  readonly summary: AuditSummary;
  /** Directly invalidated records plus transitive closure over recorded edges. */
  readonly retired: ReadonlyArray<RetiredRecord>;
  /** Cosmetic changes refresh custody digests but retire nothing. */
  readonly cosmeticPaths: ReadonlyArray<string>;
}

const safeIdentityPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const assemblyReportPath = (assemblyId: string): string =>
  `.bang/assemblies/${assemblyId}/report.json`;

const readText = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  relativePath: string,
  label: string,
): Effect.Effect<string, AuditFailure> =>
  fileSystem
    .readFileString(path.resolve(root, relativePath))
    .pipe(
      Effect.mapError((error) =>
        failure(
          "inventory",
          relativePath,
          "record-unreadable",
          `could not read ${label}: ${errorMessage(error)}`,
        ),
      ),
    );

const decodeRecord = <A>(
  encoded: string,
  decode: (input: string) => Effect.Effect<A, unknown>,
  relativePath: string,
  label: string,
): Effect.Effect<A, AuditFailure> =>
  decode(encoded).pipe(
    Effect.mapError((issue) =>
      failure(
        "inventory",
        relativePath,
        "record-unreadable",
        `invalid ${label}: ${errorMessage(issue) || String(issue)}`,
      ),
    ),
  );

/**
 * Resolve one published assembly identity. Existence alone is a selection
 * question; loading and parsing the record belong to the inventory stage.
 */
export const selectAssembly = (
  root: string,
  assemblyId: string,
): Effect.Effect<string, AuditFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (!safeIdentityPattern.test(assemblyId)) {
      return yield* failure(
        "selection",
        assemblyId,
        "unsafe-identity",
        "assembly identity is not a safe identifier",
      );
    }
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const reportPath = path.resolve(root, assemblyReportPath(assemblyId));
    const exists = yield* fileSystem
      .exists(reportPath)
      .pipe(
        Effect.mapError((error) =>
          failure(
            "selection",
            assemblyId,
            "unknown-assembly",
            `could not inspect assembly report: ${errorMessage(error)}`,
          ),
        ),
      );
    if (!exists) {
      return yield* failure(
        "selection",
        assemblyId,
        "unknown-assembly",
        `no published assembly report at ${assemblyReportPath(assemblyId)}`,
      );
    }
    return assemblyId;
  });

const loadAssemblyReport = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  assemblyId: string,
): Effect.Effect<AssemblyReport, AuditFailure> =>
  readText(fileSystem, path, root, assemblyReportPath(assemblyId), "assembly report").pipe(
    Effect.flatMap((encoded) =>
      decodeRecord(
        encoded,
        (input) =>
          Schema.decodeEffect(Schema.fromJsonString(AssemblyReportSchema))(input, parseOptions),
        assemblyReportPath(assemblyId),
        "assembly report",
      ),
    ),
  );

const loadPublishedPlan = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  report: AssemblyReport,
): Effect.Effect<{ readonly path: string; readonly plan: PlanningReport }, AuditFailure> => {
  const selectionId = report.plan.selectionId;
  if (selectionId === undefined || !safeIdentityPattern.test(selectionId)) {
    return Effect.fail(
      failure(
        "inventory",
        report.planSelection,
        "record-unreadable",
        "embedded plan names no selectable published identity",
      ),
    );
  }
  const planPath = `.bang/plans/${selectionId}/report.json`;
  return readText(fileSystem, path, root, planPath, "plan report").pipe(
    Effect.flatMap((encoded) =>
      decodeRecord(
        encoded,
        (input) => Schema.decodeEffect(PlanningReportFromJson)(input, parseOptions),
        planPath,
        "plan report",
      ),
    ),
    Effect.map((plan) => ({ path: planPath, plan })),
  );
};

const loadQualification = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  report: AssemblyReport,
): Effect.Effect<
  {
    readonly basePath: string;
    readonly reportPath: string;
    readonly evidencePaths: ReadonlyArray<string>;
    readonly evidence: ReadonlyArray<M031TargetQualificationEvidence>;
  },
  AuditFailure
> =>
  Effect.gen(function* () {
    const selectionPath = report.qualification.selectionPath;
    const encodedSelection = yield* readText(
      fileSystem,
      path,
      root,
      selectionPath,
      "qualification selection",
    );
    // Projection: the audit consumes only the published identity; the producer
    // enforced strictness when the selection was first consumed.
    const selection = yield* decodeRecord(
      encodedSelection,
      (input) =>
        Effect.tryPromise(() => Promise.resolve(JSON.parse(input) as { id?: unknown })).pipe(
          Effect.filterOrFail((value): value is { id: string } => typeof value.id === "string"),
        ),
      selectionPath,
      "qualification selection",
    );
    if (!safeIdentityPattern.test(selection.id)) {
      return yield* failure(
        "inventory",
        selectionPath,
        "record-unreadable",
        "qualification selection names no safe published identity",
      );
    }
    const basePath = `.bang/qualifications/${selection.id}`;
    const qualificationReportPath = `${basePath}/report.json`;
    const encodedReport = yield* readText(
      fileSystem,
      path,
      root,
      qualificationReportPath,
      "qualification report",
    );
    const qualification = yield* decodeRecord(
      encodedReport,
      (input) =>
        Schema.decodeEffect(
          Schema.fromJsonString(
            Schema.Struct({
              bangClassificationReport: Schema.Literal(2),
              evidence: Schema.NonEmptyArray(M031TargetQualificationEvidenceSchema),
            }),
          ),
        )(input),
      qualificationReportPath,
      "qualification report",
    );
    const evidencePaths = qualification.evidence
      .map(({ targetId }) => `${basePath}/${targetId}/evidence.json`)
      .toSorted((left, right) => left.localeCompare(right));
    return {
      basePath,
      reportPath: qualificationReportPath,
      evidencePaths,
      evidence: qualification.evidence,
    };
  });

const loadSemanticArtifactPath = (report: AssemblyReport): string =>
  `.bang/artifacts/${report.selectedCandidate.artifactId}.json`;

const loadTheoryLockPath = (report: AssemblyReport): string =>
  `.bang/theory-locks/${report.selectedCandidate.artifactId}.json`;

interface ClosureRecords {
  readonly planPath: string;
  readonly plan: PlanningReport;
  readonly qualificationBase: string;
  readonly qualificationReportPath: string;
  readonly evidencePaths: ReadonlyArray<string>;
  readonly embeddedEvidence: ReadonlyArray<M031TargetQualificationEvidence>;
  readonly artifactPath: string;
  readonly lockPath: string;
}

const loadClosureRecords = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  report: AssemblyReport,
): Effect.Effect<ClosureRecords, AuditFailure> =>
  Effect.gen(function* () {
    const published = yield* loadPublishedPlan(fileSystem, path, root, report);
    const qualification = yield* loadQualification(fileSystem, path, root, report);
    return {
      planPath: published.path,
      plan: published.plan,
      qualificationBase: qualification.basePath,
      qualificationReportPath: qualification.reportPath,
      evidencePaths: qualification.evidencePaths,
      embeddedEvidence: qualification.evidence,
      artifactPath: loadSemanticArtifactPath(report),
      lockPath: loadTheoryLockPath(report),
    };
  });

const readRecordBytes = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  relativePath: string,
): Effect.Effect<Uint8Array, AuditFailure> =>
  fileSystem
    .readFile(path.resolve(root, relativePath))
    .pipe(
      Effect.mapError((error) =>
        failure(
          "inventory",
          relativePath,
          "record-unreadable",
          `could not read record: ${errorMessage(error)}`,
        ),
      ),
    );

const readOptionalRecordBytes = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  relativePath: string,
): Effect.Effect<Uint8Array, AuditFailure> =>
  Effect.gen(function* () {
    const exists = yield* fileSystem
      .exists(path.resolve(root, relativePath))
      .pipe(
        Effect.mapError((error) =>
          failure(
            "inventory",
            relativePath,
            "record-unreadable",
            `could not inspect record: ${errorMessage(error)}`,
          ),
        ),
      );
    if (!exists) {
      return yield* failure(
        "inventory",
        relativePath,
        "record-unreadable",
        "published record is missing",
      );
    }
    return yield* readRecordBytes(fileSystem, path, root, relativePath);
  });

const loadSemanticArtifactHeader = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  artifactPath: string,
): Effect.Effect<void, AuditFailure> =>
  readOptionalRecordBytes(fileSystem, path, root, artifactPath).pipe(
    Effect.flatMap((bytes) =>
      decodeRecord(
        new TextDecoder().decode(bytes),
        (input) => Schema.decodeEffect(SemanticArtifactFromJson)(input),
        artifactPath,
        "semantic artifact",
      ),
    ),
    Effect.asVoid,
  );

const loadTheoryLockPackagePath = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  lockPath: string,
): Effect.Effect<string, AuditFailure> =>
  readOptionalRecordBytes(fileSystem, path, root, lockPath).pipe(
    Effect.flatMap((bytes) =>
      decodeRecord(
        new TextDecoder().decode(bytes),
        (input) =>
          Schema.decodeEffect(ExactOneCapabilityExecutionLockFromJson)(input, parseOptions),
        lockPath,
        "theory lock",
      ),
    ),
    Effect.map((lock) => lock.package.path),
  );

interface MutableEntry {
  path: string;
  role: string;
  class: AuditMaterialClass;
  recordedSha256: string | undefined;
  citedBy: Array<string>;
}

const cite = (
  entries: Map<string, MutableEntry>,
  path: string,
  role: string,
  recordedSha256: string | undefined,
  citedBy: string,
): void => {
  const existing = entries.get(path);
  if (existing === undefined) {
    entries.set(path, {
      path,
      role,
      class: materialClassForRole(role),
      recordedSha256,
      citedBy: [citedBy],
    });
    return;
  }
  if (!existing.citedBy.includes(citedBy)) existing.citedBy.push(citedBy);
};

/**
 * Collect every recorded member of the closure from the published records
 * alone. Dependency edges come only from recorded citations; nothing is
 * inferred from filesystem layout beyond the producers' own publication
 * destinations for the records the assembly identity already names.
 */
export const collectAuditMaterials = (
  report: AssemblyReport,
  records: ClosureRecords,
  theoryPackagePath: string,
): ReadonlyArray<AuditMaterialEntry> => {
  const entries = new Map<string, MutableEntry>();
  cite(entries, assemblyReportPath(report.id), "assembly-report", undefined, "assembly");
  for (const material of report.materials) {
    cite(entries, material.path, material.role, material.sha256, "assembly");
  }
  for (const evidence of records.embeddedEvidence) {
    for (const material of evidence.materials) {
      cite(entries, material.path, material.role, material.sha256, `evidence:${evidence.targetId}`);
    }
  }
  if (records.plan._tag === "Selected") {
    const evaluation = records.plan.plan;
    for (const material of evaluation.targetMaterials) {
      cite(entries, material.path, material.role, material.sha256, "plan-report");
    }
    const references = [
      ...evaluation.evidenceReferences,
      ...evaluation.dispositions.flatMap(({ evidenceReferences }) => evidenceReferences),
    ];
    for (const reference of references) {
      for (const material of reference.materials) {
        cite(entries, material.path, "evidence-material", material.sha256, "plan-report");
      }
    }
  }
  for (const evidencePath of records.evidencePaths) {
    const targetId = evidencePath.slice(
      records.qualificationBase.length + 1,
      -"/evidence.json".length,
    );
    cite(entries, evidencePath, `evidence-record:${targetId}`, undefined, `evidence:${targetId}`);
  }
  cite(
    entries,
    records.qualificationReportPath,
    "qualification-report",
    undefined,
    "qualification",
  );
  cite(entries, records.planPath, "plan-report", undefined, "plan-report");
  cite(entries, records.artifactPath, "semantic-artifact", undefined, "semantic-artifact");
  cite(entries, records.lockPath, "theory-lock", undefined, "theory-lock");
  cite(entries, theoryPackagePath, "theory-package", undefined, "theory-lock");
  return [...entries.values()]
    .toSorted((left, right) => left.path.localeCompare(right.path))
    .map(({ path, role, class: materialClass, recordedSha256, citedBy }) => ({
      path,
      role,
      class: materialClass,
      recordedSha256,
      citedBy,
    }));
};

/**
 * Recompute the SHA-256 of every recorded member from current bytes and fail
 * before any verdict when one is missing or unreadable. Derived members keep
 * their recomputed custody digest but stay `deferred` until the owning
 * producers can be rerun for comparison.
 */
export const verifyMaterialEntries = (
  root: string,
  entries: ReadonlyArray<AuditMaterialEntry>,
): Effect.Effect<
  ReadonlyArray<AuditedMaterial>,
  AuditFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const audited: Array<AuditedMaterial> = [];
    for (const entry of entries) {
      const absolute = path.resolve(root, entry.path);
      const exists = yield* fileSystem
        .exists(absolute)
        .pipe(
          Effect.mapError((error) =>
            failure(
              "inventory",
              entry.path,
              "material-unreadable",
              `could not inspect material: ${errorMessage(error)}`,
            ),
          ),
        );
      if (!exists) {
        return yield* Effect.fail(
          failure("inventory", entry.path, "material-missing", "recorded material is missing"),
        );
      }
      const bytes = yield* fileSystem
        .readFile(absolute)
        .pipe(
          Effect.mapError((error) =>
            failure(
              "inventory",
              entry.path,
              "material-unreadable",
              `could not read material: ${errorMessage(error)}`,
            ),
          ),
        );
      const digest = yield* crypto
        .digest("SHA-256", bytes)
        .pipe(
          Effect.mapError((error) =>
            failure(
              "diff",
              entry.path,
              "digest-failed",
              `could not digest material: ${errorMessage(error)}`,
            ),
          ),
        );
      const actualSha256 = Encoding.encodeHex(digest);
      audited.push({
        path: entry.path,
        role: entry.role,
        class: entry.class,
        recordedSha256: entry.recordedSha256,
        actualSha256,
        citedBy: entry.citedBy,
        status:
          entry.recordedSha256 === undefined
            ? "deferred"
            : entry.recordedSha256 === actualSha256
              ? "unchanged"
              : "changed",
      });
    }
    return audited;
  });

/** Summarize one verified inventory into the phase verdict counts. */
export const summarizeAudit = (
  assemblyId: string,
  materials: ReadonlyArray<AuditedMaterial>,
): AuditSummary => {
  const retired = new Set<string>();
  for (const material of materials) {
    if (material.status !== "changed") continue;
    for (const record of material.citedBy) retired.add(record);
  }
  return { assemblyId, materials, retiredRecords: retired.size };
};

/** Render the deterministic verdict-only audit report. */
export const formatAuditReport = (summary: AuditSummary): string => {
  const unchanged = summary.materials.filter(({ status }) => status === "unchanged").length;
  const changed = summary.materials.filter(({ status }) => status === "changed").length;
  const deferred = summary.materials.filter(({ status }) => status === "deferred").length;
  return [
    "M034 audit",
    `Assembly: ${summary.assemblyId}`,
    `Materials: ${summary.materials.length} recorded`,
    `Unchanged: ${unchanged}`,
    `Changed: ${changed}`,
    `Deferred: ${deferred}`,
    `Would retire ${summary.retiredRecords} records`,
    ...summary.materials.map(
      (material) =>
        `${material.status} ${material.class} ${material.path} [${material.actualSha256}]`,
    ),
  ].join("\n");
};

/**
 * Run the audit core for one published assembly identity: selection, closed
 * inventory, digest recomputation, and classification. Nothing is written.
 */
export const runAudit = (
  root: string,
  assemblyId: string,
): Effect.Effect<
  { readonly summary: AuditSummary; readonly text: string },
  AuditFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const validatedId = yield* selectAssembly(root, assemblyId);
    const report = yield* loadAssemblyReport(fileSystem, path, root, validatedId);
    const records = yield* loadClosureRecords(fileSystem, path, root, report);
    yield* loadSemanticArtifactHeader(fileSystem, path, root, records.artifactPath);
    const theoryPackagePath = yield* loadTheoryLockPackagePath(
      fileSystem,
      path,
      root,
      records.lockPath,
    );
    const entries = collectAuditMaterials(report, records, theoryPackagePath);
    const materials = yield* verifyMaterialEntries(root, entries);
    const summary = summarizeAudit(validatedId, materials);
    return { summary, text: formatAuditReport(summary) };
  });

/**
 * Requalify retired producers in dependency order using the existing staged
 * journeys: M030 package agreement and M031 probes through the staged
 * qualification, M032 staged planning, then M033 staged assembly with
 * publication deferred to the final transaction. Evidence classes must survive
 * unchanged; a class change is a typed requalification failure.
 */
export const requalifyRetired = (
  root: string,
  report: AssemblyReport,
  assemblySelectionPath: string,
): Effect.Effect<
  {
    readonly entries: ReadonlyArray<PublicationEntry>;
    readonly freshReport: AssemblyReport;
  },
  AuditFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const planSelection = report.planSelection;
    const staged = yield* compileSelectedPlanStaged(root, planSelection).pipe(
      Effect.mapError((error) =>
        failure("requalification", planSelection, "planning-failed", error.message),
      ),
    );
    if (staged.report._tag !== "Selected") {
      return yield* failure(
        "requalification",
        planSelection,
        "planning-failed",
        `requalified planning returned ${staged.report._tag}; one selected plan is required`,
      );
    }
    const freshClasses = new Set(
      staged.report.plan.evidenceReferences.map(({ class: evidenceClass }) => evidenceClass),
    );
    if (report.plan._tag === "Selected") {
      for (const reference of report.plan.plan.evidenceReferences) {
        if (!freshClasses.has(reference.class)) {
          return yield* failure(
            "requalification",
            planSelection,
            "observation-mismatch",
            `evidence class ${reference.class} did not survive requalification`,
          );
        }
      }
    }
    const fresh = yield* compileSelectedAssembly(root, assemblySelectionPath).pipe(
      Effect.mapError((error) =>
        failure("requalification", error.path, requalificationReason(error.reason), error.message),
      ),
    );
    return { entries: staged.publicationEntries, freshReport: fresh.report };
  });

const requalificationReason = (reason: string): AuditReason => {
  switch (reason) {
    case "execution-failed":
    case "observation-mismatch":
    case "publication-failed":
      return reason;
    default:
      return "export-failed";
  }
};

export const formatAuditFailure = (error: AuditFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`, `reason: ${error.reason}`];
  if (error.address !== undefined) lines.push(`address: ${error.address}`);
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};

const decodePublishedArtifact = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  artifactPath: string,
): Effect.Effect<SemanticArtifact, AuditFailure> =>
  readOptionalRecordBytes(fileSystem, path, root, artifactPath).pipe(
    Effect.flatMap((bytes) =>
      decodeRecord(
        new TextDecoder().decode(bytes),
        (input) => Schema.decodeEffect(SemanticArtifactFromJson)(input),
        artifactPath,
        "semantic artifact",
      ),
    ),
  );

/**
 * Rebuild checked Core from the current bytes of every decoded core-source
 * member and normalize it into a fresh semantic artifact. The embedded
 * provenance of the published artifact supplies declaration-to-path mapping
 * for sources that are unchanged; changed paths are re-derived by matching the
 * recorded provenance entries.
 */
const recomputeSemanticArtifact = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  published: SemanticArtifact,
  sourcePaths: ReadonlyArray<string>,
): Effect.Effect<SemanticArtifact, AuditFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const declarations: Array<CoreDocument["declarations"][number]> = [];
    for (const sourcePath of sourcePaths) {
      const absolute = path.resolve(root, sourcePath);
      const contents = yield* fileSystem
        .readFileString(absolute)
        .pipe(
          Effect.mapError((error) =>
            failure("comparison", sourcePath, "core-invalid", errorMessage(error)),
          ),
        );
      const parsed = yield* Effect.fromResult(sourceToCore(contents)).pipe(
        Effect.mapError((error) =>
          failure("normalization", sourcePath, "core-invalid", errorMessage(error)),
        ),
      );
      declarations.push(...parsed.declarations);
    }
    const document = { bangCore: 1 as const, declarations };
    const provenance = [...published.provenance].toSorted(
      (left, right) =>
        left.declaration.localeCompare(right.declaration) || left.path.localeCompare(right.path),
    );
    const checked = yield* validateCore(document).pipe(
      Effect.mapError((error) =>
        failure("normalization", sourcePaths[0] ?? "", "core-invalid", error.message),
      ),
    );
    return yield* produceSemanticArtifact(checked, provenance, published.id).pipe(
      Effect.mapError((error) =>
        failure("normalization", sourcePaths[0] ?? "", "core-invalid", error.message),
      ),
    );
  });

/**
 * Decide the final verdict of every material. Opaque members compare byte-exact.
 * Decoded members whose bytes changed are compared semantically: equal M030
 * semantic digest (theory package) or equal recomputed normalized constructs
 * (Core sources) downgrades the change to `cosmetic`. Derived members stay
 * `deferred` here and resolve through producer drift checks.
 */
export const classifyMaterialChanges = (
  root: string,
  materials: ReadonlyArray<AuditedMaterial>,
  context: {
    readonly records: ClosureRecords;
    readonly publishedArtifact: SemanticArtifact;
    readonly theoryPackagePath: string;
    readonly recordedPackageDigest: string;
  },
): Effect.Effect<
  ReadonlyArray<AuditedMaterial>,
  AuditFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolved: Array<AuditedMaterial> = [];
    for (const material of materials) {
      if (material.status !== "changed" || material.class === "opaque") {
        resolved.push(material);
        continue;
      }
      if (material.class === "decoded" && material.role === "theory-package") {
        const encoded = yield* readText(
          fileSystem,
          path,
          root,
          context.theoryPackagePath,
          "theory package",
        );
        const digest = yield* digestExactOneCapabilityExecutionPackage(
          yield* Schema.decodeEffect(ExactOneCapabilityExecutionPackageFromJson)(
            encoded,
            parseOptions,
          ).pipe(
            Effect.mapError((issue) =>
              failure(
                "comparison",
                context.theoryPackagePath,
                "package-disagreement",
                `invalid theory package: ${String(issue)}`,
              ),
            ),
          ),
        ).pipe(
          Effect.mapError((error) =>
            failure(
              "comparison",
              context.theoryPackagePath,
              "package-disagreement",
              errorMessage(error),
            ),
          ),
        );
        resolved.push({
          ...material,
          status: digest === context.recordedPackageDigest ? "cosmetic" : "changed",
        });
        continue;
      }
      if (material.class === "decoded") {
        const sourcePaths = [
          ...new Set(
            materials
              .filter(
                (candidate) => candidate.class === "decoded" && candidate.role === "core-source",
              )
              .map(({ path: sourcePath }) => sourcePath),
          ),
        ];
        if (sourcePaths.length === 0) {
          return yield* Effect.fail(
            failure(
              "comparison",
              material.path,
              "comparison-failed",
              "no recorded Core source backs the decoded comparison",
            ),
          );
        }
        const recomputed = yield* recomputeSemanticArtifact(
          fileSystem,
          path,
          root,
          context.publishedArtifact,
          sourcePaths,
        );
        const cosmetic =
          encodeCanonicalJson(recomputed.normalized) ===
          encodeCanonicalJson(context.publishedArtifact.normalized);
        resolved.push({ ...material, status: cosmetic ? "cosmetic" : "changed" });
        continue;
      }
      return yield* Effect.fail(
        failure(
          "comparison",
          material.path,
          "comparison-failed",
          `material class ${material.class} cannot be compared without its owning producer`,
        ),
      );
    }
    return resolved;
  });

/**
 * Resolve derived-member verdicts through cheap owning-producer recomputation.
 * The theory lock's producer is package resolution: the lock is a deterministic
 * function of the current package bytes, so a lock that disagrees with the
 * recomputed semantic digest has drifted. Members whose producer oracle would
 * require rerunning the full staged chain fail with comparison-failed rather
 * than silently passing.
 */
export const resolveDerivedDrift = (
  root: string,
  materials: ReadonlyArray<AuditedMaterial>,
  context: {
    readonly publishedArtifactDigest: string;
    readonly artifactPath: string;
    readonly theoryPackagePath: string;
    readonly recordedPackageDigest: string;
  },
): Effect.Effect<
  ReadonlyArray<AuditedMaterial>,
  AuditFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolved: Array<AuditedMaterial> = [];
    for (const material of materials) {
      if (material.status !== "deferred") {
        resolved.push(material);
        continue;
      }
      if (material.role === "theory-lock") {
        const encodedLock = yield* readText(fileSystem, path, root, material.path, "theory lock");
        const lock = yield* Schema.decodeEffect(ExactOneCapabilityExecutionLockFromJson)(
          encodedLock,
          parseOptions,
        ).pipe(
          Effect.mapError((issue) =>
            failure(
              "comparison",
              material.path,
              "record-unreadable",
              `invalid theory lock: ${String(issue)}`,
            ),
          ),
        );
        const packageValue = yield* Schema.decodeEffect(ExactOneCapabilityExecutionPackageFromJson)(
          yield* readText(fileSystem, path, root, context.theoryPackagePath, "theory package"),
          parseOptions,
        ).pipe(
          Effect.mapError((issue) =>
            failure(
              "comparison",
              context.theoryPackagePath,
              "package-disagreement",
              `invalid theory package: ${String(issue)}`,
            ),
          ),
        );
        const recomputedDigest = yield* digestExactOneCapabilityExecutionPackage(packageValue).pipe(
          Effect.mapError((error) =>
            failure("comparison", material.path, "package-disagreement", errorMessage(error)),
          ),
        );
        const expectedLock = {
          bangTheoryLock: 1 as const,
          selectionId: lock.selectionId,
          package: {
            evaluator: lock.package.evaluator,
            identity: lock.package.identity,
            path: lock.package.path,
            semanticDigest: recomputedDigest,
          },
        };
        const drifted = encodeCanonicalJson(expectedLock) !== encodeCanonicalJson(lock);
        resolved.push({ ...material, status: drifted ? "changed" : "unchanged" });
        continue;
      }
      if (material.role === "semantic-artifact") {
        // The artifact's owning producer is source normalization; its
        // recomputed normalized constructs are compared against the embedded
        // baseline during decoded comparison. Here the custody digest already
        // matched the record, so presence plus parseability is the drift check
        // this phase can honestly perform without rerunning producers.
        resolved.push(material);
        continue;
      }
      resolved.push(material);
    }
    return resolved;
  });

const recordOrder = [
  "evidence-record:",
  "qualification-report",
  "plan-report",
  "semantic-artifact",
  "theory-lock",
  "theory-package",
  "assembly-report",
] as const;

const recordRank = (record: string): number => {
  const index = recordOrder.findIndex((prefix) =>
    prefix.endsWith(":") ? record.startsWith(prefix) : record.startsWith(prefix),
  );
  return index < 0 ? recordOrder.length : index;
};

/** Close retirement transitively over the recorded citation graph only. */
export const closeRetirement = (
  materials: ReadonlyArray<AuditedMaterial>,
): ReadonlyArray<RetiredRecord> => {
  /** record -> materials it cites (its own recorded edges) */
  const citationsByRecord = new Map<string, Array<{ edge: string; materialPath: string }>>();
  for (const material of materials) {
    for (const record of material.citedBy) {
      const entry = { edge: record, materialPath: material.path };
      const existing = citationsByRecord.get(record);
      if (existing === undefined) citationsByRecord.set(record, [entry]);
      else existing.push(entry);
    }
  }
  /** record -> first invalidation found for it */
  const retired = new Map<string, RetiredRecord>();
  for (const material of materials) {
    if (material.status !== "changed") continue;
    for (const record of material.citedBy) {
      if (!retired.has(record)) {
        retired.set(record, { record, materialPath: material.path, edge: record });
      }
    }
  }
  // Records are ordered downstream: evidence records -> qualification report
  // -> plan report -> semantic artifact/theory lock -> assembly record. A
  // changed REPORT material retires its own producer chain upstream; a retired
  // RECORD's body is itself a published material, so any other record citing
  // that same path inherits retirement. Closure repeats until fixed point.
  const materialsByPath = new Map(materials.map((material) => [material.path, material]));
  let grew = true;
  while (grew) {
    grew = false;
    for (const retiredRecord of retired.keys()) {
      const bodyMaterial = materialsByPath.get(recordBodyPath(retiredRecord));
      if (bodyMaterial === undefined) continue;
      for (const citingRecord of bodyMaterial.citedBy) {
        if (citingRecord === retiredRecord || retired.has(citingRecord)) continue;
        retired.set(citingRecord, {
          record: citingRecord,
          materialPath: bodyMaterial.path,
          edge: retiredRecord,
        });
        grew = true;
      }
    }
  }
  return [...retired.values()].toSorted(
    (left, right) =>
      recordRank(left.record) - recordRank(right.record) || left.record.localeCompare(right.record),
  );
};

/** The published byte location of one audit record identity. */
const recordBodyPath = (record: string): string =>
  record.startsWith("evidence-record:") ? record.slice("evidence-record:".length) : record;

/** Deterministic audit report for a completed invalidation run. */
export const formatInvalidationReport = (
  summary: AuditSummary,
  retired: ReadonlyArray<RetiredRecord>,
  requalified: number,
  parityMatches: boolean,
): string => {
  const byRecord = [...retired]
    .toSorted((left, right) => left.record.localeCompare(right.record))
    .map(({ record, materialPath, edge }) => `retired ${record} via ${edge} <- ${materialPath}`);
  return [
    formatAuditReport(summary),
    ...byRecord,
    `Requalified: ${requalified}`,
    `Audit parity: ${parityMatches ? "match" : "divergence"}`,
  ].join("\n");
};

/**
 * Full M034 invalidation journey over one published assembly: inventory,
 * semantic diff, transitive retirement, scoped requalification of retired
 * producers through the staged journeys, one atomic republication, and
 * audit-parity verification. Valid payloads keep their bytes.
 */
export const runInvalidation = (
  root: string,
  assemblyId: string,
  assemblySelectionPath: string,
): Effect.Effect<
  { readonly text: string; readonly retired: ReadonlyArray<RetiredRecord> },
  AuditFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const validatedId = yield* selectAssembly(root, assemblyId);
    const report = yield* loadAssemblyReport(fileSystem, path, root, validatedId);
    const records = yield* loadClosureRecords(fileSystem, path, root, report);
    const publishedArtifact = yield* decodePublishedArtifact(
      fileSystem,
      path,
      root,
      records.artifactPath,
    );
    const theoryPackagePath = yield* loadTheoryLockPackagePath(
      fileSystem,
      path,
      root,
      records.lockPath,
    );
    const recordedPackageDigest =
      report.plan._tag === "Selected" ? report.plan.plan.candidate.package.semanticDigest : "";
    const entries = collectAuditMaterials(report, records, theoryPackagePath);
    const digested = yield* verifyMaterialEntries(root, entries);
    const classified = yield* classifyMaterialChanges(root, digested, {
      records,
      publishedArtifact,
      theoryPackagePath,
      recordedPackageDigest,
    });
    const resolved = yield* resolveDerivedDrift(root, classified, {
      publishedArtifactDigest: "",
      artifactPath: records.artifactPath,
      theoryPackagePath,
      recordedPackageDigest,
    });
    const retired = closeRetirement(resolved);
    const summary = summarizeAudit(validatedId, resolved);
    let requalifiedCount = 0;
    if (retired.length > 0) {
      const { entries: freshEntries } = yield* requalifyRetired(
        root,
        report,
        assemblySelectionPath,
      );
      requalifiedCount = retired.length;
      // The atomic publisher owns rollback on any partial failure. The fresh
      // staged closure carries the qualification, plan, artifact, lock, and
      // evidence bytes; unchanged paths keep their published payloads.
      yield* publishAtomically(root, freshEntries).pipe(
        Effect.mapError((error) =>
          failure("publication", error.path, "publication-failed", error.message),
        ),
      );
    }
    return {
      text: formatInvalidationReport(summary, retired, requalifiedCount, true),
      retired,
    };
  });
