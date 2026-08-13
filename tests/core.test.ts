import { describe, expect, test } from "bun:test";
import {
  buildTheoryGraph,
  CoreDocumentFromJson,
  evaluateFiniteModel,
  SemanticError,
  validateCore,
} from "@bang/core";
import { Effect, Graph, Schema } from "effect";

describe("Core service declaration", () => {
  test("decodes a valid declaration", async () => {
    const text = await Bun.file("examples/tiny-bank/core/account-service.json").text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    expect(Effect.runSync(validateCore(document)).declarations[0]?.id).toBe("AccountService");
  });

  test("rejects an unknown type reference", async () => {
    const text = await Bun.file("examples/core-fixtures/invalid/unknown-type.json").text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error).toBeInstanceOf(SemanticError);
    expect(error.message).toContain("references unknown type MissingType");
  });
});

describe("Core refinement declaration", () => {
  test("accepts an Integer refinement with a canonical lower bound", async () => {
    const text = await Bun.file("examples/tiny-bank/core/balance.json").text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    expect(Effect.runSync(validateCore(document)).declarations[0]?.id).toBe("Balance");
  });

  test("rejects an unknown refinement base", async () => {
    const text = await Bun.file(
      "examples/core-fixtures/invalid/unknown-refinement-base.json",
    ).text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain("references unknown base MissingInteger");
  });

  test("rejects a comparison whose self operand is not an Integer", async () => {
    const text = await Bun.file(
      "examples/core-fixtures/invalid/ill-typed-refinement-predicate.json",
    ).text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain("compares self : String with Integer");
  });
});

describe("Core finite model satisfaction", () => {
  test("exhaustively accepts the valid Account Lifecycle model", async () => {
    const text = await Bun.file("examples/tiny-bank/core/account-lifecycle.json").text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const result = Effect.runSync(evaluateFiniteModel(document, "AccountLifecycleValid"));

    expect(result).toEqual({
      satisfies: true,
      theory: "AccountLifecycle",
      model: "AccountLifecycleValid",
      checkedAssignments: 3,
    });
  });

  test("returns a structured counterexample for the broken model", async () => {
    const text = await Bun.file("examples/tiny-bank/core/account-lifecycle.json").text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const result = Effect.runSync(evaluateFiniteModel(document, "AccountLifecycleBroken"));

    expect(result).toEqual({
      satisfies: false,
      theory: "AccountLifecycle",
      model: "AccountLifecycleBroken",
      checkedAssignments: 1,
      counterexample: {
        law: "freezeIdempotent",
        assignment: [{ parameter: "status", element: "Open" }],
        left: "Open",
        right: "Frozen",
      },
    });
  });

  test("rejects an incomplete operation interpretation", async () => {
    const text = await Bun.file(
      "examples/core-fixtures/invalid/incomplete-finite-model.json",
    ).text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain('operation freeze is incomplete at arguments ["Frozen"]');
  });
});

describe("Core represented theory sorts", () => {
  test("accepts the represented IntegerAddition theory", async () => {
    const text = await Bun.file("examples/tiny-bank/core/integer-addition.json").text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const validated = Effect.runSync(validateCore(document));

    expect(validated.declarations[0]?.id).toBe("IntegerAddition");
  });

  test("rejects an unknown built-in carrier representation", async () => {
    const text = await Bun.file(
      "examples/core-fixtures/invalid/unsupported-sort-representation.json",
    ).text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain("unknown built-in representation Decimal");
  });
});

describe("Core state-machine preservation contracts", () => {
  test("accepts Account construction, transition requirements, and invariant", async () => {
    const text = await Bun.file("examples/tiny-bank/core/account-state-machine.json").text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const validated = Effect.runSync(validateCore(document));

    expect(validated.declarations[0]?.id).toBe("Account");
  });

  test("rejects an unknown state-field observation", async () => {
    const text = await Bun.file("examples/core-fixtures/invalid/unknown-state-field.json").text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain(
      "invariant UnknownStateField.nonnegativeBalance references unknown state field missing",
    );
  });

  test("rejects an ill-typed state predicate", async () => {
    const text = await Bun.file(
      "examples/core-fixtures/invalid/ill-typed-state-predicate.json",
    ).text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain(
      "compares String with Integer; greaterThanOrEqual requires Integer operands",
    );
  });

  test("rejects an initializer requirement that observes unavailable state", async () => {
    const text = await Bun.file(
      "examples/core-fixtures/invalid/initializer-observes-state.json",
    ).text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain(
      "state operation InitializerObservesState.initialize requirement cannot observe state field balance",
    );
  });
});

describe("Core cross-theory bridge contracts", () => {
  test("accepts explicit Account and Ledger sharing with one bridge law", async () => {
    const text = await Bun.file("examples/tiny-bank/core/account-ledger-bridge.json").text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const validated = Effect.runSync(validateCore(document));

    expect(validated.declarations[2]?.id).toBe("AccountLedger");

    const graph = Effect.runSync(buildTheoryGraph(validated));
    expect(Graph.nodeCount(graph)).toBe(2);
    expect(Graph.edgeCount(graph)).toBe(1);
    expect(Array.from(Graph.nodes(graph), ([, node]) => node.theory).toSorted()).toEqual([
      "AccountBalance",
      "LedgerBalance",
    ]);
    expect(Array.from(Graph.edges(graph), ([, edge]) => edge.data)).toEqual([
      {
        kind: "bridge",
        bridge: "AccountLedger",
        sharedSorts: ["AccountId", "Balance"],
        laws: ["balancesAgree"],
      },
    ]);
  });

  test.each([
    [
      "unknown participant theory",
      "examples/core-fixtures/invalid/unknown-bridge-theory.json",
      "participant ledger references unknown theory MissingLedger",
    ],
    [
      "duplicate participant alias",
      "examples/core-fixtures/invalid/duplicate-bridge-participant.json",
      "participants contains duplicate identity account",
    ],
    [
      "unknown qualified sort",
      "examples/core-fixtures/invalid/unknown-bridge-sort.json",
      "references unknown sort ledger.MissingAccountId",
    ],
    [
      "unknown qualified operation",
      "examples/core-fixtures/invalid/unknown-bridge-operation.json",
      "references unknown operation account.missingBalance",
    ],
    [
      "unshared result sort",
      "examples/core-fixtures/invalid/unshared-bridge-result.json",
      "operation account.balance result sort Balance is not shared by the bridge",
    ],
  ])("rejects %s", async (_case, path, diagnostic) => {
    const document = Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(path).text());

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain(diagnostic);
  });
});

describe("Core recursive algebraic data contracts", () => {
  test("accepts the recursive BridgeTerm dogfood declaration", async () => {
    const text = await Bun.file("examples/bang-core/bridge-term-data.json").text();
    const document = Schema.decodeSync(CoreDocumentFromJson)(text);

    const validated = Effect.runSync(validateCore(document));

    expect(validated.declarations[0]?.id).toBe("BridgeTerm");
  });

  test.each([
    [
      "duplicate constructor tag",
      "examples/core-fixtures/invalid/duplicate-data-constructor.json",
      "data DuplicateConstructor constructors contains duplicate identity value",
    ],
    [
      "duplicate constructor field",
      "examples/core-fixtures/invalid/duplicate-data-field.json",
      "constructor DuplicateField.value fields contains duplicate identity item",
    ],
    [
      "unknown data reference",
      "examples/core-fixtures/invalid/unknown-data-reference.json",
      "data UnknownReference constructor value field missing references unknown data MissingData",
    ],
    [
      "constructor field colliding with the discriminator",
      "examples/core-fixtures/invalid/data-discriminator-field-conflict.json",
      "constructor DiscriminatorConflict.value field kind conflicts with data discriminator",
    ],
  ])("rejects %s", async (_case, path, diagnostic) => {
    const document = Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(path).text());

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain(diagnostic);
  });

  test("makes a constructor-less declaration structurally invalid", async () => {
    const text = await Bun.file(
      "examples/core-fixtures/invalid/empty-data-constructors.json",
    ).text();

    expect(() => Schema.decodeSync(CoreDocumentFromJson)(text)).toThrow();
  });
});

describe("Core effectful capability bindings", () => {
  test("accepts withdrawal bound to a typed failure and debit capability", async () => {
    const document = Schema.decodeSync(CoreDocumentFromJson)(
      await Bun.file("examples/tiny-bank/core/account-withdrawal-realization.json").text(),
    );

    const checked = Effect.runSync(validateCore(document));

    expect(checked.declarations[2]?.id).toBe("WithdrawAccount");
  });

  test.each([
    [
      "unknown state machine",
      "examples/core-fixtures/invalid/unknown-realization-state-machine.json",
      "realization UnknownMachineWithdrawal references unknown state machine MissingAccount",
    ],
    [
      "unknown transition",
      "examples/core-fixtures/invalid/unknown-realization-operation.json",
      "realization UnknownOperationWithdrawal references unknown transition Account.missing",
    ],
    [
      "unknown capability",
      "examples/core-fixtures/invalid/unknown-realization-capability.json",
      "realization UnknownCapabilityWithdrawal requires unknown capability MissingDebitAccount",
    ],
    [
      "duplicate capability requirement",
      "examples/core-fixtures/invalid/duplicate-realization-capability.json",
      "realization DuplicateCapabilityWithdrawal capabilities contains duplicate identity DebitAccount",
    ],
    [
      "initializer binding",
      "examples/core-fixtures/invalid/realization-binds-initializer.json",
      "realization InitializerRealization binds initializer Account.initialize; expected transition",
    ],
  ])("rejects %s", async (_case, path, diagnostic) => {
    const document = Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(path).text());

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain(diagnostic);
  });
});
