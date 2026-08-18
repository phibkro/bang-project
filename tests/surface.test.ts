import { describe, expect, test } from "bun:test";
import { CoreDocumentFromJson, SemanticError, validateCore } from "@bang/core";
import { parseSource, SourceParseError, sourceToCore } from "@bang/surface";
import { Effect, Result, Schema } from "effect";

const sourcePath = "examples/tiny-bank/account.bang";

const accountSource = () => Bun.file(sourcePath).text();

const lower = (source: string) => {
  const result = sourceToCore(source);
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

const parse = (source: string) => {
  const result = parseSource(source);
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};
const parseFailure = (source: string): SourceParseError => {
  const result = sourceToCore(source);
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isSuccess(result)) throw new Error("expected source parsing to fail");
  return result.failure;
};

describe("Account source boundary", () => {
  test("retains stable spans on the parsed declaration tree", async () => {
    const source = await accountSource();
    const document = parse(source);

    expect(document.span).toEqual({
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 607, line: 30, column: 2 },
    });
    expect(
      document.declarations.map(({ kind, id, span }) => ({
        kind,
        id,
        start: span.start,
        end: span.end,
      })),
    ).toEqual([
      {
        kind: "machine",
        id: "Account",
        start: { offset: 0, line: 1, column: 1 },
        end: { offset: 314, line: 18, column: 2 },
      },
      {
        kind: "capability",
        id: "DebitAccount",
        start: { offset: 316, line: 20, column: 1 },
        end: { offset: 339, line: 20, column: 24 },
      },
      {
        kind: "realization",
        id: "WithdrawAccount",
        start: { offset: 341, line: 22, column: 1 },
        end: { offset: 469, line: 25, column: 2 },
      },
      {
        kind: "realization",
        id: "WithdrawAccountOnce",
        start: { offset: 471, line: 27, column: 1 },
        end: { offset: 607, line: 30, column: 2 },
      },
    ]);
  });
  test("ignores line comments without changing the parsed declarations", async () => {
    const source = await accountSource();
    const document = parse(
      source.replace("machine Account {", "machine Account { // account state"),
    );

    expect(document.declarations.map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      "machine:Account",
      "capability:DebitAccount",
      "realization:WithdrawAccount",
      "realization:WithdrawAccountOnce",
    ]);
  });

  test("lowers stable declarations and deterministic Core JSON", async () => {
    const source = await accountSource();
    const first = lower(source);
    const second = lower(source);

    expect(first.declarations.map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      "stateMachine:Account",
      "capability:DebitAccount",
      "operationRealization:WithdrawAccount",
      "operationRealization:WithdrawAccountOnce",
    ]);
    const machine = first.declarations[0];
    if (machine?.kind !== "stateMachine") throw new Error("expected the Account state machine");
    expect(machine.initializers[0]?.requires[0]?.left).toEqual({
      kind: "parameter",
      id: "initialBalance",
    });
    expect(machine.transitions[0]?.requires[1]?.left).toEqual({
      kind: "stateField",
      field: "balance",
    });
    expect(first.declarations[2]).toMatchObject({
      kind: "operationRealization",
      requires: [{ capability: "DebitAccount", quantity: { kind: "unbounded" } }],
    });
    expect(first.declarations[3]).toMatchObject({
      kind: "operationRealization",
      requires: [{ capability: "DebitAccount", quantity: { kind: "exactly", uses: "1" } }],
    });
    expect(Effect.runSync(validateCore(first)).declarations).toHaveLength(4);
    expect(Schema.encodeSync(CoreDocumentFromJson)(first)).toBe(
      Schema.encodeSync(CoreDocumentFromJson)(second),
    );
  });

  test("reports a missing closing brace at end of input", async () => {
    const source = await accountSource();
    const missingBrace = source.slice(0, source.lastIndexOf("}"));
    const result = sourceToCore(missingBrace);

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) throw new Error("expected source parsing to fail");
    expect(result.failure).toBeInstanceOf(SourceParseError);
    expect(result.failure.reason).toBe("unexpected-end");
    expect(result.failure.found).toBe("end of input");
    expect(result.failure.expected).toContain("}");
    expect(result.failure.span).toEqual({
      start: { offset: 606, line: 30, column: 1 },
      end: { offset: 606, line: 30, column: 1 },
    });
  });
  test("rejects missing and duplicate state declarations as source errors", () => {
    const missing = parseFailure("machine Account { }");
    expect(missing).toMatchObject({
      reason: "unexpected-token",
      found: "}",
      expected: ["state"],
    });

    const duplicateSource = "machine Account { state First { } state Second { } }";
    const duplicate = parseFailure(duplicateSource);
    expect(duplicate).toMatchObject({
      reason: "unexpected-token",
      found: "state",
      expected: ["}"],
    });
    expect(duplicate.span.start.offset).toBe(duplicateSource.lastIndexOf("state"));
  });
  test("retains machine members on both sides of the state declaration", () => {
    const document = parse(
      "machine Account { initializer initialize() { } state AccountState { balance: Integer } transition withdraw() { } invariant nonnegative { balance >= 0 } }",
    );
    expect(document.declarations[0]).toMatchObject({
      kind: "machine",
      state: { id: "AccountState" },
      initializers: [{ id: "initialize" }],
      transitions: [{ id: "withdraw" }],
      invariants: [{ id: "nonnegative" }],
    });
  });

  test("rejects invalid decimal and comparison syntax at the source boundary", async () => {
    const source = await accountSource();
    const leadingZero = parseFailure(
      source.replace("requires amount >= 0", "requires amount >= 007"),
    );
    expect(leadingZero).toMatchObject({
      reason: "unexpected-token",
      found: "007",
      expected: ["decimal integer"],
    });

    const prototypeName = parseFailure(
      source.replace("requires amount >= 0", "requires amount valueOf 0"),
    );
    expect(prototypeName).toMatchObject({
      reason: "unexpected-token",
      found: "valueOf",
      expected: [">="],
    });

    const chained = parseFailure(
      source.replace("requires amount >= 0", "requires amount >= 0 >= 0"),
    );
    expect(chained).toMatchObject({
      reason: "unexpected-token",
      found: ">=",
      expected: ["end of predicate"],
      message: "predicate requires exactly one >= operator",
    });
  });

  test("requires explicit positive capability quantities", async () => {
    const source = await accountSource();

    const missing = parseFailure(
      source.replace("requires DebitAccount unbounded", "requires DebitAccount"),
    );
    expect(missing).toMatchObject({
      reason: "unexpected-token",
      found: "when",
      expected: ["unbounded"],
    });

    const zero = parseFailure(
      source.replace("requires DebitAccount exactly 1", "requires DebitAccount exactly 0"),
    );
    expect(zero).toMatchObject({
      reason: "unexpected-token",
      found: "0",
      expected: ["positive decimal integer"],
    });

    const negative = parseFailure(
      source.replace("requires DebitAccount exactly 1", "requires DebitAccount exactly -1"),
    );
    expect(negative).toMatchObject({
      reason: "invalid-character",
      found: "-",
      expected: ["token"],
    });

    const malformed = parseFailure(
      source.replace("requires DebitAccount exactly 1", "requires DebitAccount exactly one"),
    );
    expect(malformed).toMatchObject({
      reason: "unexpected-token",
      found: "one",
      expected: ["decimal integer"],
    });
  });
  test("rejects impossible decoded source-error values", () => {
    const value = {
      _tag: "SourceParseError",
      reason: "unexpected-token",
      span: {
        start: { offset: 1, line: 1, column: 1 },
        end: { offset: 0, line: 0, column: 0 },
      },
      found: "x",
      expected: [],
      message: "invalid",
    };

    expect(() => Schema.decodeUnknownSync(SourceParseError)(value)).toThrow();
  });

  test("leaves unknown state-field rejection to Core validation", async () => {
    const source = await accountSource();
    const invalidSource = source.replace(
      "requires balance >= amount",
      "requires missing >= amount",
    );
    const document = lower(invalidSource);
    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error).toBeInstanceOf(SemanticError);
    expect(error.message).toContain("references unknown state field missing");
  });
});
