import { registerBridgeTermDecoderConformance } from "../../../generated/effect/BridgeTerm.ts";
import { bridgeTermDecoder } from "../implementation/bridge-term-decoder.ts";

registerBridgeTermDecoderConformance(bridgeTermDecoder, {
  seed: 20260813,
  numRuns: 100,
});
