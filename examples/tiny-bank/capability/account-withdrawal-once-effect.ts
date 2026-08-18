import {
  DebitAccount,
  debitAccountGrantRemainingUses,
  debitAccountLayer,
  makeDebitAccountLayer,
  makeWithdrawAccountOnceLayer,
  observeWithdrawAccountOnce,
  type WithdrawAccountOnce,
  type DebitAccountGrant,
  type WithdrawAccountOnceImplementation,
  type WithdrawAccountOnceObservation,
  type WithdrawAccountOnceRequirements,
} from "../../../generated/effect/WithdrawAccountOnce.ts";
import { Effect, Layer } from "effect";
export { debitAccountLayer };

type IsExact<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

export const capabilityRequirementIsRetained: IsExact<
  WithdrawAccountOnceRequirements,
  DebitAccount
> = true;

export const defectDebitAccountLayer = makeDebitAccountLayer("defect");

export const withdrawAccountOnceImplementation = {
  withdraw: Effect.fn("accountWithdrawOnceImplementation.withdraw")((state, amount) =>
    Effect.succeed({ balance: state.balance - amount }),
  ),
} satisfies WithdrawAccountOnceImplementation;

export const withdrawAccountOnceLayer = makeWithdrawAccountOnceLayer(
  withdrawAccountOnceImplementation,
);

export const defectingWithdrawAccountOnceImplementation = {
  withdraw: Effect.fn("defectingWithdrawAccountOnceImplementation.withdraw")(() =>
    Effect.die("controlled M018 implementation defect"),
  ),
} satisfies WithdrawAccountOnceImplementation;

export const defectingWithdrawAccountOnceLayer = makeWithdrawAccountOnceLayer(
  defectingWithdrawAccountOnceImplementation,
);

export interface SingleUseCall {
  readonly sequence: number;
  readonly invocationId: string;
  readonly grantId: string;
  readonly destination: string;
  readonly amount: bigint;
  readonly preState: { readonly balance: bigint };
  readonly remainingUsesBefore: number;
  readonly outcome: WithdrawAccountOnceObservation;
}

export interface SingleUseJourney {
  readonly entityId: "account-1";
  readonly initialState: { readonly balance: 10n };
  readonly grantId: string;
  readonly calls: readonly [SingleUseCall, SingleUseCall];
}

const stateOf = (observation: WithdrawAccountOnceObservation): { readonly balance: bigint } =>
  observation.state;

const runTwoCalls = (
  boundary: Layer.Layer<DebitAccount | WithdrawAccountOnce>,
  invocationPrefix: "withdraw" | "defect-withdraw",
): Effect.Effect<SingleUseJourney, never> =>
  Effect.gen(function* () {
    const issuer = yield* DebitAccount;
    const grant: DebitAccountGrant = yield* issuer.issueGrant;
    const entityId = "account-1" as const;
    const initialState = { balance: 10n } as const;
    const firstState = initialState;
    const firstRemainingUsesBefore = yield* debitAccountGrantRemainingUses(grant);
    const first = yield* observeWithdrawAccountOnce(grant, entityId, firstState, 4n);
    const secondState = stateOf(first);
    const secondRemainingUsesBefore = yield* debitAccountGrantRemainingUses(grant);
    const second = yield* observeWithdrawAccountOnce(grant, entityId, secondState, 1n);
    return {
      entityId,
      initialState,
      grantId: grant.grantId,
      calls: [
        {
          sequence: 0,
          invocationId: `${invocationPrefix}-1`,
          grantId: grant.grantId,
          destination: entityId,
          amount: 4n,
          preState: firstState,
          remainingUsesBefore: firstRemainingUsesBefore,
          outcome: first,
        },
        {
          sequence: 1,
          invocationId: `${invocationPrefix}-2`,
          grantId: grant.grantId,
          destination: entityId,
          amount: 1n,
          preState: secondState,
          remainingUsesBefore: secondRemainingUsesBefore,
          outcome: second,
        },
      ] as const,
    };
  }).pipe(
    // The fixture layer is selected at this executable composition boundary.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(boundary),
  );
export const runLawfulSingleUseJourney = Effect.fn("runLawfulSingleUseJourney")(
  function* (): Effect.fn.Return<SingleUseJourney, never> {
    return yield* runTwoCalls(
      Layer.mergeAll(debitAccountLayer, withdrawAccountOnceLayer),
      "withdraw",
    );
  },
);

export const runDefectSingleUseJourney = Effect.fn("runDefectSingleUseJourney")(
  function* (): Effect.fn.Return<SingleUseJourney, never> {
    return yield* runTwoCalls(
      Layer.mergeAll(defectDebitAccountLayer, defectingWithdrawAccountOnceLayer),
      "defect-withdraw",
    );
  },
);
