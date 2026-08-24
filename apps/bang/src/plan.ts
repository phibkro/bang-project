import {
  PlanningSelectionFromJson,
  encodePlanningReport,
  planObjective,
  type CandidateEvaluation,
  type PlanningReport,
  type PlanningSelection,
} from "@bang/planning";
import { makeEffectPlanningContribution } from "@bang/target-effect";
import { makeGleamPlanningContribution } from "@bang/target-gleam";
import { Effect, FileSystem, Path, Schema, type Crypto } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import {
  compileSelectedM031ClassificationStaged,
  publishAtomically,
  type M031ClassificationCompileResult,
  type PublicationEntry,
} from "./classify.ts";

const PlanStageSchema = Schema.Literals([
  "selection",
  "qualification",
  "objective",
  "contribution",
  "planning",
  "publication",
]);
export type PlanStage = typeof PlanStageSchema.Type;

/** A typed failure emitted by one planning boundary. */
export class PlanFailure extends Schema.TaggedError<PlanFailure>()("PlanFailure", {
  stage: PlanStageSchema,
  path: Schema.String,
  reason: Schema.String,
  message: Schema.String,
  address: Schema.optional(Schema.String),
}) {}

const failure = (
  stage: PlanStage,
  path: string,
  reason: string,
  message: string,
  address?: string,
): PlanFailure =>
  new PlanFailure({
    stage,
    path,
    reason,
    message,
    ...(address === undefined ? {} : { address }),
  });

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;

const stringField = (value: unknown, key: string): string | undefined => {
  const candidate = field(value, key);
  return typeof candidate === "string" ? candidate : undefined;
};

const mapBoundaryError = (stage: PlanStage, path: string, error: unknown): PlanFailure =>
  failure(
    stage,
    stringField(error, "path") ?? path,
    stringField(error, "reason") ?? "boundary-failure",
    stringField(error, "message") ?? String(error),
    stringField(error, "address"),
  );

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

const resolveSelection = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  { readonly absolute: string; readonly relative: string },
  PlanFailure,
  Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (!isRepositoryRelativePath(selectionPath)) {
      return yield* failure(
        "selection",
        selectionPath,
        "unsafe-path",
        "planning selection path must be repository-relative",
      );
    }
    return {
      absolute: path.resolve(root, selectionPath),
      relative: selectionPath,
    };
  });

const readSelection = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  { readonly selection: PlanningSelection; readonly absolutePath: string },
  PlanFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const resolved = yield* resolveSelection(root, selectionPath);
    const fileSystem = yield* FileSystem.FileSystem;
    const encoded = yield* fileSystem
      .readFileString(resolved.absolute)
      .pipe(
        Effect.mapError((error) =>
          failure(
            "selection",
            resolved.absolute,
            "read-failed",
            `could not read planning selection: ${String(error)}`,
          ),
        ),
      );
    const selection = yield* Schema.decodeUnknownEffect(PlanningSelectionFromJson)(encoded, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError((error) => mapBoundaryError("selection", resolved.absolute, error)));
    return { selection, absolutePath: resolved.absolute };
  });

const ensureDemandOrder = (
  selection: PlanningSelection,
  selectionPath: string,
): Effect.Effect<void, PlanFailure> => {
  const expectedOrder = ["runtime-model", "restart", "grant-restart"];
  const previous = new Set<string>();
  let lastIndex = -1;
  for (const demand of selection.demands) {
    const index = expectedOrder.indexOf(demand.family);
    if (previous.has(demand.family)) {
      return Effect.fail(
        failure(
          "selection",
          selectionPath,
          "duplicate-demand-family",
          `planning selection repeats demand family ${demand.family}`,
        ),
      );
    }
    if (index <= lastIndex) {
      return Effect.fail(
        failure(
          "selection",
          selectionPath,
          "invalid-demand-order",
          "planning demand families must use runtime-model, restart, grant-restart order",
        ),
      );
    }
    previous.add(demand.family);
    lastIndex = index;
  }
  return Effect.void;
};
const ensureSelectionIdentity = (
  selection: PlanningSelection,
  selectionPath: string,
): Effect.Effect<void, PlanFailure> =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(selection.id)
    ? Effect.void
    : Effect.fail(
        failure(
          "selection",
          selectionPath,
          "unsafe-selection-identity",
          "planning selection id is not a safe identity",
        ),
      );

const targetIds = ["effect-typescript", "gleam-beam"] as const;

const checkQualificationIdentity = (
  selection: PlanningSelection,
  staged: {
    readonly selection: { readonly id: string; readonly bangClassification: number };
    readonly artifact: { readonly id: string };
    readonly evidence: ReadonlyArray<{
      readonly selectionId: string;
      readonly targetId: string;
      readonly artifactId: string;
      readonly requirementAddress: string;
      readonly producer: { readonly targetId: string };
      readonly observations: { readonly target: string };
    }>;
    readonly results: ReadonlyArray<{
      readonly _tag: string;
      readonly artifactId: string;
      readonly artifactFormat: string;
      readonly realizationId: string;
      readonly targetId: string;
      readonly theoryResultIdentity: {
        readonly artifactId: string;
        readonly artifactFormat: string;
        readonly requirementAddress: string;
      };
    }>;
  },
  qualificationPath: string,
): Effect.Effect<void, PlanFailure> => {
  if (staged.selection.bangClassification !== 2) {
    return Effect.fail(
      failure(
        "qualification",
        qualificationPath,
        "non-m031-qualification-selection",
        "planning requires an M031 version-two qualification selection",
      ),
    );
  }
  if (staged.results.length !== targetIds.length) {
    return Effect.fail(
      failure(
        "qualification",
        qualificationPath,
        "invalid-candidate-set",
        "M031 qualification must contain exactly one Effect and one Gleam candidate",
      ),
    );
  }
  const seenTargets = new Set<string>();
  for (const result of staged.results) {
    if (result._tag !== "Qualified") {
      return Effect.fail(
        failure(
          "qualification",
          qualificationPath,
          "non-qualified-candidate",
          `M031 candidate ${result.targetId} is not Qualified`,
        ),
      );
    }
    if (!targetIds.some((target) => target === result.targetId)) {
      return Effect.fail(
        failure(
          "qualification",
          qualificationPath,
          "invalid-evidence-set",
          `M031 candidate target ${result.targetId} is not supported by planning`,
        ),
      );
    }
    if (seenTargets.has(result.targetId)) {
      return Effect.fail(
        failure(
          "qualification",
          qualificationPath,
          "invalid-candidate-set",
          `M031 candidate target ${result.targetId} is duplicated`,
        ),
      );
    }
    seenTargets.add(result.targetId);
    if (
      result.artifactId !== staged.artifact.id ||
      result.theoryResultIdentity.artifactId !== staged.artifact.id ||
      result.artifactFormat !== result.theoryResultIdentity.artifactFormat ||
      result.theoryResultIdentity.requirementAddress !== selection.requirementAddress ||
      result.realizationId !== "WithdrawAccountOnce"
    ) {
      return Effect.fail(
        failure(
          "qualification",
          qualificationPath,
          "requirement-mismatch",
          "M031 candidate identity does not match the planning objective",
          result.theoryResultIdentity.requirementAddress,
        ),
      );
    }
  }
  if (seenTargets.size !== targetIds.length) {
    return Effect.fail(
      failure(
        "qualification",
        qualificationPath,
        "invalid-candidate-set",
        "M031 qualification must contain both supported target candidates",
      ),
    );
  }
  for (const evidence of staged.evidence) {
    if (
      evidence.selectionId !== staged.selection.id ||
      evidence.artifactId !== staged.artifact.id ||
      evidence.requirementAddress !== selection.requirementAddress ||
      evidence.targetId !== evidence.producer.targetId ||
      evidence.targetId !== evidence.observations.target
    ) {
      return Effect.fail(
        failure(
          "qualification",
          qualificationPath,
          "checked-identity-mismatch",
          `M031 evidence identity does not match ${selection.requirementAddress}`,
          evidence.requirementAddress,
        ),
      );
    }
  }
  if (staged.evidence.length !== targetIds.length) {
    return Effect.fail(
      failure(
        "qualification",
        qualificationPath,
        "invalid-evidence-set",
        "M031 qualification must contain one checked evidence record per target",
      ),
    );
  }
  return Effect.void;
};

/** Format the successful planning result without paths, process ids, or volatile data. */
export const formatPlan = (report: PlanningReport): string => {
  const evaluations: ReadonlyArray<CandidateEvaluation> =
    report._tag === "Selected"
      ? [report.plan]
      : report._tag === "Incomparable"
        ? report.plans
        : report.evaluations;
  const lines = ["M032 objective-relative realization planning", `Result: ${report._tag}`];
  for (const evaluation of evaluations) {
    lines.push(`Candidate: ${evaluation.candidate.target}`);
    for (const disposition of evaluation.dispositions) {
      const demand = `${disposition.demand.family}=${disposition.expected}`;
      if (disposition.disposition === "unresolved") {
        lines.push(`  ${demand} unresolved: ${disposition.reason}`);
      } else {
        lines.push(
          `  ${demand} ${disposition.disposition}: established=${disposition.established}`,
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
};
const addPlanPublication = (
  root: string,
  selection: PlanningSelection,
  report: PlanningReport,
  entries: ReadonlyArray<PublicationEntry>,
): Effect.Effect<ReadonlyArray<PublicationEntry>, PlanFailure, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const reportEncoded = `${encodePlanningReport(report)}\n`;
    const reportPath = `.bang/plans/${selection.id}/report.json`;
    const absolutePath = path.resolve(root, reportPath);
    if (!isRepositoryRelativePath(reportPath) || path.relative(root, absolutePath) !== reportPath) {
      return yield* failure(
        "publication",
        reportPath,
        "unsafe-publication-path",
        "planning report path is not repository-relative",
      );
    }
    const encoded = new TextEncoder().encode(reportEncoded);
    const planEntry: PublicationEntry = { path: reportPath, bytes: encoded };
    return [...entries, planEntry];
  });

export interface PlanCompileStagedResult {
  readonly selection: PlanningSelection;
  readonly report: PlanningReport;
  readonly text: string;
  readonly qualification: M031ClassificationCompileResult;
  readonly publicationEntries: ReadonlyArray<PublicationEntry>;
}

/** Stage fresh M031 qualification and deterministic planning output without writes. */
export const compileSelectedPlanStaged = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  PlanCompileStagedResult,
  PlanFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const { selection, absolutePath } = yield* readSelection(root, selectionPath);
    yield* ensureSelectionIdentity(selection, absolutePath);
    yield* ensureDemandOrder(selection, absolutePath);

    const qualification = yield* compileSelectedM031ClassificationStaged(
      root,
      selection.qualificationSelection,
    ).pipe(Effect.mapError((error) => mapBoundaryError("qualification", absolutePath, error)));

    yield* checkQualificationIdentity(selection, qualification, selection.qualificationSelection);

    const effectResult = qualification.results.find(
      ({ targetId }) => targetId === "effect-typescript",
    );
    const gleamResult = qualification.results.find(({ targetId }) => targetId === "gleam-beam");
    const effectEvidence = qualification.evidence.find(
      ({ targetId }) => targetId === "effect-typescript",
    );
    const gleamEvidence = qualification.evidence.find(({ targetId }) => targetId === "gleam-beam");
    if (effectResult === undefined || gleamResult === undefined) {
      return yield* failure(
        "qualification",
        selection.qualificationSelection,
        "invalid-evidence-set",
        "M031 qualification did not expose both target candidates",
      );
    }
    if (effectEvidence === undefined || gleamEvidence === undefined) {
      return yield* failure(
        "qualification",
        selection.qualificationSelection,
        "invalid-evidence-set",
        "M031 qualification did not expose both checked target evidence records",
      );
    }

    const effectContribution = yield* makeEffectPlanningContribution({
      qualification: effectResult,
      evidence: effectEvidence,
    }).pipe(
      Effect.mapError((error) =>
        mapBoundaryError("contribution", selection.qualificationSelection, error),
      ),
    );
    const gleamContribution = yield* makeGleamPlanningContribution({
      qualification: gleamResult,
      evidence: gleamEvidence,
    }).pipe(
      Effect.mapError((error) =>
        mapBoundaryError("contribution", selection.qualificationSelection, error),
      ),
    );

    const report = yield* planObjective(selection, [effectContribution, gleamContribution]).pipe(
      Effect.mapError((error) => mapBoundaryError("planning", absolutePath, error)),
    );
    const publicationEntries = yield* addPlanPublication(
      root,
      selection,
      report,
      qualification.publicationEntries,
    );
    return {
      selection,
      report,
      text: formatPlan(report),
      qualification,
      publicationEntries,
    };
  });

/** Stage fresh M031 qualification, plan it, and publish one deterministic closure. */
export const compileSelectedPlan = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  { readonly report: PlanningReport; readonly text: string },
  PlanFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const staged = yield* compileSelectedPlanStaged(root, selectionPath);
    const path = yield* Path.Path;
    yield* publishAtomically(root, staged.publicationEntries).pipe(
      Effect.mapError((error) =>
        mapBoundaryError("publication", path.resolve(root, selectionPath), error),
      ),
    );
    return { report: staged.report, text: staged.text };
  });

export const formatPlanFailure = (error: PlanFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`];
  if (error.reason.length > 0) lines.push(`reason: ${error.reason}`);
  if (error.address !== undefined) lines.push(`address: ${error.address}`);
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};
