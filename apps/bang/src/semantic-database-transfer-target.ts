import type {
  CheckedSemanticArtifact,
  RefinementDeclaration,
  StateMachineDeclaration,
  TheoryBridgeDeclaration,
} from "@bang/core";
import { deriveTransferPreservationObligation, type RelationalObligation } from "@bang/obligations";
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
  balanceField: PublicIdentity,
}).annotate({ parseOptions });

const SelectionRefinementSchema = Schema.Struct({
  id: PublicIdentity,
}).annotate({ parseOptions });

const SelectionBridgeSchema = Schema.Struct({
  id: PublicIdentity,
  sharedSort: PublicIdentity,
}).annotate({ parseOptions });

const SelectionCompositionLinkSchema = Schema.Struct({
  id: PublicIdentity,
  kind: Schema.Literal("representation-compatible"),
  from: Schema.String,
  to: Schema.String,
}).annotate({ parseOptions });

const SelectionObligationSchema = Schema.Struct({
  id: PublicIdentity,
  variant: Schema.Literal("lawful"),
}).annotate({ parseOptions });

const SelectionEvidenceSchema = Schema.Struct({
  path: RepositoryRelativePath,
}).annotate({ parseOptions });

const SelectionCommandSchema = Schema.Struct({
  id: PublicIdentity,
}).annotate({ parseOptions });

const SelectionRejectionSchema = Schema.Struct({
  id: PublicIdentity,
}).annotate({ parseOptions });

const SelectionAccountQuerySchema = Schema.Struct({
  id: PublicIdentity,
  stateFields: Schema.NonEmptyArray(PublicIdentity),
  capabilityAvailability: PublicIdentity,
}).annotate({ parseOptions });

const SelectionTotalQuerySchema = Schema.Struct({
  id: PublicIdentity,
}).annotate({ parseOptions });

const SelectionSubscriptionSchema = Schema.Struct({
  id: PublicIdentity,
  query: PublicIdentity,
  mode: Schema.Literal("snapshots"),
  initialSnapshot: Schema.Literal(true),
}).annotate({ parseOptions });

const SelectionTargetSchema = Schema.Struct({
  database: PublicIdentity,
  api: PublicIdentity,
}).annotate({ parseOptions });

const SelectionScenarioSchema = Schema.Struct({
  sourceAccountId: PublicIdentity,
  targetAccountId: PublicIdentity,
  sourceInitialBalance: NonNegativeDecimalInteger,
  targetInitialBalance: NonNegativeDecimalInteger,
  transferAmount: NonNegativeDecimalInteger,
  rejectionAmount: NonNegativeDecimalInteger,
}).annotate({ parseOptions });

const M027SemanticDatabaseSelectionSchemaBase = Schema.Struct({
  bangSemanticDatabase: Schema.Literal(1),
  id: PublicIdentity,
  project: RepositoryRelativePath,
  entity: SelectionEntitySchema,
  refinement: SelectionRefinementSchema,
  bridge: SelectionBridgeSchema,
  compositionLinks: Schema.Tuple([SelectionCompositionLinkSchema, SelectionCompositionLinkSchema]),
  obligation: SelectionObligationSchema,
  evidence: SelectionEvidenceSchema,
  command: SelectionCommandSchema,
  rejection: SelectionRejectionSchema,
  accountQuery: SelectionAccountQuerySchema,
  totalQuery: SelectionTotalQuerySchema,
  accountSubscription: SelectionSubscriptionSchema,
  totalSubscription: SelectionSubscriptionSchema,
  target: SelectionTargetSchema,
  scenario: SelectionScenarioSchema,
}).annotate({ parseOptions });

type M027SemanticDatabaseSelectionValue = typeof M027SemanticDatabaseSelectionSchemaBase.Type;

const hasUniquePublicIdentities = (selection: M027SemanticDatabaseSelectionValue): boolean => {
  const identities = [
    selection.id,
    selection.command.id,
    selection.rejection.id,
    selection.accountQuery.id,
    selection.totalQuery.id,
    selection.accountSubscription.id,
    selection.totalSubscription.id,
  ];
  return new Set(identities).size === identities.length;
};

const hasDistinctCompositionLinks = (selection: M027SemanticDatabaseSelectionValue): boolean => {
  const ids = selection.compositionLinks.map(({ id }) => id);
  return new Set(ids).size === ids.length;
};

/** Strict M027 cross-entity transfer selection. */
export const M027SemanticDatabaseSelectionSchema = M027SemanticDatabaseSelectionSchemaBase.check(
  Schema.makeFilter(
    (selection: M027SemanticDatabaseSelectionValue) =>
      hasUniquePublicIdentities(selection) &&
      hasDistinctCompositionLinks(selection) &&
      selection.command.id !== selection.rejection.id &&
      selection.accountQuery.id !== selection.totalQuery.id &&
      selection.accountSubscription.id !== selection.totalSubscription.id,
    {
      expected:
        "an M027 selection with distinct command, query, subscription, and account identities",
    },
  ),
);

/** JSON string codec for strict M027 selections. */
export const M027SemanticDatabaseSelectionFromJson = Schema.fromJsonString(
  M027SemanticDatabaseSelectionSchema,
);

export type M027SemanticDatabaseSelection = typeof M027SemanticDatabaseSelectionSchema.Type;

export type M027TargetStage =
  | "selection"
  | "project"
  | "reference"
  | "evidence"
  | "artifact"
  | "projection"
  | "report";

const M027TargetStageSchema = Schema.Literals([
  "selection",
  "project",
  "reference",
  "evidence",
  "artifact",
  "projection",
  "report",
]);

export type M027TargetFailureReason =
  | "schema"
  | "unsafe-path"
  | "invalid-artifact"
  | "missing-source"
  | "duplicate-declaration"
  | "unknown-state-machine"
  | "unknown-initializer"
  | "unknown-state-field"
  | "missing-nonnegative-invariant"
  | "unknown-refinement"
  | "invalid-refinement"
  | "unknown-bridge"
  | "invalid-bridge"
  | "invalid-account-identity"
  | "representation-incompatible"
  | "composition-link-mismatch"
  | "obligation-identity-mismatch"
  | "evidence-identity-mismatch"
  | "stale-evidence"
  | "unknown-capability"
  | "query-identity-mismatch"
  | "subscription-query-mismatch"
  | "unsupported-target"
  | "identical-account-identities"
  | "invalid-scenario"
  | "identifier-collision";

const M027TargetFailureReasonSchema = Schema.Literals([
  "schema",
  "unsafe-path",
  "invalid-artifact",
  "missing-source",
  "duplicate-declaration",
  "unknown-state-machine",
  "unknown-initializer",
  "unknown-state-field",
  "missing-nonnegative-invariant",
  "unknown-refinement",
  "invalid-refinement",
  "unknown-bridge",
  "invalid-bridge",
  "invalid-account-identity",
  "representation-incompatible",
  "composition-link-mismatch",
  "obligation-identity-mismatch",
  "evidence-identity-mismatch",
  "stale-evidence",
  "unknown-capability",
  "query-identity-mismatch",
  "subscription-query-mismatch",
  "unsupported-target",
  "identical-account-identities",
  "invalid-scenario",
  "identifier-collision",
]);

/** Typed failure for M027 selection and target projection. */
export class M027TargetFailure extends Schema.TaggedError<M027TargetFailure>()(
  "M027TargetFailure",
  {
    stage: M027TargetStageSchema,
    path: Schema.String,
    reason: M027TargetFailureReasonSchema,
    message: Schema.String,
    identity: Schema.optional(Schema.String),
  },
) {}

const makeFailure = (
  stage: M027TargetStage,
  path: string,
  reason: M027TargetFailureReason,
  message: string,
  identity?: string,
): M027TargetFailure =>
  new M027TargetFailure({
    stage,
    path,
    reason,
    message,
    ...(identity === undefined ? {} : { identity }),
  });

const fail = (
  stage: M027TargetStage,
  path: string,
  reason: M027TargetFailureReason,
  message: string,
  identity?: string,
): Effect.Effect<never, M027TargetFailure> =>
  Effect.fail(makeFailure(stage, path, reason, message, identity));

/** Decode one strict M027 selection and retain its source path in failures. */
export const decodeM027SemanticDatabaseSelection = Effect.fn("decodeM027SemanticDatabaseSelection")(
  function* (
    encoded: string,
    path: string,
  ): Effect.fn.Return<M027SemanticDatabaseSelection, M027TargetFailure> {
    return yield* Schema.decodeEffect(M027SemanticDatabaseSelectionFromJson)(
      encoded,
      parseOptions,
    ).pipe(
      Effect.mapError((issue) => {
        const message = String(issue);
        const reason: M027TargetFailureReason = message.includes("repository-relative path")
          ? "unsafe-path"
          : message.includes("nonnegative canonical decimal integer")
            ? "schema"
            : message.includes("distinct command")
              ? "schema"
              : "schema";
        return makeFailure(
          "selection",
          path,
          reason,
          `invalid M027 transfer selection: ${message}`,
        );
      }),
    );
  },
);

const isStateMachine = (
  declaration: CheckedSemanticArtifact["core"]["declarations"][number],
): declaration is StateMachineDeclaration => declaration.kind === "stateMachine";

const isRefinement = (
  declaration: CheckedSemanticArtifact["core"]["declarations"][number],
): declaration is RefinementDeclaration => declaration.kind === "refinement";

const isBridge = (
  declaration: CheckedSemanticArtifact["core"]["declarations"][number],
): declaration is TheoryBridgeDeclaration => declaration.kind === "theoryBridge";

const safeSqlIdentifier = (value: string): string => {
  const safe = value.replace(/[^A-Za-z0-9_]/gu, "_");
  return /^[A-Za-z_]/u.test(safe) ? safe : `_${safe}`;
};

const safeSqlFieldIdentifier = (value: string): string =>
  safeSqlIdentifier(value.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase());

const address = {
  project: (project: string): string => `project:${project}`,
  entity: (id: string): string => `entity:${id}`,
  stateMachine: (id: string): string => `stateMachine:${id}`,
  initializer: (machine: string, id: string): string => `stateMachine:${machine}.initializer:${id}`,
  state: (machine: string, id: string): string => `stateMachine:${machine}.state:${id}`,
  field: (machine: string, state: string, id: string): string =>
    `stateMachine:${machine}.state:${state}.field:${id}`,
  invariant: (machine: string, id: string): string => `stateMachine:${machine}.invariant:${id}`,
  refinement: (id: string): string => `refinement:${id}`,
  bridge: (id: string): string => `theoryBridge:${id}`,
  sharedSort: (bridge: string, sort: string): string => `theoryBridge:${bridge}.sharedSort:${sort}`,
  composition: (id: string): string => `compositionLink:${id}`,
  obligation: (id: string): string => `obligation:${id}`,
  evidence: (path: string): string => `evidence:${path}`,
  command: (id: string): string => `command:${id}`,
  rejection: (id: string): string => `rejection:${id}`,
  query: (id: string): string => `query:${id}`,
  subscription: (id: string): string => `subscription:${id}`,
};

export interface M027SelectedStateField {
  readonly id: string;
  readonly type: string;
  readonly column: string;
  readonly address: string;
}

export interface M027TransferPlan {
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
    readonly balanceField: string;
  };
  readonly refinement: {
    readonly id: string;
    readonly base: string;
    readonly predicate: RefinementDeclaration["predicate"];
  };
  readonly bridge: {
    readonly id: string;
    readonly sharedSort: string;
    readonly sourcePath: string;
    readonly participants: TheoryBridgeDeclaration["participants"];
  };
  readonly compositionLinks: ReadonlyArray<{
    readonly id: string;
    readonly kind: "representation-compatible";
    readonly from: string;
    readonly to: string;
  }>;
  readonly obligation: RelationalObligation;
  readonly evidence: {
    readonly path: string;
    readonly obligationId: string;
    readonly variant: "lawful";
  };
  readonly command: { readonly id: string };
  readonly rejection: { readonly id: string };
  readonly accountQuery: {
    readonly id: string;
    readonly stateFields: ReadonlyArray<M027SelectedStateField>;
    readonly capabilityAvailability: string;
  };
  readonly totalQuery: { readonly id: string };
  readonly accountSubscription: {
    readonly id: string;
    readonly queryId: string;
    readonly mode: "snapshots";
    readonly initialSnapshot: true;
  };
  readonly totalSubscription: {
    readonly id: string;
    readonly queryId: string;
    readonly mode: "snapshots";
    readonly initialSnapshot: true;
  };
  readonly target: { readonly database: "sqlite"; readonly api: "effect-typescript" };
  readonly scenario: {
    readonly sourceAccountId: string;
    readonly targetAccountId: string;
    readonly sourceInitialBalance: bigint;
    readonly targetInitialBalance: bigint;
    readonly transferAmount: bigint;
    readonly rejectionAmount: bigint;
  };
  readonly tableName: string;
  readonly identityColumn: string;
  readonly balanceColumn: string;
  readonly revisionColumn: string;
  readonly stateColumns: ReadonlyArray<M027SelectedStateField>;
  readonly constructIds: {
    readonly entity: string;
    readonly stateMachine: string;
    readonly initializer: string;
    readonly invariant: string;
    readonly refinement: string;
    readonly bridge: string;
    readonly sharedSort: string;
    readonly obligation: string;
    readonly evidence: string;
    readonly command: string;
    readonly rejection: string;
    readonly accountQuery: string;
    readonly totalQuery: string;
    readonly accountSubscription: string;
    readonly totalSubscription: string;
  };
  readonly addresses: {
    readonly project: string;
    readonly entity: string;
    readonly stateMachine: string;
    readonly initializer: string;
    readonly state: string;
    readonly fields: ReadonlyArray<string>;
    readonly invariant: string;
    readonly refinement: string;
    readonly bridge: string;
    readonly sharedSort: string;
    readonly compositionLinks: ReadonlyArray<string>;
    readonly obligation: string;
    readonly evidence: string;
    readonly command: string;
    readonly rejection: string;
    readonly accountQuery: string;
    readonly totalQuery: string;
    readonly accountSubscription: string;
    readonly totalSubscription: string;
  };
}

const sameLink = (
  left: M027SemanticDatabaseSelection["compositionLinks"][number],
  right: M027SemanticDatabaseSelection["compositionLinks"][number],
): boolean =>
  left.id === right.id &&
  left.kind === right.kind &&
  left.from === right.from &&
  left.to === right.to;

const parseScenarioBigInts = (
  selection: M027SemanticDatabaseSelection,
  path: string,
): Effect.Effect<M027TransferPlan["scenario"], M027TargetFailure> => {
  try {
    return Effect.succeed({
      sourceAccountId: selection.scenario.sourceAccountId,
      targetAccountId: selection.scenario.targetAccountId,
      sourceInitialBalance: BigInt(selection.scenario.sourceInitialBalance),
      targetInitialBalance: BigInt(selection.scenario.targetInitialBalance),
      transferAmount: BigInt(selection.scenario.transferAmount),
      rejectionAmount: BigInt(selection.scenario.rejectionAmount),
    });
  } catch (error) {
    return fail(
      "selection",
      path,
      "invalid-scenario",
      `invalid decimal scenario: ${String(error)}`,
    );
  }
};

/** Derive one checked-artifact-backed M027 transfer plan. */
export const deriveM027TransferPlan = Effect.fn("deriveM027TransferPlan")(function* (
  artifact: CheckedSemanticArtifact,
  selection: M027SemanticDatabaseSelection,
  path: string,
  accountSourcePath = "examples/tiny-bank/account.bang",
): Effect.fn.Return<M027TransferPlan, M027TargetFailure> {
  if (
    artifact.bangSemanticArtifact !== 1 ||
    artifact.id.length === 0 ||
    artifact.id !== selection.id ||
    artifact.core.bangCore !== 1
  ) {
    return yield* fail(
      "artifact",
      path,
      "invalid-artifact",
      "the checked M025 project artifact has an invalid identity",
      selection.id,
    );
  }

  const provenance = artifact.provenance;
  const provenanceFor = (declaration: string, sourcePath: string) =>
    provenance.filter((entry) => entry.declaration === declaration && entry.path === sourcePath);
  if (
    provenanceFor("Account", accountSourcePath).length !== 1 ||
    provenanceFor("Balance", "examples/tiny-bank/core/balance.json").length !== 1 ||
    provenanceFor("AccountLedger", "examples/tiny-bank/core/account-ledger-bridge.json").length !==
      1
  ) {
    return yield* fail(
      "project",
      path,
      "missing-source",
      "M027 requires Account source, Balance Core, and AccountLedger Core provenance",
      selection.project,
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
  if (selection.entity.id !== "Account" || selection.entity.identityField !== "accountId") {
    return yield* fail(
      "reference",
      path,
      "invalid-account-identity",
      "M027 Account persistence requires the Account/accountId identity",
      selection.entity.identityField,
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

  const balanceField = stateMachine.state.fields.find(
    ({ id }) => id === selection.entity.balanceField,
  );
  if (balanceField === undefined) {
    return yield* fail(
      "reference",
      path,
      "unknown-state-field",
      `selected balance field ${selection.entity.balanceField} does not belong to ${stateMachine.id}`,
      selection.entity.balanceField,
    );
  }
  if (balanceField.type !== "Integer") {
    return yield* fail(
      "projection",
      path,
      "representation-incompatible",
      `selected balance field ${balanceField.id} is not represented by Core Integer`,
      balanceField.id,
    );
  }
  if (stateMachine.state.fields.length !== 1 || balanceField.id !== "balance") {
    return yield* fail(
      "projection",
      path,
      "invalid-bridge",
      "M027 Account projections require exactly one balance state field",
      stateMachine.id,
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

  const refinement = declarations.find(
    (declaration): declaration is RefinementDeclaration =>
      isRefinement(declaration) && declaration.id === selection.refinement.id,
  );
  if (refinement === undefined) {
    return yield* fail(
      "reference",
      path,
      "unknown-refinement",
      `selected refinement ${selection.refinement.id} does not exist`,
      selection.refinement.id,
    );
  }
  if (
    refinement.base !== "Integer" ||
    refinement.predicate.kind !== "greaterThanOrEqual" ||
    refinement.predicate.left.kind !== "self" ||
    refinement.predicate.right.kind !== "integerLiteral" ||
    refinement.predicate.right.value !== "0"
  ) {
    return yield* fail(
      "reference",
      path,
      "invalid-refinement",
      `selected refinement ${refinement.id} is not the checked nonnegative Integer refinement`,
      refinement.id,
    );
  }

  const bridge = declarations.find(
    (declaration): declaration is TheoryBridgeDeclaration =>
      isBridge(declaration) && declaration.id === selection.bridge.id,
  );
  if (bridge === undefined) {
    return yield* fail(
      "reference",
      path,
      "unknown-bridge",
      `selected bridge ${selection.bridge.id} does not exist`,
      selection.bridge.id,
    );
  }
  const accountParticipant = bridge.participants.find(({ id }) => id === "account");
  const ledgerParticipant = bridge.participants.find(({ id }) => id === "ledger");
  const sharedBalance = bridge.sharedSorts.find(({ id }) => id === selection.bridge.sharedSort);
  if (
    bridge.participants.length !== 2 ||
    accountParticipant === undefined ||
    ledgerParticipant === undefined ||
    accountParticipant.theory !== "AccountBalance" ||
    ledgerParticipant.theory !== "LedgerBalance" ||
    sharedBalance === undefined ||
    sharedBalance.members.length !== 2
  ) {
    return yield* fail(
      "reference",
      path,
      "invalid-bridge",
      "AccountLedger must expose account and ledger participants plus one shared Balance sort",
      bridge.id,
    );
  }
  const theories = new Map(
    declarations
      .filter((declaration) => declaration.kind === "theory")
      .map((theory) => [theory.id, theory]),
  );
  for (const member of sharedBalance.members) {
    const participant = bridge.participants.find(({ id }) => id === member.participant);
    const theory = participant === undefined ? undefined : theories.get(participant.theory);
    const sort = theory?.sorts.find(({ id }) => id === member.sort);
    if (
      participant === undefined ||
      sort === undefined ||
      sort.representation?.kind !== "builtin" ||
      sort.representation.type !== "Integer"
    ) {
      return yield* fail(
        "reference",
        path,
        "representation-incompatible",
        "AccountLedger shared Balance members must use Core Integer representations",
        member.sort,
      );
    }
  }
  if (!bridge.laws.some(({ id }) => id === "balancesAgree")) {
    return yield* fail(
      "reference",
      path,
      "invalid-bridge",
      "AccountLedger must retain the checked balancesAgree law",
      bridge.id,
    );
  }

  const expectedLinks: M027SemanticDatabaseSelection["compositionLinks"] = [
    {
      id: "Balance.refinement-to-account-state",
      kind: "representation-compatible",
      from: "refinement:Balance",
      to: "stateMachine:Account.state.balance",
    },
    {
      id: "Balance.refinement-to-ledger-bridge",
      kind: "representation-compatible",
      from: "refinement:Balance",
      to: "theoryBridge:AccountLedger.sharedSort.Balance",
    },
  ];
  if (
    selection.compositionLinks.length !== expectedLinks.length ||
    expectedLinks.some(
      (expected) => !selection.compositionLinks.some((actual) => sameLink(actual, expected)),
    )
  ) {
    return yield* fail(
      "reference",
      path,
      "composition-link-mismatch",
      "selection composition links do not describe the checked Balance carriers",
      selection.bridge.sharedSort,
    );
  }

  const bridgeSourcePath = "examples/tiny-bank/core/account-ledger-bridge.json";
  const obligation = yield* deriveTransferPreservationObligation(artifact.core, "lawful", {
    coreSource: bridgeSourcePath,
  }).pipe(
    Effect.mapError((error) =>
      makeFailure(
        "reference",
        path,
        "obligation-identity-mismatch",
        error.message,
        error.obligationId,
      ),
    ),
  );
  if (
    obligation.id !== selection.obligation.id ||
    obligation.variant !== selection.obligation.variant ||
    obligation.source.core !== bridgeSourcePath ||
    obligation.source.bridge !== selection.bridge.id ||
    obligation.source.relation !== "transferPreservesTotal"
  ) {
    return yield* fail(
      "reference",
      path,
      "obligation-identity-mismatch",
      "derived obligation does not match the selected mission-local identity",
      selection.obligation.id,
    );
  }
  if (selection.evidence.path !== ".bang/evidence/M016.json") {
    return yield* fail(
      "evidence",
      path,
      "evidence-identity-mismatch",
      "M027 requires the declared M016 dual-provider evidence input",
      selection.evidence.path,
    );
  }

  const capability = declarations.find(
    (declaration) =>
      declaration.kind === "capability" &&
      declaration.id === selection.accountQuery.capabilityAvailability,
  );
  if (capability === undefined) {
    return yield* fail(
      "reference",
      path,
      "unknown-capability",
      `selected capability ${selection.accountQuery.capabilityAvailability} does not exist`,
      selection.accountQuery.capabilityAvailability,
    );
  }
  if (
    selection.accountQuery.stateFields.length !== 1 ||
    selection.accountQuery.stateFields[0] !== balanceField.id
  ) {
    return yield* fail(
      "reference",
      path,
      "query-identity-mismatch",
      "AccountSummary must select the checked balance field",
      selection.accountQuery.id,
    );
  }
  if (selection.accountSubscription.query !== selection.accountQuery.id) {
    return yield* fail(
      "reference",
      path,
      "subscription-query-mismatch",
      `subscription ${selection.accountSubscription.id} must refer to ${selection.accountQuery.id}`,
      selection.accountSubscription.id,
    );
  }
  if (selection.accountQuery.id !== "AccountSummary") {
    return yield* fail(
      "reference",
      path,
      "query-identity-mismatch",
      "M027 requires the selected AccountSummary query identity",
      selection.accountQuery.id,
    );
  }
  if (selection.totalQuery.id !== "TotalFunds") {
    return yield* fail(
      "reference",
      path,
      "query-identity-mismatch",
      "M027 requires the selected TotalFunds query identity",
      selection.totalQuery.id,
    );
  }
  if (selection.totalSubscription.query !== selection.totalQuery.id) {
    return yield* fail(
      "reference",
      path,
      "subscription-query-mismatch",
      `subscription ${selection.totalSubscription.id} must refer to ${selection.totalQuery.id}`,
      selection.totalSubscription.id,
    );
  }
  if (selection.target.database !== "sqlite" || selection.target.api !== "effect-typescript") {
    return yield* fail(
      "projection",
      path,
      "unsupported-target",
      "M027 supports only SQLite and Effect TypeScript",
    );
  }
  if (selection.scenario.sourceAccountId === selection.scenario.targetAccountId) {
    return yield* fail(
      "reference",
      path,
      "identical-account-identities",
      "source and target account identities must differ",
      selection.scenario.sourceAccountId,
    );
  }
  const scenario = yield* parseScenarioBigInts(selection, path);
  if (
    scenario.sourceInitialBalance < 0n ||
    scenario.targetInitialBalance < 0n ||
    scenario.transferAmount <= 0n ||
    scenario.rejectionAmount <= 0n ||
    scenario.transferAmount > scenario.sourceInitialBalance ||
    scenario.rejectionAmount <= scenario.sourceInitialBalance - scenario.transferAmount
  ) {
    return yield* fail(
      "reference",
      path,
      "invalid-scenario",
      "scenario requires nonnegative balances, a positive affordable transfer, and an overdraft rejection",
      selection.id,
    );
  }

  const stateColumns: ReadonlyArray<M027SelectedStateField> = [
    {
      id: balanceField.id,
      type: balanceField.type,
      column: safeSqlFieldIdentifier(balanceField.id),
      address: address.field(stateMachine.id, stateMachine.state.id, balanceField.id),
    },
  ];
  const tableName = safeSqlIdentifier(`${selection.id}_${stateMachine.id}`);
  const identityColumn = safeSqlFieldIdentifier(selection.entity.identityField);
  const revisionColumn = "revision";
  const columnIdentifiers = [
    identityColumn,
    ...stateColumns.map(({ column }) => column),
    revisionColumn,
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
    invariant: balanceInvariant.id,
    refinement: refinement.id,
    bridge: bridge.id,
    sharedSort: sharedBalance.id,
    obligation: obligation.id,
    evidence: selection.evidence.path,
    command: selection.command.id,
    rejection: selection.rejection.id,
    accountQuery: selection.accountQuery.id,
    totalQuery: selection.totalQuery.id,
    accountSubscription: selection.accountSubscription.id,
    totalSubscription: selection.totalSubscription.id,
  } as const;
  const addresses = {
    project: address.project(selection.project),
    entity: address.entity(selection.entity.id),
    stateMachine: address.stateMachine(stateMachine.id),
    initializer: address.initializer(stateMachine.id, initializer.id),
    state: address.state(stateMachine.id, stateMachine.state.id),
    fields: stateColumns.map(({ address: fieldAddress }) => fieldAddress),
    invariant: address.invariant(stateMachine.id, balanceInvariant.id),
    refinement: address.refinement(refinement.id),
    bridge: address.bridge(bridge.id),
    sharedSort: address.sharedSort(bridge.id, sharedBalance.id),
    compositionLinks: selection.compositionLinks.map(({ id }) => address.composition(id)),
    obligation: address.obligation(obligation.id),
    evidence: address.evidence(selection.evidence.path),
    command: address.command(selection.command.id),
    rejection: address.rejection(selection.rejection.id),
    accountQuery: address.query(selection.accountQuery.id),
    totalQuery: address.query(selection.totalQuery.id),
    accountSubscription: address.subscription(selection.accountSubscription.id),
    totalSubscription: address.subscription(selection.totalSubscription.id),
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
      balanceField: balanceField.id,
    },
    refinement: {
      id: refinement.id,
      base: refinement.base,
      predicate: refinement.predicate,
    },
    bridge: {
      id: bridge.id,
      sharedSort: sharedBalance.id,
      sourcePath: bridgeSourcePath,
      participants: bridge.participants,
    },
    compositionLinks: selection.compositionLinks,
    obligation,
    evidence: {
      path: selection.evidence.path,
      obligationId: obligation.id,
      variant: obligation.variant,
    },
    command: { id: selection.command.id },
    rejection: { id: selection.rejection.id },
    accountQuery: {
      id: selection.accountQuery.id,
      stateFields: stateColumns,
      capabilityAvailability: capability.id,
    },
    totalQuery: { id: selection.totalQuery.id },
    accountSubscription: {
      id: selection.accountSubscription.id,
      queryId: selection.accountSubscription.query,
      mode: selection.accountSubscription.mode,
      initialSnapshot: selection.accountSubscription.initialSnapshot,
    },
    totalSubscription: {
      id: selection.totalSubscription.id,
      queryId: selection.totalSubscription.query,
      mode: selection.totalSubscription.mode,
      initialSnapshot: selection.totalSubscription.initialSnapshot,
    },
    target: { database: "sqlite", api: "effect-typescript" },
    scenario,
    tableName,
    identityColumn,
    balanceColumn: stateColumns[0]?.column ?? "balance",
    revisionColumn,
    stateColumns,
    constructIds,
    addresses,
  };
});

const quoteSqlIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

/** Render deterministic one-table SQLite DDL from a checked M027 plan. */
export const renderM027Sql = (plan: M027TransferPlan): string => {
  const table = quoteSqlIdentifier(plan.tableName);
  const identity = quoteSqlIdentifier(plan.identityColumn);
  const balance = quoteSqlIdentifier(plan.balanceColumn);
  const revision = quoteSqlIdentifier(plan.revisionColumn);
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `  ${identity} TEXT PRIMARY KEY NOT NULL,`,
    `  ${balance} TEXT NOT NULL CHECK (${balance} <> '' AND ${balance} NOT GLOB '*[^0-9]*' AND (${balance} = '0' OR substr(${balance}, 1, 1) <> '0')),`,
    `  ${revision} INTEGER NOT NULL CHECK (typeof(${revision}) = 'integer' AND ${revision} >= 0)`,
    ") STRICT;",
    "",
  ].join("\n");
};

const renderStateFields = (fields: ReadonlyArray<M027SelectedStateField>, indent: string): string =>
  fields.map(({ id }) => `${indent}${id}: nonNegativeBigInt,`).join("\n");

/** Render deterministic Effect v4 schemas and one typed transfer boundary. */
export const renderM027EffectBindings = (plan: M027TransferPlan): string => {
  const commandId = JSON.stringify(plan.command.id);
  const rejectionId = JSON.stringify(plan.rejection.id);
  const stateFields = renderStateFields(plan.stateColumns, "  ");
  const summaryFields = stateFields;
  return (
    [
      "// Generated by BANG M027. Do not edit.",
      'import { Context, Effect, Schema, Stream } from "effect";',
      "",
      'const parseOptions = { onExcessProperty: "error" } as const;',
      'const nonNegativeBigInt = Schema.BigInt.pipe(Schema.check(Schema.makeFilter((value) => value >= 0n, { expected: "a nonnegative bigint" })));',
      "",
      "export const AccountState = Schema.Struct({",
      stateFields,
      "}).annotate({ parseOptions });",
      "export type AccountState = typeof AccountState.Type;",
      "",
      "export const AccountSummary = Schema.Struct({",
      "  accountId: Schema.String,",
      "  revision: nonNegativeBigInt,",
      summaryFields,
      "}).annotate({ parseOptions });",
      "export type AccountSummary = typeof AccountSummary.Type;",
      "",
      "export const TotalFunds = Schema.Struct({",
      "  revision: nonNegativeBigInt,",
      "  total: nonNegativeBigInt,",
      "}).annotate({ parseOptions });",
      "export type TotalFunds = typeof TotalFunds.Type;",
      "",
      "export const TransferResult = Schema.Struct({",
      "  source: AccountSummary,",
      "  target: AccountSummary,",
      "  total: TotalFunds,",
      "}).annotate({ parseOptions });",
      "export type TransferResult = typeof TransferResult.Type;",
      "",
      "export const AccountCreate = Schema.Struct({",
      "  accountId: Schema.String,",
      "  initialBalance: nonNegativeBigInt,",
      "}).annotate({ parseOptions });",
      "export type AccountCreate = typeof AccountCreate.Type;",
      "",
      "export const AccountQuery = Schema.Struct({",
      "  accountId: Schema.String,",
      "}).annotate({ parseOptions });",
      "export type AccountQuery = typeof AccountQuery.Type;",
      "",
      "export const TotalFundsQuery = Schema.Struct({}).annotate({ parseOptions });",
      "export type TotalFundsQuery = typeof TotalFundsQuery.Type;",
      "",
      `export const Transfer = Schema.TaggedStruct(${commandId}, {`,
      "  sourceAccountId: Schema.String,",
      "  targetAccountId: Schema.String,",
      "  amount: nonNegativeBigInt,",
      "}).annotate({ parseOptions });",
      "export type Transfer = typeof Transfer.Type;",
      "",
      "export const TransferCommand = Schema.Union([Transfer]).pipe(",
      '  Schema.toTaggedUnion("_tag"),',
      ").annotate({ parseOptions });",
      "export type TransferCommand = typeof TransferCommand.Type;",
      "",
      "export class TransferRejected extends Schema.TaggedError<TransferRejected>()(",
      `  ${rejectionId},`,
      "  {",
      "    sourceAccountId: Schema.String,",
      "    targetAccountId: Schema.String,",
      "    amount: nonNegativeBigInt,",
      "    message: Schema.String,",
      "  },",
      ") {}",
      "",
      "export class M027AccountCreateError extends Schema.TaggedError<M027AccountCreateError>()(",
      '  "M027AccountCreateError",',
      "  { accountId: Schema.String, message: Schema.String },",
      ") {}",
      "",
      "export class M027AccountQueryError extends Schema.TaggedError<M027AccountQueryError>()(",
      '  "M027AccountQueryError",',
      "  { accountId: Schema.String, message: Schema.String },",
      ") {}",
      "",
      "export class M027TransferServiceUnavailableError extends Schema.TaggedError<M027TransferServiceUnavailableError>()(",
      '  "M027TransferServiceUnavailableError",',
      "  { message: Schema.String },",
      ") {}",
      "",
      "export interface M027TransferServiceShape {",
      "  readonly create: (",
      "    input: AccountCreate,",
      "  ) => Effect.Effect<AccountSummary, M027AccountCreateError | M027TransferServiceUnavailableError>;",
      "  readonly account: (",
      "    input: AccountQuery,",
      "  ) => Effect.Effect<AccountSummary, M027AccountQueryError | M027TransferServiceUnavailableError>;",
      "  readonly total: (",
      "    input: TotalFundsQuery,",
      "  ) => Effect.Effect<TotalFunds, M027AccountQueryError | M027TransferServiceUnavailableError>;",
      "  readonly transfer: (",
      "    input: TransferCommand,",
      "  ) => Effect.Effect<TransferResult, TransferRejected | M027TransferServiceUnavailableError>;",
      "  readonly subscribeAccount: (",
      "    input: AccountQuery,",
      "  ) => Stream.Stream<AccountSummary, M027AccountQueryError | M027TransferServiceUnavailableError>;",
      "  readonly subscribeTotal: (",
      "    input: TotalFundsQuery,",
      "  ) => Stream.Stream<TotalFunds, M027AccountQueryError | M027TransferServiceUnavailableError>;",
      "}",
      "",
      "export class M027TransferService extends Context.Service<",
      "  M027TransferService,",
      "  M027TransferServiceShape",
      ">()(",
      '  "@bang/m027/transfer",',
      ") {}",
      "",
      `export const transferRejectedIdentity = ${rejectionId} as const;`,
      `export const generatedTarget = ${JSON.stringify(plan.target.api)} as const;`,
      `export const generatedTable = ${JSON.stringify(plan.tableName)} as const;`,
    ].join("\n") + "\n"
  );
};

export interface M027ReportArtifact {
  readonly kind: "sqlite-schema" | "effect-binding";
  readonly path: string;
  readonly sha256: string;
}

export interface M027LawDisposition {
  readonly subject: string;
  readonly law: string;
  readonly source:
    | "authored"
    | "checked-core"
    | "composition-links"
    | "reusable-obligation"
    | "m016-lean"
    | "target"
    | "runtime"
    | "scenario"
    | "structurally-derived"
    | "theory-derived";
  readonly mechanism:
    | "type"
    | "structure"
    | "representation-check"
    | "derivation"
    | "kernel"
    | "database-constraint"
    | "atomic-transaction"
    | "runtime-evaluator"
    | "runtime-check"
    | "scenario";
  readonly qualification:
    | "static-checked"
    | "structurally-derived"
    | "kernel-proven"
    | "runtime-checked"
    | "scenario-tested"
    | "unsupported-by-target"
    | "unresolved";
  readonly claim: string;
  readonly invalidators: ReadonlyArray<string>;
}

const M027AccountSummaryReportSchema = Schema.Struct({
  accountId: PublicIdentity,
  revision: NonNegativeDecimalInteger,
  balance: NonNegativeDecimalInteger,
}).annotate({ parseOptions });

const M027TotalFundsReportSchema = Schema.Struct({
  revision: NonNegativeDecimalInteger,
  total: NonNegativeDecimalInteger,
}).annotate({ parseOptions });

const M027SnapshotReportSchema = Schema.Struct({
  source: M027AccountSummaryReportSchema,
  target: M027AccountSummaryReportSchema,
  total: M027TotalFundsReportSchema,
}).annotate({ parseOptions });

const M027DispositionSchema = Schema.Struct({
  subject: Schema.String,
  law: Schema.String,
  source: Schema.Literals([
    "authored",
    "checked-core",
    "composition-links",
    "reusable-obligation",
    "m016-lean",
    "target",
    "runtime",
    "scenario",
    "structurally-derived",
    "theory-derived",
  ]),
  mechanism: Schema.Literals([
    "type",
    "structure",
    "representation-check",
    "derivation",
    "kernel",
    "database-constraint",
    "atomic-transaction",
    "runtime-evaluator",
    "runtime-check",
    "scenario",
  ]),
  qualification: Schema.Literals([
    "static-checked",
    "structurally-derived",
    "kernel-proven",
    "runtime-checked",
    "scenario-tested",
    "unsupported-by-target",
    "unresolved",
  ]),
  claim: Schema.String,
  invalidators: Schema.NonEmptyArray(Schema.String),
}).annotate({ parseOptions });

const M027SelectionReportSchema = Schema.Struct({
  path: RepositoryRelativePath,
  stateMachine: PublicIdentity,
  initializer: PublicIdentity,
  invariant: PublicIdentity,
  refinement: PublicIdentity,
  bridge: PublicIdentity,
  obligation: PublicIdentity,
  evidence: RepositoryRelativePath,
  command: PublicIdentity,
  rejection: PublicIdentity,
  accountQuery: PublicIdentity,
  totalQuery: PublicIdentity,
  accountSubscription: PublicIdentity,
  totalSubscription: PublicIdentity,
}).annotate({ parseOptions });

const M027JourneyReportSchema = Schema.Struct({
  initial: M027SnapshotReportSchema,
  committed: M027SnapshotReportSchema,
  emitted: Schema.Tuple([M027SnapshotReportSchema, M027SnapshotReportSchema]),
  rejection: Schema.Struct({
    identity: PublicIdentity,
    sourceRevisionUnchangedAt: NonNegativeDecimalInteger,
    targetRevisionUnchangedAt: NonNegativeDecimalInteger,
    totalRevisionUnchangedAt: NonNegativeDecimalInteger,
  }).annotate({ parseOptions }),
  queryRunsAfterRejection: Schema.Natural,
  clean: M027SnapshotReportSchema,
  reopened: M027SnapshotReportSchema,
  incrementalEqualsClean: Schema.Boolean,
  reopenedEqualsClean: Schema.Boolean,
}).annotate({ parseOptions });

const M027TransferReportSchemaBase = Schema.Struct({
  bangSemanticDatabaseReport: Schema.Literal(1),
  projectId: PublicIdentity,
  serviceId: PublicIdentity,
  artifact: Schema.Struct({
    id: PublicIdentity,
    sha256: Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u))),
  }).annotate({ parseOptions }),
  selection: M027SelectionReportSchema,
  generatedArtifacts: Schema.Tuple([
    Schema.Struct({
      kind: Schema.Literal("sqlite-schema"),
      path: RepositoryRelativePath,
      sha256: Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u))),
    }).annotate({ parseOptions }),
    Schema.Struct({
      kind: Schema.Literal("effect-binding"),
      path: RepositoryRelativePath,
      sha256: Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u))),
    }).annotate({ parseOptions }),
  ]),
  journey: M027JourneyReportSchema,
  dispositions: Schema.NonEmptyArray(M027DispositionSchema),
  limitations: Schema.NonEmptyArray(Schema.String),
}).annotate({ parseOptions });

type M027TransferReportValue = typeof M027TransferReportSchemaBase.Type;

const m027SnapshotEqual = (
  left: M027TransferReportValue["journey"]["initial"],
  right: M027TransferReportValue["journey"]["initial"],
): boolean =>
  left.source.accountId === right.source.accountId &&
  left.source.revision === right.source.revision &&
  left.source.balance === right.source.balance &&
  left.target.accountId === right.target.accountId &&
  left.target.revision === right.target.revision &&
  left.target.balance === right.target.balance &&
  left.total.revision === right.total.revision &&
  left.total.total === right.total.total;

const hasConsistentM027TransferReport = (report: M027TransferReportValue): boolean => {
  const [schemaArtifact, bindingArtifact] = report.generatedArtifacts;
  if (
    schemaArtifact.kind !== "sqlite-schema" ||
    bindingArtifact.kind !== "effect-binding" ||
    report.projectId !== report.artifact.id ||
    report.serviceId.length === 0 ||
    report.journey.initial.source.revision !== "0" ||
    report.journey.initial.target.revision !== "0" ||
    report.journey.initial.total.revision !== "0" ||
    report.journey.committed.source.revision !== "1" ||
    report.journey.committed.target.revision !== "1" ||
    report.journey.committed.total.revision !== "1" ||
    report.journey.rejection.sourceRevisionUnchangedAt !== "1" ||
    report.journey.rejection.targetRevisionUnchangedAt !== "1" ||
    report.journey.rejection.totalRevisionUnchangedAt !== "1" ||
    !report.journey.incrementalEqualsClean ||
    !report.journey.reopenedEqualsClean
  ) {
    return false;
  }
  return (
    m027SnapshotEqual(report.journey.emitted[0], report.journey.initial) &&
    m027SnapshotEqual(report.journey.emitted[1], report.journey.committed) &&
    m027SnapshotEqual(report.journey.clean, report.journey.committed) &&
    m027SnapshotEqual(report.journey.reopened, report.journey.clean)
  );
};

/** Strict deterministic M027 report retaining every law disposition and limitation. */
export const M027TransferReportSchema = M027TransferReportSchemaBase.check(
  Schema.makeFilter(hasConsistentM027TransferReport, {
    expected: "an internally consistent M027 transfer revision and parity report",
  }),
);
export type M027TransferReport = typeof M027TransferReportSchema.Type;
export const M027TransferReportFromJson = Schema.fromJsonString(M027TransferReportSchema);
