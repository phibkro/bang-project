export interface AccountTransferInput {
  readonly sourceBalance: bigint;
  readonly targetBalance: bigint;
  readonly amount: bigint;
}

export interface AccountTransferResult {
  readonly sourceBalanceAfter: bigint;
  readonly targetBalanceAfter: bigint;
}

/** Independent arithmetic for the M027 transfer command. */
export const transferAccountState = ({
  sourceBalance,
  targetBalance,
  amount,
}: AccountTransferInput): AccountTransferResult => ({
  sourceBalanceAfter: sourceBalance - amount,
  targetBalanceAfter: targetBalance + amount,
});

/** Stable app-local name for the independent handler. */
export const accountTransfer = transferAccountState;
