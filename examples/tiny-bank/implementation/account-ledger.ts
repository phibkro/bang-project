import type {
  AccountBalanceModel,
  LedgerBalanceModel,
} from "../../../generated/effect/AccountLedgerBridge.ts";

export const accountBalance = {
  balance: (accountId) => accountId * 10n,
} satisfies AccountBalanceModel;

export const ledgerBalance = {
  balance: (accountId) => accountId * 10n,
} satisfies LedgerBalanceModel;

export const inconsistentLedgerBalance = {
  balance: (accountId) => accountId * 10n + 1n,
} satisfies LedgerBalanceModel;
