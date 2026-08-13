import {
  DebitAccount,
  makeWithdrawAccountLayer,
  type WithdrawAccountImplementation,
  type WithdrawAccountRequirements,
} from "../../../generated/effect/WithdrawAccount.ts";
import { Effect, Layer } from "effect";
import { withdrawAccountState } from "./account-withdrawal.ts";

type IsExact<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

export const capabilityRequirementIsRetained: IsExact<WithdrawAccountRequirements, DebitAccount> =
  true;

export const debitAccountLayer = Layer.succeed(
  DebitAccount,
  DebitAccount.of({ declaration: "DebitAccount" }),
);

export const withdrawAccountImplementation = {
  withdraw: Effect.fn("withdrawAccountImplementation.withdraw")((state, amount) =>
    Effect.sync(() => withdrawAccountState(state, amount)),
  ),
} satisfies WithdrawAccountImplementation;

export const defectingWithdrawAccountImplementation = {
  withdraw: Effect.fn("defectingWithdrawAccountImplementation.withdraw")((_state, _amount) =>
    Effect.die("defecting withdrawal"),
  ),
} satisfies WithdrawAccountImplementation;

export const withdrawAccountLayer = makeWithdrawAccountLayer(withdrawAccountImplementation);
export const defectingWithdrawAccountLayer = makeWithdrawAccountLayer(
  defectingWithdrawAccountImplementation,
);
