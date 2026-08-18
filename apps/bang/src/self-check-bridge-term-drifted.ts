import { decodeBridgeTerm, type BridgeTerm } from "@bang/core";
import { Effect, Schema } from "effect";

export class DeliberateDecoderDrift extends Schema.TaggedError<DeliberateDecoderDrift>()(
  "DeliberateDecoderDrift",
  { message: Schema.String },
) {}

export const bridgeTermDecoder = {
  decode: (input: unknown): Effect.Effect<BridgeTerm, unknown> =>
    decodeBridgeTerm(input).pipe(
      Effect.flatMap((value) => {
        if (
          value.kind === "application" &&
          value.arguments.some((argument) => argument.kind === "variable")
        ) {
          return new DeliberateDecoderDrift({
            message: "terminal variable arguments are not supported",
          });
        }
        return Effect.succeed(value);
      }),
    ),
};
