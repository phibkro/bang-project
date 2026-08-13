import { registerAccountLedgerProperties } from "../../../generated/effect/AccountLedgerBridge.ts";
import { accountBalance, ledgerBalance } from "../implementation/account-ledger.ts";

registerAccountLedgerProperties(accountBalance, ledgerBalance, {
  seed: 20260813,
  numRuns: 100,
});
