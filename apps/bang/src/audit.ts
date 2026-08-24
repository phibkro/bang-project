import {
  type M031TargetQualificationEvidence,
  M031TargetQualificationEvidenceSchema,
} from "@bang/evidence";
import { PlanningReportFromJson, type PlanningReport } from "@bang/planning";
import { SemanticArtifactFromJson } from "@bang/core";
import { ExactOneCapabilityExecutionLockFromJson } from "@bang/theories";
import { Crypto, Effect, Encoding, FileSystem, Path, Schema } from "effect";

import { AssemblyReportSchema, type AssemblyReport } from "./assemble.ts";

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
  /**
   * `deferred` marks derived members whose owning-producer recomputation and
   * decoded semantic comparison arrive with the comparison phases; this phase
   * establishes their presence and custody digest only.
   */
  readonly status: "unchanged" | "changed" | "deferred";
}

export interface AuditSummary {
  readonly assemblyId: string;
  readonly materials: ReadonlyArray<AuditedMaterial>;
  /** Records directly citing at least one changed material. */
  readonly retiredRecords: number;
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

export const formatAuditFailure = (error: AuditFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`, `reason: ${error.reason}`];
  if (error.address !== undefined) lines.push(`address: ${error.address}`);
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};
