import { decodeBridgeTerm } from "@bang/core";
import type { BridgeTerm, BridgeTermDecoder } from "../../../generated/effect/BridgeTerm.ts";
import { Effect, Match, Schema } from "effect";

export const bridgeTermDecoder: BridgeTermDecoder = {
  decode: (input) => decodeBridgeTerm(input),
};

export class DeliberateDecoderDrift extends Schema.TaggedError<DeliberateDecoderDrift>()(
  "DeliberateDecoderDrift",
  { message: Schema.String },
) {}

export const driftedBridgeTermDecoder: BridgeTermDecoder = {
  decode: (input) =>
    decodeBridgeTerm(input).pipe(
      Effect.flatMap(
        (value): Effect.Effect<BridgeTerm, unknown> =>
          Match.value(value).pipe(
            Match.when({ kind: "variable" }, (variable) => Effect.succeed(variable)),
            Match.when({ kind: "application" }, (application) =>
              application.arguments.some((argument) => argument.kind === "variable")
                ? Effect.fail(
                    new DeliberateDecoderDrift({
                      message: "terminal variable arguments are not supported",
                    }),
                  )
                : Effect.succeed(application),
            ),
            Match.exhaustive,
          ),
      ),
    ),
};
