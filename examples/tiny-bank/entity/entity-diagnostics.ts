import {
  AccountEntityId,
  AccountMessage,
  makeAccountEntity,
} from "../../../generated/effect/AccountEntity.ts";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Layer, Schema } from "effect";
import { runEntityJourney } from "./account-entity.ts";
import { debitAccountLayer, withdrawAccountLayer } from "./account-withdrawal-effect.ts";

const toJson = (value: unknown): string =>
  JSON.stringify(value, (_key, nested) =>
    typeof nested === "bigint" ? nested.toString(10) : nested,
  );

const realizationBoundary = Layer.mergeAll(withdrawAccountLayer, debitAccountLayer);
const program = Effect.gen(function* () {
  const unknownMessage = yield* Effect.result(
    Schema.decodeUnknownEffect(AccountMessage)({
      _tag: "Deposit",
      destination: "account-1",
      messageId: "unknown-encoded-message",
      amount: 1n,
    }),
  );
  const stateCarryingMessage = yield* Effect.result(
    Schema.decodeUnknownEffect(AccountMessage)({
      _tag: "Withdraw",
      destination: "account-1",
      messageId: "state-carrying-message",
      amount: 1n,
      state: { balance: 1_000n },
    }),
  );
  const invalidInitialization = yield* Effect.result(
    makeAccountEntity(AccountEntityId.make("invalid-account"), -1n),
  );
  const journey = yield* runEntityJourney();
  yield* Console.log(
    toJson({
      ...journey,
      unknownEncodedRejected: unknownMessage._tag === "Failure",
      stateCarryingEncodedRejected: stateCarryingMessage._tag === "Failure",
      invalidInitializationRejected: invalidInitialization._tag === "Failure",
    }),
  );
}).pipe(
  // This executable diagnostic is the entity composition root.
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(realizationBoundary),
);

BunRuntime.runMain(program);
