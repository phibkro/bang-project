import type { IntegerAdditionModel } from "../../../generated/effect/IntegerAdditionProperties.ts";

export const integerAddition = {
  zero: () => 0n,
  add: (left, right) => left + right,
} satisfies IntegerAdditionModel;

export const brokenIntegerAddition = {
  zero: () => 0n,
  add: (left, right) => left + right + 1n,
} satisfies IntegerAdditionModel;
