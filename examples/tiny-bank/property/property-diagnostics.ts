import { checkIntegerAdditionProperties } from "../../../generated/effect/IntegerAdditionProperties.ts";
import { brokenIntegerAddition, integerAddition } from "../implementation/integer-addition.ts";

const options = { seed: 20260813, numRuns: 100 } as const;

console.log(
  JSON.stringify({
    lawful: checkIntegerAdditionProperties(integerAddition, options),
    broken: checkIntegerAdditionProperties(brokenIntegerAddition, options),
  }),
);
