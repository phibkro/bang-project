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
    requirement.quantity.kind !== "unbounded"
  ) {
    return unsupported(
      `operationRealization:${realization.id}.requires`,
      `Gleam entity projection requires exactly one unbounded ${expected.capability}`,
    );
  }
  if (realization.disabled.kind !== "failure" || realization.disabled.id !== expected.failure) {
    return unsupported(
      `operationRealization:${realization.id}.disabled`,
      `Gleam entity projection supports only disabled failure ${expected.failure}`,
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
  const collision = document.declarations.find(
    (declaration) =>
      !selectedIdentifiers.has(declaration.id) && generatedIdentifiers[declaration.id] === true,
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
