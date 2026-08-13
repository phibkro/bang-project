import { describe, expect, test } from "bun:test";
import { CoreDocumentFromJson, SemanticError, validateCore } from "@bang/core";
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
