import { observeWithdrawAccount } from "../../../generated/effect/WithdrawAccount.ts";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Layer, Match } from "effect";
import {
  debitAccountLayer,
  defectingWithdrawAccountLayer,
  withdrawAccountLayer,
} from "../implementation/account-withdrawal-effect.ts";

const serialize = Match.type<
  | { readonly _tag: "Success"; readonly state: { readonly balance: bigint } }
  | {
      readonly _tag: "TypedFailure";
      readonly error: {
        readonly _tag: "WithdrawalRejected";
        readonly state: { readonly balance: bigint };
        readonly amount: bigint;
      };
    }
  | { readonly _tag: "Defect"; readonly defect: string }
  | { readonly _tag: "UnexpectedFailure"; readonly cause: string }
>().pipe(
  Match.tag("Success", ({ state }) => ({
    _tag: "Success" as const,
    state: { balance: String(state.balance) },
  })),
  Match.tag("TypedFailure", ({ error }) => ({
    _tag: "TypedFailure" as const,
    error: {
      _tag: "WithdrawalRejected" as const,
      state: { balance: String(error.state.balance) },
      amount: String(error.amount),
    },
  })),
  Match.tag("Defect", ({ defect }) => ({ _tag: "Defect" as const, defect })),
  Match.tag("UnexpectedFailure", ({ cause }) => ({
    _tag: "UnexpectedFailure" as const,
    cause,
  })),
  Match.exhaustive,
);

const lawfulBoundary = Layer.mergeAll(withdrawAccountLayer, debitAccountLayer);
const defectingBoundary = Layer.mergeAll(defectingWithdrawAccountLayer, debitAccountLayer);

const program = Effect.gen(function* () {
  const success = yield* observeWithdrawAccount({ balance: 10n }, 4n).pipe(
    // This executable diagnostic is an application composition root.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(lawfulBoundary),
  );
  const rejected = yield* observeWithdrawAccount({ balance: 10n }, 11n).pipe(
    // This executable diagnostic is an application composition root.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(lawfulBoundary),
  );
  const defect = yield* observeWithdrawAccount({ balance: 10n }, 4n).pipe(
    // This executable diagnostic is an application composition root.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(defectingBoundary),
  );

  yield* Console.log(
    JSON.stringify({ success: serialize(success), rejected: serialize(rejected), defect }),
  );
});

BunRuntime.runMain(program);
