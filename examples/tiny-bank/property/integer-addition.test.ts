import { registerIntegerAdditionProperties } from "../../../generated/effect/IntegerAdditionProperties.ts";
import { integerAddition } from "../implementation/integer-addition.ts";

registerIntegerAdditionProperties(integerAddition, {
  seed: 20260813,
  numRuns: 100,
});
