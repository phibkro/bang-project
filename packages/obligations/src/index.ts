import type { CheckedCoreDocument } from "@bang/core";
import { Context, Effect, FileSystem, Layer, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export type RelationalVariant = "lawful" | "faulty";

export interface RelationalVariableExpression {
  readonly kind: "variable";
  readonly id: string;
  readonly sort: "Integer";
}

export interface RelationalLiteralExpression {
  readonly kind: "literal";
  readonly value: number;
}

export interface RelationalBinaryExpression {
  readonly kind: "add" | "subtract";
  readonly left: RelationalExpression;
  readonly right: RelationalExpression;
}

export type RelationalExpression =
  | RelationalVariableExpression
  | RelationalLiteralExpression
  | RelationalBinaryExpression;

export interface RelationalPredicate {
  readonly kind: "equal" | "lessThanOrEqual";
  readonly left: RelationalExpression;
  readonly right: RelationalExpression;
}

const RelationalExpressionReference = Schema.suspend(
  (): Schema.Codec<RelationalExpression> => RelationalExpressionSchema,
);

const RelationalVariableExpressionSchema = Schema.Struct({
  kind: Schema.Literal("variable"),
  id: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  sort: Schema.Literal("Integer"),
});

const RelationalLiteralExpressionSchema = Schema.Struct({
  kind: Schema.Literal("literal"),
  value: Schema.Int,
});

const RelationalBinaryExpressionSchema = Schema.Struct({
  kind: Schema.Literals(["add", "subtract"]),
  left: RelationalExpressionReference,
  right: RelationalExpressionReference,
});

export const RelationalExpressionSchema: Schema.Codec<RelationalExpression> = Schema.Union([
  RelationalVariableExpressionSchema,
  RelationalLiteralExpressionSchema,
  RelationalBinaryExpressionSchema,
]);

export const RelationalPredicateSchema: Schema.Codec<RelationalPredicate> = Schema.Struct({
  kind: Schema.Literals(["equal", "lessThanOrEqual"]),
  left: RelationalExpressionSchema,
  right: RelationalExpressionSchema,
});

const RelationalVariable = Schema.Struct({
  id: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  sort: Schema.Literal("Integer"),
  lower: Schema.Int,
  upper: Schema.Int,
});

export const RelationalObligationSchema = Schema.Struct({
  kind: Schema.Literal("relational"),
  id: Schema.Literal("AccountLedger.transferPreservesTotal"),
  variant: Schema.Literals(["lawful", "faulty"]),
  source: Schema.Struct({
    core: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
    bridge: Schema.Literal("AccountLedger"),
    relation: Schema.Literal("transferPreservesTotal"),
  }),
  variables: Schema.Array(RelationalVariable),
  assumptions: Schema.Array(RelationalPredicateSchema),
  claim: RelationalPredicateSchema,
}).annotate({ parseOptions: { onExcessProperty: "error" } });

export type RelationalObligation = typeof RelationalObligationSchema.Type;
export type RelationalModel = Readonly<Record<string, number>>;

export class ObligationError extends Schema.TaggedError<ObligationError>()("ObligationError", {
  reason: Schema.Literals([
    "missing-bridge",
    "unsupported-source",
    "invalid-obligation",
    "unknown-variable",
  ]),
  obligationId: Schema.String,
  message: Schema.String,
}) {}

const obligationFailure = (reason: ObligationError["reason"], message: string): ObligationError =>
  new ObligationError({
    reason,
    obligationId: "AccountLedger.transferPreservesTotal",
    message,
  });

const variable = (id: string): RelationalVariableExpression => ({
  kind: "variable",
  id,
  sort: "Integer",
});
const literal = (value: number): RelationalLiteralExpression => ({ kind: "literal", value });
const add = (left: RelationalExpression, right: RelationalExpression): RelationalExpression => ({
  kind: "add",
  left,
  right,
});
const subtract = (
  left: RelationalExpression,
  right: RelationalExpression,
): RelationalExpression => ({ kind: "subtract", left, right });
const equal = (left: RelationalExpression, right: RelationalExpression): RelationalPredicate => ({
  kind: "equal",
  left,
  right,
});
const lessThanOrEqual = (
  left: RelationalExpression,
  right: RelationalExpression,
): RelationalPredicate => ({ kind: "lessThanOrEqual", left, right });

const findAccountLedgerBridge = (document: CheckedCoreDocument) =>
  document.declarations.find(
    (declaration) => declaration.kind === "theoryBridge" && declaration.id === "AccountLedger",
  );

const hasIntegerBalanceSharing = (document: CheckedCoreDocument): boolean => {
  const bridge = findAccountLedgerBridge(document);
  if (bridge === undefined || bridge.kind !== "theoryBridge") return false;
  const sharedBalance = bridge.sharedSorts.find(({ id }) => id === "Balance");
  if (sharedBalance === undefined || sharedBalance.members.length !== 2) return false;
  return sharedBalance.members.every((member) => {
    const participant = bridge.participants.find(({ id }) => id === member.participant);
    const theory = document.declarations.find(
      (declaration) => declaration.kind === "theory" && declaration.id === participant?.theory,
    );
    return (
      theory?.kind === "theory" &&
      theory.sorts.some(
        (sort) =>
          sort.id === member.sort &&
          sort.representation?.kind === "builtin" &&
          sort.representation.type === "Integer",
      )
    );
  });
};

export const deriveTransferPreservationObligation = (
  document: CheckedCoreDocument,
  variant: RelationalVariant,
  options: { readonly coreSource?: string } = {},
): Effect.Effect<RelationalObligation, ObligationError> => {
  if (findAccountLedgerBridge(document) === undefined) {
    return Effect.fail(
      obligationFailure("missing-bridge", "checked Core does not declare bridge AccountLedger"),
    );
  }
  if (!hasIntegerBalanceSharing(document)) {
    return Effect.fail(
      obligationFailure(
        "unsupported-source",
        "AccountLedger must share an Integer-represented Balance sort across both participants",
      ),
    );
  }

  const sourceBefore = variable("sourceBefore");
  const targetBefore = variable("targetBefore");
  const amount = variable("amount");
  const sourceAfter = variable("sourceAfter");
  const targetAfter = variable("targetAfter");
  const fault = literal(variant === "faulty" ? 1 : 0);
  const obligation = RelationalObligationSchema.make({
    kind: "relational",
    id: "AccountLedger.transferPreservesTotal",
    variant,
    source: {
      core: options.coreSource ?? "examples/tiny-bank/core/account-ledger-bridge.json",
      bridge: "AccountLedger",
      relation: "transferPreservesTotal",
    },
    variables: [
      { id: "sourceBefore", sort: "Integer", lower: 1, upper: 10 },
      { id: "targetBefore", sort: "Integer", lower: 0, upper: 10 },
      { id: "amount", sort: "Integer", lower: 1, upper: 10 },
      { id: "sourceAfter", sort: "Integer", lower: 0, upper: 10 },
      { id: "targetAfter", sort: "Integer", lower: 0, upper: 21 },
    ],
    assumptions: [
      lessThanOrEqual(amount, sourceBefore),
      equal(sourceAfter, subtract(sourceBefore, amount)),
      equal(targetAfter, add(add(targetBefore, amount), fault)),
    ],
    claim: equal(add(sourceBefore, targetBefore), add(sourceAfter, targetAfter)),
  });
  return checkRelationalObligation(document, obligation).pipe(Effect.as(obligation));
};

const expressionVariables = (expression: RelationalExpression): ReadonlyArray<string> => {
  switch (expression.kind) {
    case "variable":
      return [expression.id];
    case "literal":
      return [];
    case "add":
    case "subtract":
      return [...expressionVariables(expression.left), ...expressionVariables(expression.right)];
  }
};

export const checkRelationalObligation = (
  document: CheckedCoreDocument,
  obligation: RelationalObligation,
): Effect.Effect<void, ObligationError> => {
  if (
    findAccountLedgerBridge(document) === undefined ||
    obligation.source.bridge !== "AccountLedger"
  ) {
    return Effect.fail(
      obligationFailure("missing-bridge", "obligation source bridge is not checked"),
    );
  }
  if (!hasIntegerBalanceSharing(document)) {
    return Effect.fail(
      obligationFailure("unsupported-source", "checked source has no shared Integer Balance"),
    );
  }
  const identities = new Set<string>();
  for (const entry of obligation.variables) {
    if (identities.has(entry.id)) {
      return Effect.fail(
        obligationFailure("invalid-obligation", `variable identity ${entry.id} is duplicated`),
      );
    }
    if (entry.lower > entry.upper) {
      return Effect.fail(
        obligationFailure(
          "invalid-obligation",
          `variable ${entry.id} has lower bound ${entry.lower} above upper bound ${entry.upper}`,
        ),
      );
    }
    identities.add(entry.id);
  }
  const references = [
    ...obligation.assumptions.flatMap(({ left, right }) => [
      ...expressionVariables(left),
      ...expressionVariables(right),
    ]),
    ...expressionVariables(obligation.claim.left),
    ...expressionVariables(obligation.claim.right),
  ];
  const unknown = references.find((id) => !identities.has(id));
  return unknown === undefined
    ? Effect.void
    : Effect.fail(
        obligationFailure(
          "unknown-variable",
          `relational expression references unknown variable ${unknown}`,
        ),
      );
};

const evaluateExpression = (expression: RelationalExpression, model: RelationalModel): number => {
  switch (expression.kind) {
    case "literal":
      return expression.value;
    case "variable": {
      const value = model[expression.id];
      if (value === undefined) throw new TypeError(`model omits variable ${expression.id}`);
      return value;
    }
    case "add":
      return (
        evaluateExpression(expression.left, model) + evaluateExpression(expression.right, model)
      );
    case "subtract":
      return (
        evaluateExpression(expression.left, model) - evaluateExpression(expression.right, model)
      );
  }
};

const evaluatePredicate = (predicate: RelationalPredicate, model: RelationalModel): boolean => {
  const left = evaluateExpression(predicate.left, model);
  const right = evaluateExpression(predicate.right, model);
  return predicate.kind === "equal" ? left === right : left <= right;
};

export interface RelationalEvaluation {
  readonly assumptionsSatisfied: boolean;
  readonly claimSatisfied: boolean;
  readonly counterexample: boolean;
  readonly sourceTotal: number;
  readonly targetTotal: number;
}

export const evaluateRelationalObligation = (
  obligation: RelationalObligation,
  model: RelationalModel,
): RelationalEvaluation => {
  const expected = obligation.variables.map(({ id }) => id).toSorted();
  const actual = Object.keys(model).toSorted();
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
    throw new TypeError("model identities do not match the relational obligation");
  }
  for (const entry of obligation.variables) {
    const value = model[entry.id];
    if (
      value === undefined ||
      !Number.isInteger(value) ||
      value < entry.lower ||
      value > entry.upper
    ) {
      throw new TypeError(`model value for ${entry.id} is outside its declared Integer bounds`);
    }
  }
  const assumptionsSatisfied = obligation.assumptions.every((predicate) =>
    evaluatePredicate(predicate, model),
  );
  const claimSatisfied = evaluatePredicate(obligation.claim, model);
  return {
    assumptionsSatisfied,
    claimSatisfied,
    counterexample: assumptionsSatisfied && !claimSatisfied,
    sourceTotal: (model.sourceBefore ?? 0) + (model.targetBefore ?? 0),
    targetTotal: (model.sourceAfter ?? 0) + (model.targetAfter ?? 0),
  };
};

const smtInteger = (value: number): string =>
  value < 0 ? `(- ${Math.abs(value)})` : String(value);
const projectExpression = (expression: RelationalExpression): string => {
  switch (expression.kind) {
    case "variable":
      return expression.id;
    case "literal":
      return smtInteger(expression.value);
    case "add":
      return `(+ ${projectExpression(expression.left)} ${projectExpression(expression.right)})`;
    case "subtract":
      return `(- ${projectExpression(expression.left)} ${projectExpression(expression.right)})`;
  }
};
const projectPredicate = (predicate: RelationalPredicate): string =>
  `(${predicate.kind === "equal" ? "=" : "<="} ${projectExpression(predicate.left)} ${projectExpression(predicate.right)})`;

export const projectQfLia = (obligation: RelationalObligation): string => {
  const lines = [
    "; Generated by BANG M011. Solver syntax is not Core semantics.",
    "(set-logic QF_LIA)",
    "(set-option :produce-models true)",
    "(set-option :timeout 2000)",
    ...obligation.variables.map(({ id }) => `(declare-const ${id} Int)`),
    ...obligation.variables.map(
      ({ id, lower, upper }) =>
        `(assert (and (<= ${smtInteger(lower)} ${id}) (<= ${id} ${smtInteger(upper)})))`,
    ),
    ...obligation.assumptions.map((predicate) => `(assert ${projectPredicate(predicate)})`),
    `(assert (not ${projectPredicate(obligation.claim)}))`,
    ...(obligation.variant === "faulty"
      ? obligation.variables.map(({ id }) => `(minimize ${id})`)
      : []),
    "(check-sat)",
    ...(obligation.variant === "faulty"
      ? [`(get-value (${obligation.variables.map(({ id }) => id).join(" ")}))`]
      : []),
    "",
  ];
  return lines.join("\n");
};

export interface RelationalProviderResult {
  readonly obligationId: string;
  readonly variant: RelationalVariant;
  readonly status: "sat" | "unsat" | "unknown";
  readonly result: "bounded-counterexample" | "bounded-no-counterexample" | "inconclusive";
  readonly model?: RelationalModel;
  readonly z3Version?: string;
}

export class ProviderFailure extends Schema.TaggedError<ProviderFailure>()("ProviderFailure", {
  reason: Schema.Literals(["unsupported-provider", "provider-timeout", "provider-failed"]),
  obligationId: Schema.String,
  message: Schema.String,
}) {}

const providerFailure = (
  reason: ProviderFailure["reason"],
  obligationId: string,
  message: string,
): ProviderFailure => new ProviderFailure({ reason, obligationId, message });

const parseInteger = (text: string): number | undefined => {
  const trimmed = text.trim();
  const match = /^\(-\s+(\d+)\)$/.exec(trimmed);
  const value = match === null ? Number(trimmed) : -Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
};

export const parseZ3Output = (
  output: string,
  obligation: RelationalObligation,
  z3Version?: string,
): Effect.Effect<RelationalProviderResult, ProviderFailure> => {
  const statusMatch = /^(sat|unsat|unknown)$/m.exec(output);
  if (statusMatch === null) {
    return Effect.fail(
      providerFailure("provider-failed", obligation.id, "Z3 output omitted a standalone status"),
    );
  }
  const status = statusMatch[1] as "sat" | "unsat" | "unknown";
  if (status === "unsat") {
    return Effect.succeed({
      obligationId: obligation.id,
      variant: obligation.variant,
      status,
      result: "bounded-no-counterexample",
      ...(z3Version === undefined ? {} : { z3Version }),
    });
  }
  if (status === "unknown") {
    return Effect.succeed({
      obligationId: obligation.id,
      variant: obligation.variant,
      status,
      result: "inconclusive",
      ...(z3Version === undefined ? {} : { z3Version }),
    });
  }
  const model: Record<string, number> = {};
  for (const { id } of obligation.variables) {
    const match = new RegExp(`\\(${id}\\s+((?:\\(-\\s+\\d+\\))|-?\\d+)\\)`).exec(output);
    const value = match?.[1] === undefined ? undefined : parseInteger(match[1]);
    if (value === undefined) {
      return Effect.fail(
        providerFailure("provider-failed", obligation.id, `Z3 model omitted Integer value ${id}`),
      );
    }
    model[id] = value;
  }
  const pairs = [...output.matchAll(/\(([A-Za-z][A-Za-z0-9]*)\s+((?:\(-\s+\d+\))|-?\d+)\)/g)];
  const extra = pairs.find(([_, id]) => !obligation.variables.some((entry) => entry.id === id));
  if (extra?.[1] !== undefined) {
    return Effect.fail(
      providerFailure(
        "provider-failed",
        obligation.id,
        `Z3 model returned extra identity ${extra[1]}`,
      ),
    );
  }
  try {
    const evaluation = evaluateRelationalObligation(obligation, model);
    if (!evaluation.counterexample) {
      return Effect.fail(
        providerFailure(
          "provider-failed",
          obligation.id,
          "Z3 SAT model is not a counterexample to the normalized obligation",
        ),
      );
    }
  } catch (error) {
    return Effect.fail(providerFailure("provider-failed", obligation.id, String(error)));
  }
  return Effect.succeed({
    obligationId: obligation.id,
    variant: obligation.variant,
    status,
    result: "bounded-counterexample",
    model,
    ...(z3Version === undefined ? {} : { z3Version }),
  });
};

export interface RelationalProviderRequest {
  readonly obligation: RelationalObligation;
  readonly smtLib?: string;
}

export class RelationalProvider extends Context.Service<
  RelationalProvider,
  {
    readonly run: (
      request: RelationalProviderRequest,
    ) => Effect.Effect<
      RelationalProviderResult,
      ProviderFailure,
      ChildProcessSpawner.ChildProcessSpawner
    >;
  }
>()("@bang/obligations/RelationalProvider") {}

const runCommand = Effect.fn("Z3Provider.runCommand")(function* (
  command: string,
  args: ReadonlyArray<string>,
  stdin?: string,
) {
  const process = yield* ChildProcess.make(command, args, {
    stdin: stdin === undefined ? "ignore" : Stream.succeed(new TextEncoder().encode(stdin)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      process.stdout.pipe(Stream.decodeText(), Stream.mkString),
      process.stderr.pipe(Stream.decodeText(), Stream.mkString),
      process.exitCode,
    ] as const,
    { concurrency: "unbounded" },
  );
  return { stdout, stderr, exitCode };
}, Effect.scoped);

const z3Args = ["shell", "nixpkgs#z3", "-c", "z3"] as const;

const makeZ3Provider = Effect.succeed(
  RelationalProvider.of({
    run: Effect.fn("Z3Provider.run")(function* ({ obligation, smtLib }: RelationalProviderRequest) {
      const query = smtLib ?? projectQfLia(obligation);
      const versionProcess = yield* runCommand("nix", [...z3Args, "-version"]).pipe(
        Effect.mapError((error) =>
          providerFailure(
            "provider-failed",
            obligation.id,
            `Z3 version command failed: ${String(error)}`,
          ),
        ),
      );
      if (versionProcess.exitCode !== ChildProcessSpawner.ExitCode(0)) {
        return yield* providerFailure(
          "provider-failed",
          obligation.id,
          `Z3 version command exited ${versionProcess.exitCode}: ${versionProcess.stderr}`,
        );
      }
      const version = versionProcess.stdout.trim().replace(/^Z3 version\s+/i, "");
      const execution = yield* runCommand("nix", [...z3Args, "-in", "-smt2"], query).pipe(
        Effect.mapError((error) =>
          providerFailure("provider-failed", obligation.id, `Z3 process failed: ${String(error)}`),
        ),
        Effect.timeoutOrElse({
          duration: 5_000,
          orElse: () =>
            Effect.fail(
              providerFailure("provider-timeout", obligation.id, "Z3 process exceeded 5000 ms"),
            ),
        }),
      );
      if (execution.exitCode !== ChildProcessSpawner.ExitCode(0)) {
        return yield* providerFailure(
          "provider-failed",
          obligation.id,
          `Z3 exited ${execution.exitCode}: ${execution.stderr || execution.stdout}`,
        );
      }
      if (/^timeout$/m.test(execution.stdout) || /timeout/i.test(execution.stderr)) {
        return yield* providerFailure("provider-timeout", obligation.id, "Z3 reported a timeout");
      }
      return yield* parseZ3Output(execution.stdout, obligation, version);
    }),
  }),
);

export const Z3Layer = Layer.effect(RelationalProvider, makeZ3Provider);
export const LEAN_VERSION = "4.30.0" as const;
export const LEAN_ARCHIVE_SHA256 = "sha256-Ta10FBwsEZyhqmJmVr6DuOFCOK+6lycf178es/CBsxk=" as const;
export const LEAN_IMPORTED_MODULE = "Lean.Elab.Tactic.Omega" as const;
export const LEAN_PROVIDER_COMMAND = "nix shell -f nix/lean.nix -c lean" as const;

export const LEAN_LAWFUL_THEOREM_ID = "AccountLedger_transferPreservesTotal_lawful" as const;
export const LEAN_FAULTY_THEOREM_ID =
  "AccountLedger_transferPreservesTotal_faulty_refuted" as const;

export type LeanEvidenceResult = "kernel-proven" | "kernel-refuted";

export interface LeanObligationProjection {
  readonly obligationId: RelationalObligation["id"];
  readonly variant: RelationalVariant;
  readonly theoremId: string;
  readonly result: LeanEvidenceResult;
  readonly source: string;
}

export interface LeanModuleProjection {
  readonly source: string;
  readonly lawful: LeanObligationProjection;
  readonly faulty: LeanObligationProjection;
}

const leanVariableIds = [
  "sourceBefore",
  "targetBefore",
  "amount",
  "sourceAfter",
  "targetAfter",
] as const;

const leanIdentifier = /^[A-Za-z_][A-Za-z0-9_']*$/;

const validateLeanObligation = (obligation: RelationalObligation): void => {
  if (obligation.id !== "AccountLedger.transferPreservesTotal") {
    throw new TypeError(`Lean provider does not support obligation ${obligation.id}`);
  }
  const variableIds = obligation.variables.map(({ id }) => id);
  if (
    variableIds.length !== leanVariableIds.length ||
    variableIds.some((id, index) => id !== leanVariableIds[index])
  ) {
    throw new TypeError(
      "Lean provider requires the canonical AccountLedger transfer variable identities",
    );
  }
  if (new Set(variableIds).size !== variableIds.length) {
    throw new TypeError("Lean provider cannot project duplicate variable identities");
  }
  for (const id of variableIds) {
    if (!leanIdentifier.test(id)) {
      throw new TypeError(`Lean provider cannot project variable identity ${id}`);
    }
  }
  const references = [
    ...obligation.assumptions.flatMap(({ left, right }) => [
      ...expressionVariables(left),
      ...expressionVariables(right),
    ]),
    ...expressionVariables(obligation.claim.left),
    ...expressionVariables(obligation.claim.right),
  ];
  const unknown = references.find((id) => !variableIds.includes(id));
  if (unknown !== undefined) {
    throw new TypeError(`Lean provider cannot project unknown variable ${unknown}`);
  }
};

const leanInteger = (value: number): string =>
  value < 0 ? `(-${Math.abs(value)})` : String(value);

const projectLeanExpression = (expression: RelationalExpression): string => {
  switch (expression.kind) {
    case "variable":
      if (!leanIdentifier.test(expression.id)) {
        throw new TypeError(`Lean provider cannot project variable identity ${expression.id}`);
      }
      return expression.id;
    case "literal":
      return leanInteger(expression.value);
    case "add":
      return `(${projectLeanExpression(expression.left)} + ${projectLeanExpression(expression.right)})`;
    case "subtract":
      return `(${projectLeanExpression(expression.left)} - ${projectLeanExpression(expression.right)})`;
  }
};

const projectLeanPredicate = (predicate: RelationalPredicate): string =>
  predicate.kind === "equal"
    ? `${projectLeanExpression(predicate.left)} = ${projectLeanExpression(predicate.right)}`
    : `${projectLeanExpression(predicate.left)} <= ${projectLeanExpression(predicate.right)}`;

const leanVariableBinder = (obligation: RelationalObligation): string =>
  `${obligation.variables.map(({ id }) => id).join(" ")} : Int`;

const leanProofMarker = (projection: {
  readonly obligationId: string;
  readonly variant: RelationalVariant;
  readonly theoremId: string;
  readonly result: LeanEvidenceResult;
}): ReadonlyArray<string> => [
  `#eval IO.println "BANG_M016_SUCCESS|${projection.obligationId}|${projection.variant}|${projection.theoremId}|${projection.result}"`,
  `#eval IO.println "BANG_M016_AXIOMS_BEGIN|${projection.theoremId}"`,
  `#print axioms ${projection.theoremId}`,
  `#eval IO.println "BANG_M016_AXIOMS_END|${projection.theoremId}"`,
];

const renderLeanLawfulTheorem = (obligation: RelationalObligation, theoremId: string): string => {
  const assumptions = obligation.assumptions.map((predicate, index) => {
    const name = `_h_assumption_${index + 1}`;
    return `    (${name} : ${projectLeanPredicate(predicate)})`;
  });
  return [
    `theorem ${theoremId} (${leanVariableBinder(obligation)})`,
    ...assumptions,
    `    : ${projectLeanPredicate(obligation.claim)} := by`,
    "  omega",
  ].join("\n");
};

const renderLeanFaultyRefutation = (
  obligation: RelationalObligation,
  theoremId: string,
): string => {
  const assumptions = obligation.assumptions.map((predicate) => projectLeanPredicate(predicate));
  return [
    `theorem ${theoremId} :`,
    `    ¬ (∀ (${leanVariableBinder(obligation)}),`,
    ...assumptions.map((predicate) => `      ${predicate} →`),
    `      ${projectLeanPredicate(obligation.claim)}) := by`,
    "  intro universalClaim",
    "  -- Explicit counterexample witness: (1,0,1,0,2)",
    "  have counterexample := universalClaim (1 : Int) (0 : Int) (1 : Int) (0 : Int) (2 : Int)",
    ...assumptions.map(() => "    (by omega)"),
    "  omega",
  ].join("\n");
};

const renderLeanObligation = (projection: {
  readonly obligation: RelationalObligation;
  readonly theoremId: string;
  readonly result: LeanEvidenceResult;
}): string => {
  const theorem =
    projection.result === "kernel-proven"
      ? renderLeanLawfulTheorem(projection.obligation, projection.theoremId)
      : renderLeanFaultyRefutation(projection.obligation, projection.theoremId);
  const marker = leanProofMarker({
    obligationId: projection.obligation.id,
    variant: projection.obligation.variant,
    theoremId: projection.theoremId,
    result: projection.result,
  });
  return [theorem, ...marker].join("\n");
};

const makeLeanObligationProjection = (
  obligation: RelationalObligation,
): LeanObligationProjection => {
  validateLeanObligation(obligation);
  const lawful = obligation.variant === "lawful";
  const theoremId = lawful ? LEAN_LAWFUL_THEOREM_ID : LEAN_FAULTY_THEOREM_ID;
  const result = lawful ? "kernel-proven" : "kernel-refuted";
  const body = renderLeanObligation({ obligation, theoremId, result });
  return {
    obligationId: obligation.id,
    variant: obligation.variant,
    theoremId,
    result,
    source: [`import ${LEAN_IMPORTED_MODULE}`, "", body, ""].join("\n"),
  };
};

/** Project the canonical lawful/faulty pair into one deterministic Lean module. */
export const projectLeanModule = ({
  lawful,
  faulty,
}: {
  readonly lawful: RelationalObligation;
  readonly faulty: RelationalObligation;
}): LeanModuleProjection => {
  if (lawful.variant !== "lawful" || faulty.variant !== "faulty") {
    throw new TypeError("Lean module projection requires lawful then faulty obligations");
  }
  if (
    lawful.source.core !== faulty.source.core ||
    lawful.source.bridge !== faulty.source.bridge ||
    lawful.source.relation !== faulty.source.relation
  ) {
    throw new TypeError("Lean module projection requires one AccountLedger source pair");
  }
  const lawfulProjection = makeLeanObligationProjection(lawful);
  const faultyProjection = makeLeanObligationProjection(faulty);
  const lawfulBody = renderLeanObligation({
    obligation: lawful,
    theoremId: lawfulProjection.theoremId,
    result: lawfulProjection.result,
  });
  const faultyBody = renderLeanObligation({
    obligation: faulty,
    theoremId: faultyProjection.theoremId,
    result: faultyProjection.result,
  });
  return {
    lawful: lawfulProjection,
    faulty: faultyProjection,
    source: [
      `import ${LEAN_IMPORTED_MODULE}`,
      "",
      "-- Generated by BANG M016. Lean is a proof provider, not Core semantics.",
      lawfulBody,
      "",
      faultyBody,
      "",
    ].join("\n"),
  };
};

export class LeanProviderFailure extends Schema.TaggedError<LeanProviderFailure>()(
  "LeanProviderFailure",
  {
    reason: Schema.Literals([
      "unsupported-provider",
      "provider-timeout",
      "provider-failed",
      "identity-mismatch",
    ]),
    obligationId: Schema.String,
    message: Schema.String,
  },
) {}

const leanProviderFailure = (
  reason: LeanProviderFailure["reason"],
  obligationId: string,
  message: string,
): LeanProviderFailure => new LeanProviderFailure({ reason, obligationId, message });

export interface LeanProviderObservation {
  readonly obligationId: string;
  readonly variant: RelationalVariant;
  readonly theoremId: string;
  readonly result: LeanEvidenceResult;
  readonly axioms: ReadonlyArray<string>;
}

export interface LeanProviderResult {
  readonly leanVersion: string;
  readonly observations: ReadonlyArray<LeanProviderObservation>;
}

const isLeanVariant = (value: string): value is RelationalVariant =>
  value === "lawful" || value === "faulty";

const isLeanEvidenceResult = (value: string): value is LeanEvidenceResult =>
  value === "kernel-proven" || value === "kernel-refuted";

const parseAxiomLine = (output: string, theoremId: string): ReadonlyArray<string> | undefined => {
  const escaped = theoremId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^'?${escaped}'?\\s+depends on axioms:\\s*\\[([^\\]]*)\\]$`, "m");
  const match = pattern.exec(output);
  if (match?.[1] !== undefined) {
    const values = match[1].trim();
    return values.length === 0 ? [] : values.split(",").map((axiom) => axiom.trim());
  }
  const noAxiomsPattern = new RegExp(`^'?${escaped}'?\\s+does not depend on any axioms$`, "m");
  return noAxiomsPattern.test(output) ? [] : undefined;
};

/** Strictly decode Lean's success markers and `#print axioms` output. */
export const parseLeanOutput = (
  output: string,
  projection: LeanModuleProjection,
  leanVersion: string = LEAN_VERSION,
): Effect.Effect<LeanProviderResult, LeanProviderFailure> => {
  const expected = [projection.lawful, projection.faulty];
  const failure = (
    reason: LeanProviderFailure["reason"],
    message: string,
  ): Effect.Effect<never, LeanProviderFailure> =>
    Effect.fail(leanProviderFailure(reason, projection.lawful.obligationId, message));

  const successMarkers: Array<{
    readonly obligationId: string;
    readonly variant: RelationalVariant;
    readonly theoremId: string;
    readonly result: LeanEvidenceResult;
  }> = [];
  const successPattern =
    /^BANG_M016_SUCCESS\|([^|]+)\|(lawful|faulty)\|([^|]+)\|(kernel-proven|kernel-refuted)$/gm;
  for (const match of output.matchAll(successPattern)) {
    const obligationId = match[1];
    const variant = match[2];
    const theoremId = match[3];
    const result = match[4];
    if (
      obligationId === undefined ||
      variant === undefined ||
      theoremId === undefined ||
      result === undefined ||
      !isLeanVariant(variant) ||
      !isLeanEvidenceResult(result)
    ) {
      return failure("provider-failed", "Lean success marker was malformed");
    }
    successMarkers.push({ obligationId, variant, theoremId, result });
  }
  if (successMarkers.length !== expected.length) {
    return failure("provider-failed", "Lean output did not contain exactly two success markers");
  }

  const observations: Array<LeanProviderObservation> = [];
  for (const [index, expectedProjection] of expected.entries()) {
    const marker = successMarkers[index];
    if (
      marker === undefined ||
      marker.obligationId !== expectedProjection.obligationId ||
      marker.variant !== expectedProjection.variant ||
      marker.theoremId !== expectedProjection.theoremId ||
      marker.result !== expectedProjection.result
    ) {
      return failure("identity-mismatch", "Lean output identity or theorem marker did not match");
    }
    const axioms = parseAxiomLine(output, expectedProjection.theoremId);
    if (axioms === undefined) {
      return failure(
        "provider-failed",
        `Lean output omitted #print axioms for ${expectedProjection.theoremId}`,
      );
    }
    const allowedAxioms = new Set(["propext", "Classical.choice", "Quot.sound"]);
    if (
      new Set(axioms).size !== axioms.length ||
      axioms.some((axiom) => !allowedAxioms.has(axiom))
    ) {
      return failure(
        "provider-failed",
        `Lean theorem ${expectedProjection.theoremId} depends on an unapproved or duplicate axiom`,
      );
    }
    observations.push({
      obligationId: expectedProjection.obligationId,
      variant: expectedProjection.variant,
      theoremId: expectedProjection.theoremId,
      result: expectedProjection.result,
      axioms,
    });
  }

  const beginMarkers = [...output.matchAll(/^BANG_M016_AXIOMS_BEGIN\|([^\n|]+)$/gm)].map(
    (match) => match[1],
  );
  const endMarkers = [...output.matchAll(/^BANG_M016_AXIOMS_END\|([^\n|]+)$/gm)].map(
    (match) => match[1],
  );
  if (
    beginMarkers.length !== expected.length ||
    endMarkers.length !== expected.length ||
    expected.some(
      ({ theoremId }, index) =>
        beginMarkers[index] !== theoremId || endMarkers[index] !== theoremId,
    )
  ) {
    return failure("provider-failed", "Lean output omitted or reordered axiom markers");
  }

  return Effect.succeed({ leanVersion, observations });
};

export interface LeanProviderRequest {
  readonly lawful: RelationalObligation;
  readonly faulty: RelationalObligation;
}

export class LeanProvider extends Context.Service<
  LeanProvider,
  {
    readonly run: (
      request: LeanProviderRequest,
    ) => Effect.Effect<
      LeanProviderResult,
      LeanProviderFailure,
      ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem
    >;
  }
>()("@bang/obligations/LeanProvider") {}

const leanNixArgs = ["shell", "-f", "nix/lean.nix", "-c", "lean"] as const;

const runLeanCommand = Effect.fn("LeanProvider.runCommand")(function* (
  args: ReadonlyArray<string>,
  stdin?: string,
) {
  return yield* runCommand("nix", [...leanNixArgs, ...args], stdin);
});

const parseLeanVersion = (output: string): string | undefined => {
  const match =
    /Lean\s+\(version\s+([0-9]+\.[0-9]+\.[0-9]+)/.exec(output) ??
    /\bLean\s+([0-9]+\.[0-9]+\.[0-9]+)/.exec(output);
  return match?.[1];
};

const makeLeanProvider = Effect.succeed(
  LeanProvider.of({
    run: Effect.fn("LeanProvider.run")(function* ({ lawful, faulty }: LeanProviderRequest) {
      let projection: LeanModuleProjection;
      try {
        projection = projectLeanModule({ lawful, faulty });
      } catch (error) {
        const identityMismatch =
          lawful.id !== "AccountLedger.transferPreservesTotal" ||
          faulty.id !== "AccountLedger.transferPreservesTotal" ||
          lawful.variant !== "lawful" ||
          faulty.variant !== "faulty" ||
          lawful.source.core !== faulty.source.core ||
          lawful.source.bridge !== faulty.source.bridge ||
          lawful.source.relation !== faulty.source.relation;
        return yield* leanProviderFailure(
          identityMismatch ? "identity-mismatch" : "unsupported-provider",
          lawful.id,
          `Lean source projection failed: ${String(error)}`,
        );
      }
      const versionProcess = yield* runLeanCommand(["--version"]).pipe(
        Effect.mapError((error) =>
          leanProviderFailure(
            "provider-failed",
            lawful.id,
            `Lean version command failed: ${String(error)}`,
          ),
        ),
      );
      if (versionProcess.exitCode !== ChildProcessSpawner.ExitCode(0)) {
        return yield* leanProviderFailure(
          "provider-failed",
          lawful.id,
          `Lean version command exited ${versionProcess.exitCode}: ${versionProcess.stderr}`,
        );
      }
      const leanVersion = parseLeanVersion(`${versionProcess.stdout}\n${versionProcess.stderr}`);
      if (leanVersion === undefined || leanVersion !== LEAN_VERSION) {
        return yield* leanProviderFailure(
          "provider-failed",
          lawful.id,
          `Lean version was ${leanVersion ?? "not reported"}, expected ${LEAN_VERSION}`,
        );
      }
      const fileSystem = yield* FileSystem.FileSystem;
      const proofPath = yield* fileSystem
        .makeTempFile({
          prefix: "bang-m016-",
          suffix: ".lean",
        })
        .pipe(
          Effect.mapError((error) =>
            leanProviderFailure(
              "provider-failed",
              lawful.id,
              `Lean proof file creation failed: ${String(error)}`,
            ),
          ),
        );
      yield* fileSystem
        .writeFileString(proofPath, projection.source)
        .pipe(
          Effect.mapError((error) =>
            leanProviderFailure(
              "provider-failed",
              lawful.id,
              `Lean proof file write failed: ${String(error)}`,
            ),
          ),
        );
      const execution = yield* runLeanCommand(["-t", "0", "-DwarningAsError=true", proofPath]).pipe(
        Effect.mapError((error) =>
          leanProviderFailure(
            "provider-failed",
            lawful.id,
            `Lean process failed: ${String(error)}`,
          ),
        ),
        Effect.timeoutOrElse({
          duration: 5_000,
          orElse: () =>
            Effect.fail(
              leanProviderFailure("provider-timeout", lawful.id, "Lean process exceeded 5000 ms"),
            ),
        }),
        Effect.ensuring(fileSystem.remove(proofPath, { force: true }).pipe(Effect.ignore)),
      );
      if (execution.exitCode !== ChildProcessSpawner.ExitCode(0)) {
        return yield* leanProviderFailure(
          "provider-failed",
          lawful.id,
          `Lean exited ${execution.exitCode}: ${execution.stderr || execution.stdout}`,
        );
      }
      return yield* parseLeanOutput(
        `${execution.stdout}\n${execution.stderr}`,
        projection,
        leanVersion,
      );
    }),
  }),
);

/** Layer for the pinned Nix-built Lean kernel-proof provider. */
export const LeanLayer = Layer.effect(LeanProvider, makeLeanProvider);
