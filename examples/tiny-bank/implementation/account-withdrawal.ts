export const withdrawAccountState = (
  state: { readonly balance: bigint },
  amount: bigint,
): { readonly balance: bigint } => ({ balance: state.balance - amount });
