import { checkAccountLedgerProperties } from "../../../generated/effect/AccountLedgerBridge.ts";
import {
  accountBalance,
  inconsistentLedgerBalance,
  ledgerBalance,
} from "../implementation/account-ledger.ts";

const options = { seed: 20260813, numRuns: 100 } as const;

console.log(
  JSON.stringify({
    lawful: checkAccountLedgerProperties(accountBalance, ledgerBalance, options),
    inconsistent: checkAccountLedgerProperties(accountBalance, inconsistentLedgerBalance, options),
  }),
);
