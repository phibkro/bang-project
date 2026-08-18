import { Effect, Schema } from "effect";
import {
  M024ChannelTraceSchema,
  type M024ChannelSelection,
  type M024ChannelTrace,
} from "@bang/theories";

const parseOptions = { onExcessProperty: "error" } as const;

export type M024ChannelRuntimeFailureReason =
  | "unknown-message"
  | "invalid-attempt"
  | "invalid-completion"
  | "trace-inconsistency";

const M024ChannelRuntimeFailureReasonSchema = Schema.Literals([
  "unknown-message",
  "invalid-attempt",
  "invalid-completion",
  "trace-inconsistency",
]);

/** A failure means that a selection which passed semantic validation was inconsistent at execution time. */
export class M024ChannelRuntimeError extends Schema.TaggedError<M024ChannelRuntimeError>()(
  "M024ChannelRuntimeError",
  {
    reason: M024ChannelRuntimeFailureReasonSchema,
    scheduleId: Schema.String,
    message: Schema.String,
  },
) {}

const runtimeFailure = (
  reason: M024ChannelRuntimeFailureReason,
  scheduleId: string,
  message: string,
): M024ChannelRuntimeError => new M024ChannelRuntimeError({ reason, scheduleId, message });

type CandidateObservation = Record<string, unknown>;

type CandidateScheduleTrace = {
  readonly scheduleId: string;
  readonly observations: ReadonlyArray<CandidateObservation>;
  readonly finalStates: {
    readonly ownerA: "waiting" | "complete";
    readonly ownerB: "idle" | "prepared" | "committed";
  };
  readonly stateMutations: number;
};

const executeSchedule = (
  schedule: M024ChannelSelection["schedules"][number],
  ownerA: string,
  ownerB: string,
  messages: ReadonlyMap<string, M024ChannelSelection["protocol"]["messages"][number]>,
): Effect.Effect<CandidateScheduleTrace, M024ChannelRuntimeError> =>
  Effect.gen(function* () {
    const observations: CandidateObservation[] = [];
    const handledMessages = new Set<string>();
    const attempts = new Set<string>();
    let sequence = 0;
    let ownerAState: "waiting" | "complete" = "waiting";
    let ownerBState: "idle" | "prepared" | "committed" = "idle";
    let stateMutations = 0;

    const nextSequence = (): number => {
      sequence += 1;
      return sequence;
    };

    for (const step of schedule.steps) {
      if (step.action === "complete") {
        if (step.ownerId !== ownerA) {
          return yield* Effect.fail(
            runtimeFailure(
              "invalid-completion",
              schedule.id,
              `completion step targets ${step.ownerId}, expected ${ownerA}`,
            ),
          );
        }
        if (ownerAState !== "waiting") {
          return yield* Effect.fail(
            runtimeFailure(
              "invalid-completion",
              schedule.id,
              "completion step requires owner-a to still be waiting",
            ),
          );
        }
        const previousState = ownerAState;
        ownerAState = "complete";
        stateMutations += 1;
        observations.push({
          _tag: "ForcedCompletion",
          sequence: nextSequence(),
          ownerId: step.ownerId,
          previousState,
          nextState: "complete",
        });
        continue;
      }

      if (attempts.has(step.attemptId)) {
        return yield* Effect.fail(
          runtimeFailure(
            "invalid-attempt",
            schedule.id,
            `delivery attempt ${step.attemptId} occurs more than once`,
          ),
        );
      }
      attempts.add(step.attemptId);

      const message = messages.get(step.messageId);
      if (message === undefined) {
        return yield* Effect.fail(
          runtimeFailure(
            "unknown-message",
            schedule.id,
            `schedule step references unknown logical message ${step.messageId}`,
          ),
        );
      }

      const attemptId = step.attemptId;
      observations.push({
        _tag: "Sent",
        sequence: nextSequence(),
        attemptId,
        messageId: message.id,
      });

      if (step.action === "drop") {
        observations.push({
          _tag: "Dropped",
          sequence: nextSequence(),
          attemptId,
          messageId: message.id,
        });
        continue;
      }

      observations.push({
        _tag: "Delivered",
        sequence: nextSequence(),
        attemptId,
        messageId: message.id,
      });

      const expectedOwner = message.operation === "Ack" ? ownerA : ownerB;
      const expectedSender = message.operation === "Ack" ? ownerB : ownerA;
      if (message.receiver !== expectedOwner || message.sender !== expectedSender) {
        observations.push({
          _tag: "Rejected",
          sequence: nextSequence(),
          attemptId,
          messageId: message.id,
          ownerId: message.receiver,
          reason: "wrong-recipient",
        });
        continue;
      }

      if (handledMessages.has(message.id)) {
        observations.push({
          _tag: "DuplicateIgnored",
          sequence: nextSequence(),
          attemptId,
          messageId: message.id,
          ownerId: expectedOwner,
        });
        continue;
      }

      if (message.causalParent !== undefined && !handledMessages.has(message.causalParent)) {
        observations.push({
          _tag: "Rejected",
          sequence: nextSequence(),
          attemptId,
          messageId: message.id,
          ownerId: expectedOwner,
          reason: "causal-parent-not-handled",
        });
        continue;
      }

      if (
        (message.operation === "Prepare" && ownerBState !== "idle") ||
        (message.operation === "Commit" && ownerBState !== "prepared") ||
        (message.operation === "Ack" && ownerAState !== "waiting")
      ) {
        observations.push({
          _tag: "Rejected",
          sequence: nextSequence(),
          attemptId,
          messageId: message.id,
          ownerId: expectedOwner,
          reason: "wrong-state",
        });
        continue;
      }

      handledMessages.add(message.id);
      if (message.operation === "Prepare") {
        ownerBState = "prepared";
      } else if (message.operation === "Commit") {
        ownerBState = "committed";
      } else {
        ownerAState = "complete";
      }
      stateMutations += 1;
      observations.push({
        _tag: "Handled",
        sequence: nextSequence(),
        attemptId,
        messageId: message.id,
        ownerId: expectedOwner,
      });
    }

    return {
      scheduleId: schedule.id,
      observations,
      finalStates: {
        ownerA: ownerAState,
        ownerB: ownerBState,
      },
      stateMutations,
    };
  });

/** Execute every encoded schedule through one deterministic in-process scheduler. */
export const runM024ChannelSelection = Effect.fn("runM024ChannelSelection")(function* (
  selection: M024ChannelSelection,
) {
  const ownerA = selection.protocol.owners[0];
  const ownerB = selection.protocol.owners[1];
  if (ownerA === undefined || ownerB === undefined || ownerA === ownerB) {
    return yield* Effect.fail(
      runtimeFailure(
        "trace-inconsistency",
        "selection",
        "validated selection does not contain two distinct owners",
      ),
    );
  }

  const messages = new Map(
    selection.protocol.messages.map((message) => [message.id, message] as const),
  );
  const schedules: CandidateScheduleTrace[] = [];
  for (const schedule of selection.schedules) {
    schedules.push(yield* executeSchedule(schedule, ownerA, ownerB, messages));
  }

  const candidate = {
    bangChannelTrace: 1,
    protocolId: selection.protocol.id,
    protocolVersion: selection.protocol.version,
    schedules,
  };

  return yield* Schema.decodeUnknownEffect(M024ChannelTraceSchema)(candidate, parseOptions).pipe(
    Effect.mapError((issue) =>
      runtimeFailure(
        "trace-inconsistency",
        "selection",
        `invalid generated M024 trace: ${String(issue)}`,
      ),
    ),
  );
});

export type { M024ChannelSelection, M024ChannelTrace };
