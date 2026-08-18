import {
  M024_CHANNEL_OBLIGATION_IDS,
  M024ChannelReportSchema,
  M024ChannelSelectionFromJson,
  M024ChannelTraceSchema,
  decodeM024ChannelSelection,
  evaluateM024ChannelTrace,
  validateM024ChannelSelection,
  type M024ChannelReport,
  type M024ChannelSelection,
  type M024ChannelTrace,
} from "@bang/theories";
import { Effect, FileSystem, Path, Schema } from "effect";

import { runM024ChannelSelection } from "./channel-runtime.ts";

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

export type TraceStage = "selection" | "validation" | "execution" | "evaluation";

const TraceStageSchema = Schema.Literals(["selection", "validation", "execution", "evaluation"]);

/** A typed M024 failure. Reports are only emitted after every stage succeeds. */
export class TraceFailure extends Schema.TaggedError<TraceFailure>()("TraceFailure", {
  stage: TraceStageSchema,
  path: Schema.String,
  message: Schema.String,
  reason: Schema.optional(Schema.String),
}) {}

const makeFailure = (
  stage: TraceStage,
  path: string,
  message: string,
  reason?: string,
): TraceFailure =>
  new TraceFailure({ stage, path, message, ...(reason === undefined ? {} : { reason }) });

const errorField = (error: unknown, field: string): unknown => {
  if (typeof error !== "object" || error === null) return undefined;
  return Object.getOwnPropertyDescriptor(error, field)?.value;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  const message = errorField(error, "message");
  return typeof message === "string" ? message : String(error);
};

const errorReason = (error: unknown): string | undefined => {
  const reason = errorField(error, "reason");
  if (typeof reason === "string") return reason;
  const tag = errorField(error, "_tag");
  return typeof tag === "string" ? tag : undefined;
};

const readSelection = (
  filePath: string,
): Effect.Effect<string, TraceFailure, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem
      .readFileString(filePath)
      .pipe(
        Effect.mapError((error) =>
          makeFailure("selection", filePath, errorMessage(error), "selection-read-failed"),
        ),
      );
  });

const decodeSelection = (
  contents: string,
  filePath: string,
): Effect.Effect<M024ChannelSelection, TraceFailure> =>
  decodeM024ChannelSelection(contents).pipe(
    Effect.mapError((error) => {
      const reason = errorReason(error);
      return makeFailure(
        reason === "schema" ? "selection" : "validation",
        filePath,
        `invalid M024 channel selection: ${errorMessage(error)}`,
        reason,
      );
    }),
  );

const validateSelection = (
  selection: M024ChannelSelection,
  filePath: string,
): Effect.Effect<void, TraceFailure> =>
  validateM024ChannelSelection(selection).pipe(
    Effect.asVoid,
    Effect.mapError((error) =>
      makeFailure(
        "validation",
        filePath,
        `invalid M024 channel selection: ${errorMessage(error)}`,
        errorReason(error),
      ),
    ),
  );

const decodeTrace = (
  trace: M024ChannelTrace,
  filePath: string,
): Effect.Effect<M024ChannelTrace, TraceFailure> =>
  Schema.decodeUnknownEffect(M024ChannelTraceSchema)(trace, parseOptions).pipe(
    Effect.mapError((error) =>
      makeFailure(
        "execution",
        filePath,
        `invalid M024 channel trace: ${errorMessage(error)}`,
        "trace-decode-failed",
      ),
    ),
  );

const decodeReport = (
  report: M024ChannelReport,
  filePath: string,
): Effect.Effect<M024ChannelReport, TraceFailure> =>
  Schema.decodeUnknownEffect(M024ChannelReportSchema)(report, parseOptions).pipe(
    Effect.mapError((error) =>
      makeFailure(
        "evaluation",
        filePath,
        `invalid M024 channel report: ${errorMessage(error)}`,
        "report-decode-failed",
      ),
    ),
  );

type M024ChannelScheduleReport = M024ChannelReport["schedules"][number];
type M024ChannelObservation = M024ChannelScheduleReport["observations"][number];

const formatObservation = (observation: M024ChannelObservation): string => {
  const identities = [
    "messageId" in observation ? `logical=${observation.messageId}` : undefined,
    "attemptId" in observation ? `attempt=${observation.attemptId}` : undefined,
    "ownerId" in observation ? `owner=${observation.ownerId}` : undefined,
    "reason" in observation ? `reason=${observation.reason}` : undefined,
    "previousState" in observation ? `previous=${observation.previousState}` : undefined,
    "nextState" in observation ? `next=${observation.nextState}` : undefined,
  ].filter((value): value is string => value !== undefined);
  return `- #${observation.sequence} ${observation._tag}${
    identities.length === 0 ? "" : ` ${identities.join(" ")}`
  }`;
};

const formatSchedule = (
  schedule: M024ChannelScheduleReport,
  ownerA: string,
  ownerB: string,
): ReadonlyArray<string> => {
  const obligations = new Map(
    schedule.obligations.map((obligation) => [obligation.obligationId, obligation]),
  );
  const lines = [
    `Schedule: ${schedule.scheduleId}`,
    `Result: ${schedule.result}`,
    `Final states: ${ownerA}=${schedule.finalStates.ownerA}; ${ownerB}=${schedule.finalStates.ownerB}`,
    `State mutations: ${String(schedule.stateMutations)}`,
    "Obligations:",
  ];
  for (const obligationId of M024_CHANNEL_OBLIGATION_IDS) {
    const obligation = obligations.get(obligationId);
    if (obligation === undefined) {
      lines.push(`- ${obligationId}: missing`);
      continue;
    }
    const details = [`- ${obligation.obligationId}: ${obligation.status}`];
    details.push(`reason=${obligation.reason}`);
    if (obligation.counterexample !== undefined) {
      const counterexample = obligation.counterexample;
      const reference = [
        counterexample.observationSequence === undefined
          ? undefined
          : `sequence=${counterexample.observationSequence}`,
        counterexample.attemptId === undefined ? undefined : `attempt=${counterexample.attemptId}`,
        counterexample.messageId === undefined ? undefined : `logical=${counterexample.messageId}`,
      ].filter((value): value is string => value !== undefined);
      details.push(
        `counterexample=${counterexample.detail}${
          reference.length === 0 ? "" : ` (${reference.join(" ")})`
        }`,
      );
    }
    lines.push(details.join("; "));
  }
  lines.push("Observations:");
  lines.push(...schedule.observations.map(formatObservation));
  return lines;
};

/** Format the fully checked M024 report without relying on object/property iteration order. */
export const formatM024ChannelReport = (
  selection: M024ChannelSelection,
  report: M024ChannelReport,
): string => {
  const lines = [
    "M024 bounded channel trace report",
    `Protocol: ${report.protocolId} (version ${report.protocolVersion})`,
    `Owners: ${selection.protocol.owners.join(", ")}`,
    "Obligations:",
    ...M024_CHANNEL_OBLIGATION_IDS.map((id) => `- ${id}`),
  ];
  const ownerA = selection.protocol.owners[0];
  const ownerB = selection.protocol.owners[1];
  for (const schedule of report.schedules) {
    lines.push("", ...formatSchedule(schedule, ownerA, ownerB));
  }
  lines.push(
    "",
    "Limitations:",
    ...report.limitations.map((limitation) => `- ${limitation}`),
    "Evidence: runtime-checked bounded deterministic in-process scheduler.",
  );
  return `${lines.join("\n")}\n`;
};

export interface M024TraceCompileResult {
  readonly selection: M024ChannelSelection;
  readonly trace: M024ChannelTrace;
  readonly report: M024ChannelReport;
  readonly text: string;
}

/** Decode, validate, execute, evaluate, and format one repository-relative selection. */
export const compileSelectedTrace = (
  root: string,
  selectionPath: string,
): Effect.Effect<M024TraceCompileResult, TraceFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (!isRepositoryRelativePath(selectionPath)) {
      return yield* Effect.fail(
        makeFailure(
          "selection",
          selectionPath,
          "unsafe repository-relative selection path",
          "unsafe-path",
        ),
      );
    }
    const resolvedSelectionPath = path.resolve(root, selectionPath);
    const selection = yield* decodeSelection(
      yield* readSelection(resolvedSelectionPath),
      resolvedSelectionPath,
    );
    yield* validateSelection(selection, resolvedSelectionPath);
    const trace = yield* runM024ChannelSelection(selection).pipe(
      Effect.mapError((error) =>
        makeFailure("execution", resolvedSelectionPath, errorMessage(error), errorReason(error)),
      ),
    );
    const checkedTrace = yield* decodeTrace(trace, resolvedSelectionPath);
    const report = yield* evaluateM024ChannelTrace(selection, checkedTrace).pipe(
      Effect.mapError((error) =>
        makeFailure("evaluation", resolvedSelectionPath, errorMessage(error), errorReason(error)),
      ),
    );
    const checkedReport = yield* decodeReport(report, resolvedSelectionPath);
    return {
      selection,
      trace: checkedTrace,
      report: checkedReport,
      text: formatM024ChannelReport(selection, checkedReport),
    };
  });

/** Format one M024 failure without a stack trace or partial report. */
export const formatTraceFailure = (error: TraceFailure): string => {
  const lines = [`stage: ${error.stage}`, `path: ${error.path}`];
  if (error.reason !== undefined) lines.push(`reason: ${error.reason}`);
  lines.push(`message: ${error.message}`);
  return lines.join("\n");
};

export { M024ChannelSelectionFromJson };
