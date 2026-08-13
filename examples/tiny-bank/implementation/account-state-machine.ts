import type { AccountStateMachineModel } from "../../../generated/effect/AccountStateMachine.ts";

export const accountStateMachine = {
  initialize: (initialBalance) => ({ balance: initialBalance }),
  withdraw: (state, amount) => ({ balance: state.balance - amount }),
} satisfies AccountStateMachineModel;

export const brokenAccountStateMachine = {
  initialize: (initialBalance) => ({ balance: initialBalance }),
  withdraw: (_state, _amount) => ({ balance: -1n }),
} satisfies AccountStateMachineModel;
