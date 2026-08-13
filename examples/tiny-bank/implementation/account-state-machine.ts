import type { AccountStateMachineModel } from "../../../generated/effect/AccountStateMachine.ts";
import { withdrawAccountState } from "./account-withdrawal.ts";

export const accountStateMachine = {
  initialize: (initialBalance) => ({ balance: initialBalance }),
  withdraw: withdrawAccountState,
} satisfies AccountStateMachineModel;

export const brokenAccountStateMachine = {
  initialize: (initialBalance) => ({ balance: initialBalance }),
  withdraw: (_state, _amount) => ({ balance: -1n }),
} satisfies AccountStateMachineModel;
