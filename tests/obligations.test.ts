import { CheckedCoreDocumentFromJson, type CheckedCoreDocument } from "@bang/core";
import {
  checkRelationalObligation,
  deriveTransferPreservationObligation,
  evaluateRelationalObligation,
  parseLeanOutput,
  projectLeanModule,
  LeanProviderFailure,
  LEAN_FAULTY_THEOREM_ID,
  LEAN_LAWFUL_THEOREM_ID,
  parseZ3Output,
  projectQfLia,
  ProviderFailure,
  RelationalObligationSchema,
  type LeanModuleProjection,
} from "@bang/obligations";
import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";

const corePath = "examples/tiny-bank/core/account-ledger-bridge.json";

const loadCore = Effect.fn("obligationsTest.loadCore")(function* () {
  const text = yield* Effect.promise(() => Bun.file(corePath).text());
  return yield* Schema.decodeEffect(CheckedCoreDocumentFromJson)(text);
});
const renderLeanOutput = (projection: LeanModuleProjection): string =>
  [projection.lawful, projection.faulty]
    .flatMap((entry) => [
      `BANG_M016_SUCCESS|${entry.obligationId}|${entry.variant}|${entry.theoremId}|${entry.result}`,
      `BANG_M016_AXIOMS_BEGIN|${entry.theoremId}`,
      `'${entry.theoremId}' depends on axioms: [propext, Quot.sound]`,
      `BANG_M016_AXIOMS_END|${entry.theoremId}`,
    ])
    .join("\n");

describe("M011 relational obligation", () => {
  test("derives a deterministic solver-neutral bounded query", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const checked = yield* loadCore();
        const lawful = yield* deriveTransferPreservationObligation(checked, "lawful");
        const faulty = yield* deriveTransferPreservationObligation(checked, "faulty");
        const lawfulText = projectQfLia(lawful);
        const faultyText = projectQfLia(faulty);

        expect(lawful.id).toBe("AccountLedger.transferPreservesTotal");
        expect(lawful.variables.map(({ id }) => id)).toEqual([
          "sourceBefore",
          "targetBefore",
          "amount",
          "sourceAfter",
          "targetAfter",
        ]);
        expect(lawfulText).toBe(projectQfLia(lawful));
        expect(lawfulText).toContain("(set-logic QF_LIA)");
        expect(lawfulText).not.toContain("(minimize");
        expect(faultyText).toContain("(minimize sourceBefore)");
      }),
    );
  });

  test("rejects unknown relational identities before provider dispatch", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const checked = yield* loadCore();
        const lawful = yield* deriveTransferPreservationObligation(checked, "lawful");
        const malformed = {
          ...lawful,
          assumptions: [
            ...lawful.assumptions,
            {
              kind: "equal" as const,
              left: { kind: "variable" as const, id: "missing", sort: "Integer" as const },
              right: { kind: "literal" as const, value: 0 },
            },
          ],
        };
        const failure = yield* Effect.flip(checkRelationalObligation(checked, malformed));
        expect(failure.reason).toBe("unknown-variable");
      }),
    );
  });

  test("rejects unsupported expression constructs at the public Schema boundary", () => {
    expect(() =>
      Schema.decodeUnknownSync(RelationalObligationSchema)({
        kind: "relational",
        id: "AccountLedger.transferPreservesTotal",
        variant: "lawful",
        source: {
          core: corePath,
          bridge: "AccountLedger",
          relation: "transferPreservesTotal",
        },
        variables: [{ id: "value", sort: "Integer", lower: 0, upper: 1 }],
        assumptions: [],
        claim: {
          kind: "equal",
          left: { kind: "multiply", left: 1, right: 1 },
          right: { kind: "literal", value: 1 },
        },
      }),
    ).toThrow();
  });

  test("rejects checked Core without the source bridge", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const checked = yield* loadCore();
        const withoutBridge = {
          ...checked,
          declarations: checked.declarations.filter(
            (declaration) => declaration.kind !== "theoryBridge",
          ),
        } as CheckedCoreDocument;
        const failure = yield* Effect.flip(
          deriveTransferPreservationObligation(withoutBridge, "lawful"),
        );
        expect(failure.reason).toBe("missing-bridge");
      }),
    );
  });

  test("independently validates a parsed bounded counterexample", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const checked = yield* loadCore();
        const faulty = yield* deriveTransferPreservationObligation(checked, "faulty");
        const output = [
          "sat",
          "((sourceBefore 1)",
          " (targetBefore 0)",
          " (amount 1)",
          " (sourceAfter 0)",
          " (targetAfter 2))",
        ].join("\n");
        const result = yield* parseZ3Output(output, faulty, "4.16.0");
        expect(result.result).toBe("bounded-counterexample");
        expect(result.model).toBeDefined();
        expect(evaluateRelationalObligation(faulty, result.model ?? {})).toEqual({
          assumptionsSatisfied: true,
          claimSatisfied: false,
          counterexample: true,
          sourceTotal: 1,
          targetTotal: 2,
        });
      }),
    );
  });

  test("keeps unknown separate from malformed provider output", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const checked = yield* loadCore();
        const lawful = yield* deriveTransferPreservationObligation(checked, "lawful");
        const unknown = yield* parseZ3Output("unknown\n", lawful);
        expect(unknown.result).toBe("inconclusive");

        const malformed = yield* Effect.flip(parseZ3Output("not-a-status", lawful));
        expect(malformed).toBeInstanceOf(ProviderFailure);
        expect(malformed.reason).toBe("provider-failed");
      }),
    );
  });
  test("projects deterministic unbounded Lean source with explicit refutation", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const checked = yield* loadCore();
        const lawful = yield* deriveTransferPreservationObligation(checked, "lawful");
        const faulty = yield* deriveTransferPreservationObligation(checked, "faulty");
        const first = projectLeanModule({ lawful, faulty });
        const second = projectLeanModule({ lawful, faulty });

        expect(first.source).toBe(second.source);
        expect(first.source).toContain(
          "(sourceBefore targetBefore amount sourceAfter targetAfter : Int)",
        );
        for (const { id, lower, upper } of lawful.variables) {
          expect(first.source).not.toContain(`${lower} <= ${id}`);
          expect(first.source).not.toContain(`${id} <= ${upper}`);
        }
        expect(first.lawful.theoremId).toBe(LEAN_LAWFUL_THEOREM_ID);
        expect(first.faulty.theoremId).toBe(LEAN_FAULTY_THEOREM_ID);
        expect(first.source).toContain("¬ (∀");
        expect(first.source).toContain("(1,0,1,0,2)");
        expect(first.source).toContain(`#print axioms ${LEAN_LAWFUL_THEOREM_ID}`);
        expect(first.source).toContain(`#print axioms ${LEAN_FAULTY_THEOREM_ID}`);
      }),
    );
  });

  test("strictly parses Lean success and axiom markers", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const checked = yield* loadCore();
        const lawful = yield* deriveTransferPreservationObligation(checked, "lawful");
        const faulty = yield* deriveTransferPreservationObligation(checked, "faulty");
        const projection = projectLeanModule({ lawful, faulty });
        const result = yield* parseLeanOutput(renderLeanOutput(projection), projection);

        expect(result.leanVersion).toBe("4.30.0");
        expect(result.observations).toEqual([
          {
            obligationId: "AccountLedger.transferPreservesTotal",
            variant: "lawful",
            theoremId: LEAN_LAWFUL_THEOREM_ID,
            result: "kernel-proven",
            axioms: ["propext", "Quot.sound"],
          },
          {
            obligationId: "AccountLedger.transferPreservesTotal",
            variant: "faulty",
            theoremId: LEAN_FAULTY_THEOREM_ID,
            result: "kernel-refuted",
            axioms: ["propext", "Quot.sound"],
          },
        ]);
      }),
    );
  });

  test("rejects mismatched identities and broken Lean output as typed failures", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const checked = yield* loadCore();
        const lawful = yield* deriveTransferPreservationObligation(checked, "lawful");
        const faulty = yield* deriveTransferPreservationObligation(checked, "faulty");
        const projection = projectLeanModule({ lawful, faulty });
        const lawfulMarker = `BANG_M016_SUCCESS|${projection.lawful.obligationId}|lawful|${projection.lawful.theoremId}|kernel-proven`;
        const mismatched = renderLeanOutput(projection).replace(
          lawfulMarker,
          lawfulMarker.replace(projection.lawful.theoremId, LEAN_FAULTY_THEOREM_ID),
        );
        const identityFailure = yield* Effect.flip(parseLeanOutput(mismatched, projection));
        expect(identityFailure).toBeInstanceOf(LeanProviderFailure);
        expect(identityFailure.reason).toBe("identity-mismatch");

        const brokenFailure = yield* Effect.flip(parseLeanOutput("Lean: syntax error", projection));
        expect(brokenFailure).toBeInstanceOf(LeanProviderFailure);
        expect(brokenFailure.reason).toBe("provider-failed");

        const sorryOutput = renderLeanOutput(projection).replace(
          `'${LEAN_LAWFUL_THEOREM_ID}' depends on axioms: [propext, Quot.sound]`,
          `'${LEAN_LAWFUL_THEOREM_ID}' depends on axioms: [sorryAx]`,
        );
        const sorryFailure = yield* Effect.flip(parseLeanOutput(sorryOutput, projection));
        expect(sorryFailure).toBeInstanceOf(LeanProviderFailure);
        expect(sorryFailure.reason).toBe("provider-failed");
      }),
    );
  });
});
