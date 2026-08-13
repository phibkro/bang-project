import { Effect, Layer } from "effect";
import { AccountService } from "../../../generated/effect/AccountService.ts";

export const AccountServiceLive = Layer.succeed(
  AccountService,
  AccountService.of({
    balance: (_accountId) => Effect.succeed(0n),
  }),
);
