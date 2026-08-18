import { describe, expect, test } from "bun:test";
import {
  buildTheoryGraph,
  compareNormalizedCore,
  type CheckedCoreDocument,
  CoreDocumentFromJson,
  deriveStateInvariantObligations,
  evaluateFiniteModel,
  NormalizationError,
  normalizeCore,
  SemanticError,
  stateInvariantObligationId,
  verifyCleanParity,
  validateCore,
} from "@bang/core";
import { sourceToCore } from "@bang/surface";
import { Crypto, Effect, Graph, Result, Schema } from "effect";

const checkedAccountSource = async () => {
  const source = await Bun.file("examples/tiny-bank/account.bang").text();
  const parsed = sourceToCore(source);
  if (Result.isFailure(parsed)) throw parsed.failure;
  return Effect.runSync(validateCore(parsed.success));
};

const normalizationCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) =>
    Effect.promise(() => crypto.subtle.digest("SHA-256", Uint8Array.from(data).buffer)).pipe(
      Effect.map((hash) => new Uint8Array(hash)),
    ),
});

const accountNormalizationProvenance = [
  { declaration: "Account", path: "examples/tiny-bank/account.bang" },
  { declaration: "DebitAccount", path: "examples/tiny-bank/account.bang" },
  { declaration: "WithdrawAccount", path: "examples/tiny-bank/account.bang" },
  { declaration: "WithdrawAccountOnce", path: "examples/tiny-bank/account.bang" },
] as const;

const normalizeAccount = async (document?: CheckedCoreDocument) => {
  const checked = document ?? (await checkedAccountSource());
  return Effect.runPromise(
    Effect.provideService(
      normalizeCore(checked, accountNormalizationProvenance),
      Crypto.Crypto,
      normalizationCrypto,
    ),
  );
};

const changedAccountInvariant = async (value: string) => {
  const document = structuredClone(await checkedAccountSource());
  const machine = document.declarations.find(
    (declaration) => declaration.kind === "stateMachine" && declaration.id === "Account",
  );
  if (machine === undefined || machine.kind !== "stateMachine") {
    throw new Error("Account state machine fixture is missing");
  }
  const invariant = machine.invariants[0];
  if (invariant === undefined || invariant.proposition.right.kind !== "integerLiteral") {
    throw new Error("Account invariant fixture is missing");
  }
  Reflect.set(invariant.proposition.right, "value", value);
  return Effect.runSync(validateCore(document));
};

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

describe("Core opaque extensions", () => {
  test("preserves unknown properties recursively through JSON decode and encode", () => {
    const input = {
      bangCore: 1,
      declarations: [
        {
          kind: "refinement",
          id: "Balance",
          base: "Integer",
          predicate: {
            kind: "greaterThanOrEqual",
            left: {
              kind: "self",
              "example.dev/left": { editor: "self" },
            },
            right: {
              kind: "integerLiteral",
              value: "0",
              "example.dev/right": { sourceOffset: 17 },
            },
            "example.dev/predicate": { explanation: "nonnegative" },
          },
          "example.dev/declaration": { documentation: "Account balance" },
        },
      ],
      "example.dev/document": { owner: "tiny-bank" },
    };
    const text = JSON.stringify(input);
    const decoded = Schema.decodeSync(CoreDocumentFromJson)(text);
    const checked = Effect.runSync(validateCore(decoded));
    const encoded = Schema.encodeSync(CoreDocumentFromJson)(checked);

    expect(JSON.parse(encoded)).toEqual(input);
  });

  test("does not accept an unknown declaration kind as checked Core", () => {
    const text = JSON.stringify({
      bangCore: 1,
      declarations: [{ kind: "example.dev/quantumProtocol", id: "Transfer" }],
    });

    expect(() => Schema.decodeSync(CoreDocumentFromJson)(text)).toThrow();
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
    const validated = await checkedAccountSource();

    expect(validated.declarations[0]?.id).toBe("Account");
  });
  test("derives deterministic initializer and transition obligations", async () => {
    const validated = await checkedAccountSource();

    expect(deriveStateInvariantObligations(validated)).toEqual([
      {
        id: "Account.initialize.establishes.nonnegativeBalance",
        stateMachine: "Account",
        operation: "initialize",
        relation: "establishes",
        invariant: "nonnegativeBalance",
      },
      {
        id: "Account.withdraw.preserves.nonnegativeBalance",
        stateMachine: "Account",
        operation: "withdraw",
        relation: "preserves",
        invariant: "nonnegativeBalance",
      },
    ]);
    expect(
      stateInvariantObligationId("Account", "withdraw", "preserves", "nonnegativeBalance"),
    ).toBe("Account.withdraw.preserves.nonnegativeBalance");
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
  test("accepts reusable and single-use withdrawal bindings", async () => {
    const checked = await checkedAccountSource();

    expect(checked.declarations[2]?.id).toBe("WithdrawAccount");
    expect(checked.declarations[2]).toMatchObject({
      requires: [{ capability: "DebitAccount", quantity: { kind: "unbounded" } }],
    });
    expect(checked.declarations[3]?.id).toBe("WithdrawAccountOnce");
    expect(checked.declarations[3]).toMatchObject({
      requires: [{ capability: "DebitAccount", quantity: { kind: "exactly", uses: "1" } }],
    });
  });

  test("accepts both tagged quantity forms in Core JSON", async () => {
    const document = Schema.decodeSync(CoreDocumentFromJson)(
      await Bun.file("examples/core-fixtures/valid/realization-capability-quantities.json").text(),
    );

    const checked = Effect.runSync(validateCore(document));

    expect(checked.declarations[2]?.id).toBe("WithdrawAccount");
    expect(checked.declarations[3]?.id).toBe("WithdrawAccountOnce");
  });

  test.each([
    ["missing quantity", "realization-missing-quantity.json"],
    ["zero quantity", "realization-zero-quantity.json"],
    ["negative quantity", "realization-negative-quantity.json"],
    ["malformed quantity", "realization-malformed-quantity.json"],
  ])("rejects %s in Core JSON", async (_case, filename) => {
    const text = await Bun.file(`examples/core-fixtures/invalid/${filename}`).text();

    expect(() => Schema.decodeSync(CoreDocumentFromJson)(text)).toThrow();
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
    [
      "failure identity collision",
      "examples/core-fixtures/invalid/realization-failure-collision.json",
      "realization FailureCollisionWithdrawal failure DebitAccount conflicts with a declaration identity",
    ],
  ])("rejects %s", async (_case, path, diagnostic) => {
    const document = Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(path).text());

    const error = Effect.runSync(Effect.flip(validateCore(document)));

    expect(error.message).toContain(diagnostic);
  });
});

describe("Core construct-addressed normalization", () => {
  test("keeps addresses and fingerprints stable across declaration object-key reorder", async () => {
    const baselineDocument = await checkedAccountSource();
    const reorderedDocument = Schema.decodeSync(CoreDocumentFromJson)(
      JSON.stringify({
        declarations: baselineDocument.declarations.map((declaration) =>
          Object.fromEntries(Object.entries(declaration).toReversed()),
        ),
        bangCore: baselineDocument.bangCore,
      }),
    );
    const baseline = await normalizeAccount(baselineDocument);
    const candidate = await normalizeAccount(Effect.runSync(validateCore(reorderedDocument)));

    expect(candidate.nodes).toEqual(baseline.nodes);
  });

  test("changes semantic fingerprints without changing construct addresses", async () => {
    const baseline = await normalizeAccount();
    const candidate = await normalizeAccount(await changedAccountInvariant("1"));
    const address = "stateMachine:Account.invariant:nonnegativeBalance";
    const baselineNode = baseline.nodes.find((node) => node.address === address);
    const candidateNode = candidate.nodes.find((node) => node.address === address);

    expect(candidateNode?.address).toBe(address);
    expect(candidateNode?.fingerprint).not.toBe(baselineNode?.fingerprint);
  });

  test("reuses unrelated conclusions and invalidates referenced conclusions", async () => {
    const baseline = await normalizeAccount();
    const unrelatedDocument = structuredClone(await checkedAccountSource());
    const realization = unrelatedDocument.declarations.find(
      (declaration) =>
        declaration.kind === "operationRealization" && declaration.id === "WithdrawAccountOnce",
    );
    if (realization === undefined || realization.kind !== "operationRealization") {
      throw new Error("WithdrawAccountOnce fixture is missing");
    }
    Reflect.set(realization.disabled, "id", "WithdrawalRejectedOnceChanged");
    const unrelated = await normalizeAccount(Effect.runSync(validateCore(unrelatedDocument)));
    const unrelatedComparison = await Effect.runPromise(compareNormalizedCore(baseline, unrelated));
    expect(
      unrelatedComparison.results.find(
        (result) => result.address === "obligation:Account.withdraw.preserves.nonnegativeBalance",
      )?.status,
    ).toBe("reused");

    const referenced = await normalizeAccount(await changedAccountInvariant("1"));
    const referencedComparison = await Effect.runPromise(
      compareNormalizedCore(baseline, referenced),
    );
    const obligation = referencedComparison.results.find(
      (result) => result.address === "obligation:Account.withdraw.preserves.nonnegativeBalance",
    );
    expect(obligation?.status).toBe("changed");
    expect(obligation?.invalidatedBy).toContainEqual({
      type: "obligation-invariant",
      target: "stateMachine:Account.invariant:nonnegativeBalance",
    });
  });

  test("computes cycle-safe dependency closures", async () => {
    const document = Schema.decodeSync(CoreDocumentFromJson)(
      JSON.stringify({
        bangCore: 1,
        declarations: [
          {
            kind: "data",
            id: "A",
            discriminator: "kind",
            constructors: [
              { tag: "value", fields: [{ id: "next", type: { kind: "reference", id: "B" } }] },
            ],
          },
          {
            kind: "data",
            id: "B",
            discriminator: "kind",
            constructors: [
              { tag: "value", fields: [{ id: "next", type: { kind: "reference", id: "A" } }] },
            ],
          },
        ],
      }),
    );
    const checked = Effect.runSync(validateCore(document));
    const normalized = await Effect.runPromise(
      Effect.provideService(
        normalizeCore(checked, [
          { declaration: "A", path: "cycle.json" },
          { declaration: "B", path: "cycle.json" },
        ]),
        Crypto.Crypto,
        normalizationCrypto,
      ),
    );

    expect(
      normalized.nodes.find((node) => node.address === "data:A")?.dependencyClosure,
    ).toContainEqual({
      type: "data-reference",
      target: "data:B",
    });
    expect(
      normalized.nodes.find((node) => node.address === "data:B")?.dependencyClosure,
    ).toContainEqual({
      type: "data-reference",
      target: "data:A",
    });
  });

  test("returns typed errors for missing provenance and dependency targets", async () => {
    const checked = await checkedAccountSource();
    const missingProvenance = await Effect.runPromise(
      Effect.flip(
        Effect.provideService(normalizeCore(checked, []), Crypto.Crypto, normalizationCrypto),
      ),
    );
    expect(missingProvenance).toBeInstanceOf(NormalizationError);
    expect(missingProvenance.reason).toBe("missing-provenance");

    const malformed = structuredClone(checked);
    const realization = malformed.declarations.find(
      (declaration) =>
        declaration.kind === "operationRealization" && declaration.id === "WithdrawAccount",
    );
    if (realization === undefined || realization.kind !== "operationRealization") {
      throw new Error("WithdrawAccount fixture is missing");
    }
    Reflect.set(realization.operation, "stateMachine", "MissingAccount");
    const missingTarget = await Effect.runPromise(
      Effect.flip(
        Effect.provideService(
          normalizeCore(malformed, accountNormalizationProvenance),
          Crypto.Crypto,
          normalizationCrypto,
        ),
      ),
    );
    expect(missingTarget).toBeInstanceOf(NormalizationError);
    expect(missingTarget.reason).toBe("missing-dependency-target");
  });

  test("assembles an incremental candidate with clean-run parity", async () => {
    const normalized = await normalizeAccount();
    const comparison = await Effect.runPromise(compareNormalizedCore(normalized, normalized));

    expect(comparison.cleanParity).toBe(true);
    expect(comparison.incrementalCandidate).toEqual(comparison.cleanCandidate);
    expect(comparison.results.every((result) => result.status === "reused")).toBe(true);

    const divergent = {
      nodes: normalized.nodes.slice(1),
    };
    const parityFailure = await Effect.runPromise(
      Effect.flip(verifyCleanParity(divergent, normalized)),
    );
    expect(parityFailure).toBeInstanceOf(NormalizationError);
    expect(parityFailure.reason).toBe("clean-parity");
  });
});
