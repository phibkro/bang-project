import {
  observeWithdrawAccountTrace,
  type WithdrawAccountTraceEvent,
} from "../../../generated/effect/WithdrawAccountTrace.ts";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Layer } from "effect";
import {
  debitAccountLayer,
  defectingWithdrawAccountLayer,
  withdrawAccountLayer,
} from "../implementation/account-withdrawal-effect.ts";

const lawfulBoundary = Layer.mergeAll(withdrawAccountLayer, debitAccountLayer);
const defectingBoundary = Layer.mergeAll(defectingWithdrawAccountLayer, debitAccountLayer);

const serializeEvent = (event: WithdrawAccountTraceEvent): unknown => {
  switch (event._tag) {
    case "Started":
      return {
        ...event,
        preState: { balance: String(event.preState.balance) },
        input: { amount: String(event.input.amount) },
      };
    case "Succeeded":
      return { ...event, postState: { balance: String(event.postState.balance) } };
    case "TypedFailure":
    case "Defect":
      return event;
  }
};

const serializeTrace = (trace: ReadonlyArray<WithdrawAccountTraceEvent>): ReadonlyArray<unknown> =>
  trace.map(serializeEvent);

const program = Effect.gen(function* () {
  const success = yield* observeWithdrawAccountTrace(
    "withdraw-success-001",
    { balance: 10n },
    4n,
  ).pipe(
    // This executable diagnostic is an application composition root.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(lawfulBoundary),
  );
  const rejected = yield* observeWithdrawAccountTrace(
    "withdraw-rejected-001",
    { balance: 10n },
    11n,
  ).pipe(
    // This executable diagnostic is an application composition root.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(lawfulBoundary),
  );
  const defect = yield* observeWithdrawAccountTrace(
    "withdraw-defect-001",
    { balance: 10n },
    4n,
  ).pipe(
    // This executable diagnostic is an application composition root.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(defectingBoundary),
  );

  yield* Console.log(
    JSON.stringify({
      success: serializeTrace(success),
      rejected: serializeTrace(rejected),
      defect: serializeTrace(defect),
    }),
  );
});

BunRuntime.runMain(program);
