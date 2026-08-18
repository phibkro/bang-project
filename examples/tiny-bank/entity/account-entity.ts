import {
  AccountEntityId,
  AccountMessageId,
  AccountWithdrawMessage,
  makeAccountEntity,
  type AccountEntity,
  type AccountEntityReply,
  type AccountMessage,
  type AccountState,
  type AccountEntityInitializationRejected,
  type DebitAccount,
  type WithdrawAccount,
} from "../../../generated/effect/AccountEntity.ts";
import { Effect } from "effect";

type IsExact<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type DispatchParameters = Parameters<AccountEntity["dispatch"]>;
type ExtraHandleKeys = Exclude<keyof AccountEntity, "entityId" | "dispatch">;

/** This compile-time witness rejects a state parameter on the public dispatch boundary. */
export const dispatchHasOnlyMessageParameter: IsExact<DispatchParameters, [AccountMessage]> = true;

/** This compile-time witness keeps the owned state and its Ref out of the entity handle. */
export const entityHandleHasNoStateSetter: IsExact<ExtraHandleKeys, never> = true;

export interface EntityJourneyStep {
  readonly sequence: number;
  readonly message: AccountMessage;
  readonly preState: AccountState;
  readonly reply: AccountEntityReply;
}

export interface EntityJourney {
  readonly entityId: AccountEntityId;
  readonly initialState: AccountState;
  readonly steps: ReadonlyArray<EntityJourneyStep>;
}

const step = (
  entity: AccountEntity,
  sequence: number,
  preState: AccountState,
  message: AccountMessage,
): Effect.Effect<EntityJourneyStep, never, DebitAccount> =>
  entity.dispatch(message).pipe(Effect.map((reply) => ({ sequence, message, preState, reply })));

const stateOf = (reply: AccountEntityReply): AccountState => reply.state;

/** Run the bounded M015 ownership journey against the generated boundary. */
export const runEntityJourney = Effect.fn("runEntityJourney")(function* (): Effect.fn.Return<
  EntityJourney,
  AccountEntityInitializationRejected,
  WithdrawAccount | DebitAccount
> {
  const entityId = AccountEntityId.make("account-1");
  const initialState: AccountState = { balance: 10n };
  const entity = yield* makeAccountEntity(entityId, initialState.balance);

  const firstMessage = AccountWithdrawMessage.make({
    destination: entityId,
    messageId: AccountMessageId.make("withdraw-1"),
    amount: 4n,
  });
  const first = yield* step(entity, 0, initialState, firstMessage);

  const secondMessage = AccountWithdrawMessage.make({
    destination: entityId,
    messageId: AccountMessageId.make("withdraw-2"),
    amount: 2n,
  });
  const second = yield* step(entity, 1, stateOf(first.reply), secondMessage);

  const overdraftMessage = AccountWithdrawMessage.make({
    destination: entityId,
    messageId: AccountMessageId.make("withdraw-overdraft"),
    amount: 5n,
  });
  const overdraft = yield* step(entity, 2, stateOf(second.reply), overdraftMessage);

  const otherEntityId = AccountEntityId.make("account-2");
  const wrongDestinationMessage = AccountWithdrawMessage.make({
    destination: otherEntityId,
    messageId: AccountMessageId.make("withdraw-wrong-destination"),
    amount: 1n,
  });
  const wrongDestination = yield* step(
    entity,
    3,
    stateOf(overdraft.reply),
    wrongDestinationMessage,
  );

  return {
    entityId,
    initialState,
    steps: [first, second, overdraft, wrongDestination],
  };
});
