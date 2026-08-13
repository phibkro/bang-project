import { describe, expect, test } from "bun:test";
import { CoreDocumentFromJson, evaluateFiniteModel, SemanticError, validateCore } from "@bang/core";
import { Effect, Schema } from "effect";

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
