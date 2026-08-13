import {
  checkAccountStateMachineProperties,
  isWithdrawEnabled,
} from "../../../generated/effect/AccountStateMachine.ts";
import {
  accountStateMachine,
  brokenAccountStateMachine,
} from "../implementation/account-state-machine.ts";

const options = { seed: 20260813, numRuns: 100 } as const;
const broken = checkAccountStateMachineProperties(brokenAccountStateMachine, options);
const serializedCounterexample = broken.find(({ operation }) => operation === "withdraw")
  ?.counterexample?.[0];
if (serializedCounterexample === undefined) {
  throw new Error("broken withdrawal produced no counterexample");
}
const counterexample = JSON.parse(serializedCounterexample) as {
  readonly state: { readonly balance: string };
  readonly amount: string;
};
const brokenNextStateValue = brokenAccountStateMachine.withdraw(
  { balance: BigInt(counterexample.state.balance) },
  BigInt(counterexample.amount),
);
const brokenNextState = { balance: String(brokenNextStateValue.balance) };

console.log(
  JSON.stringify({
    legalWithdrawal: isWithdrawEnabled({ balance: 10n }, 4n),
    overdraftWithdrawal: isWithdrawEnabled({ balance: 10n }, 11n),
    lawful: checkAccountStateMachineProperties(accountStateMachine, options),
    broken,
    brokenNextState,
  }),
);
