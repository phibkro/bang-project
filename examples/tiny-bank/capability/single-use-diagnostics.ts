import {
  debitAccountGrantRemainingUses,
  DebitAccount,
  observeWithdrawAccountOnce,
  type WithdrawAccountOnceObservation,
} from "../../../generated/effect/WithdrawAccountOnce.ts";
import {
  debitAccountLayer,
  runDefectSingleUseJourney,
  runLawfulSingleUseJourney,
  withdrawAccountOnceLayer,
} from "./account-withdrawal-once-effect.ts";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Layer } from "effect";

const boundary = Layer.mergeAll(debitAccountLayer, withdrawAccountOnceLayer);

type NegativeScenarios = {
  readonly wrongDestination: {
    readonly grantId: string;
    readonly remainingUsesBefore: number;
    readonly outcome: WithdrawAccountOnceObservation;
  };
  readonly disabled: {
    readonly grantId: string;
    readonly remainingUsesBefore: number;
    readonly outcome: WithdrawAccountOnceObservation;
  };
};

const runNegativeScenarios: Effect.Effect<NegativeScenarios, never> = Effect.gen(function* () {
  const issuer = yield* DebitAccount;
  const wrongGrant = yield* issuer.issueGrant;
  const wrongRemainingUsesBefore = yield* debitAccountGrantRemainingUses(wrongGrant);
  const wrongDestination = yield* observeWithdrawAccountOnce(
    wrongGrant,
    "account-2",
    { balance: 10n },
    1n,
  );
  const disabledGrant = yield* issuer.issueGrant;
  const disabledRemainingUsesBefore = yield* debitAccountGrantRemainingUses(disabledGrant);
  const disabled = yield* observeWithdrawAccountOnce(
    disabledGrant,
    "account-1",
    { balance: 10n },
    11n,
  );
  return {
    wrongDestination: {
      grantId: wrongGrant.grantId,
      remainingUsesBefore: wrongRemainingUsesBefore,
      outcome: wrongDestination,
    },
    disabled: {
      grantId: disabledGrant.grantId,
      remainingUsesBefore: disabledRemainingUsesBefore,
      outcome: disabled,
    },
  };
}).pipe(
  // This executable diagnostic selects its fixture layer at the composition root.
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(boundary),
);

const toJson = (value: unknown): string =>
  JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? Number(nested) : nested));

const program = Effect.gen(function* () {
  const lawful = yield* runLawfulSingleUseJourney();
  const negatives = yield* runNegativeScenarios;
  const defect = yield* runDefectSingleUseJourney();
  yield* Console.log(
    `BANG_M018_RESULT|${toJson({
      entityId: lawful.entityId,
      initialState: lawful.initialState,
      grantId: lawful.grantId,
      first: lawful.calls[0],
      second: lawful.calls[1],
      wrongDestination: negatives.wrongDestination,
      disabled: negatives.disabled,
      defect: {
        grantId: defect.grantId,
        first: defect.calls[0],
        reuse: defect.calls[1],
      },
    })}`,
  );
});

BunRuntime.runMain(program);
