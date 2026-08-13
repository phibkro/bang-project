import { registerAccountStateMachineProperties } from "../../../generated/effect/AccountStateMachine.ts";
import { accountStateMachine } from "../implementation/account-state-machine.ts";

registerAccountStateMachineProperties(accountStateMachine, {
  seed: 20260813,
  numRuns: 100,
});
