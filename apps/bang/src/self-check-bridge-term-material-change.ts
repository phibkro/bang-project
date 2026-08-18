import { decodeBridgeTerm, type BridgeTerm } from "@bang/core";
import type { Effect } from "effect";

// Material marker: B
export const bridgeTermDecoder = {
  decode: (input: unknown): Effect.Effect<BridgeTerm, unknown> => decodeBridgeTerm(input),
};
