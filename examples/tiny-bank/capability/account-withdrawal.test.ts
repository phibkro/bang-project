import { registerWithdrawAccountConformance } from "../../../generated/effect/WithdrawAccount.ts";
import {
  debitAccountLayer,
  defectingWithdrawAccountLayer,
  withdrawAccountLayer,
} from "../implementation/account-withdrawal-effect.ts";

registerWithdrawAccountConformance(
  withdrawAccountLayer,
  defectingWithdrawAccountLayer,
  debitAccountLayer,
  {
    enabled: {
      state: { balance: 10n },
      amount: 4n,
      expectedState: { balance: 6n },
    },
    disabled: {
      state: { balance: 10n },
      amount: 11n,
    },
  },
);
