import type {
  CapabilityDeclaration,
  CheckedSemanticArtifact,
  OperationRealizationDeclaration,
  StateMachineDeclaration,
  StateValue,
} from "@bang/core";
import { Effect, Schema } from "effect";

const parseOptions = { onExcessProperty: "error" } as const;

const isRepositoryRelativePath = (value: string): boolean => {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\u0000") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value)
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
};

const RepositoryRelativePath = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(isRepositoryRelativePath, {
      expected: "a repository-relative path without traversal segments",
    }),
  ),
);

const PublicIdentity = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^[A-Za-z][A-Za-z0-9._-]*$/u.test(value), {
      expected: "a public identity without path separators",
    }),
  ),
);

const NonNegativeDecimalInteger = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^(?:0|[1-9][0-9]*)$/u.test(value), {
      expected: "a nonnegative canonical decimal integer",
    }),
  ),
);

const SelectionEntitySchema = Schema.Struct({
  id: PublicIdentity,
  stateMachine: PublicIdentity,
  initializer: PublicIdentity,
  identityField: PublicIdentity,
}).annotate({ parseOptions });

const SelectionCommandSchema = Schema.Struct({
  id: PublicIdentity,
  realization: PublicIdentity,
}).annotate({ parseOptions });

const SelectionQuerySchema = Schema.Struct({
  id: PublicIdentity,
  stateFields: Schema.NonEmptyArray(PublicIdentity),
  capabilityAvailability: PublicIdentity,
}).annotate({ parseOptions });

const SelectionSubscriptionSchema = Schema.Struct({
  id: PublicIdentity,
  query: PublicIdentity,
  mode: Schema.Literal("snapshots"),
  initialSnapshot: Schema.Literal(true),
}).annotate({ parseOptions });

const SelectionTargetSchema = Schema.Struct({
  database: Schema.Literal("sqlite"),
  api: Schema.Literal("effect-typescript"),
}).annotate({ parseOptions });

const SelectionScenarioSchema = Schema.Struct({
  accountId: PublicIdentity,
  initialBalance: NonNegativeDecimalInteger,
  withdrawAmount: NonNegativeDecimalInteger,
}).annotate({ parseOptions });

const M026SemanticDatabaseSelectionSchemaBase = Schema.Struct({
  bangSemanticDatabase: Schema.Literal(1),
  id: PublicIdentity,
  project: RepositoryRelativePath,
  entity: SelectionEntitySchema,
  command: SelectionCommandSchema,
  query: SelectionQuerySchema,
  subscription: SelectionSubscriptionSchema,
  target: SelectionTargetSchema,
  scenario: SelectionScenarioSchema,
}).annotate({ parseOptions });

type M026SemanticDatabaseSelectionValue = typeof M026SemanticDatabaseSelectionSchemaBase.Type;

const hasUniquePublicIdentities = (selection: M026SemanticDatabaseSelectionValue): boolean => {
  const identities = [
    selection.id,
    selection.entity.id,
    selection.command.id,
    selection.query.id,
    selection.subscription.id,
  ];
  return new Set(identities).size === identities.length;
};

const hasUniqueStateFields = (selection: M026SemanticDatabaseSelectionValue): boolean => {
  const fields = selection.query.stateFields;
  return new Set(fields).size === fields.length;
};
/** Strict M026 version-one data-service selection. */
export const M026SemanticDatabaseSelectionSchema = M026SemanticDatabaseSelectionSchemaBase.check(
  Schema.makeFilter(
    (selection: M026SemanticDatabaseSelectionValue) =>
      hasUniquePublicIdentities(selection) && hasUniqueStateFields(selection),
    {
      expected: "a data-service selection with unique public identities and state fields",
    },
  ),
);

/** JSON string codec for strict M026 data-service selections. */
export const M026SemanticDatabaseSelectionFromJson = Schema.fromJsonString(
  M026SemanticDatabaseSelectionSchema,
);

export type M026SemanticDatabaseSelection = typeof M026SemanticDatabaseSelectionSchema.Type;

export type M026TargetStage =
  | "selection"
  | "project"
  | "reference"
  | "artifact"
  | "projection"
  | "filesystem"
  | "runtime"
  | "report";

const M026TargetStageSchema = Schema.Literals([
  "selection",
  "project",
  "reference",
  "artifact",
  "projection",
  "filesystem",
  "runtime",
  "report",
]);

/** Typed failure for selection decoding and checked-artifact target projection. */
export class M026TargetFailure extends Schema.TaggedError<M026TargetFailure>()(
  "M026TargetFailure",
  {
    stage: M026TargetStageSchema,
    path: Schema.String,
    reason: Schema.String,
    message: Schema.String,
    identity: Schema.optional(Schema.String),
  },
) {}

const makeFailure = (
  stage: M026TargetStage,
  path: string,
  reason: string,
  message: string,
  identity?: string,
): M026TargetFailure =>
  new M026TargetFailure({
    stage,
    path,
    reason,
    message,
    ...(identity === undefined ? {} : { identity }),
  });

const fail = (
  stage: M026TargetStage,
  path: string,
  reason: string,
  message: string,
  identity?: string,
): Effect.Effect<never, M026TargetFailure> =>
  Effect.fail(makeFailure(stage, path, reason, message, identity));

/** Decode one strict M026 selection and retain the supplied source path in failures. */
export const decodeM026SemanticDatabaseSelection = Effect.fn("decodeM026SemanticDatabaseSelection")(
  function* (
    encoded: string,
    path: string,
  ): Effect.fn.Return<M026SemanticDatabaseSelection, M026TargetFailure> {
    return yield* Schema.decodeEffect(M026SemanticDatabaseSelectionFromJson)(
      encoded,
      parseOptions,
    ).pipe(
      Effect.mapError((issue) => {
        const message = String(issue);
        const reason = message.includes("repository-relative path")
          ? "unsafe-path"
          : message.includes("unique public identities")
            ? "duplicate-identity"
            : message.includes("unique state fields")
              ? "duplicate-state-field"
              : message.includes("nonnegative canonical decimal integer")
                ? "malformed-decimal"
                : "schema";
        return makeFailure(
          "selection",
          path,
          reason,
          `invalid M026 data-service selection: ${message}`,
        );
      }),
    );
  },
);

const isStateMachine = (
  declaration: CheckedSemanticArtifact["core"]["declarations"][number],
): declaration is StateMachineDeclaration => declaration.kind === "stateMachine";

const isCapability = (
  declaration: CheckedSemanticArtifact["core"]["declarations"][number],
): declaration is CapabilityDeclaration => declaration.kind === "capability";

const isRealization = (
  declaration: CheckedSemanticArtifact["core"]["declarations"][number],
): declaration is OperationRealizationDeclaration => declaration.kind === "operationRealization";

const stateValue = (
  value: StateValue,
  state: ReadonlyMap<string, bigint>,
  parameters: ReadonlyMap<string, bigint>,
): bigint | undefined => {
  switch (value.kind) {
    case "integerLiteral":
      return BigInt(value.value);
    case "parameter":
      return parameters.get(value.id);
    case "stateField":
      return state.get(value.field);
  }
};

export interface M026StatePredicate {
  readonly kind: "greaterThanOrEqual";
  readonly left: StateValue;
  readonly right: StateValue;
}

export const violatesM026StatePredicates = (
  requires: ReadonlyArray<M026StatePredicate>,
  state: ReadonlyMap<string, bigint>,
  parameters: ReadonlyMap<string, bigint>,
): boolean =>
  requires.some((predicate) => {
    const left = stateValue(predicate.left, state, parameters);
    const right = stateValue(predicate.right, state, parameters);
    return left === undefined || right === undefined || left < right;
  });

const safeSqlIdentifier = (value: string): string => {
  const safe = value.replace(/[^A-Za-z0-9_]/gu, "_");
  return /^[A-Za-z_]/u.test(safe) ? safe : `_${safe}`;
};

const safeSqlFieldIdentifier = (value: string): string =>
  safeSqlIdentifier(value.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase());

const safeTypeIdentifier = (value: string): string => {
  const chunks = value.split(/[^A-Za-z0-9]+/u).filter((chunk) => chunk.length > 0);
  const identifier = chunks
    .map((chunk) => `${chunk[0]?.toUpperCase() ?? ""}${chunk.slice(1)}`)
    .join("");
  const result = identifier.length === 0 ? "M026" : identifier;
  return /^[A-Za-z_]/u.test(result) ? result : `M${result}`;
};

const address = {
  project: (project: string): string => `project:${project}`,
  entity: (id: string): string => `entity:${id}`,
  stateMachine: (id: string): string => `stateMachine:${id}`,
  initializer: (machine: string, id: string): string => `stateMachine:${machine}.initializer:${id}`,
  state: (machine: string, id: string): string => `stateMachine:${machine}.state:${id}`,
  field: (machine: string, state: string, id: string): string =>
    `stateMachine:${machine}.state:${state}.field:${id}`,
  invariant: (machine: string, id: string): string => `stateMachine:${machine}.invariant:${id}`,
  operation: (machine: string, kind: "initializer" | "transition", id: string): string =>
    `stateMachine:${machine}.${kind}:${id}`,
  realization: (id: string): string => `operationRealization:${id}`,
  realizationOperation: (id: string): string => `operationRealization:${id}.operation`,
  realizationRequirement: (id: string, capability: string): string =>
    `operationRealization:${id}.requirement:${capability}`,
  realizationDisabled: (id: string, failure: string): string =>
    `operationRealization:${id}.disabled:${failure}`,
  capability: (id: string): string => `capability:${id}`,
  query: (id: string): string => `query:${id}`,
  subscription: (id: string): string => `subscription:${id}`,
};

export interface M026SelectedStateField {
  readonly id: string;
  readonly type: string;
  readonly column: string;
  readonly address: string;
}

export interface M026DataServicePlan {
  readonly version: 1;
  readonly serviceId: string;
  readonly projectId: string;
  readonly projectPath: string;
  readonly artifactId: string;
  readonly entity: {
    readonly id: string;
    readonly stateMachineId: string;
    readonly initializerId: string;
    readonly invariantId: string;
    readonly identityField: string;
  };
  readonly command: {
    readonly id: string;
    readonly realizationId: string;
    readonly operationId: string;
    readonly parameters: ReadonlyArray<{ readonly id: string; readonly type: string }>;
    readonly requires: ReadonlyArray<M026StatePredicate>;
    readonly disabledFailureId: string;
    readonly capabilityId: string;
    readonly exactUses: bigint;
  };
  readonly query: {
    readonly id: string;
    readonly stateFields: ReadonlyArray<M026SelectedStateField>;
    readonly capabilityAvailability: string;
  };
  readonly subscription: {
    readonly id: string;
    readonly queryId: string;
    readonly mode: "snapshots";
    readonly initialSnapshot: true;
  };
  readonly target: {
    readonly database: "sqlite";
    readonly api: "effect-typescript";
  };
  readonly scenario: {
    readonly accountId: string;
    readonly initialBalance: bigint;
    readonly withdrawAmount: bigint;
  };
  readonly tableName: string;
  readonly identityColumn: string;
  readonly revisionColumn: string;
  readonly remainingUsesColumn: string;
  readonly stateColumns: ReadonlyArray<M026SelectedStateField>;
  readonly balanceColumn: string;
  readonly constructIds: {
    readonly entity: string;
    readonly stateMachine: string;
    readonly initializer: string;
    readonly command: string;
    readonly realization: string;
    readonly operation: string;
    readonly disabledFailure: string;
    readonly capability: string;
    readonly query: string;
    readonly subscription: string;
  };
  readonly addresses: {
    readonly project: string;
    readonly entity: string;
    readonly stateMachine: string;
    readonly initializer: string;
    readonly invariant: string;
    readonly state: string;
    readonly fields: ReadonlyArray<string>;
    readonly command: string;
    readonly realization: string;
    readonly operation: string;
    readonly disabledFailure: string;
    readonly capabilityRequirement: string;
    readonly capability: string;
    readonly query: string;
    readonly subscription: string;
  };
}

/** Derive one checked-artifact-backed M026 SQLite and Effect plan. */
export const deriveM026DataServicePlan = Effect.fn("deriveM026DataServicePlan")(function* (
  artifact: CheckedSemanticArtifact,
  selection: M026SemanticDatabaseSelection,
  path: string,
): Effect.fn.Return<M026DataServicePlan, M026TargetFailure> {
  if (artifact.bangSemanticArtifact !== 1 || artifact.id.length === 0) {
    return yield* fail(
      "artifact",
      path,
      "invalid-artifact",
      "the checked semantic artifact is invalid",
    );
  }

  const declarations = artifact.core.declarations;
  const stateMachine = declarations.find(
    (declaration): declaration is StateMachineDeclaration =>
      isStateMachine(declaration) && declaration.id === selection.entity.stateMachine,
  );
  if (stateMachine === undefined) {
    return yield* fail(
      "reference",
      path,
      "unknown-state-machine",
      `selected state machine ${selection.entity.stateMachine} does not exist`,
      selection.entity.stateMachine,
    );
  }

  const initializer = stateMachine.initializers.find(
    ({ id }) => id === selection.entity.initializer,
  );
  if (initializer === undefined) {
    return yield* fail(
      "reference",
      path,
      "unknown-initializer",
      `initializer ${selection.entity.initializer} does not belong to ${stateMachine.id}`,
      selection.entity.initializer,
    );
  }

  const selectedFields: M026SelectedStateField[] = [];
  for (const fieldId of selection.query.stateFields) {
    const field = stateMachine.state.fields.find(({ id }) => id === fieldId);
    if (field === undefined) {
      return yield* fail(
        "reference",
        path,
        "unknown-state-field",
        `selected state field ${fieldId} does not belong to ${stateMachine.id}`,
        fieldId,
      );
    }
    if (field.type !== "Integer") {
      return yield* fail(
        "projection",
        path,
        "unsupported-state-type",
        `selected state field ${fieldId} is not an Integer field`,
        fieldId,
      );
    }
    selectedFields.push({
      id: field.id,
      type: field.type,
      column: safeSqlIdentifier(field.id),
      address: address.field(stateMachine.id, stateMachine.state.id, field.id),
    });
  }

  const balanceField = selectedFields.find(({ id }) => id === "balance");
  if (balanceField === undefined) {
    return yield* fail(
      "reference",
      path,
      "missing-balance-field",
      "AccountSummary requires the selected balance state field",
      "balance",
    );
  }
  if (selectedFields.length !== 1) {
    return yield* fail(
      "projection",
      path,
      "unsupported-state-shape",
      "M026 AccountSummary projects only the balance state field",
      selection.query.id,
    );
  }
  const balanceInvariant = stateMachine.invariants.find(
    ({ proposition }) =>
      proposition.left.kind === "stateField" &&
      proposition.left.field === balanceField.id &&
      proposition.right.kind === "integerLiteral" &&
      proposition.right.value === "0",
  );
  if (balanceInvariant === undefined) {
    return yield* fail(
      "reference",
      path,
      "missing-nonnegative-invariant",
      `selected state machine ${stateMachine.id} does not require ${balanceField.id} >= 0`,
      stateMachine.id,
    );
  }

  const capability = declarations.find(
    (declaration): declaration is CapabilityDeclaration =>
      isCapability(declaration) && declaration.id === selection.query.capabilityAvailability,
  );
  if (capability === undefined) {
    return yield* fail(
      "reference",
      path,
      "unknown-capability",
      `selected capability ${selection.query.capabilityAvailability} does not exist`,
      selection.query.capabilityAvailability,
    );
  }

  const realization = declarations.find(
    (declaration): declaration is OperationRealizationDeclaration =>
      isRealization(declaration) && declaration.id === selection.command.realization,
  );
  if (realization === undefined) {
    return yield* fail(
      "reference",
      path,
      "unknown-realization",
      `selected realization ${selection.command.realization} does not exist`,
      selection.command.realization,
    );
  }
  if (realization.operation.stateMachine !== stateMachine.id) {
    return yield* fail(
      "reference",
      path,
      "realization-binding-mismatch",
      `realization ${realization.id} does not bind ${stateMachine.id}`,
      realization.id,
    );
  }

  const operation = stateMachine.transitions.find(
    ({ id }) => id === realization.operation.operation,
  );
  if (operation === undefined) {
    return yield* fail(
      "reference",
      path,
      "unknown-bound-operation",
      `realization ${realization.id} binds unknown operation ${realization.operation.operation}`,
      realization.operation.operation,
    );
  }

  const capabilityRequirements = realization.requires.filter(
    ({ capability: requiredCapability }) => requiredCapability === capability.id,
  );
  if (capabilityRequirements.length !== 1) {
    return yield* fail(
      "reference",
      path,
      "capability-requirement-mismatch",
      `realization ${realization.id} must contain one requirement for ${capability.id}`,
      realization.id,
    );
  }
  const capabilityRequirement = capabilityRequirements[0];
  if (
    capabilityRequirement === undefined ||
    capabilityRequirement.quantity.kind !== "exactly" ||
    capabilityRequirement.quantity.uses !== "1"
  ) {
    return yield* fail(
      "reference",
      path,
      "quantity-mismatch",
      `realization ${realization.id} must require exactly one use of ${capability.id}`,
      realization.id,
    );
  }
  if (realization.disabled.kind !== "failure" || realization.disabled.id.length === 0) {
    return yield* fail(
      "reference",
      path,
      "missing-disabled-failure",
      `realization ${realization.id} must name one disabled failure`,
      realization.id,
    );
  }

  if (selection.subscription.query !== selection.query.id) {
    return yield* fail(
      "reference",
      path,
      "subscription-query-mismatch",
      `subscription ${selection.subscription.id} must refer to query ${selection.query.id}`,
      selection.subscription.id,
    );
  }

  const initializerParameter = initializer.parameters.find(({ id }) => id === "initialBalance");
  if (
    initializer.parameters.length !== 1 ||
    initializerParameter === undefined ||
    initializerParameter.type !== "Integer"
  ) {
    return yield* fail(
      "reference",
      path,
      "initializer-shape",
      `initializer ${initializer.id} must accept one Integer initialBalance parameter`,
      initializer.id,
    );
  }
  const operationParameter = operation.parameters.find(({ id }) => id === "amount");
  if (
    operation.parameters.length !== 1 ||
    operationParameter === undefined ||
    operationParameter.type !== "Integer"
  ) {
    return yield* fail(
      "reference",
      path,
      "operation-shape",
      `operation ${operation.id} must accept one Integer amount parameter`,
      operation.id,
    );
  }

  const initialBalance = BigInt(selection.scenario.initialBalance);
  const withdrawAmount = BigInt(selection.scenario.withdrawAmount);
  const initialParameters = new Map([["initialBalance", initialBalance]]);
  if (violatesM026StatePredicates(initializer.requires, new Map(), initialParameters)) {
    return yield* fail(
      "reference",
      path,
      "initializer-precondition",
      `scenario initial balance does not satisfy ${stateMachine.id}.${initializer.id}`,
      address.initializer(stateMachine.id, initializer.id),
    );
  }
  const transitionParameters = new Map([["amount", withdrawAmount]]);
  const initialState = new Map([["balance", initialBalance]]);
  if (violatesM026StatePredicates(operation.requires, initialState, transitionParameters)) {
    return yield* fail(
      "reference",
      path,
      "transition-precondition",
      `scenario withdrawal does not satisfy ${stateMachine.id}.${operation.id}`,
      address.operation(stateMachine.id, "transition", operation.id),
    );
  }

  const tableName = safeSqlIdentifier(`${selection.id}_${stateMachine.id}`);
  const identityColumn = safeSqlFieldIdentifier(selection.entity.identityField);
  const revisionColumn = "revision";
  const remainingUsesColumn = safeSqlIdentifier(`${capability.id}_remaining_uses`);
  const stateColumns = selectedFields;
  const columnIdentifiers = [
    identityColumn,
    ...stateColumns.map(({ column }) => column),
    revisionColumn,
    remainingUsesColumn,
  ];
  if (new Set(columnIdentifiers).size !== columnIdentifiers.length) {
    return yield* fail(
      "projection",
      path,
      "identifier-collision",
      "checked identities derive colliding SQLite column names",
      selection.entity.identityField,
    );
  }
  const constructIds = {
    entity: selection.entity.id,
    stateMachine: stateMachine.id,
    initializer: initializer.id,
    command: selection.command.id,
    realization: realization.id,
    operation: operation.id,
    disabledFailure: realization.disabled.id,
    capability: capability.id,
    query: selection.query.id,
    subscription: selection.subscription.id,
  } as const;
  const addresses = {
    project: address.project(selection.project),
    entity: address.entity(selection.entity.id),
    stateMachine: address.stateMachine(stateMachine.id),
    invariant: address.invariant(stateMachine.id, balanceInvariant.id),
    initializer: address.initializer(stateMachine.id, initializer.id),
    state: address.state(stateMachine.id, stateMachine.state.id),
    fields: stateColumns.map(({ id }) => address.field(stateMachine.id, stateMachine.state.id, id)),
    command: `command:${selection.command.id}`,
    realization: address.realization(realization.id),
    operation: address.realizationOperation(realization.id),
    disabledFailure: address.realizationDisabled(realization.id, realization.disabled.id),
    capabilityRequirement: address.realizationRequirement(realization.id, capability.id),
    capability: address.capability(capability.id),
    query: address.query(selection.query.id),
    subscription: address.subscription(selection.subscription.id),
  } as const;

  return {
    version: 1,
    serviceId: selection.id,
    projectId: artifact.id,
    projectPath: selection.project,
    artifactId: artifact.id,
    entity: {
      id: selection.entity.id,
      stateMachineId: stateMachine.id,
      initializerId: initializer.id,
      invariantId: balanceInvariant.id,
      identityField: selection.entity.identityField,
    },
    command: {
      id: selection.command.id,
      realizationId: realization.id,
      operationId: operation.id,
      parameters: operation.parameters.map(({ id, type }) => ({ id, type })),
      requires: operation.requires,
      disabledFailureId: realization.disabled.id,
      capabilityId: capability.id,
      exactUses: BigInt(capabilityRequirement.quantity.uses),
    },
    query: {
      id: selection.query.id,
      stateFields: stateColumns,
      capabilityAvailability: capability.id,
    },
    subscription: {
      id: selection.subscription.id,
      queryId: selection.subscription.query,
      mode: selection.subscription.mode,
      initialSnapshot: selection.subscription.initialSnapshot,
    },
    target: selection.target,
    scenario: {
      accountId: selection.scenario.accountId,
      initialBalance,
      withdrawAmount,
    },
    tableName,
    identityColumn,
    revisionColumn,
    remainingUsesColumn,
    stateColumns,
    balanceColumn: balanceField.column,
    constructIds,
    addresses,
  };
});

const quoteSqlIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

/** Render deterministic SQLite DDL from a checked data-service plan. */
export const renderM026Sql = (plan: M026DataServicePlan): string => {
  const table = quoteSqlIdentifier(plan.tableName);
  const identity = quoteSqlIdentifier(plan.identityColumn);
  const revision = quoteSqlIdentifier(plan.revisionColumn);
  const balance = quoteSqlIdentifier(plan.balanceColumn);
  const remainingUses = quoteSqlIdentifier(plan.remainingUsesColumn);
  const stateColumns = plan.stateColumns.map(
    ({ column }) => `  ${quoteSqlIdentifier(column)} TEXT NOT NULL`,
  );
  const balanceCheck =
    `  CHECK (${balance} <> '' AND ${balance} NOT GLOB '*[^0-9]*' ` +
    `AND (${balance} = '0' OR substr(${balance}, 1, 1) <> '0'))`;
  const columns = [
    `  ${identity} TEXT PRIMARY KEY NOT NULL`,
    ...stateColumns,
    `  ${revision} INTEGER NOT NULL`,
    `  ${remainingUses} INTEGER NOT NULL`,
    balanceCheck,
    `  CHECK (typeof(${revision}) = 'integer' AND ${revision} >= 0)`,
    `  CHECK (typeof(${remainingUses}) = 'integer' AND ${remainingUses} IN (0, 1))`,
  ];
  return [
    `-- BANG M026 semantic database schema for ${plan.addresses.entity}`,
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    columns.join(",\n"),
    ") STRICT;",
    "",
  ].join("\n");
};

const renderSchemaFields = (
  fields: ReadonlyArray<{ readonly id: string; readonly type: string }>,
  indent: string,
): string => fields.map(({ id }) => `${indent}${id}: Schema.BigInt,`).join("\n");

/** Render deterministic Effect v4 Schemas and one typed data-service boundary. */
export const renderM026EffectBindings = (plan: M026DataServicePlan): string => {
  const entityName = safeTypeIdentifier(plan.entity.id);
  const commandName = safeTypeIdentifier(plan.command.id);
  const accountIdSchema = `${entityName}Id`;
  const stateSchema = `${entityName}State`;
  const createSchema = `${entityName}Create`;
  const querySchema = `${entityName}Query`;
  const commandSchema = `${commandName}Command`;
  const stateFields = renderSchemaFields(plan.query.stateFields, "  ");
  const commandFields = plan.command.parameters
    .map(({ id }) => `  ${id}: Schema.BigInt,`)
    .join("\n");
  const summaryBalance = plan.query.stateFields
    .filter(({ id }) => id === "balance")
    .map(({ id }) => `  ${id}: Schema.BigInt,`)
    .join("\n");
  const source = [
    "// Generated by BANG M026. Do not edit.",
    'import { Context, Effect, Schema, Stream } from "effect";',
    "",
    'const parseOptions = { onExcessProperty: "error" } as const;',
    "",
    `export const ${accountIdSchema} = Schema.String;`,
    `export type ${accountIdSchema} = typeof ${accountIdSchema}.Type;`,
    "",
    `export const ${stateSchema} = Schema.Struct({`,
    stateFields,
    "}).annotate({ parseOptions });",
    `export type ${stateSchema} = typeof ${stateSchema}.Type;`,
    "",
    `export const ${createSchema} = Schema.Struct({`,
    `  accountId: ${accountIdSchema},`,
    "  initialBalance: Schema.BigInt,",
    "}).annotate({ parseOptions });",
    `export type ${createSchema} = typeof ${createSchema}.Type;`,
    "",
    `export const ${querySchema} = Schema.Struct({`,
    `  accountId: ${accountIdSchema},`,
    "}).annotate({ parseOptions });",
    `export type ${querySchema} = typeof ${querySchema}.Type;`,
    "",
    "export const AccountSummary = Schema.Struct({",
    `  accountId: ${accountIdSchema},`,
    "  revision: Schema.BigInt,",
    summaryBalance,
    "  withdrawalAvailable: Schema.Boolean,",
    "}).annotate({ parseOptions });",
    "export type AccountSummary = typeof AccountSummary.Type;",
    "",
    `export const ${commandName} = Schema.TaggedStruct("${plan.command.id}", {`,
    `  accountId: ${accountIdSchema},`,
    commandFields,
    "}).annotate({ parseOptions });",
    `export type ${commandName} = typeof ${commandName}.Type;`,
    "",
    `export const ${commandSchema} = Schema.Union([${commandName}]).pipe(`,
    '  Schema.toTaggedUnion("_tag"),',
    ").annotate({ parseOptions });",
    `export type ${commandSchema} = typeof ${commandSchema}.Type;`,
    "",
    `export class M026DataServiceMissingError extends Schema.TaggedError<M026DataServiceMissingError>()(`,
    '  "M026DataServiceMissingError",',
    `  { accountId: ${accountIdSchema} },`,
    ") {}",
    "",
    `export class M026DataServiceDuplicateError extends Schema.TaggedError<M026DataServiceDuplicateError>()(`,
    '  "M026DataServiceDuplicateError",',
    `  { accountId: ${accountIdSchema} },`,
    ") {}",
    "",
    `export class M026DataServiceDisabledError extends Schema.TaggedError<M026DataServiceDisabledError>()(`,
    '  "M026DataServiceDisabledError",',
    `  { accountId: ${accountIdSchema}, failureId: Schema.String },`,
    ") {}",
    "",
    `export class M026DataServiceUnavailableError extends Schema.TaggedError<M026DataServiceUnavailableError>()(`,
    '  "M026DataServiceUnavailableError",',
    "  { message: Schema.String },",
    ") {}",
    "",
    "export interface M026DataServiceShape {",
    "  readonly create: (",
    `    input: ${createSchema},`,
    "  ) => Effect.Effect<",
    "    AccountSummary,",
    "    M026DataServiceDuplicateError | M026DataServiceUnavailableError",
    "  >;",
    "  readonly query: (",
    `    input: ${querySchema},`,
    "  ) => Effect.Effect<",
    "    AccountSummary,",
    "    M026DataServiceMissingError | M026DataServiceUnavailableError",
    "  >;",
    "  readonly dispatch: (",
    `    command: ${commandSchema},`,
    "  ) => Effect.Effect<",
    "    AccountSummary,",
    "    M026DataServiceMissingError | M026DataServiceDisabledError | M026DataServiceUnavailableError",
    "  >;",
    "  readonly subscribe: (",
    `    input: ${querySchema},`,
    "  ) => Stream.Stream<AccountSummary, M026DataServiceMissingError | M026DataServiceUnavailableError>;",
    "}",
    "",
    "export class M026DataService extends Context.Service<",
    "  M026DataService,",
    "  M026DataServiceShape",
    ">()(",
    `  "@bang/m026/${safeSqlIdentifier(plan.serviceId)}",`,
    ") {}",
  ];
  return `${source.join("\n")}\n`;
};
