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
