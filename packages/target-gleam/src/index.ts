import type { CheckedM031TargetQualificationEvidence } from "@bang/evidence";
import {
  makePlanningContribution,
  type PlanningContribution,
  type PlanningError,
} from "@bang/planning";
import type { M023ClassificationResult } from "@bang/theories";
import type { Effect } from "effect";
import type {
  CheckedCoreDocument,
  OperationRealizationDeclaration,
  StateMachineDeclaration,
  StateOperation,
  StatePredicate,
  StateValue,
} from "@bang/core";

export type GleamTargetProjectionReason =
  | "missing-declaration"
  | "inconsistent-declaration"
  | "unsupported-target"
  | "invalid-identifier"
  | "identifier-collision";

export interface GleamTargetProjectionError {
  readonly _tag: "GleamTargetProjectionError";
  readonly reason: GleamTargetProjectionReason;
  readonly source: string;
  readonly message: string;
  readonly identifier?: string;
}

export type GleamTargetProjectionResult =
  | { readonly ok: true; readonly _tag: "Success"; readonly value: string }
  | {
      readonly ok: false;
      readonly _tag: "Failure";
      readonly error: GleamTargetProjectionError;
    };

const gleamKeywords: Record<string, true> = {
  as: true,
  assert: true,
  case: true,
  const: true,
  echo: true,
  else: true,
  fn: true,
  if: true,
  import: true,
  let: true,
  pub: true,
  todo: true,
  type: true,
  use: true,
};

const expected = {
  machine: "Account",
  state: "AccountState",
  stateField: "balance",
  initializer: "initialize",
  initializerParameter: "initialBalance",
  transition: "withdraw",
  transitionParameter: "amount",
  invariant: "nonnegativeBalance",
  capability: "DebitAccount",
  realization: "WithdrawAccount",
  failure: "WithdrawalRejected",
};

const generatedIdentifiers: Record<string, true> = {
  Account: true,
  AccountState: true,
  AccountMessage: true,
  AccountReply: true,
  AccountEntity: true,
  Message: true,
  Reply: true,
  DebitAccount: true,
  WithdrawalRejected: true,
  ExternalMessageRejected: true,
  StartError: true,
  Succeeded: true,
  TypedFailure: true,
  WrongDestination: true,
  Withdraw: true,
  Balance: true,
  Stop: true,
  ForceFailure: true,
  account_entity_id: true,
  core_state_machine_id: true,
  core_initializer_id: true,
  core_operation_id: true,
  core_realization_id: true,
  core_capability_id: true,
  core_failure_id: true,
  debit_account: true,
  start_supervised: true,
  withdraw: true,
  balance: true,
  dispatch_external: true,
  force_failure: true,
  account_pid: true,
  lookup: true,
  stop: true,
  supervisor_alive: true,
};

const quote = (value: string): string => JSON.stringify(value);

const failure = (
  reason: GleamTargetProjectionReason,
  source: string,
  message: string,
  identifier?: string,
): GleamTargetProjectionResult => ({
  ok: false,
  _tag: "Failure",
  error: {
    _tag: "GleamTargetProjectionError",
    reason,
    source,
    message,
    ...(identifier === undefined ? {} : { identifier }),
  },
});

const invalidIdentifier = (
  identifier: string,
  source: string,
  kind: "type" | "value",
): GleamTargetProjectionResult | undefined => {
  const valid =
    kind === "type"
      ? /^[A-Z][A-Za-z0-9]*$/.test(identifier)
      : /^[a-z][A-Za-z0-9]*$/.test(identifier);
  if (!valid) {
    return failure(
      "invalid-identifier",
      source,
      `Gleam ${kind} identifier ${identifier} is not valid`,
      identifier,
    );
  }
  if (gleamKeywords[identifier] === true) {
    return failure(
      "invalid-identifier",
      source,
      `Gleam identifier ${identifier} is a reserved keyword`,
      identifier,
    );
  }
  return undefined;
};

const unsupported = (source: string, message: string): GleamTargetProjectionResult =>
  failure("unsupported-target", source, message);

const inconsistent = (source: string, message: string): GleamTargetProjectionResult =>
  failure("inconsistent-declaration", source, message);

const matchesValue = (value: StateValue, kind: StateValue["kind"], name: string): boolean => {
  if (kind === "parameter") {
    return value.kind === "parameter" && value.id === name;
  }
  if (kind === "stateField") {
    return value.kind === "stateField" && value.field === name;
  }
  return value.kind === "integerLiteral" && value.value === name;
};

const matchesPredicate = (
  predicate: StatePredicate,
  leftKind: StateValue["kind"],
  leftName: string,
  rightKind: StateValue["kind"],
  rightName: string,
): boolean =>
  predicate.kind === "greaterThanOrEqual" &&
  matchesValue(predicate.left, leftKind, leftName) &&
  matchesValue(predicate.right, rightKind, rightName);

const hasPredicate = (
  predicates: ReadonlyArray<StatePredicate>,
  leftKind: StateValue["kind"],
  leftName: string,
  rightKind: StateValue["kind"],
  rightName: string,
): boolean =>
  predicates.some((predicate) =>
    matchesPredicate(predicate, leftKind, leftName, rightKind, rightName),
  );

const safeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "malformed checked Core document";

const projectCapabilityIds = (
  requirements: OperationRealizationDeclaration["requires"],
): ReadonlyArray<string> => requirements.map(({ capability }) => capability);

const emitAccountEntity = (
  machine: StateMachineDeclaration,
  initializer: StateOperation,
  operation: StateOperation,
  realization: OperationRealizationDeclaration,
): string => {
  const machineId = machine.id;
  const stateId = machine.state.id;
  const stateField = machine.state.fields[0]?.id ?? expected.stateField;
  const initializerId = initializer.id;
  const operationId = operation.id;
  const capabilityId = projectCapabilityIds(realization.requires)[0] ?? expected.capability;
  const realizationId = realization.id;
  const failureId = realization.disabled.id;

  return [
    "//// Generated by BANG M017. Do not edit.",
    `//// Checked Core: ${machineId}.${initializerId}, ${machineId}.${operationId}, ${realizationId}, ${capabilityId}, ${failureId}.`,
    "//// This module is a deterministic target projection, not a Core authority.",
    "",
    "import gleam/dynamic",
    "import gleam/dynamic/decode",
    "import gleam/erlang/process",
    "import gleam/otp/actor",
    "import gleam/otp/static_supervisor",
    "import gleam/otp/supervision",
    "",
    `pub const core_state_machine_id = ${quote(machineId)}`,
    `pub const core_initializer_id = ${quote(initializerId)}`,
    `pub const core_operation_id = ${quote(operationId)}`,
    `pub const core_realization_id = ${quote(realizationId)}`,
    `pub const core_capability_id = ${quote(capabilityId)}`,
    `pub const core_failure_id = ${quote(failureId)}`,
    'pub const message_type = "Withdraw"',
    'pub const account_entity_id = "account-1"',
    "",
    `pub type ${stateId} {`,
    `  ${stateId}(${stateField}: Int)`,
    "}",
    "",
    "pub opaque type DebitAccount {",
    "  DebitAccount",
    "}",
    "",
    "pub fn debit_account() -> DebitAccount {",
    "  DebitAccount",
    "}",
    "",
    "pub type Reply {",
    "  Succeeded(",
    "    entity_id: String,",
    "    message_id: String,",
    "    message_type: String,",
    `    state: ${stateId},`,
    "  )",
    "  TypedFailure(",
    "    entity_id: String,",
    "    message_id: String,",
    "    message_type: String,",
    "    failure_id: String,",
    `    state: ${stateId},`,
    "  )",
    "  WrongDestination(",
    "    entity_id: String,",
    "    message_id: String,",
    "    message_type: String,",
    "    destination: String,",
    `    state: ${stateId},`,
    "  )",
    "}",
    "",
    "pub type ExternalMessageRejected {",
    "  ExternalMessageRejected",
    "}",
    "",
    "pub type StartError {",
    "  InvalidInitialBalance(balance: Int)",
    "  SupervisorStartFailed",
    "}",
    "",
    "pub opaque type Account {",
    "  Account(",
    "    name: process.Name(Message),",
    "    supervisor_pid: process.Pid,",
    "    entity_id: String,",
    "  )",
    "}",
    "",
    "pub type Message {",
    "  Withdraw(",
    "    reply_to: process.Subject(Reply),",
    "    destination: String,",
    "    message_id: String,",
    "    amount: Int,",
    "  )",
    "  Balance(reply_to: process.Subject(Int))",
    "  Stop(reply_to: process.Subject(Nil))",
    "  ForceFailure",
    "}",
    "",
    "fn handle_message(",
    "  entity_id: String,",
    `  state: ${stateId},`,
    "  message: Message,",
    `) -> actor.Next(${stateId}, Message) {`,
    "  case message {",
    "    Withdraw(reply_to:, destination:, message_id:, amount:) -> {",
    "      let accepted = destination == entity_id && amount >= 0 && state.balance >= amount",
    `      let next_state = case accepted { True -> ${stateId}(${stateField}: state.${stateField} - amount) False -> state }`,
    "      let reply = case destination == entity_id {",
    "        False -> WrongDestination(",
    "          entity_id: entity_id,",
    "          message_id: message_id,",
    "          message_type: message_type,",
    "          destination: destination,",
    "          state: state,",
    "        )",
    "        True -> case accepted {",
    "          True -> Succeeded(entity_id: entity_id, message_id: message_id, message_type: message_type, state: next_state)",
    "          False -> TypedFailure(",
    "            entity_id: entity_id,",
    "            message_id: message_id,",
    "            message_type: message_type,",
    "            failure_id: core_failure_id,",
    "            state: state,",
    "          )",
    "        }",
    "      }",
    "      actor.send(reply_to, reply)",
    "      actor.continue(next_state)",
    "    }",
    "    Balance(reply_to) -> {",
    `      actor.send(reply_to, state.${stateField})`,
    "      actor.continue(state)",
    "    }",
    "    Stop(reply_to) -> {",
    "      actor.send(reply_to, Nil)",
    "      actor.stop()",
    "    }",
    '    ForceFailure -> actor.stop_abnormal("controlled failure")',
    "  }",
    "}",
    "",
    "fn start_actor(",
    "  name: process.Name(Message),",
    "  initial_balance: Int,",
    ") -> actor.StartResult(process.Subject(Message)) {",
    `  actor.new(${stateId}(${stateField}: initial_balance))`,
    "  |> actor.named(name)",
    "  |> actor.on_message(fn(state, message) {",
    "    handle_message(account_entity_id, state, message)",
    "  })",
    "  |> actor.start",
    "}",
    "",
    "pub fn start_supervised(",
    "  name: process.Name(Message),",
    "  initial_balance: Int,",
    ") -> Result(Account, StartError) {",
    "  case initial_balance < 0 {",
    "    True -> Error(InvalidInitialBalance(initial_balance))",
    "    False -> {",
    "      let child =",
    "        supervision.worker(fn() { start_actor(name, initial_balance) })",
    "        |> supervision.restart(supervision.Transient)",
    "        |> supervision.significant(True)",
    "      let builder =",
    "        static_supervisor.new(static_supervisor.OneForOne)",
    "        |> static_supervisor.auto_shutdown(static_supervisor.AnySignificant)",
    "        |> static_supervisor.add(child)",
    "      case static_supervisor.start(builder) {",
    "        Ok(started) -> {",
    "          process.unlink(started.pid)",
    "          Ok(Account(name: name, supervisor_pid: started.pid, entity_id: account_entity_id))",
    "        }",
    "        Error(_) -> Error(SupervisorStartFailed)",
    "      }",
    "    }",
    "  }",
    "}",
    "fn dispatch(",
    "  account: Account,",
    "  _capability: DebitAccount,",
    "  destination: String,",
    "  amount: Int,",
    "  message_id: String,",
    ") -> Reply {",
    "  actor.call(process.named_subject(account.name), 5_000, fn(reply_to) {",
    "    Withdraw(",
    "      reply_to: reply_to,",
    "      destination: destination,",
    "      message_id: message_id,",
    "      amount: amount,",
    "    )",
    "  })",
    "}",
    "",
    "pub fn withdraw(",
    "  account: Account,",
    "  capability: DebitAccount,",
    "  amount: Int,",
    "  message_id: String,",
    ") -> Reply {",
    "  dispatch(account, capability, account.entity_id, amount, message_id)",
    "}",
    "",
    "pub fn balance(account: Account) -> Int {",
    "  actor.call(process.named_subject(account.name), 5_000, Balance)",
    "}",
    "",
    "pub fn dispatch_external(",
    "  account: Account,",
    "  value: dynamic.Dynamic,",
    ") -> Result(Reply, ExternalMessageRejected) {",
    "  let decoder = {",
    '    use destination <- decode.field("destination", decode.string)',
    '    use message_id <- decode.field("message_id", decode.string)',
    '    use amount <- decode.field("amount", decode.int)',
    "    decode.success(#(destination, message_id, amount))",
    "  }",
    "  case decode.run(value, decoder) {",
    "    Ok(#(destination, message_id, amount)) ->",
    "      Ok(dispatch(account, debit_account(), destination, amount, message_id))",
    "    Error(_) -> Error(ExternalMessageRejected)",
    "  }",
    "}",
    "",
    "pub fn force_failure(account: Account) -> Nil {",
    "  actor.send(process.named_subject(account.name), ForceFailure)",
    "}",
    "",
    "pub fn account_pid(account: Account) -> Result(process.Pid, Nil) {",
    "  process.named(account.name)",
    "}",
    "",
    "pub fn lookup(account: Account) -> Result(Account, Nil) {",
    "  case process.named(account.name) {",
    "    Ok(_) -> Ok(account)",
    "    Error(_) -> Error(Nil)",
    "  }",
    "}",
    "",
    "pub fn supervisor_alive(account: Account) -> Bool {",
    "  process.is_alive(account.supervisor_pid)",
    "}",
    "",
    "pub fn stop(account: Account) -> Nil {",
    "  actor.call(process.named_subject(account.name), 5_000, Stop)",
    "}",
    "",
  ].join("\n");
};

const validateAccountProjection = (
  document: CheckedCoreDocument,
  stateMachineId: string,
  realizationId: string,
  options: {
    readonly quantityKind: "unbounded" | "exactly";
    readonly quantityUses?: string;
    readonly failureId: string;
    readonly generatedIdentifiers?: Record<string, true>;
  } = {
    quantityKind: "unbounded",
    failureId: expected.failure,
  },
):
  | GleamTargetProjectionResult
  | {
      readonly machine: StateMachineDeclaration;
      readonly initializer: StateOperation;
      readonly operation: StateOperation;
      readonly realization: OperationRealizationDeclaration;
    } => {
  const realization = document.declarations.find(
    (declaration): declaration is OperationRealizationDeclaration =>
      declaration.kind === "operationRealization" && declaration.id === realizationId,
  );
  if (realization === undefined) {
    return failure(
      "missing-declaration",
      `operationRealization:${realizationId}`,
      `Gleam entity projection cannot resolve checked realization ${realizationId}`,
    );
  }
  const realizationIdentifierFailure = invalidIdentifier(
    realization.id,
    `operationRealization:${realization.id}`,
    "type",
  );
  if (realizationIdentifierFailure !== undefined) return realizationIdentifierFailure;
  if (realization.operation.stateMachine !== stateMachineId) {
    return inconsistent(
      `operationRealization:${realization.id}.stateMachine:${realization.operation.stateMachine}`,
      `Gleam entity projection realization ${realization.id} targets ${realization.operation.stateMachine}, not ${stateMachineId}`,
    );
  }

  const machine = document.declarations.find(
    (declaration): declaration is StateMachineDeclaration =>
      declaration.kind === "stateMachine" && declaration.id === stateMachineId,
  );
  if (machine === undefined) {
    return failure(
      "missing-declaration",
      `stateMachine:${stateMachineId}`,
      `Gleam entity projection cannot resolve checked state machine ${stateMachineId}`,
    );
  }
  const machineIdentifierFailure = invalidIdentifier(
    machine.id,
    `stateMachine:${machine.id}`,
    "type",
  );
  if (machineIdentifierFailure !== undefined) return machineIdentifierFailure;
  if (machine.id !== expected.machine) {
    return unsupported(
      `stateMachine:${machine.id}`,
      `Gleam entity projection supports only checked state machine ${expected.machine}`,
    );
  }
  if (machine.state.id !== expected.state) {
    const stateIdentifierFailure = invalidIdentifier(
      machine.state.id,
      `stateMachine:${machine.id}.state:${machine.state.id}`,
      "type",
    );
    return (
      stateIdentifierFailure ??
      unsupported(
        `stateMachine:${machine.id}.state:${machine.state.id}`,
        `Gleam entity projection supports only state ${expected.state}`,
      )
    );
  }
  if (machine.state.fields.length !== 1) {
    return unsupported(
      `stateMachine:${machine.id}.state`,
      `Gleam entity projection requires exactly one Account state field`,
    );
  }
  const stateField = machine.state.fields[0];
  if (stateField === undefined) {
    return unsupported(
      `stateMachine:${machine.id}.state`,
      `Gleam entity projection cannot recover the Account state field`,
    );
  }
  const stateFieldIdentifierFailure = invalidIdentifier(
    stateField.id,
    `stateMachine:${machine.id}.stateField:${stateField.id}`,
    "value",
  );
  if (stateFieldIdentifierFailure !== undefined) return stateFieldIdentifierFailure;
  if (stateField.id !== expected.stateField || stateField.type !== "Integer") {
    return unsupported(
      `stateMachine:${machine.id}.stateField:${stateField.id}`,
      `Gleam entity projection requires Integer field ${machine.id}.${expected.stateField}`,
    );
  }

  if (machine.initializers.length === 0) {
    return failure(
      "missing-declaration",
      `stateMachine:${machine.id}.initializer`,
      `Gleam entity projection cannot resolve the checked ${expected.initializer} initializer`,
    );
  }
  if (machine.initializers.length !== 1) {
    return unsupported(
      `stateMachine:${machine.id}.initializers`,
      `Gleam entity projection requires exactly one Account initializer`,
    );
  }
  const initializer = machine.initializers[0];
  if (initializer === undefined || initializer.id !== expected.initializer) {
    return inconsistent(
      `stateMachine:${machine.id}.initializer`,
      `Gleam entity projection requires initializer ${machine.id}.${expected.initializer}`,
    );
  }
  const initializerIdentifierFailure = invalidIdentifier(
    initializer.id,
    `stateMachine:${machine.id}.initializer:${initializer.id}`,
    "value",
  );
  if (initializerIdentifierFailure !== undefined) return initializerIdentifierFailure;
  if (initializer.parameters.length !== 1) {
    return unsupported(
      `stateMachine:${machine.id}.${initializer.id}.parameters`,
      `Gleam entity projection requires one Integer initializer parameter`,
    );
  }
  const initializerParameter = initializer.parameters[0];
  if (initializerParameter === undefined) {
    return unsupported(
      `stateMachine:${machine.id}.${initializer.id}.parameters`,
      `Gleam entity projection cannot recover the initializer parameter`,
    );
  }
  const initializerParameterIdentifierFailure = invalidIdentifier(
    initializerParameter.id,
    `stateMachine:${machine.id}.${initializer.id}.parameter:${initializerParameter.id}`,
    "value",
  );
  if (initializerParameterIdentifierFailure !== undefined)
    return initializerParameterIdentifierFailure;
  if (
    initializerParameter.id !== expected.initializerParameter ||
    initializerParameter.type !== "Integer" ||
    initializer.requires.length !== 1 ||
    !hasPredicate(
      initializer.requires,
      "parameter",
      expected.initializerParameter,
      "integerLiteral",
      "0",
    )
  ) {
    return unsupported(
      `stateMachine:${machine.id}.${initializer.id}`,
      `Gleam entity projection requires ${expected.initializerParameter} >= 0`,
    );
  }

  if (machine.transitions.length === 0) {
    return failure(
      "missing-declaration",
      `stateMachine:${machine.id}.transition`,
      `Gleam entity projection cannot resolve the checked ${expected.transition} transition`,
    );
  }
  if (machine.transitions.length !== 1) {
    return unsupported(
      `stateMachine:${machine.id}.transitions`,
      `Gleam entity projection requires exactly one Account transition`,
    );
  }
  const operation = machine.transitions[0];
  if (operation === undefined || operation.id !== expected.transition) {
    return inconsistent(
      `stateMachine:${machine.id}.transition`,
      `Gleam entity projection requires transition ${machine.id}.${expected.transition}`,
    );
  }
  const operationIdentifierFailure = invalidIdentifier(
    operation.id,
    `stateMachine:${machine.id}.transition:${operation.id}`,
    "value",
  );
  if (operationIdentifierFailure !== undefined) return operationIdentifierFailure;
  if (operation.parameters.length !== 1) {
    return unsupported(
      `stateMachine:${machine.id}.${operation.id}.parameters`,
      `Gleam entity projection requires one Integer withdrawal parameter`,
    );
  }
  const operationParameter = operation.parameters[0];
  if (operationParameter === undefined) {
    return unsupported(
      `stateMachine:${machine.id}.${operation.id}.parameters`,
      `Gleam entity projection cannot recover the withdrawal parameter`,
    );
  }
  const operationParameterIdentifierFailure = invalidIdentifier(
    operationParameter.id,
    `stateMachine:${machine.id}.${operation.id}.parameter:${operationParameter.id}`,
    "value",
  );
  if (operationParameterIdentifierFailure !== undefined) return operationParameterIdentifierFailure;
  if (
    operationParameter.id !== expected.transitionParameter ||
    operationParameter.type !== "Integer" ||
    operation.requires.length !== 2 ||
    !hasPredicate(
      operation.requires,
      "parameter",
      expected.transitionParameter,
      "integerLiteral",
      "0",
    ) ||
    !hasPredicate(
      operation.requires,
      "stateField",
      expected.stateField,
      "parameter",
      expected.transitionParameter,
    )
  ) {
    return unsupported(
      `stateMachine:${machine.id}.${operation.id}`,
      `Gleam entity projection requires ${expected.transitionParameter} >= 0 and ${expected.stateField} >= ${expected.transitionParameter}`,
    );
  }

  if (machine.invariants.length !== 1) {
    return unsupported(
      `stateMachine:${machine.id}.invariants`,
      `Gleam entity projection requires exactly one Account invariant`,
    );
  }
  const invariant = machine.invariants[0];
  if (
    invariant === undefined ||
    invariant.id !== expected.invariant ||
    !matchesPredicate(
      invariant.proposition,
      "stateField",
      expected.stateField,
      "integerLiteral",
      "0",
    )
  ) {
    return unsupported(
      `stateMachine:${machine.id}.invariants`,
      `Gleam entity projection requires invariant ${expected.invariant}: ${expected.stateField} >= 0`,
    );
  }

  const capability = document.declarations.find(
    (declaration) => declaration.kind === "capability" && declaration.id === expected.capability,
  );
  if (capability === undefined) {
    return inconsistent(
      `capability:${expected.capability}`,
      `Gleam entity projection cannot resolve checked capability ${expected.capability}`,
    );
  }
  const requirement = realization.requires[0];
  if (
    realization.requires.length !== 1 ||
    requirement === undefined ||
    requirement.capability !== expected.capability ||
    requirement.quantity.kind !== options.quantityKind ||
    (requirement.quantity.kind === "exactly" && requirement.quantity.uses !== options.quantityUses)
  ) {
    return unsupported(
      `operationRealization:${realization.id}.requires`,
      options.quantityKind === "exactly"
        ? `Gleam entity projection requires exactly ${options.quantityUses ?? "one"} ${expected.capability}`
        : `Gleam entity projection requires exactly one unbounded ${expected.capability}`,
    );
  }
  if (realization.disabled.kind !== "failure" || realization.disabled.id !== options.failureId) {
    return unsupported(
      `operationRealization:${realization.id}.disabled`,
      `Gleam entity projection supports only disabled failure ${options.failureId}`,
    );
  }

  const selectedIdentifiers = new Set([
    machine.id,
    machine.state.id,
    stateField.id,
    initializer.id,
    initializerParameter.id,
    operation.id,
    operationParameter.id,
    invariant.id,
    capability.id,
    realization.id,
    realization.disabled.id,
  ]);
  const projectionGeneratedIdentifiers = options.generatedIdentifiers ?? generatedIdentifiers;
  const collision = document.declarations.find(
    (declaration) =>
      !selectedIdentifiers.has(declaration.id) &&
      projectionGeneratedIdentifiers[declaration.id] === true,
  );
  if (collision !== undefined) {
    return failure(
      "identifier-collision",
      `operationRealization:${realization.id}`,
      `Gleam generated identifier ${collision.id} collides with checked Core declaration ${collision.id}`,
      collision.id,
    );
  }

  return { machine, initializer, operation, realization };
};

/** Projects the checked M015 Account entity into one deterministic Gleam actor module. */
export const projectGleamEntityOperationRealization = (
  document: CheckedCoreDocument,
  stateMachineId: string,
  realizationId: string,
): GleamTargetProjectionResult => {
  const source = `operationRealization:${realizationId}`;
  try {
    if (document.bangCore !== 1 || !Array.isArray(document.declarations)) {
      return inconsistent(source, "Gleam entity projection requires a checked Core document");
    }
    const projection = validateAccountProjection(document, stateMachineId, realizationId);
    if ("ok" in projection) return projection;
    return {
      ok: true,
      _tag: "Success",
      value: emitAccountEntity(
        projection.machine,
        projection.initializer,
        projection.operation,
        projection.realization,
      ),
    };
  } catch (error) {
    return failure(
      "inconsistent-declaration",
      source,
      `Gleam entity projection rejected malformed checked Core input: ${safeErrorMessage(error)}`,
    );
  }
};
const exactOneGeneratedIdentifiers: Record<string, true> = {
  Account: true,
  AccountState: true,
  AccountMessage: true,
  AccountReply: true,
  AccountGrant: true,
  AccountEntity: true,
  ActorState: true,
  Message: true,
  RemainingUses: true,
  Grant: true,
  Reply: true,
  StartError: true,
  InvalidInitialBalance: true,
  SupervisorStartFailed: true,
  Success: true,
  CapabilityUseRejected: true,
  StaleGrantRejected: true,
  WrongDestination: true,
  DomainRejected: true,
  Withdraw: true,
  IssueGrant: true,
  DefectWithdraw: true,
  Balance: true,
  CounterMessage: true,
  NextIncarnation: true,
  Stop: true,
  account_entity_id: true,
  core_state_machine_id: true,
  core_initializer_id: true,
  core_operation_id: true,
  core_realization_id: true,
  core_capability_id: true,
  core_failure_id: true,
  start_supervised: true,
  start_counter: true,
  next_incarnation: true,
  balance: true,
  issue_grant: true,
  grant_id: true,
  withdraw: true,
  defect_withdraw: true,
  competing: true,
  remaining_uses: true,
  lookup: true,
  supervisor_alive: true,
  stop: true,
  run_exact_one_probe: true,
};

const emitExactOneAccountEntity = (
  machine: StateMachineDeclaration,
  initializer: StateOperation,
  operation: StateOperation,
  realization: OperationRealizationDeclaration,
): string => {
  const machineId = machine.id;
  const stateId = machine.state.id;
  const stateField = machine.state.fields[0]?.id ?? expected.stateField;
  const initializerId = initializer.id;
  const operationId = operation.id;
  const parameterId = operation.parameters[0]?.id ?? expected.transitionParameter;
  const capabilityId = projectCapabilityIds(realization.requires)[0] ?? expected.capability;
  const realizationId = realization.id;
  const failureId = realization.disabled.id;

  return [
    "//// Generated by BANG M031. Do not edit.",
    `//// Checked Core: ${machineId}.${initializerId}, ${machineId}.${operationId}, ${realizationId}, ${capabilityId}, ${failureId}.`,
    "//// This module is a deterministic target projection, not a Core authority.",
    "//// Runtime process identifiers are intentionally not part of the probe output.",
    "",
    "import gleam/erlang/process",
    "import gleam/erlang/reference",
    "import gleam/int",
    "import gleam/list",
    "import gleam/otp/actor",
    "import gleam/otp/static_supervisor",
    "import gleam/otp/supervision",
    "",
    `pub const core_state_machine_id = ${quote(machineId)}`,
    `pub const core_initializer_id = ${quote(initializerId)}`,
    `pub const core_operation_id = ${quote(operationId)}`,
    `pub const core_realization_id = ${quote(realizationId)}`,
    `pub const core_capability_id = ${quote(capabilityId)}`,
    `pub const core_failure_id = ${quote(failureId)}`,
    'pub const message_type = "WithdrawAccountOnce"',
    'pub const account_entity_id = "account-1"',
    "",
    `pub type ${stateId} {`,
    `  ${stateId}(${stateField}: Int)`,
    "}",
    "",
    "pub opaque type Grant {",
    "  Grant(token: String, incarnation: reference.Reference)",
    "}",
    "",
    "pub fn grant_id(grant: Grant) -> String {",
    "  grant.token",
    "}",
    "",
    "pub type Reply {",
    `  Success(state: ${stateId}, remaining_uses: Int, implementation_calls: Int)`,
    `  CapabilityUseRejected(state: ${stateId}, remaining_uses: Int, implementation_calls: Int)`,
    `  StaleGrantRejected(state: ${stateId}, remaining_uses: Int, implementation_calls: Int)`,
    `  WrongDestination(destination: String, expected_destination: String, state: ${stateId}, remaining_uses: Int, implementation_calls: Int)`,
    `  DomainRejected(failure_id: String, state: ${stateId}, remaining_uses: Int, implementation_calls: Int)`,
    "}",
    "",
    "pub type StartError {",
    "  InvalidInitialBalance(balance: Int)",
    "  SupervisorStartFailed",
    "}",
    "",
    "pub opaque type Account {",
    "  Account(",
    "    name: process.Name(Message),",
    "    supervisor_pid: process.Pid,",
    "  )",
    "}",
    "",
    "pub type Message {",
    "  IssueGrant(reply_to: process.Subject(Grant))",
    "  Withdraw(",
    "    reply_to: process.Subject(Reply),",
    "    grant: Grant,",
    "    destination: String,",
    `    ${parameterId}: Int,`,
    "  )",
    "  DefectWithdraw(",
    "    grant: Grant,",
    "    destination: String,",
    `    ${parameterId}: Int,`,
    "  )",
    "  Balance(reply_to: process.Subject(Int))",
    "  RemainingUses(reply_to: process.Subject(Int), grant: Grant)",
    "  Stop(reply_to: process.Subject(Nil))",
    "}",
    "",
    "pub type CounterMessage {",
    "  NextIncarnation(reply_to: process.Subject(Int))",
    "}",
    "",
    "fn start_counter(",
    "  name: process.Name(CounterMessage),",
    ") -> actor.StartResult(process.Subject(CounterMessage)) {",
    "  actor.new(1)",
    "  |> actor.named(name)",
    "  |> actor.on_message(fn(next, message) {",
    "    case message {",
    "      NextIncarnation(reply_to) -> {",
    "        actor.send(reply_to, next)",
    "        actor.continue(next + 1)",
    "      }",
    "    }",
    "  })",
    "  |> actor.start",
    "}",
    "",
    "fn next_incarnation(name: process.Name(CounterMessage)) -> Int {",
    "  actor.call(process.named_subject(name), 5_000, fn(reply_to) { NextIncarnation(reply_to) })",
    "}",
    "",
    "type ActorState {",
    "  ActorState(",
    "    balance: Int,",
    "    incarnation: reference.Reference,",
    "    incarnation_id: Int,",
    "    next_grant: Int,",
    "    consumed_grants: List(String),",
    "    implementation_calls: Int,",
    "  )",
    "}",
    "",
    "fn remaining_for(state: ActorState, grant: Grant) -> Int {",
    "  case grant.incarnation == state.incarnation {",
    "    False -> 0",
    "    True -> case list.contains(state.consumed_grants, any: grant.token) {",
    "      True -> 0",
    "      False -> 1",
    "    }",
    "  }",
    "}",
    "",
    "fn state_value(state: ActorState) -> AccountState {",
    `  ${stateId}(${stateField}: state.balance)`,
    "}",
    "",
    "fn transition_enabled(state: ActorState, amount: Int) -> Bool {",
    "  amount >= 0 && state.balance >= amount",
    "}",
    "",
    "fn consumed_state(state: ActorState, grant: Grant) -> ActorState {",
    "  ActorState(",
    "    balance: state.balance,",
    "    incarnation: state.incarnation,",
    "    incarnation_id: state.incarnation_id,",
    "    next_grant: state.next_grant,",
    "    consumed_grants: [grant.token, ..state.consumed_grants],",
    "    implementation_calls: state.implementation_calls + 1,",
    "  )",
    "}",
    "",
    "fn handle_withdraw(",
    "  state: ActorState,",
    "  reply_to: process.Subject(Reply),",
    "  grant: Grant,",
    "  destination: String,",
    `  ${parameterId}: Int,`,
    ") -> actor.Next(ActorState, Message) {",
    "  let remaining_uses = remaining_for(state, grant)",
    "  case grant.incarnation == state.incarnation {",
    "    False -> {",
    "      actor.send(",
    "        reply_to,",
    "        StaleGrantRejected(",
    "          state: state_value(state),",
    "          remaining_uses: 0,",
    "          implementation_calls: state.implementation_calls,",
    "        ),",
    "      )",
    "      actor.continue(state)",
    "    }",
    "    True -> case destination == account_entity_id {",
    "      False -> {",
    "        actor.send(",
    "          reply_to,",
    "          WrongDestination(",
    "            destination: destination,",
    "            expected_destination: account_entity_id,",
    "            state: state_value(state),",
    "            remaining_uses: remaining_uses,",
    "            implementation_calls: state.implementation_calls,",
    "          ),",
    "        )",
    "        actor.continue(state)",
    "      }",
    "      True -> case transition_enabled(state, amount) {",
    "        False -> {",
    "          actor.send(",
    "            reply_to,",
    "            DomainRejected(",
    "              failure_id: core_failure_id,",
    "              state: state_value(state),",
    "              remaining_uses: remaining_uses,",
    "              implementation_calls: state.implementation_calls,",
    "            ),",
    "          )",
    "          actor.continue(state)",
    "        }",
    "        True -> case remaining_uses {",
    "          0 -> {",
    "            actor.send(",
    "              reply_to,",
    "              CapabilityUseRejected(",
    "                state: state_value(state),",
    "                remaining_uses: 0,",
    "                implementation_calls: state.implementation_calls,",
    "              ),",
    "            )",
    "            actor.continue(state)",
    "          }",
    "          _ -> {",
    "            let consumed = consumed_state(state, grant)",
    "            let next = ActorState(",
    `              balance: consumed.balance - ${parameterId},`,
    "              incarnation: consumed.incarnation,",
    "              incarnation_id: consumed.incarnation_id,",
    "              next_grant: consumed.next_grant,",
    "              consumed_grants: consumed.consumed_grants,",
    "              implementation_calls: consumed.implementation_calls,",
    "            )",
    "            actor.send(",
    "              reply_to,",
    "              Success(",
    "                state: state_value(next),",
    "                remaining_uses: 0,",
    "                implementation_calls: next.implementation_calls,",
    "              ),",
    "            )",
    "            actor.continue(next)",
    "          }",
    "        }",
    "      }",
    "    }",
    "  }",
    "}",
    "",
    "fn handle_defect_withdraw(",
    "  state: ActorState,",
    "  grant: Grant,",
    "  destination: String,",
    `  ${parameterId}: Int,`,
    ") -> actor.Next(ActorState, Message) {",
    "  let remaining_uses = remaining_for(state, grant)",
    "  case grant.incarnation == state.incarnation {",
    "    False -> actor.continue(state)",
    "    True -> case destination == account_entity_id {",
    "      False -> actor.continue(state)",
    "      True -> case transition_enabled(state, amount) {",
    "        False -> actor.continue(state)",
    "        True -> case remaining_uses {",
    "          0 -> actor.continue(state)",
    "          _ -> {",
    "            let _consumed = consumed_state(state, grant)",
    '            actor.stop_abnormal("controlled M031 implementation defect after consumption")',
    "          }",
    "        }",
    "      }",
    "    }",
    "  }",
    "}",
    "",
    "fn handle_message(",
    "  state: ActorState,",
    "  message: Message,",
    ") -> actor.Next(ActorState, Message) {",
    "  case message {",
    "    IssueGrant(reply_to) -> {",
    '      let token = "grant-" <> int.to_string(state.incarnation_id) <> "-" <> int.to_string(state.next_grant)',
    "      let grant = Grant(token: token, incarnation: state.incarnation)",
    "      actor.send(reply_to, grant)",
    "      actor.continue(ActorState(",
    "        balance: state.balance,",
    "        incarnation: state.incarnation,",
    "        next_grant: state.next_grant + 1,",
    "        incarnation_id: state.incarnation_id,",
    "        consumed_grants: state.consumed_grants,",
    "        implementation_calls: state.implementation_calls,",
    "      ))",
    "    }",
    "    Withdraw(reply_to, grant, destination, amount) ->",
    "      handle_withdraw(state, reply_to, grant, destination, amount)",
    "    DefectWithdraw(grant, destination, amount) ->",
    "      handle_defect_withdraw(state, grant, destination, amount)",
    "    Balance(reply_to) -> {",
    "      actor.send(reply_to, state.balance)",
    "      actor.continue(state)",
    "    }",
    "    RemainingUses(reply_to, grant) -> {",
    "      actor.send(reply_to, remaining_for(state, grant))",
    "      actor.continue(state)",
    "    }",
    "    Stop(reply_to) -> {",
    "      actor.send(reply_to, Nil)",
    "      actor.stop()",
    "    }",
    "  }",
    "}",
    "",
    "fn start_actor(",
    "  name: process.Name(Message),",
    "  initial_balance: Int,",
    "  counter_name: process.Name(CounterMessage),",
    ") -> actor.StartResult(process.Subject(Message)) {",
    "  let incarnation_id = next_incarnation(counter_name)",
    "  let initial = ActorState(",
    "    balance: initial_balance,",
    "    incarnation: reference.new(),",
    "    incarnation_id: incarnation_id,",
    "    next_grant: 1,",
    "    consumed_grants: [],",
    "    implementation_calls: 0,",
    "  )",
    "  actor.new(initial)",
    "  |> actor.named(name)",
    "  |> actor.on_message(handle_message)",
    "  |> actor.start",
    "}",
    "",
    "pub fn start_supervised(",
    "  name: process.Name(Message),",
    "  initial_balance: Int,",
    ") -> Result(Account, StartError) {",
    "  case initial_balance < 0 {",
    "    True -> Error(InvalidInitialBalance(initial_balance))",
    "    False -> {",
    '      let counter_name = process.new_name("bang_m031_counter")',
    "      let counter_child =",
    "        supervision.worker(fn() { start_counter(counter_name) })",
    "        |> supervision.restart(supervision.Transient)",
    "        |> supervision.significant(False)",
    "      let child =",
    "        supervision.worker(fn() { start_actor(name, initial_balance, counter_name) })",
    "        |> supervision.restart(supervision.Transient)",
    "        |> supervision.significant(True)",
    "      let builder =",
    "        static_supervisor.new(static_supervisor.OneForOne)",
    "        |> static_supervisor.auto_shutdown(static_supervisor.AnySignificant)",
    "        |> static_supervisor.add(counter_child)",
    "        |> static_supervisor.add(child)",
    "      case static_supervisor.start(builder) {",
    "        Ok(started) -> {",
    "          process.unlink(started.pid)",
    "          Ok(Account(name: name, supervisor_pid: started.pid))",
    "        }",
    "        Error(_) -> Error(SupervisorStartFailed)",
    "      }",
    "    }",
    "  }",
    "}",
    "",
    "pub fn issue_grant(account: Account) -> Grant {",
    "  actor.call(process.named_subject(account.name), 5_000, fn(reply_to) {",
    "    IssueGrant(reply_to)",
    "  })",
    "}",
    "",
    "pub fn withdraw(",
    "  account: Account,",
    "  grant: Grant,",
    "  destination: String,",
    `  ${parameterId}: Int,`,
    ") -> Reply {",
    "  actor.call(process.named_subject(account.name), 5_000, fn(reply_to) {",
    "    Withdraw(",
    "      reply_to: reply_to,",
    "      grant: grant,",
    "      destination: destination,",
    `      ${parameterId}: ${parameterId},`,
    "    )",
    "  })",
    "}",
    "",
    "pub fn competing(",
    "  account: Account,",
    "  grant: Grant,",
    "  destination: String,",
    `  ${parameterId}: Int,`,
    ") -> Result(#(Reply, Reply), Nil) {",
    "  let first_reply = process.new_subject()",
    "  let second_reply = process.new_subject()",
    "  let subject = process.named_subject(account.name)",
    "  actor.send(subject, Withdraw(",
    "    reply_to: first_reply,",
    "    grant: grant,",
    "    destination: destination,",
    `    ${parameterId}: ${parameterId},`,
    "  ))",
    "  actor.send(subject, Withdraw(",
    "    reply_to: second_reply,",
    "    grant: grant,",
    "    destination: destination,",
    `    ${parameterId}: ${parameterId},`,
    "  ))",
    "  case #(process.receive(first_reply, within: 5_000), process.receive(second_reply, within: 5_000)) {",
    "    #(Ok(first), Ok(second)) -> Ok(#(first, second))",
    "    _ -> Error(Nil)",
    "  }",
    "}",
    "",
    "pub fn defect_withdraw(",
    "  account: Account,",
    "  grant: Grant,",
    "  destination: String,",
    `  ${parameterId}: Int,`,
    ") -> Nil {",
    "  actor.send(",
    "    process.named_subject(account.name),",
    "    DefectWithdraw(",
    "      grant: grant,",
    "      destination: destination,",
    `      ${parameterId}: ${parameterId},`,
    "    ),",
    "  )",
    "}",
    "",
    "pub fn balance(account: Account) -> Int {",
    "  actor.call(process.named_subject(account.name), 5_000, Balance)",
    "}",
    "",
    "pub fn remaining_uses(account: Account, grant: Grant) -> Int {",
    "  actor.call(",
    "    process.named_subject(account.name),",
    "    5_000,",
    "    fn(reply_to) { RemainingUses(reply_to, grant) },",
    "  )",
    "}",
    "",
    "pub fn lookup(account: Account) -> Result(Account, Nil) {",
    "  case process.named(account.name) {",
    "    Ok(_) -> Ok(account)",
    "    Error(_) -> Error(Nil)",
    "  }",
    "}",
    "",
    "pub fn supervisor_alive(account: Account) -> Bool {",
    "  process.is_alive(account.supervisor_pid)",
    "}",
    "",
    "pub fn stop(account: Account) -> Nil {",
    "  actor.call(process.named_subject(account.name), 5_000, Stop)",
    "}",
    "",
    "fn bool_string(value: Bool) -> String {",
    "  case value {",
    '    True -> "true"',
    '    False -> "false"',
    "  }",
    "}",
    "",
    "fn state_balance(state: AccountState) -> Int {",
    `  state.${stateField}`,
    "}",
    "",
    "fn grants_are_distinct(first: Grant, second: Grant) -> Bool {",
    "  first.incarnation != second.incarnation",
    "}",
    "",
    "pub fn run_exact_one_probe() -> String {",
    '  let name = process.new_name("bang_m031_exact_one")',
    "  let assert Ok(account) = start_supervised(name, 10)",
    "  let valid_grant = issue_grant(account)",
    "  let valid_before = balance(account)",
    "  let valid_remaining_before = remaining_uses(account, valid_grant)",
    `  let valid = withdraw(account, valid_grant, account_entity_id, 4)`,
    "  let valid_after = balance(account)",
    "  let valid_remaining_after = remaining_uses(account, valid_grant)",
    "  let valid_call = case valid {",
    `    Success(state:, remaining_uses:, implementation_calls:) -> state_balance(state) == 6 && remaining_uses == 0 && implementation_calls == 1`,
    "    _ -> False",
    "  }",
    "",
    "  let reuse_before = balance(account)",
    "  let reuse_remaining_before = remaining_uses(account, valid_grant)",
    `  let reuse = withdraw(account, valid_grant, account_entity_id, 1)`,
    "  let reuse_after = balance(account)",
    "  let reuse_remaining_after = remaining_uses(account, valid_grant)",
    "  let reuse_call = case reuse {",
    "    CapabilityUseRejected(state:, remaining_uses:, implementation_calls:) ->",
    "      state_balance(state) == 6 && remaining_uses == 0 && implementation_calls == 1",
    "    _ -> False",
    "  }",
    "",
    "  let competing_grant = issue_grant(account)",
    "  let competing_before = balance(account)",
    "  let competing_remaining_before = remaining_uses(account, competing_grant)",
    "  let assert Ok(#(competing_first, competing_second)) = competing(",
    "    account,",
    "    competing_grant,",
    "    account_entity_id,",
    "    2,",
    "  )",
    "  let competing_after = balance(account)",
    "  let competing_remaining_after = remaining_uses(account, competing_grant)",
    "  let competing_call = case #(competing_first, competing_second) {",
    "    #(Success(state: first_state, remaining_uses: first_remaining, implementation_calls: first_calls), CapabilityUseRejected(state: second_state, remaining_uses: second_remaining, implementation_calls: second_calls)) ->",
    "      state_balance(first_state) == 4 && first_remaining == 0 && first_calls == 2 && state_balance(second_state) == 4 && second_remaining == 0 && second_calls == 2",
    "    _ -> False",
    "  }",
    "  let competing_successes = case competing_first {",
    "    Success(state:, remaining_uses:, implementation_calls:) -> 1",
    "    _ -> 0",
    "  } + case competing_second {",
    "    Success(state:, remaining_uses:, implementation_calls:) -> 1",
    "    _ -> 0",
    "  }",
    "  let competing_rejections = case competing_first {",
    "    CapabilityUseRejected(state:, remaining_uses:, implementation_calls:) -> 1",
    "    _ -> 0",
    "  } + case competing_second {",
    "    CapabilityUseRejected(state:, remaining_uses:, implementation_calls:) -> 1",
    "    _ -> 0",
    "  }",
    "",
    "  let wrong_grant = issue_grant(account)",
    "  let wrong_before = balance(account)",
    "  let wrong_remaining_before = remaining_uses(account, wrong_grant)",
    '  let wrong = withdraw(account, wrong_grant, "account-2", 1)',
    "  let wrong_after = balance(account)",
    "  let wrong_remaining_after = remaining_uses(account, wrong_grant)",
    "  let wrong_destination = case wrong {",
    "    WrongDestination(destination:, expected_destination:, state:, remaining_uses:, implementation_calls:) ->",
    '      destination == "account-2" && expected_destination == account_entity_id && state_balance(state) == 4 && remaining_uses == 1 && implementation_calls == 2',
    "    _ -> False",
    "  }",
    "",
    "  let disabled_grant = issue_grant(account)",
    "  let disabled_before = balance(account)",
    "  let disabled_remaining_before = remaining_uses(account, disabled_grant)",
    `  let disabled = withdraw(account, disabled_grant, account_entity_id, 9)`,
    "  let disabled_after = balance(account)",
    "  let disabled_remaining_after = remaining_uses(account, disabled_grant)",
    "  let disabled_transition = case disabled {",
    "    DomainRejected(failure_id:, state:, remaining_uses:, implementation_calls:) ->",
    `      failure_id == core_failure_id && state_balance(state) == 4 && remaining_uses == 1 && implementation_calls == 2`,
    "    _ -> False",
    "  }",
    "",
    "  let defect_grant = issue_grant(account)",
    "  let defect_before = balance(account)",
    "  let defect_remaining_before = remaining_uses(account, defect_grant)",
    `  defect_withdraw(account, defect_grant, account_entity_id, 1)`,
    "  process.sleep(50)",
    "  let stale_before = balance(account)",
    "  let stale_remaining_before = remaining_uses(account, defect_grant)",
    "  let stale = withdraw(account, defect_grant, account_entity_id, 1)",
    "  let stale_after = balance(account)",
    "  let stale_remaining_after = remaining_uses(account, defect_grant)",
    "  let replacement_grant = issue_grant(account)",
    "  let replacement_before = balance(account)",
    "  let replacement_remaining_before = remaining_uses(account, replacement_grant)",
    "  let replacement = withdraw(account, replacement_grant, account_entity_id, 3)",
    "  let replacement_after = balance(account)",
    "  let replacement_remaining_after = remaining_uses(account, replacement_grant)",
    "  let defect_after = stale_after",
    "  let defect_remaining_after = stale_remaining_after",
    "  let defect_call = case stale {",
    "    StaleGrantRejected(state:, remaining_uses:, implementation_calls:) ->",
    "      state_balance(state) == 10 && remaining_uses == 0 && implementation_calls == 0",
    "    _ -> False",
    "  }",
    "  let actor_restart = case replacement {",
    "    Success(state:, remaining_uses:, implementation_calls:) ->",
    `      state_balance(state) == 7 && remaining_uses == 0 && implementation_calls == 1 && grants_are_distinct(defect_grant, replacement_grant)`,
    "    _ -> False",
    "  }",
    "  let old_grant_rejected = case stale {",
    "    StaleGrantRejected(_, _, _) -> True",
    "    _ -> False",
    "  }",
    "  stop(account)",
    "  let payload =",
    `    ${quote('{"target":"gleam-beam","realization":"WithdrawAccountOnce","entity":"account-1",')}`,
    `    <> ${quote('"validCall":')} <> bool_string(valid_call) <> ${quote(",")}`,
    `    <> ${quote('"reuse":')} <> bool_string(reuse_call) <> ${quote(",")}`,
    `    <> ${quote('"competing":')} <> bool_string(competing_call) <> ${quote(",")}`,
    `    <> ${quote('"competingSuccesses":')} <> int.to_string(competing_successes) <> ${quote(",")}`,
    `    <> ${quote('"competingRejections":')} <> int.to_string(competing_rejections) <> ${quote(",")}`,
    `    <> ${quote('"wrongDestination":')} <> bool_string(wrong_destination) <> ${quote(",")}`,
    `    <> ${quote('"disabled":')} <> bool_string(disabled_transition) <> ${quote(",")}`,
    `    <> ${quote('"defect":')} <> bool_string(defect_call) <> ${quote(",")}`,
    `    <> ${quote('"stateTrace":{')}`,
    `    <> ${quote('"valid":"')} <> int.to_string(valid_before) <> ${quote(">")} <> int.to_string(valid_after) <> ${quote('",')}`,
    `    <> ${quote('"reuse":"')} <> int.to_string(reuse_before) <> ${quote(">")} <> int.to_string(reuse_after) <> ${quote('",')}`,
    `    <> ${quote('"competing":"')} <> int.to_string(competing_before) <> ${quote(">")} <> int.to_string(competing_after) <> ${quote('",')}`,
    `    <> ${quote('"wrongDestination":"')} <> int.to_string(wrong_before) <> ${quote(">")} <> int.to_string(wrong_after) <> ${quote('",')}`,
    `    <> ${quote('"disabled":"')} <> int.to_string(disabled_before) <> ${quote(">")} <> int.to_string(disabled_after) <> ${quote('",')}`,
    `    <> ${quote('"defect":"')} <> int.to_string(defect_before) <> ${quote(">")} <> int.to_string(defect_after) <> ${quote('",')}`,
    `    <> ${quote('"stale":"')} <> int.to_string(stale_before) <> ${quote(">")} <> int.to_string(stale_after) <> ${quote('",')}`,
    `    <> ${quote('"replacement":"')} <> int.to_string(replacement_before) <> ${quote(">")} <> int.to_string(replacement_after) <> ${quote('"},')}`,
    `    <> ${quote('"remainingTrace":{')}`,
    `    <> ${quote('"valid":"')} <> int.to_string(valid_remaining_before) <> ${quote(">")} <> int.to_string(valid_remaining_after) <> ${quote('",')}`,
    `    <> ${quote('"reuse":"')} <> int.to_string(reuse_remaining_before) <> ${quote(">")} <> int.to_string(reuse_remaining_after) <> ${quote('",')}`,
    `    <> ${quote('"competing":"')} <> int.to_string(competing_remaining_before) <> ${quote(">")} <> int.to_string(competing_remaining_after) <> ${quote('",')}`,
    `    <> ${quote('"wrongDestination":"')} <> int.to_string(wrong_remaining_before) <> ${quote(">")} <> int.to_string(wrong_remaining_after) <> ${quote('",')}`,
    `    <> ${quote('"disabled":"')} <> int.to_string(disabled_remaining_before) <> ${quote(">")} <> int.to_string(disabled_remaining_after) <> ${quote('",')}`,
    `    <> ${quote('"defect":"')} <> int.to_string(defect_remaining_before) <> ${quote(">")} <> int.to_string(defect_remaining_after) <> ${quote('",')}`,
    `    <> ${quote('"stale":"')} <> int.to_string(stale_remaining_before) <> ${quote(">")} <> int.to_string(stale_remaining_after) <> ${quote('",')}`,
    `    <> ${quote('"replacement":"')} <> int.to_string(replacement_remaining_before) <> ${quote(">")} <> int.to_string(replacement_remaining_after) <> ${quote('"},')}`,
    `    <> ${quote('"actorRestart":{"oldGrantRejected":')} <> bool_string(old_grant_rejected)`,
    `    <> ${quote(',"freshGrantDistinct":')} <> bool_string(actor_restart) <> ${quote(',"replacementGrantAccepted":')} <> bool_string(actor_restart) <> ${quote("},")}`,
    `    <> ${quote('"supervised":true}')}`,
    `  ${quote("BANG_M031_RESULT|")} <> payload`,
    "}",
  ].join("\n");
};

/** Projects the checked M031 Account exact-one realization into a supervised Gleam actor module. */
export const projectGleamExactOneOperationRealization = (
  document: CheckedCoreDocument,
  realizationId: string,
): GleamTargetProjectionResult => {
  const source = `operationRealization:${realizationId}`;
  try {
    if (document.bangCore !== 1 || !Array.isArray(document.declarations)) {
      return inconsistent(source, "Gleam exact-one projection requires a checked Core document");
    }
    if (realizationId !== "WithdrawAccountOnce") {
      return unsupported(
        source,
        "Gleam M031 exact-one projection supports only WithdrawAccountOnce",
      );
    }
    const projection = validateAccountProjection(document, "Account", realizationId, {
      quantityKind: "exactly",
      quantityUses: "1",
      failureId: "WithdrawalRejectedOnce",
      generatedIdentifiers: exactOneGeneratedIdentifiers,
    });
    if ("ok" in projection) return projection;
    return {
      ok: true,
      _tag: "Success",
      value: emitExactOneAccountEntity(
        projection.machine,
        projection.initializer,
        projection.operation,
        projection.realization,
      ),
    };
  } catch (error) {
    return failure(
      "inconsistent-declaration",
      source,
      `Gleam exact-one projection rejected malformed checked Core input: ${safeErrorMessage(error)}`,
    );
  }
};

export interface GleamPlanningContributionInput {
  readonly qualification: M023ClassificationResult;
  readonly evidence: CheckedM031TargetQualificationEvidence;
}

/** Map checked M031 supervised actor evidence into a planning contribution. */
export const makeGleamPlanningContribution = (
  input: GleamPlanningContributionInput,
): Effect.Effect<PlanningContribution, PlanningError> =>
  makePlanningContribution({
    target: "gleam-beam",
    qualification: input.qualification,
    evidence: input.evidence,
    claims: [
      { family: "runtime-model", disposition: "established", value: "supervised-actor" },
      { family: "restart", disposition: "established", value: "supervised-restart" },
      {
        family: "grant-restart",
        disposition: "established",
        value: "invalidated-on-restart",
      },
    ],
    ...(input.evidence.observations.actorRestart === undefined
      ? {}
      : { actorRestart: input.evidence.observations.actorRestart }),
  });
export interface GleamExactOneAssemblyMaterials {
  readonly paths: Readonly<{
    readonly config: "gleam.toml";
    readonly manifest: "manifest.toml";
    readonly generatedBoundary: "src/bang/account_entity.gleam";
    readonly entry: "src/main.gleam";
    readonly canonicalizer: "canonicalize_escript.escript";
  }>;
  readonly gleamToml: string;
  readonly manifestToml: string;
  readonly mainGleam: string;
  readonly canonicalizerEscript: string;
}

const gleamExactOneAssemblyPaths = Object.freeze({
  config: "gleam.toml",
  manifest: "manifest.toml",
  generatedBoundary: "src/bang/account_entity.gleam",
  entry: "src/main.gleam",
  canonicalizer: "canonicalize_escript.escript",
} as const);

/**
 * The deterministic M033 project closure around the M031 exact-one boundary.
 *
 * These are target-owned source materials. The assembler supplies the qualified
 * generated boundary separately and must not regenerate or alter these bytes.
 */
export const gleamExactOneAssemblyMaterials: GleamExactOneAssemblyMaterials = Object.freeze({
  paths: gleamExactOneAssemblyPaths,
  gleamToml: [
    'name = "main"',
    'version = "0.1.0"',
    'target = "erlang"',
    'gleam = ">= 1.18.1 and < 2.0.0"',
    "",
    "[dependencies]",
    'gleam_erlang = ">= 1.3.0 and < 2.0.0"',
    'gleam_otp = ">= 1.3.0 and < 2.0.0"',
    'gleam_stdlib = ">= 1.0.0 and < 2.0.0"',
    "",
  ].join("\n"),
  manifestToml: [
    "# This file was generated by Gleam",
    "# You typically do not need to edit this file",
    "",
    "packages = [",
    '  { name = "gleam_erlang", version = "1.3.0", build_tools = ["gleam"], requirements = ["gleam_stdlib"], otp_app = "gleam_erlang", source = "hex", outer_checksum = "1124AD3AA21143E5AF0FC5CF3D9529F6DB8CA03E43A55711B60B6B7B3874375C" },',
    '  { name = "gleam_otp", version = "1.3.0", build_tools = ["gleam"], requirements = ["gleam_erlang", "gleam_stdlib"], otp_app = "gleam_otp", source = "hex", outer_checksum = "DE4CA6850842F0266EE95317A25DD6A0A0F20CDFAB7C0ADC2E63251D7C3C72EC" },',
    '  { name = "gleam_stdlib", version = "1.0.5", build_tools = ["gleam"], requirements = [], otp_app = "gleam_stdlib", source = "hex", outer_checksum = "CEE5B6C076A85B45F60C585F4316C63EC8B7127C119D5738C3958A9C4D50404E" },',
    "]",
    "",
    "[requirements]",
    'gleam_erlang = { version = ">= 1.3.0 and < 2.0.0" }',
    'gleam_otp = { version = ">= 1.3.0 and < 2.0.0" }',
    'gleam_stdlib = { version = ">= 1.0.0 and < 2.0.0" }',
    "",
  ].join("\n"),
  mainGleam: [
    "import bang/account_entity",
    "import gleam/io",
    "",
    "pub fn main() {",
    "  io.println(account_entity.run_exact_one_probe())",
    "}",
    "",
  ].join("\n"),
  canonicalizerEscript: [
    "#!/usr/bin/env escript",
    "%%! -noshell",
    "-mode(compile).",
    '-include_lib("kernel/include/file.hrl").',
    "",
    "main([Input, Output]) ->",
    "  {ok, Full} = file:read_file(Input),",
    "  {ok, Sections} = escript:extract(Input, []),",
    "  {archive, Archive} = lists:keyfind(archive, 1, Sections),",
    "  {Pos, _} = binary:match(Full, Archive),",
    "  Prefix = binary:part(Full, 0, Pos),",
    "  Epoch = {{1980, 1, 1}, {0, 0, 0}},",
    "  {ok, Files0} = zip:foldl(",
    "    fun(Name, Info, GetBin, Acc) ->",
    "      Normal = (Info())#file_info{atime = Epoch, mtime = Epoch, ctime = Epoch},",
    "      [{Name, GetBin(), Normal} | Acc]",
    "    end,",
    "    [],",
    "    Archive",
    "  ),",
    "  Files = lists:keysort(1, Files0),",
    '  {ok, {_, CanonicalArchive}} = zip:create("archive.zip", Files, [memory]),',
    "  ok = file:write_file(Output, [Prefix, CanonicalArchive]).",
    "",
  ].join("\n"),
});
