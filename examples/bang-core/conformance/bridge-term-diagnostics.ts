import { checkBridgeTermDecoder } from "../../../generated/effect/BridgeTerm.ts";
import {
  bridgeTermDecoder,
  driftedBridgeTermDecoder,
} from "../implementation/bridge-term-decoder.ts";

const options = { seed: 20260813, numRuns: 100 } as const;

console.log(
  JSON.stringify({
    lawful: checkBridgeTermDecoder(bridgeTermDecoder, options),
    drifted: checkBridgeTermDecoder(driftedBridgeTermDecoder, options),
  }),
);
