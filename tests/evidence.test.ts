import { describe, expect, test } from "bun:test";
import { CoreDocumentFromJson, type StateInvariantObligation, validateCore } from "@bang/core";
import {
  checkPropertyTestEvidenceRecord,
  checkRuntimeTraceEvidenceRecord,
  compareM010Observation,
  compileM012SystemReport,
  decodeM005BridgeEvidenceManifest,
  decodeM009PortabilityEvidenceManifest,
  decodeM010ReplayManifest,
  decodeM011SolverEvidenceManifest,
  M005BridgeEvidenceError,
  M009PortabilityEvidenceError,
  M011SolverEvidenceManifest,
  EvidenceError,
  formatM012SystemReport,
  formatPropertyTestEvidenceReport,
  formatRuntimeTraceEvidenceReport,
  M005BridgeEvidenceManifest,
  M009PortabilityEvidenceManifest,
  M010ReplayManifest,
  M010ReplayError,
  M012SystemReportError,
  M012SystemReportFromJson,
  M012SystemSelectionFromJson,
  PropertyTestEvidenceRecord,
  PropertyTestEvidenceRecordFromJson,
  RuntimeTraceEvidenceRecord,
  RuntimeTraceEvidenceRecordFromJson,
  selectM010Obligation,
  verifyM010Inputs,
} from "@bang/evidence";
import {
  checkEntityMessageEvidenceRecord,
  EntityMessageEvidenceError,
  EntityMessageEvidenceRecord,
  EntityMessageEvidenceRecordFromJson,
  formatEntityMessageEvidenceRecord,
} from "@bang/evidence";
import {
  decodeM016DualProviderEvidenceManifest,
  formatM016DualProviderEvidenceReport,
  M016DualProviderEvidenceError,
  M016DualProviderEvidenceManifest,
  verifyM016EvidenceMaterials,
} from "@bang/evidence";
import {
  checkM017GleamActorEvidenceManifest,
  decodeM017GleamActorEvidenceManifest,
  formatM017GleamActorEvidenceReport,
  M017GleamActorEvidenceError,
  M017GleamActorEvidenceManifest,
  verifyM017GleamActorEvidenceMaterials,
} from "@bang/evidence";
import {
  checkM018SingleUseCapabilityEvidenceManifest,
  decodeM018SingleUseCapabilityEvidenceManifest,
  formatM018SingleUseCapabilityEvidenceReport,
  M018SingleUseCapabilityEvidenceError,
  M018SingleUseCapabilityEvidenceManifest,
  M018_TARGET_WEAKENINGS,
  verifyM018SingleUseCapabilityEvidenceMaterials,
} from "@bang/evidence";
import {
  M019SelfCheckEvidenceError,
  M019SelfCheckEvidenceManifest,
  M019SelfCheckSelectionFromJson,
  M019DecoderConformanceResultFromJson,
  checkM019SelfCheckEvidence,
  formatM019SelfCheckReport,
} from "@bang/evidence";
import { BunServices } from "@effect/platform-bun";
import { sourceToCore } from "@bang/surface";
import { deriveTransferPreservationObligation } from "@bang/obligations";
import { Crypto, Effect, FileSystem, PlatformError, Result, Schema } from "effect";

const obligation: StateInvariantObligation = {
  id: "Account.withdraw.preserves.nonnegativeBalance",
  stateMachine: "Account",
  operation: "withdraw",
  relation: "preserves",
  invariant: "nonnegativeBalance",
};

const record = Schema.decodeUnknownSync(PropertyTestEvidenceRecord)({
  obligation,
  observation: {
    class: "property-tested",
    result: "passed",
    scope: "sampled",
    requestedCases: 100,
    executedCases: 100,
    seed: 20260813,
    shrinkCount: 0,
  },
  provenance: {
    coreSource: "examples/tiny-bank/account.bang",
    generatedKit: "generated/effect/AccountStateMachine.ts",
    realization: "examples/tiny-bank/state/account-withdrawal.ts",
    evaluator: "vitest@4.1.10",
  },
  producer: {
    identity: "M007 property evaluator",
    trust: "assumed-truthful",
  },
  environment: {
    toolVersions: {
      bun: "1.3.14",
      effect: "4.0.0-rc.108",
    },
    target: {
      name: "typescript",
      version: "7.0.2",
    },
  },
  qualification: {
    assumptions: ["the selected realization is the executed implementation"],
    unsupportedClaims: [
      {
        claim: "preservation for every Integer state and amount",
        reason: "property testing sampled 100 cases",
      },
    ],
    lifetime: "valid while the Core source and generated kit remain unchanged",
    invalidators: ["Core state-machine invariant changes", "realization changes"],
  },
});

const runtimeProvenance = {
  coreSource: "examples/tiny-bank/account.bang",
  generatedKit: "generated/effect/AccountStateMachine.ts",
  realization: "examples/tiny-bank/state/account-withdrawal.ts",
  evaluator: "M008 runtime monitor",
};

const runtimeProducer = {
  identity: "M008 trace monitor",
  trust: "assumed-truthful" as const,
};

const runtimeEnvironment = {
  toolVersions: {
    bun: "1.3.14",
    effect: "4.0.0-rc.108",
  },
  target: {
    name: "typescript",
    version: "7.0.2",
  },
};

const runtimeQualification = {
  assumptions: ["the selected realization is the executed implementation"],
  unsupportedClaims: [
    {
      claim: "runtime trace producer is complete and truthful",
      reason: "producer trust is assumed-truthful",
    },
  ],
  lifetime: "valid while the Core source and generated kit remain unchanged",
  invalidators: ["Core state-machine invariant changes", "realization changes"],
};

const conformingRuntimeRecord = Schema.decodeUnknownSync(RuntimeTraceEvidenceRecord)({
  obligation,
  observation: {
    class: "runtime-monitored",
    result: "conforming",
    scope: "single-closed-trace",
    invocationId: "invocation-001",
    operationId: "withdraw",
    events: [
      {
        _tag: "Started",
        sequence: 0,
        invocationId: "invocation-001",
        operationId: "withdraw",
        preState: { balance: 10 },
        input: { amount: 4 },
      },
      {
        _tag: "Succeeded",
        sequence: 1,
        invocationId: "invocation-001",
        postState: { balance: 6 },
      },
    ],
  },
  provenance: runtimeProvenance,
  producer: runtimeProducer,
  environment: runtimeEnvironment,
  qualification: runtimeQualification,
});

const violatedRuntimeRecord = Schema.decodeUnknownSync(RuntimeTraceEvidenceRecord)({
  ...conformingRuntimeRecord,
  observation: {
    ...conformingRuntimeRecord.observation,
    result: "violated",
    firstViolation: {
      eventIndex: 1,
      reason: "nonnegativeBalance is false for the returned post-state",
    },
    events: [
      conformingRuntimeRecord.observation.events[0],
      {
        _tag: "Succeeded",
        sequence: 1,
        invocationId: "invocation-001",
        postState: { balance: -2 },
      },
    ],
  },
});

describe("property-test evidence boundary", () => {
  test("decodes, checks, and formats a sampled observation", () => {
    const fromJson = Schema.decodeSync(PropertyTestEvidenceRecordFromJson)(JSON.stringify(record));
    const checked = Effect.runSync(checkPropertyTestEvidenceRecord(fromJson, [obligation]));
    const report = formatPropertyTestEvidenceReport(checked);

    expect(checked.obligation.id).toBe("Account.withdraw.preserves.nonnegativeBalance");
    expect(report).toContain("Evidence: property-tested, result passed, scope sampled");
    expect(report).toContain("Assumptions:");
    expect(report).toContain("Unsupported claims:");
    expect(report).toContain("trust assumed-truthful");
    expect(report).toContain("truthfulness is not proven");
    expect(report).toContain("Lifetime:");
    expect(report).toContain("Invalidators:");
  });

  test("rejects an unknown obligation identity with a typed error", () => {
    const unknown = Schema.decodeUnknownSync(PropertyTestEvidenceRecord)({
      ...record,
      obligation: {
        ...record.obligation,
        id: "Account.withdraw.preserves.missingInvariant",
      },
    });
    const error = Effect.runSync(
      Effect.flip(checkPropertyTestEvidenceRecord(unknown, [obligation])),
    );

    expect(error).toBeInstanceOf(EvidenceError);
    expect(error.reason).toBe("unknown-obligation");
    expect(error.obligationId).toBe("Account.withdraw.preserves.missingInvariant");
  });

  test("rejects source components inconsistent with a known identity", () => {
    const inconsistent = Schema.decodeUnknownSync(PropertyTestEvidenceRecord)({
      ...record,
      obligation: {
        ...record.obligation,
        invariant: "differentInvariant",
      },
    });
    const error = Effect.runSync(
      Effect.flip(checkPropertyTestEvidenceRecord(inconsistent, [obligation])),
    );

    expect(error).toBeInstanceOf(EvidenceError);
    expect(error.reason).toBe("inconsistent-obligation");
    expect(error.obligationId).toBe(obligation.id);
  });

  test("rejects property evidence that overstates scope or executed cases", () => {
    expect(() =>
      Schema.decodeUnknownSync(PropertyTestEvidenceRecord)({
        ...record,
        observation: {
          ...record.observation,
          scope: "unbounded",
        },
      }),
    ).toThrow();

    expect(() =>
      Schema.decodeUnknownSync(PropertyTestEvidenceRecord)({
        ...record,
        observation: {
          ...record.observation,
          requestedCases: 99,
          executedCases: 100,
        },
      }),
    ).toThrow();
  });
});

describe("runtime trace evidence boundary", () => {
  test("decodes JSON, checks a conforming trace, and formats every event", () => {
    const fromJson = Schema.decodeSync(RuntimeTraceEvidenceRecordFromJson)(
      JSON.stringify(conformingRuntimeRecord),
    );
    const checked = Effect.runSync(checkRuntimeTraceEvidenceRecord(fromJson, [obligation]));
    const report = formatRuntimeTraceEvidenceReport(checked);

    expect(checked.observation.events).toHaveLength(2);
    expect(checked.observation.events[0]?._tag).toBe("Started");
    expect(checked.observation.events[1]?._tag).toBe("Succeeded");
    expect(report).toContain("Evidence: runtime-monitored, result conforming");
    expect(report).toContain("Started [0]");
    expect(report).toContain("Succeeded [1]");
    expect(report).toContain("First violation: none");
  });

  test("checks a violated trace and preserves its indexed reason", () => {
    const checked = Effect.runSync(
      checkRuntimeTraceEvidenceRecord(violatedRuntimeRecord, [obligation]),
    );
    const report = formatRuntimeTraceEvidenceReport(checked);

    expect(checked.observation.result).toBe("violated");
    expect(checked.observation.firstViolation).toEqual({
      eventIndex: 1,
      reason: "nonnegativeBalance is false for the returned post-state",
    });
    expect(report).toContain("First violation: event 1, nonnegativeBalance is false");
  });

  test("rejects unknown and inconsistent normalized obligation references", () => {
    const unknown = Schema.decodeUnknownSync(RuntimeTraceEvidenceRecord)({
      ...conformingRuntimeRecord,
      obligation: {
        ...conformingRuntimeRecord.obligation,
        id: "Account.withdraw.preserves.missingInvariant",
      },
    });
    const unknownError = Effect.runSync(
      Effect.flip(checkRuntimeTraceEvidenceRecord(unknown, [obligation])),
    );
    expect(unknownError).toBeInstanceOf(EvidenceError);
    expect(unknownError.reason).toBe("unknown-obligation");

    const inconsistent = Schema.decodeUnknownSync(RuntimeTraceEvidenceRecord)({
      ...conformingRuntimeRecord,
      obligation: {
        ...conformingRuntimeRecord.obligation,
        invariant: "differentInvariant",
      },
    });
    const inconsistentError = Effect.runSync(
      Effect.flip(checkRuntimeTraceEvidenceRecord(inconsistent, [obligation])),
    );
    expect(inconsistentError).toBeInstanceOf(EvidenceError);
    expect(inconsistentError.reason).toBe("inconsistent-obligation");
  });

  test("rejects impossible result and trace-shape combinations", () => {
    expect(() =>
      Schema.decodeUnknownSync(RuntimeTraceEvidenceRecord)({
        ...conformingRuntimeRecord,
        observation: {
          ...conformingRuntimeRecord.observation,
          firstViolation: { eventIndex: 1, reason: "unexpected violation" },
        },
      }),
    ).toThrow();

    expect(() =>
      Schema.decodeUnknownSync(RuntimeTraceEvidenceRecord)({
        ...violatedRuntimeRecord,
        observation: {
          ...violatedRuntimeRecord.observation,
          firstViolation: undefined,
        },
      }),
    ).toThrow();

    expect(() =>
      Schema.decodeUnknownSync(RuntimeTraceEvidenceRecord)({
        ...conformingRuntimeRecord,
        observation: {
          ...conformingRuntimeRecord.observation,
          events: [conformingRuntimeRecord.observation.events[1]],
        },
      }),
    ).toThrow();

    expect(() =>
      Schema.decodeUnknownSync(RuntimeTraceEvidenceRecord)({
        ...conformingRuntimeRecord,
        observation: {
          ...conformingRuntimeRecord.observation,
          events: [conformingRuntimeRecord.observation.events[0]],
        },
      }),
    ).toThrow();
  });
});
const m010CorePath = "examples/tiny-bank/account.bang";

const provideDigestServices = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  bytes: Uint8Array,
  inputPath = m010CorePath,
) =>
  effect.pipe(
    Effect.provideService(
      FileSystem.FileSystem,
      FileSystem.makeNoop({
        readFile: (path) =>
          path === inputPath
            ? Effect.succeed(bytes)
            : Effect.fail(
                PlatformError.systemError({
                  _tag: "NotFound",
                  module: "test",
                  method: "readFile",
                  description: `missing ${path}`,
                  pathOrDescriptor: path,
                }),
              ),
      }),
    ),
    Effect.provideService(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: () => new Uint8Array(0),
        digest: (_algorithm, data) =>
          Effect.promise(() => crypto.subtle.digest("SHA-256", Uint8Array.from(data).buffer)).pipe(
            Effect.map((hash) => new Uint8Array(hash)),
          ),
      }),
    ),
  );

describe("M010 replayable evidence envelope", () => {
  const corePath = m010CorePath;

  const makeReplayManifest = async () => {
    const coreText = await Bun.file(corePath).text();
    const coreBytes = new TextEncoder().encode(coreText);
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", coreBytes)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const replayRecord = PropertyTestEvidenceRecord.make({
      ...record,
      observation: { ...record.observation, requestedCases: 1, executedCases: 1, seed: 7 },
    });
    return {
      coreText,
      coreBytes,
      replayManifest: M010ReplayManifest.make({
        bangEvidence: 1,
        kind: "property-test-replay",
        inputs: [{ role: "account-source", path: corePath, sha256: digest }],
        coreInput: { path: corePath },
        record: replayRecord,
        replay: {
          argv: ["bun", "run", "examples/tiny-bank/state/state-diagnostics.ts"],
          obligationId: obligation.id,
          requestedCases: 1,
          seed: 7,
        },
        qualification: {
          inputClosure: "declared-not-proven-complete",
          producerTruth: "assumed-truthful",
          unsafeBoundary: "bypassable",
        },
      }),
    };
  };

  test("verifies clean exact-byte input digests", async () => {
    const { coreBytes, replayManifest } = await makeReplayManifest();
    await expect(
      Effect.runPromise(provideDigestServices(verifyM010Inputs(replayManifest), coreBytes)),
    ).resolves.toBeUndefined();
  });

  test("rejects stale and missing recorded inputs", async () => {
    const { coreBytes, replayManifest } = await makeReplayManifest();
    const recordedInput = replayManifest.inputs[0];
    expect(recordedInput).toBeDefined();
    if (recordedInput === undefined) return;
    const stale = {
      ...replayManifest,
      inputs: [{ ...recordedInput, sha256: "0".repeat(64) }],
    };
    const staleError = await Effect.runPromise(
      Effect.flip(provideDigestServices(verifyM010Inputs(stale), coreBytes)),
    );
    expect(staleError).toBeInstanceOf(M010ReplayError);
    expect(staleError.reason).toBe("stale-input");

    const missing = {
      ...replayManifest,
      inputs: [{ ...recordedInput, path: "missing.json" }],
    };
    const missingError = await Effect.runPromise(
      Effect.flip(provideDigestServices(verifyM010Inputs(missing), coreBytes)),
    );
    expect(missingError).toBeInstanceOf(M010ReplayError);
    expect(missingError.reason).toBe("missing-input");
  });

  test("rejects unknown envelope fields", async () => {
    const { replayManifest } = await makeReplayManifest();
    const error = await Effect.runPromise(
      Effect.flip(
        decodeM010ReplayManifest(JSON.stringify({ ...replayManifest, unexpected: true })),
      ),
    );
    expect(error).toBeInstanceOf(M010ReplayError);
    expect(error.reason).toBe("invalid-manifest");
  });

  test("derives and selects only a normalized Core obligation", async () => {
    const { coreText, replayManifest } = await makeReplayManifest();
    const parsed = sourceToCore(coreText);
    if (Result.isFailure(parsed)) throw parsed.failure;
    const checked = await Effect.runPromise(validateCore(parsed.success));
    const selected = await Effect.runPromise(selectM010Obligation(replayManifest, checked));
    expect(selected.id).toBe(obligation.id);

    const unknown = {
      ...replayManifest,
      replay: { ...replayManifest.replay, obligationId: "Account.withdraw.preserves.missing" },
    };
    const error = await Effect.runPromise(Effect.flip(selectM010Obligation(unknown, checked)));
    expect(error.reason).toBe("unknown-obligation");
  });

  test("rejects a replayed observation mismatch", async () => {
    const { replayManifest } = await makeReplayManifest();
    const error = await Effect.runPromise(
      Effect.flip(
        compareM010Observation(
          replayManifest.record.observation,
          { ...replayManifest.record.observation, seed: 8 },
          obligation.id,
        ),
      ),
    );
    expect(error).toBeInstanceOf(M010ReplayError);
    expect(error.reason).toBe("replay-mismatch");
    expect(error.obligationId).toBe(obligation.id);
  });
});

const m012SelectionPath = "examples/tiny-bank/system/account-ledger.json";
const m012CorePaths = [
  "examples/tiny-bank/core/balance.json",
  "examples/tiny-bank/account.bang",
  "examples/tiny-bank/core/account-ledger-bridge.json",
] as const;

const loadM012Inputs = async () => {
  const [selectionText, ...coreTexts] = await Promise.all(
    [m012SelectionPath, ...m012CorePaths].map((path) => Bun.file(path).text()),
  );
  if (selectionText === undefined) throw new Error("missing M012 selection fixture");
  const coreDocuments = await Promise.all(
    m012CorePaths.map((path, index) => {
      const text = coreTexts[index];
      if (text === undefined) throw new Error(`missing M012 Core fixture: ${path}`);
      if (path === "examples/tiny-bank/account.bang") {
        const parsed = sourceToCore(text);
        if (Result.isFailure(parsed)) throw parsed.failure;
        return parsed.success;
      }
      return Effect.runPromise(
        Schema.decodeEffect(CoreDocumentFromJson)(text, {
          onExcessProperty: "preserve",
        }),
      );
    }),
  );
  const checkedCore = await Effect.runPromise(
    validateCore({
      bangCore: 1,
      declarations: coreDocuments.flatMap(({ declarations }) => declarations),
    }),
  );
  const selection = await Effect.runPromise(
    Schema.decodeEffect(M012SystemSelectionFromJson)(selectionText),
  );
  const bridgeEvidence = await Effect.runPromise(
    decodeM005BridgeEvidenceManifest({
      bangEvidence: 1,
      mission: "M005",
      graph: {
        nodes: ["AccountBalance", "LedgerBalance"],
        edge: "AccountLedger",
        sharedSorts: ["AccountId", "Balance"],
      },
      evidence: [
        {
          class: "property-tested",
          obligation: "AccountLedger.balancesAgree",
          realizations: ["account:AccountBalance", "ledger:LedgerBalance"],
          result: "passed",
          requestedCases: 100,
          executedRuns: 100,
          seed: 20260813,
        },
        {
          class: "property-tested",
          obligation: "AccountLedger.balancesAgree",
          realizations: ["account:AccountBalance", "ledger:InconsistentLedgerBalance"],
          result: "failed",
          requestedCases: 100,
          executedRuns: 1,
          seed: 20260813,
          counterexample: {
            assignment: [{ parameter: "accountId", value: "0" }],
            leftObservation: "0",
            rightObservation: "1",
          },
        },
        {
          class: "unsupported-by-target",
          obligation: "AccountLedger.balancesAgree",
          target: "typescript",
          reason: "sampled runtime evidence is not a proof",
        },
      ],
      assumptions: ["the evidence producer is truthful"],
      unsupported: ["universal proof"],
      invalidatedBy: ["selected realization changes"],
      sources: [m012CorePaths[2]],
      target: {
        name: "effect-vitest",
        effect: "4.0.0-rc.108",
        effectVitest: "4.0.0-rc.108",
        vitest: "4.1.10",
        fastCheck: "4.9.0",
      },
    }),
  );
  const propertyEvidence = PropertyTestEvidenceRecord.make({
    ...record,
    provenance: {
      ...record.provenance,
      coreSource: m012CorePaths[1],
    },
  });
  const runtimeEvidence = RuntimeTraceEvidenceRecord.make({
    ...violatedRuntimeRecord,
    provenance: {
      ...violatedRuntimeRecord.provenance,
      coreSource: m012CorePaths[1],
    },
  });
  const portabilityEvidence = await Effect.runPromise(
    decodeM009PortabilityEvidenceManifest({
      action: "target-portability",
      source: {
        core: m012CorePaths[0],
        declaration: "Balance",
        identity: "refinement:Balance",
      },
      observations: [
        {
          class: "runtime-checked",
          target: "rust",
          case: "0",
          result: "accepted",
        },
        {
          class: "target-static-analysis",
          target: "rust",
          claim: "private-field-construction",
          result: "rejected",
        },
        {
          class: "unsupported-by-target",
          target: "rust",
          claim: "Core Integer outside i128 range",
        },
      ],
      comparison: {
        effectTypeScript: {
          carrier: "arbitrary-precision bigint",
          construction: "Schema boundary",
        },
        rust: {
          carrier: "fixed-width i128",
          construction: "private newtype",
        },
      },
      provenance: {
        projector: "packages/target-rust/src/index.ts",
        generated: "generated/rust/balance.rs",
        consumer: "examples/tiny-bank/rust-balance/src/main.rs",
        compileFail: "examples/tiny-bank/rust-balance/compile-fail/direct-construction.rs",
      },
      environment: {},
      assumptions: ["generated source reflects checked Core"],
      lifetime: "valid for this fixture",
      invalidators: ["selected refinement changes"],
      unsupportedClaims: ["universal cross-target semantic equivalence"],
    }),
  );
  const replayEvidence = M010ReplayManifest.make({
    bangEvidence: 1,
    kind: "property-test-replay",
    inputs: [
      {
        role: "account-source",
        path: m012CorePaths[1],
        sha256: "0".repeat(64),
      },
    ],
    coreInput: { path: m012CorePaths[1] },
    record: propertyEvidence,
    replay: {
      argv: ["bun", "run", "examples/tiny-bank/state/state-diagnostics.ts"],
      obligationId: obligation.id,
      requestedCases: propertyEvidence.observation.requestedCases,
      seed: propertyEvidence.observation.seed,
    },
    qualification: {
      inputClosure: "declared-not-proven-complete",
      producerTruth: "assumed-truthful",
      unsafeBoundary: "bypassable",
    },
  });
  const lawful = await Effect.runPromise(
    deriveTransferPreservationObligation(checkedCore, "lawful"),
  );
  const faulty = await Effect.runPromise(
    deriveTransferPreservationObligation(checkedCore, "faulty"),
  );
  const faultyModel = {
    sourceBefore: 1,
    targetBefore: 0,
    amount: 1,
    sourceAfter: 0,
    targetAfter: 2,
  };
  const solverEvidence = await Effect.runPromise(
    decodeM011SolverEvidenceManifest(
      M011SolverEvidenceManifest.make({
        bangEvidence: 1,
        kind: "solver-reported",
        observations: [
          {
            obligation: lawful,
            result: {
              obligationId: lawful.id,
              variant: "lawful",
              status: "unsat",
              result: "bounded-no-counterexample",
              z3Version: "fixture-z3",
            },
            smtLibSha256: "0".repeat(64),
          },
          {
            obligation: faulty,
            result: {
              obligationId: faulty.id,
              variant: "faulty",
              status: "sat",
              result: "bounded-counterexample",
              model: faultyModel,
              z3Version: "fixture-z3",
            },
            smtLibSha256: "1".repeat(64),
            counterexample: {
              model: faultyModel,
              beforeTotal: 1,
              afterTotal: 2,
            },
          },
        ],
        provider: { name: "z3", version: "fixture-z3" },
        timeouts: { solverMs: 2000, processMs: 5000 },
        trust: {
          class: "solver-reported",
          producer: "z3",
          limitations: ["bounded fixture evidence is not a proof"],
        },
      }),
    ),
  );
  return {
    selection,
    checkedCore,
    bridgeEvidence,
    propertyEvidence,
    runtimeEvidence,
    portabilityEvidence,
    replayEvidence,
    solverEvidence,
  };
};

describe("M012 accumulated system report", () => {
  test("compiles the coherent checked system and preserves all six payloads", async () => {
    const input = await loadM012Inputs();
    const report = await Effect.runPromise(compileM012SystemReport(input));
    expect(report.system).toBe("TinyBankAccountLedger");
    expect(report.declarations).toHaveLength(7);
    expect(report.evidence.bridge).toEqual(input.bridgeEvidence);
    expect(report.evidence.property).toEqual(input.propertyEvidence);
    expect(report.evidence.runtime).toEqual(input.runtimeEvidence);
    expect(report.evidence.portability).toEqual(input.portabilityEvidence);
    expect(report.evidence.replay).toEqual(input.replayEvidence);
    expect(report.evidence.solver).toEqual(input.solverEvidence);
    const reloaded = await Effect.runPromise(
      Schema.decodeEffect(M012SystemReportFromJson)(JSON.stringify(report), {
        onExcessProperty: "error",
      }),
    );
    expect(formatM012SystemReport(reloaded)).toContain(
      "Property evidence: property-tested, result passed, scope sampled",
    );
    expect(formatM012SystemReport(reloaded)).toContain(
      "Runtime evidence: runtime-monitored, result violated, scope single-closed-trace",
    );
    expect(formatM012SystemReport(reloaded)).toContain("fixed-width i128");
  });

  test("rejects the inconsistent ledger realization with the exact bridge witness", async () => {
    const input = await loadM012Inputs();
    const negativeSelection = {
      ...input.selection,
      selection: {
        ...input.selection.selection,
        participantModels: input.selection.selection.participantModels.map((model) =>
          model.participant === "ledger"
            ? {
                participant: model.participant,
                theory: model.theory,
                realization: "InconsistentLedgerBalance",
              }
            : model,
        ),
      },
    };
    const error = await Effect.runPromise(
      Effect.flip(compileM012SystemReport({ ...input, selection: negativeSelection })),
    );
    expect(error).toBeInstanceOf(M012SystemReportError);
    expect(error.reason).toBe("bridge-law-failed");
    expect(error.identity).toBe("AccountLedger.balancesAgree");
    expect(error.message).toContain("InconsistentLedgerBalance");
    expect(error.message).toContain("leftObservation");
  });

  test("rejects evidence whose obligation identity drifts from checked Core", async () => {
    const input = await loadM012Inputs();
    const mismatched = {
      ...input,
      propertyEvidence: {
        ...input.propertyEvidence,
        obligation: {
          ...input.propertyEvidence.obligation,
          id: "Account.withdraw.preserves.differentInvariant",
        },
      },
    };
    const error = await Effect.runPromise(Effect.flip(compileM012SystemReport(mismatched)));
    expect(error).toBeInstanceOf(M012SystemReportError);
    expect(error.reason).toBe("obligation-source-mismatch");
    expect(error.identity).toBe("Account.withdraw.preserves.nonnegativeBalance");
  });

  test("rejects runtime-operation drift and missing target weakening", async () => {
    const input = await loadM012Inputs();
    const runtimeError = await Effect.runPromise(
      Effect.flip(
        compileM012SystemReport({
          ...input,
          runtimeEvidence: {
            ...input.runtimeEvidence,
            observation: {
              ...input.runtimeEvidence.observation,
              operationId: "deposit",
            },
          },
        }),
      ),
    );
    expect(runtimeError.reason).toBe("obligation-source-mismatch");
    expect(runtimeError.identity).toBe("Account.withdraw.preserves.nonnegativeBalance");

    const portabilityError = await Effect.runPromise(
      Effect.flip(
        compileM012SystemReport({
          ...input,
          portabilityEvidence: {
            ...input.portabilityEvidence,
            comparison: {
              ...input.portabilityEvidence.comparison,
              rust: {
                ...input.portabilityEvidence.comparison.rust,
                carrier: "arbitrary-precision bigint",
              },
            },
          },
        }),
      ),
    );
    expect(portabilityError.reason).toBe("evidence-mismatch");
    expect(portabilityError.identity).toBe("refinement:Balance");
  });

  test("maps malformed legacy manifests to typed failures", async () => {
    const input = await loadM012Inputs();
    const bridgeError = await Effect.runPromise(
      Effect.flip(
        decodeM005BridgeEvidenceManifest({
          ...input.bridgeEvidence,
          unexpected: true,
        }),
      ),
    );
    expect(bridgeError).toBeInstanceOf(M005BridgeEvidenceError);
    expect(bridgeError.reason).toBe("invalid-manifest");

    const portabilityError = await Effect.runPromise(
      Effect.flip(
        decodeM009PortabilityEvidenceManifest({
          ...input.portabilityEvidence,
          unexpected: true,
        }),
      ),
    );
    expect(portabilityError).toBeInstanceOf(M009PortabilityEvidenceError);
    expect(portabilityError.reason).toBe("invalid-manifest");
  });

  test("rejects excess fields in every new strict M012 boundary", async () => {
    const input = await loadM012Inputs();
    const bridgeError = await Effect.runPromise(
      Effect.flip(
        Schema.decodeUnknownEffect(M005BridgeEvidenceManifest)({
          ...input.bridgeEvidence,
          unexpected: true,
        }),
      ),
    );
    expect(bridgeError).toBeDefined();

    const portabilityError = await Effect.runPromise(
      Effect.flip(
        Schema.decodeUnknownEffect(M009PortabilityEvidenceManifest)({
          ...input.portabilityEvidence,
          unexpected: true,
        }),
      ),
    );
    expect(portabilityError).toBeDefined();

    const selectionError = await Effect.runPromise(
      Effect.flip(
        Schema.decodeEffect(M012SystemSelectionFromJson)(
          JSON.stringify({ ...input.selection, unexpected: true }),
        ),
      ),
    );
    expect(selectionError).toBeDefined();

    const report = await Effect.runPromise(compileM012SystemReport(input));
    const reportError = await Effect.runPromise(
      Effect.flip(
        Schema.decodeEffect(M012SystemReportFromJson)(
          JSON.stringify({ ...report, unexpected: true }),
        ),
      ),
    );
    expect(reportError).toBeDefined();
  });
});

describe("M015 entity-message evidence boundary", () => {
  const m015Source = `
machine Account {
  state AccountState {
    balance: Integer
  }

  initializer initialize(initialBalance: Integer) {
    requires initialBalance >= 0
  }

  transition withdraw(amount: Integer) {
    requires amount >= 0
    requires balance >= amount
  }

  invariant nonnegativeBalance {
    balance >= 0
  }
}

capability DebitAccount
realization WithdrawAccount binds Account.withdraw {
  requires DebitAccount unbounded
  when disabled fail WithdrawalRejected
}
`;

  const checkedM015Core = Effect.runSync(
    Effect.fromResult(sourceToCore(m015Source)).pipe(Effect.flatMap(validateCore)),
  );

  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const makeM015Record = (): EntityMessageEvidenceRecord =>
    Schema.decodeUnknownSync(EntityMessageEvidenceRecord)({
      source: {
        stateMachine: "Account",
        initializer: "initialize",
        operation: "withdraw",
        realization: "WithdrawAccount",
        capability: "DebitAccount",
        failure: "WithdrawalRejected",
      },
      observation: {
        class: "scenario-tested",
        result: "passed",
        scope: "single-entity-sequential-dispatch",
        entityId: "account-1",
        initialState: { balance: 10n },
        steps: [
          {
            sequence: 0,
            message: {
              _tag: "Withdraw",
              destination: "account-1",
              messageId: "withdraw-1",
              amount: 4n,
            },
            preState: { balance: 10n },
            reply: {
              _tag: "Succeeded",
              entityId: "account-1",
              messageId: "withdraw-1",
              messageType: "Withdraw",
              state: { balance: 6n },
            },
          },
          {
            sequence: 1,
            message: {
              _tag: "Withdraw",
              destination: "account-1",
              messageId: "withdraw-2",
              amount: 2n,
            },
            preState: { balance: 6n },
            reply: {
              _tag: "Succeeded",
              entityId: "account-1",
              messageId: "withdraw-2",
              messageType: "Withdraw",
              state: { balance: 4n },
            },
          },
          {
            sequence: 2,
            message: {
              _tag: "Withdraw",
              destination: "account-1",
              messageId: "withdraw-overdraft",
              amount: 5n,
            },
            preState: { balance: 4n },
            reply: {
              _tag: "TypedFailure",
              entityId: "account-1",
              messageId: "withdraw-overdraft",
              messageType: "Withdraw",
              failureId: "WithdrawalRejected",
              state: { balance: 4n },
            },
          },
          {
            sequence: 3,
            message: {
              _tag: "Withdraw",
              destination: "account-2",
              messageId: "withdraw-wrong-destination",
              amount: 1n,
            },
            preState: { balance: 4n },
            reply: {
              _tag: "WrongDestination",
              entityId: "account-1",
              messageId: "withdraw-wrong-destination",
              messageType: "Withdraw",
              destination: "account-2",
              state: { balance: 4n },
            },
          },
        ],
      },
      provenance: {
        coreSource: "examples/tiny-bank/account.bang",
        generatedKit: "generated/effect/AccountEntity.ts",
        realization: "examples/tiny-bank/implementation/account-withdrawal-effect.ts",
        evaluator: "tests/evidence.test.ts",
      },
      producer: {
        identity: "M015 scenario evaluator",
        trust: "assumed-truthful",
      },
      environment: {
        toolVersions: {
          bun: "1.3.14",
          effect: "4.0.0-rc.108",
        },
        target: {
          name: "typescript",
          version: "7.0.2",
        },
      },
      qualification: {
        assumptions: ["the recorded dispatch steps are complete"],
        unsupportedClaims: [
          {
            claim: "entity ownership holds for all future messages",
            reason: "the record covers one sequential scenario",
          },
        ],
        lifetime: "valid while the selected Core and generated target remain unchanged",
        invalidators: ["Core declaration changes", "target realization changes"],
      },
    });

  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const decodeM015 = (value: unknown): EntityMessageEvidenceRecord =>
    Schema.decodeUnknownSync(EntityMessageEvidenceRecord)(value);

  test("checks the 10 to 6 to 4 journey and formats ordered outcomes", () => {
    const checked = Effect.runSync(
      checkEntityMessageEvidenceRecord(makeM015Record(), checkedM015Core),
    );
    const report = formatEntityMessageEvidenceRecord(checked);

    expect(checked.observation.steps[0]?.reply._tag).toBe("Succeeded");
    expect(checked.observation.steps[1]?.reply._tag).toBe("Succeeded");
    expect(report).toContain("Entity: account-1");
    expect(report).toContain(
      "Evidence: scenario-tested, result passed, scope single-entity-sequential-dispatch",
    );
    expect(report).toContain("Step 0: Withdraw withdraw-1");
    expect(report).toContain("Step 1: Withdraw withdraw-2");
    expect(report).toContain("Step 2: Withdraw withdraw-overdraft");
    expect(report).toContain("Unsupported claims:");
  });

  test("accepts decimal strings at the JSON boundary and rejects excess fields", () => {
    // oxlint-disable-next-line eslint/no-shadow
    const record = makeM015Record();
    const encoded = {
      ...record,
      observation: {
        ...record.observation,
        initialState: { balance: "10" },
        steps: record.observation.steps.map((step) => ({
          ...step,
          message: { ...step.message, amount: String(step.message.amount) },
          preState: { balance: String(step.preState.balance) },
          reply: { ...step.reply, state: { balance: String(step.reply.state.balance) } },
        })),
      },
    };
    const decoded = Schema.decodeSync(EntityMessageEvidenceRecordFromJson)(JSON.stringify(encoded));
    expect(decoded.observation.initialState.balance).toBe(10n);
    expect(() =>
      Schema.decodeUnknownSync(EntityMessageEvidenceRecord)({
        ...record,
        unexpected: true,
      }),
    ).toThrow();
  });

  test("rejects reply identity drift", () => {
    // oxlint-disable-next-line eslint/no-shadow
    const record = makeM015Record();
    const drifted = decodeM015({
      ...record,
      observation: {
        ...record.observation,
        steps: [
          {
            ...record.observation.steps[0]!,
            reply: { ...record.observation.steps[0]!.reply, entityId: "account-2" },
          },
          ...record.observation.steps.slice(1),
        ],
      },
    });
    const error = Effect.runSync(
      Effect.flip(checkEntityMessageEvidenceRecord(drifted, checkedM015Core)),
    );
    expect(error).toBeInstanceOf(EntityMessageEvidenceError);
    expect(error.reason).toBe("identity-drift");
  });

  test("rejects duplicate message identities", () => {
    // oxlint-disable-next-line eslint/no-shadow
    const record = makeM015Record();
    const duplicate = decodeM015({
      ...record,
      observation: {
        ...record.observation,
        // oxlint-disable-next-line oxc/no-map-spread
        steps: record.observation.steps.map((step, index) =>
          index === 1 ? { ...step, message: { ...step.message, messageId: "withdraw-1" } } : step,
        ),
      },
    });
    const error = Effect.runSync(
      Effect.flip(checkEntityMessageEvidenceRecord(duplicate, checkedM015Core)),
    );
    expect(error.reason).toBe("duplicate-message");
  });

  test("rejects broken pre-state chaining", () => {
    // oxlint-disable-next-line eslint/no-shadow
    const record = makeM015Record();
    const broken = decodeM015({
      ...record,
      observation: {
        ...record.observation,
        // oxlint-disable-next-line oxc/no-map-spread
        steps: record.observation.steps.map((step, index) =>
          index === 1 ? { ...step, preState: { balance: 10n } } : step,
        ),
      },
    });
    const error = Effect.runSync(
      Effect.flip(checkEntityMessageEvidenceRecord(broken, checkedM015Core)),
    );
    expect(error.reason).toBe("broken-chain");
  });

  test("rejects state-changing typed failures", () => {
    // oxlint-disable-next-line eslint/no-shadow
    const record = makeM015Record();
    const changed = decodeM015({
      ...record,
      observation: {
        ...record.observation,
        // oxlint-disable-next-line oxc/no-map-spread
        steps: record.observation.steps.map((step, index) =>
          index === 2 ? { ...step, reply: { ...step.reply, state: { balance: 3n } } } : step,
        ),
      },
    });
    const error = Effect.runSync(
      Effect.flip(checkEntityMessageEvidenceRecord(changed, checkedM015Core)),
    );
    expect(error.reason).toBe("state-changing-failure");
  });

  test("rejects missing accepted withdrawals", () => {
    // oxlint-disable-next-line eslint/no-shadow
    const record = makeM015Record();
    const missing = decodeM015({
      ...record,
      observation: {
        ...record.observation,
        // oxlint-disable-next-line oxc/no-map-spread
        steps: record.observation.steps.map((step, index) =>
          index === 1
            ? {
                ...step,
                reply: {
                  _tag: "TypedFailure",
                  entityId: "account-1",
                  messageId: "withdraw-2",
                  messageType: "Withdraw",
                  failureId: "WithdrawalRejected",
                  state: { balance: 6n },
                },
              }
            : step,
        ),
      },
    });
    const error = Effect.runSync(
      Effect.flip(checkEntityMessageEvidenceRecord(missing, checkedM015Core)),
    );
    expect(error.reason).toBe("missing-accepted-withdrawals");
  });

  test("rejects unknown selected Core identities", () => {
    // oxlint-disable-next-line eslint/no-shadow
    const record = makeM015Record();
    const unknown = decodeM015({
      ...record,
      source: { ...record.source, realization: "MissingWithdrawAccount" },
    });
    const error = Effect.runSync(
      Effect.flip(checkEntityMessageEvidenceRecord(unknown, checkedM015Core)),
    );
    expect(error.reason).toBe("unknown-core-identity");
  });

  test("rejects accepted reset to the initial state", () => {
    // oxlint-disable-next-line eslint/no-shadow
    const record = makeM015Record();
    const reset = decodeM015({
      ...record,
      observation: {
        ...record.observation,
        // oxlint-disable-next-line oxc/no-map-spread
        steps: record.observation.steps.map((step, index) =>
          index === 1 ? { ...step, reply: { ...step.reply, state: { balance: 10n } } } : step,
        ),
      },
    });
    const error = Effect.runSync(
      Effect.flip(checkEntityMessageEvidenceRecord(reset, checkedM015Core)),
    );
    expect(error.reason).toBe("state-reset");
  });
});

describe("M016 dual-provider evidence boundary", () => {
  const leanArchiveSha256 = "sha256-Ta10FBwsEZyhqmJmVr6DuOFCOK+6lycf178es/CBsxk=";

  const makeM016Manifest = async () => {
    const { solverEvidence } = await loadM012Inputs();
    const qualification = {
      assumptions: ["Lean 4.30.0 and its imported environment implement their reported versions"],
      limitations: [
        "the generated proposition is not independently verified against Core semantics",
      ],
      unsupportedClaims: [
        {
          claim: "Effect implementation conformance",
          reason: "the proof targets the abstract relational obligation only",
        },
        {
          claim: "Rust implementation conformance",
          reason: "the proof targets the abstract relational obligation only",
        },
      ],
      lifetime: "valid while the normalized obligation and all bound artifacts remain unchanged",
      invalidators: ["obligation, source, generated Lean, or imported environment changes"],
    };
    const artifact = {
      coreSource: {
        path: "examples/tiny-bank/core/account-ledger-bridge.json",
        sha256: "2".repeat(64),
      },
      normalizedObligationSha256: "3".repeat(64),
      generatedLean: {
        path: "generated/lean/AccountLedgerTransfer.lean",
        sha256: "4".repeat(64),
      },
    };
    return M016DualProviderEvidenceManifest.make({
      bangEvidence: 1,
      mission: "M016",
      kind: "dual-provider-relational-evidence",
      solver: solverEvidence,
      kernelProof: {
        kind: "kernel-proof",
        provider: {
          name: "lean",
          version: "4.30.0",
          archiveSha256: leanArchiveSha256,
          imports: [
            {
              module: "Lean.Elab.Tactic.Omega",
              version: "4.30.0",
              sha256: leanArchiveSha256,
            },
          ],
          command: "nix shell -f nix/lean.nix -c lean",
        },
        observations: [
          {
            obligation: {
              id: "AccountLedger.transferPreservesTotal",
              variant: "lawful",
            },
            theorem: {
              id: "AccountLedger_transferPreservesTotal_lawful",
              result: "kernel-proven",
              axioms: [],
            },
            provenance: artifact,
            qualification,
          },
          {
            obligation: {
              id: "AccountLedger.transferPreservesTotal",
              variant: "faulty",
            },
            theorem: {
              id: "AccountLedger_transferPreservesTotal_faulty_refuted",
              result: "kernel-refuted",
              axioms: [],
            },
            provenance: artifact,
            qualification,
            refutation: {
              witness: {
                sourceBefore: 1,
                targetBefore: 0,
                amount: 1,
                sourceAfter: 0,
                targetAfter: 2,
              },
              beforeTotal: 1,
              afterTotal: 2,
            },
          },
        ],
        trust: {
          class: "kernel-checked",
          producer: "lean-kernel",
          limitations: ["imported Lean axioms are not independently proved here"],
        },
      },
    });
  };

  test("round-trips deterministically and keeps solver and kernel sections distinct", async () => {
    const manifest = await makeM016Manifest();
    const reloaded = await Effect.runPromise(
      decodeM016DualProviderEvidenceManifest(JSON.stringify(manifest)),
    );
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(manifest));
    const report = formatM016DualProviderEvidenceReport(reloaded);
    expect(report.indexOf("Z3 solver section")).toBeLessThan(
      report.indexOf("Lean kernel-proof section"),
    );
    expect(report).toContain("bounded-no-counterexample");
    expect(report).toContain("kernel-proven");
    expect(report).toContain("kernel-refuted");
    expect(report).toContain("No combined evidence grade");
    expect(report).toContain("Effect implementation conformance: unsupported");
    expect(report).toContain("Rust implementation conformance: unsupported");
  });

  test("rejects excess fields and missing or duplicate variants", async () => {
    const manifest = await makeM016Manifest();
    const excess = await Effect.runPromise(
      Effect.flip(
        decodeM016DualProviderEvidenceManifest({
          ...manifest,
          unexpected: true,
        }),
      ),
    );
    expect(excess).toBeInstanceOf(M016DualProviderEvidenceError);
    expect(excess.reason).toBe("invalid-manifest");

    const lawfulObservation = manifest.kernelProof.observations.find(
      ({ obligation: candidateObligation }) => candidateObligation.variant === "lawful",
    );
    if (lawfulObservation === undefined) throw new Error("fixture missing lawful observation");
    const duplicate = M016DualProviderEvidenceManifest.make({
      ...manifest,
      kernelProof: {
        ...manifest.kernelProof,
        observations: [lawfulObservation, lawfulObservation],
      },
    });
    const duplicateError = await Effect.runPromise(
      Effect.flip(decodeM016DualProviderEvidenceManifest(duplicate)),
    );
    expect(duplicateError.reason).toBe("duplicate-variant");

    const missing = M016DualProviderEvidenceManifest.make({
      ...manifest,
      kernelProof: {
        ...manifest.kernelProof,
        observations: [lawfulObservation],
      },
    });
    const missingError = await Effect.runPromise(
      Effect.flip(decodeM016DualProviderEvidenceManifest(missing)),
    );
    expect(missingError.reason).toBe("missing-variant");
  });

  test("rejects theorem/result identity drift and invalid faulty witnesses", async () => {
    const manifest = await makeM016Manifest();
    const theoremMismatch = M016DualProviderEvidenceManifest.make({
      ...manifest,
      kernelProof: {
        ...manifest.kernelProof,
        observations: manifest.kernelProof.observations.map((observation, index) =>
          index === 0
            ? {
                ...observation,
                theorem: {
                  ...observation.theorem,
                  id: "AccountLedger_transferPreservesTotal_faulty_refuted",
                },
              }
            : observation,
        ),
      },
    });
    const identityError = await Effect.runPromise(
      Effect.flip(decodeM016DualProviderEvidenceManifest(theoremMismatch)),
    );
    expect(identityError.reason).toBe("identity-mismatch");

    const resultMismatch = M016DualProviderEvidenceManifest.make({
      ...manifest,
      kernelProof: {
        ...manifest.kernelProof,
        observations: manifest.kernelProof.observations.map((observation, index) =>
          index === 0
            ? {
                ...observation,
                theorem: { ...observation.theorem, result: "kernel-refuted" },
              }
            : observation,
        ),
      },
    });
    const resultError = await Effect.runPromise(
      Effect.flip(decodeM016DualProviderEvidenceManifest(resultMismatch)),
    );
    expect(resultError.reason).toBe("result-mismatch");
    const providerMismatch = M016DualProviderEvidenceManifest.make({
      ...manifest,
      kernelProof: {
        ...manifest.kernelProof,
        provider: { ...manifest.kernelProof.provider, version: "4.29.0" },
      },
    });
    const providerError = await Effect.runPromise(
      Effect.flip(decodeM016DualProviderEvidenceManifest(providerMismatch)),
    );
    expect(providerError.reason).toBe("identity-mismatch");

    const witnessMismatch = M016DualProviderEvidenceManifest.make({
      ...manifest,
      kernelProof: {
        ...manifest.kernelProof,
        // Immutable evidence fixtures intentionally replace one nested observation.
        // oxlint-disable-next-line no-map-spread
        observations: manifest.kernelProof.observations.map((observation, index) =>
          index === 1 && observation.refutation !== undefined
            ? {
                ...observation,
                refutation: {
                  ...observation.refutation,
                  witness: { ...observation.refutation.witness, targetAfter: 3 },
                },
              }
            : observation,
        ),
      },
    });
    const witnessError = await Effect.runPromise(
      Effect.flip(decodeM016DualProviderEvidenceManifest(witnessMismatch)),
    );
    expect(witnessError.reason).toBe("invalid-witness");
  });

  test("rejects malformed material hashes and conformance claims", async () => {
    const manifest = await makeM016Manifest();
    const malformedHash = {
      ...manifest,
      kernelProof: {
        ...manifest.kernelProof,
        observations: manifest.kernelProof.observations.map((observation) => ({
          ...observation,
          provenance: {
            ...observation.provenance,
            generatedLean: { ...observation.provenance.generatedLean, sha256: "bad" },
          },
        })),
      },
    };
    const hashError = await Effect.runPromise(
      Effect.flip(decodeM016DualProviderEvidenceManifest(malformedHash)),
    );
    expect(hashError.reason).toBe("invalid-manifest");

    const missingClaim = M016DualProviderEvidenceManifest.make({
      ...manifest,
      kernelProof: {
        ...manifest.kernelProof,
        observations: manifest.kernelProof.observations.map((observation) => ({
          ...observation,
          qualification: {
            ...observation.qualification,
            unsupportedClaims: observation.qualification.unsupportedClaims.filter(
              ({ claim }) => !claim.startsWith("Rust"),
            ),
          },
        })),
      },
    });
    const claimError = await Effect.runPromise(
      Effect.flip(decodeM016DualProviderEvidenceManifest(missingClaim)),
    );
    expect(claimError.reason).toBe("unsupported-conformance");

    const sorryAxiom = M016DualProviderEvidenceManifest.make({
      ...manifest,
      kernelProof: {
        ...manifest.kernelProof,
        observations: manifest.kernelProof.observations.map((observation, index) =>
          index === 0
            ? {
                ...observation,
                theorem: { ...observation.theorem, axioms: ["sorryAx"] },
              }
            : observation,
        ),
      },
    });
    const axiomError = await Effect.runPromise(
      Effect.flip(decodeM016DualProviderEvidenceManifest(sorryAxiom)),
    );
    expect(axiomError.reason).toBe("unexpected-axiom");

    const materialError = await Effect.runPromise(
      // Test execution is the composition root for platform digest services.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.flip(verifyM016EvidenceMaterials(manifest)).pipe(Effect.provide(BunServices.layer)),
    );
    expect(materialError.reason).toBe("stale-material");
  });
});

describe("M017 Gleam/BEAM actor runtime evidence boundary", () => {
  const m017Source = `
machine Account {
  state AccountState {
    balance: Integer
  }

  initializer initialize(initialBalance: Integer) {
    requires initialBalance >= 0
  }

  transition withdraw(amount: Integer) {
    requires amount >= 0
    requires balance >= amount
  }

  invariant nonnegativeBalance {
    balance >= 0
  }
}

capability DebitAccount
realization WithdrawAccount binds Account.withdraw {
  requires DebitAccount unbounded
  when disabled fail WithdrawalRejected
}
`;

  const checkedCore = Effect.runSync(
    Effect.fromResult(sourceToCore(m017Source)).pipe(Effect.flatMap(validateCore)),
  );
  const limitations = [
    "same-sender ordering only",
    "asynchronous send without handling acknowledgement",
    "selective receive and priority messages can change mailbox processing order",
    "distributed signal loss",
    "restart without durable state",
    "raw BEAM or foreign-function type bypass",
    "finite process, mailbox, atom, and memory resources",
  ] as const;
  const makeManifest = (): M017GleamActorEvidenceManifest => ({
    bangEvidence: 1,
    mission: "M017",
    version: 1,
    kind: "gleam-beam-actor-runtime",
    source: {
      stateMachine: "Account",
      state: "AccountState",
      initializer: "initialize",
      operation: "withdraw",
      invariant: "nonnegativeBalance",
      realization: "WithdrawAccount",
      capability: "DebitAccount",
      failure: "WithdrawalRejected",
    },
    observation: {
      class: "runtime-checked",
      result: "passed",
      scope: "single-caller-supervised-beam-actor",
      entityId: "account-1",
      initialState: { balance: 10 },
      steps: [
        {
          sequence: 0,
          message: {
            _tag: "Withdraw",
            destination: "account-1",
            messageId: "withdraw-1",
            amount: 4,
          },
          preState: { balance: 10 },
          reply: {
            _tag: "Succeeded",
            entityId: "account-1",
            messageId: "withdraw-1",
            messageType: "Withdraw",
            state: { balance: 6 },
          },
        },
        {
          sequence: 1,
          message: {
            _tag: "Withdraw",
            destination: "account-1",
            messageId: "withdraw-2",
            amount: 2,
          },
          preState: { balance: 6 },
          reply: {
            _tag: "Succeeded",
            entityId: "account-1",
            messageId: "withdraw-2",
            messageType: "Withdraw",
            state: { balance: 4 },
          },
        },
        {
          sequence: 2,
          message: {
            _tag: "Withdraw",
            destination: "account-1",
            messageId: "withdraw-3",
            amount: 9,
          },
          preState: { balance: 4 },
          reply: {
            _tag: "TypedFailure",
            entityId: "account-1",
            messageId: "withdraw-3",
            messageType: "Withdraw",
            failureId: "WithdrawalRejected",
            state: { balance: 4 },
          },
        },
      ],
      invalidInput: {
        kind: "unknown-message",
        phase: "before-dispatch",
        beforeState: { balance: 4 },
        afterState: { balance: 4 },
      },
      restart: {
        oldTerminated: true,
        replacementObserved: true,
        identityChanged: true,
        replacementAlive: true,
        restartState: { balance: 10 },
      },
      supervisorStopped: true,
    },
    provenance: {
      coreSource: {
        path: "examples/tiny-bank/account.bang",
        sha256: "0".repeat(64),
      },
      projector: "@bang/target-gleam",
      generatedSource: {
        path: "generated/gleam/account-entity/src/bang/account_entity.gleam",
        sha256: "1".repeat(64),
      },
      consumer: {
        path: "examples/tiny-bank/gleam-account/src/main.gleam",
        sha256: "2".repeat(64),
      },
      toolchainDefinition: { path: "nix/gleam.nix", sha256: "3".repeat(64) },
      generatedConfig: {
        path: "generated/gleam/account-entity/gleam.toml",
        sha256: "4".repeat(64),
      },
      generatedManifest: {
        path: "generated/gleam/account-entity/manifest.toml",
        sha256: "5".repeat(64),
      },
      consumerConfig: {
        path: "examples/tiny-bank/gleam-account/gleam.toml",
        sha256: "6".repeat(64),
      },
      consumerManifest: {
        path: "examples/tiny-bank/gleam-account/manifest.toml",
        sha256: "7".repeat(64),
      },
      evaluator: "scripts/demo-m017.ts",
    },
    producer: {
      identity: "bun run scripts/demo-m017.ts",
      trust: "assumed-truthful",
    },
    toolchain: {
      nixpkgs: {
        revision: "0e251e24a4f24e036a084b6b4b2d2491af4167f4",
        sha256: "118n3xlp9fyf52588yhxa0a5xyi0gchci09l0vblrm7m8zimvln8",
      },
      gleam: { version: "1.18.1" },
      otp: { version: "29.0.5", release: "29" },
      dependencies: [
        {
          name: "gleam_stdlib",
          version: "1.0.5",
          sha256: "cee5b6c076a85b45f60c585f4316c63ec8b7127c119d5738c3958a9c4d50404e",
        },
        {
          name: "gleam_erlang",
          version: "1.3.0",
          sha256: "1124ad3aa21143e5af0fc5cf3d9529f6db8ca03e43a55711b60b6b7b3874375c",
        },
        {
          name: "gleam_otp",
          version: "1.3.0",
          sha256: "de4ca6850842f0266ee95317a25dd6a0a0f20cdfab7c0adc2e63251d7c3c72ec",
        },
      ],
      commands: {
        build: "nix shell -f ../../../nix/gleam.nix -c gleam build",
        run: "nix shell -f ../../../nix/gleam.nix -c gleam run -m main",
      },
    },
    qualification: {
      assumptions: [
        "the checked Account declarations are the semantic source for the generated actor",
        "the independent consumer records each handled request and supervised lifecycle observation",
      ],
      limitations,
      unsupportedClaims: [
        {
          claim: "Gleam, Erlang, or OTP is Core semantic authority",
          reason: "the target runtime only realizes checked Core identities",
        },
        {
          claim: "restart preserves state",
          reason: "the actor uses in-memory state and the observed replacement resets to 10",
        },
      ],
      lifetime:
        "valid while checked Core, generated source, consumer, and pinned toolchain remain unchanged",
      invalidators: [
        "Core declaration or realization identity changes",
        "generated Gleam source or consumer source changes",
        "toolchain, dependency lock, or command identity changes",
        "runtime protocol, supervision, or limitation observations change",
      ],
    },
  });

  test("checks exact trace, identity retention, restart reset, and clean shutdown", async () => {
    const manifest = makeManifest();
    const checked = await Effect.runPromise(
      checkM017GleamActorEvidenceManifest(manifest, checkedCore),
    );
    expect(checked.observation.steps.map((step) => step.reply._tag)).toEqual([
      "Succeeded",
      "Succeeded",
      "TypedFailure",
    ]);
    expect(checked.observation.steps[2]?.reply).toMatchObject({
      entityId: "account-1",
      messageId: "withdraw-3",
      failureId: "WithdrawalRejected",
    });
    expect(checked.observation.restart.restartState.balance).toBe(10);
    expect(checked.observation.supervisorStopped).toBe(true);
    const reloaded = await Effect.runPromise(
      decodeM017GleamActorEvidenceManifest(JSON.stringify(manifest)),
    );
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(manifest));
    const report = formatM017GleamActorEvidenceReport(checked);
    expect(report).toContain("same-sender ordering only");
    expect(report).toContain("WithdrawalRejected");
    expect(report).not.toMatch(/pid/i);
  });

  test("rejects excess fields and Core identity drift with typed reasons", async () => {
    const manifest = makeManifest();
    const excess = await Effect.runPromise(
      Effect.flip(decodeM017GleamActorEvidenceManifest({ ...manifest, unexpected: true })),
    );
    expect(excess).toBeInstanceOf(M017GleamActorEvidenceError);
    expect(excess.reason).toBe("invalid-manifest");

    const unknown = M017GleamActorEvidenceManifest.make({
      ...manifest,
      source: { ...manifest.source, realization: "MissingWithdrawAccount" },
    });
    const identityError = await Effect.runPromise(
      Effect.flip(checkM017GleamActorEvidenceManifest(unknown, checkedCore)),
    );
    expect(identityError.reason).toBe("unknown-core-identity");
  });

  test("rejects state-chain, invalid-input, restart, and limitation falsification", async () => {
    const manifest = makeManifest();
    const changedFailure = M017GleamActorEvidenceManifest.make({
      ...manifest,
      observation: {
        ...manifest.observation,
        steps: manifest.observation.steps.map((step, index) =>
          index === 2 ? { ...step, reply: { ...step.reply, state: { balance: 3 } } } : step,
        ),
      },
    });
    const stateError = await Effect.runPromise(
      Effect.flip(decodeM017GleamActorEvidenceManifest(changedFailure)),
    );
    expect(stateError.reason).toBe("state-changing-failure");

    const invalid = M017GleamActorEvidenceManifest.make({
      ...manifest,
      observation: {
        ...manifest.observation,
        invalidInput: {
          ...manifest.observation.invalidInput,
          phase: "before-dispatch",
          afterState: { balance: 5 },
        },
      },
    });
    const invalidError = await Effect.runPromise(
      Effect.flip(decodeM017GleamActorEvidenceManifest(invalid)),
    );
    expect(invalidError.reason).toBe("invalid-input");

    const restarted = M017GleamActorEvidenceManifest.make({
      ...manifest,
      observation: {
        ...manifest.observation,
        restart: { ...manifest.observation.restart, identityChanged: false },
      },
    });
    const restartError = await Effect.runPromise(
      Effect.flip(decodeM017GleamActorEvidenceManifest(restarted)),
    );
    expect(restartError.reason).toBe("restart-mismatch");

    const missingLimitation = M017GleamActorEvidenceManifest.make({
      ...manifest,
      qualification: {
        ...manifest.qualification,
        limitations: manifest.qualification.limitations.slice(0, 5),
      },
    });
    const limitationError = await Effect.runPromise(
      Effect.flip(decodeM017GleamActorEvidenceManifest(missingLimitation)),
    );
    expect(limitationError.reason).toBe("missing-target-limitations");
  });

  test("rejects stale live material digests", async () => {
    const manifest = makeManifest();
    const materialError = await Effect.runPromise(
      Effect.flip(verifyM017GleamActorEvidenceMaterials(manifest)).pipe(
        // Test execution is the composition root for platform digest services.
        // @effect-diagnostics-next-line strictEffectProvide:off
        Effect.provide(BunServices.layer),
      ),
    );
    expect(materialError).toBeInstanceOf(M017GleamActorEvidenceError);
    expect(materialError.reason).toBe("stale-material");
  });
});

describe("M018 single-use capability evidence boundary", () => {
  const m018Source = `
machine Account {
  state AccountState {
    balance: Integer
  }

  initializer initialize(initialBalance: Integer) {
    requires initialBalance >= 0
  }

  transition withdraw(amount: Integer) {
    requires amount >= 0
    requires balance >= amount
  }

  invariant nonnegativeBalance {
    balance >= 0
  }
}

capability DebitAccount

realization WithdrawAccount binds Account.withdraw {
  requires DebitAccount unbounded
  when disabled fail WithdrawalRejected
}

realization WithdrawAccountOnce binds Account.withdraw {
  requires DebitAccount exactly 1
  when disabled fail WithdrawalRejectedOnce
}
`;

  const checkedM018Core = Effect.runSync(
    Effect.fromResult(sourceToCore(m018Source)).pipe(Effect.flatMap(validateCore)),
  );

  // Keep this complete fixture local to the M018 evidence suite.
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const makeM018Manifest = (): M018SingleUseCapabilityEvidenceManifest =>
    M018SingleUseCapabilityEvidenceManifest.make({
      bangEvidence: 1,
      mission: "M018",
      version: 1,
      kind: "single-use-capability-runtime",
      source: {
        stateMachine: "Account",
        operation: "withdraw",
        realization: "WithdrawAccountOnce",
        capability: "DebitAccount",
        quantity: { kind: "exactly", uses: "1" },
        failure: "WithdrawalRejectedOnce",
      },
      observation: {
        class: "runtime-checked",
        result: "passed",
        scope: "single-grant-two-call-trace",
        entityId: "account-1",
        initialState: { balance: 10 },
        grantId: "grant-1",
        calls: [
          {
            sequence: 0,
            invocationId: "withdraw-1",
            grantId: "grant-1",
            destination: "account-1",
            amount: 4,
            preState: { balance: 10 },
            remainingUsesBefore: 1,
            outcome: {
              _tag: "Success",
              state: { balance: 6 },
              remainingUses: 0,
              implementationCalls: 1,
            },
          },
          {
            sequence: 1,
            invocationId: "withdraw-2",
            grantId: "grant-1",
            destination: "account-1",
            amount: 1,
            preState: { balance: 6 },
            remainingUsesBefore: 0,
            outcome: {
              _tag: "CapabilityUseRejected",
              failure: "DebitAccountGrantAlreadyConsumed",
              state: { balance: 6 },
              remainingUses: 0,
              implementationCalls: 1,
            },
          },
        ],
        defect: {
          grantId: "grant-defect",
          first: {
            sequence: 0,
            invocationId: "defect-1",
            grantId: "grant-defect",
            destination: "account-1",
            amount: 4,
            preState: { balance: 10 },
            remainingUsesBefore: 1,
            outcome: {
              failure: "independent implementation defect",
              state: { balance: 10 },
              remainingUses: 0,
              implementationCalls: 1,
            },
          },
          reuse: {
            sequence: 1,
            invocationId: "defect-2",
            grantId: "grant-defect",
            destination: "account-1",
            amount: 1,
            preState: { balance: 10 },
            remainingUsesBefore: 0,
            outcome: {
              _tag: "CapabilityUseRejected",
              failure: "DebitAccountGrantAlreadyConsumed",
              state: { balance: 10 },
              remainingUses: 0,
              implementationCalls: 1,
            },
          },
        },
      },
      provenance: {
        coreSource: {
          path: "examples/tiny-bank/account.bang",
          sha256: "0000000000000000000000000000000000000000000000000000000000000000",
        },
        generatedBoundary: {
          path: "generated/effect/WithdrawAccountOnce.ts",
          sha256: "0000000000000000000000000000000000000000000000000000000000000000",
        },
        realization: {
          path: "examples/tiny-bank/capability/account-withdrawal-once-effect.ts",
          sha256: "0000000000000000000000000000000000000000000000000000000000000000",
        },
        evaluator: "tests/evidence.test.ts",
      },
      producer: {
        identity: "M018 evidence fixture",
        trust: "assumed-truthful",
      },
      qualification: {
        assumptions: [
          "the selected checked realization and the independent implementation are the executed boundary",
        ],
        weakenings: [...M018_TARGET_WEAKENINGS],
        lifetime:
          "valid while Core, generated boundary, realization, and evaluator materials remain unchanged",
        invalidators: [
          "checked Core identity or quantity changes",
          "generated boundary or independent implementation changes",
          "runtime ordering, invocation trace, or target semantics change",
        ],
      },
    });

  test("decodes, checks, and formats the exact-one two-call trace", async () => {
    const manifest = makeM018Manifest();
    const reloaded = await Effect.runPromise(
      decodeM018SingleUseCapabilityEvidenceManifest(JSON.stringify(manifest)),
    );
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(manifest));
    const checked = await Effect.runPromise(
      checkM018SingleUseCapabilityEvidenceManifest(reloaded, checkedM018Core),
    );
    const report = formatM018SingleUseCapabilityEvidenceReport(checked);
    expect(report).toContain("quantity exactly 1");
    expect(report).toContain("CapabilityUseRejected:DebitAccountGrantAlreadyConsumed");
    expect(report).toContain("implementation calls 1");
    expect(report).toContain("Weakenings:");
    expect(report).toContain("Lifetime:");
    expect(report).toContain("Invalidators:");
  });

  test("rejects quantity drift, reuse execution, restored grants, state drift, and duplicate calls", async () => {
    const manifest = makeM018Manifest();
    const quantityDrift = M018SingleUseCapabilityEvidenceManifest.make({
      ...manifest,
      source: { ...manifest.source, quantity: { kind: "exactly", uses: "2" } },
    });
    const quantityError = await Effect.runPromise(
      Effect.flip(decodeM018SingleUseCapabilityEvidenceManifest(quantityDrift)),
    );
    expect(quantityError).toBeInstanceOf(M018SingleUseCapabilityEvidenceError);
    expect(quantityError.reason).toBe("quantity-mismatch");

    const reachedAfterReuse = M018SingleUseCapabilityEvidenceManifest.make({
      ...manifest,
      observation: {
        ...manifest.observation,
        calls: [
          manifest.observation.calls[0]!,
          {
            ...manifest.observation.calls[1]!,
            outcome: { ...manifest.observation.calls[1]!.outcome, implementationCalls: 2 },
          },
        ],
      },
    });
    const reachedError = await Effect.runPromise(
      Effect.flip(decodeM018SingleUseCapabilityEvidenceManifest(reachedAfterReuse)),
    );
    expect(reachedError.reason).toBe("implementation-reached-after-reuse");

    const restored = M018SingleUseCapabilityEvidenceManifest.make({
      ...manifest,
      observation: {
        ...manifest.observation,
        defect: {
          ...manifest.observation.defect,
          reuse: {
            ...manifest.observation.defect.reuse,
            outcome: {
              ...manifest.observation.defect.reuse.outcome,
              remainingUses: 1,
            },
          },
        },
      },
    });
    const restoredError = await Effect.runPromise(
      Effect.flip(decodeM018SingleUseCapabilityEvidenceManifest(restored)),
    );
    expect(restoredError.reason).toBe("grant-restored");

    const stateDrift = M018SingleUseCapabilityEvidenceManifest.make({
      ...manifest,
      observation: {
        ...manifest.observation,
        calls: [
          manifest.observation.calls[0]!,
          {
            ...manifest.observation.calls[1]!,
            outcome: {
              ...manifest.observation.calls[1]!.outcome,
              state: { balance: 5 },
            },
          },
        ],
      },
    });
    const stateError = await Effect.runPromise(
      Effect.flip(decodeM018SingleUseCapabilityEvidenceManifest(stateDrift)),
    );
    expect(stateError.reason).toBe("broken-trace");

    const duplicate = M018SingleUseCapabilityEvidenceManifest.make({
      ...manifest,
      observation: {
        ...manifest.observation,
        calls: [
          manifest.observation.calls[0]!,
          {
            ...manifest.observation.calls[1]!,
            invocationId: "withdraw-1",
          },
        ],
      },
    });
    const duplicateError = await Effect.runPromise(
      Effect.flip(decodeM018SingleUseCapabilityEvidenceManifest(duplicate)),
    );
    expect(duplicateError.reason).toBe("broken-trace");
  });

  test("rejects unknown Core identity, missing weakenings, and stale materials", async () => {
    const manifest = makeM018Manifest();
    const unknown = M018SingleUseCapabilityEvidenceManifest.make({
      ...manifest,
      source: { ...manifest.source, realization: "MissingWithdrawAccountOnce" },
    });
    const unknownError = await Effect.runPromise(
      Effect.flip(checkM018SingleUseCapabilityEvidenceManifest(unknown, checkedM018Core)),
    );
    expect(unknownError.reason).toBe("unknown-core-identity");

    const missingWeakening = M018SingleUseCapabilityEvidenceManifest.make({
      ...manifest,
      qualification: { ...manifest.qualification, weakenings: [] },
    });
    const weakeningError = await Effect.runPromise(
      Effect.flip(decodeM018SingleUseCapabilityEvidenceManifest(missingWeakening)),
    );
    expect(weakeningError.reason).toBe("missing-target-weakening");

    const materialError = await Effect.runPromise(
      Effect.flip(
        verifyM018SingleUseCapabilityEvidenceMaterials(manifest).pipe(
          // Test execution is the composition root for platform digest services.
          // @effect-diagnostics-next-line strictEffectProvide:off
          Effect.provide(BunServices.layer),
        ),
      ),
    );
    expect(materialError.reason).toBe("stale-material");
  });
});
describe("M019 self-check evidence boundary", () => {
  const digest = "a".repeat(64);

  const makeManifest = (): M019SelfCheckEvidenceManifest =>
    M019SelfCheckEvidenceManifest.make({
      bangEvidence: 1,
      mission: "M019",
      kind: "property-tested-self-check",
      declarationIdentity: {
        path: "examples/bang-core/bridge-term-data.json",
        declaration: "BridgeTerm",
      },
      implementationBinding: {
        binding: "bang-core-bridge-term",
      },
      targetProfile: "effect-typescript",
      observations: {
        valid: {
          passed: true,
          requestedCases: 100,
          executedRuns: 100,
          seed: 20260813,
          numShrinks: 0,
          counterexamplePath: null,
        },
        invalid: {
          passed: true,
          requestedCases: 100,
          executedRuns: 100,
          seed: 20260813,
          numShrinks: 0,
          counterexamplePath: null,
        },
        maximumObservedDepth: 6,
      },
      materials: [
        { role: "core-source", path: "examples/bang-core/bridge-term-data.json", sha256: digest },
        {
          role: "generated-boundary",
          path: "packages/target-effect/src/index.ts",
          sha256: digest,
        },
        {
          role: "implementation-source",
          path: "packages/core/src/index.ts",
          sha256: "b".repeat(64),
        },
        {
          role: "adapter",
          path: "apps/bang/src/self-check-bridge-term.ts",
          sha256: "c".repeat(64),
        },
        {
          role: "binding-registry",
          path: "apps/bang/src/self-check-bindings.ts",
          sha256: "d".repeat(64),
        },
        {
          role: "evaluator",
          path: "apps/bang/src/report.ts",
          sha256: "e".repeat(64),
        },
      ],
      versions: {
        provider: "@bang/core@0.0.0",
        target: "effect-typescript",
        runtime: "bun@1.3.14",
      },
      qualification: {
        assumptions: ["the selected binding is the executed implementation"],
        targetWeakening: ["bounded generated corpus"],
        lifetime: "valid while all material inputs remain unchanged",
        invalidators: ["Core declaration changes", "implementation changes"],
      },
    });

  test("rejects strict excess properties at both JSON boundaries", async () => {
    const selectionError = await Effect.runPromise(
      Effect.flip(
        Schema.decodeUnknownEffect(M019SelfCheckSelectionFromJson)(
          JSON.stringify({
            bangSelfCheck: 1,
            core: {
              path: "examples/bang-core/bridge-term-data.json",
              declaration: "BridgeTerm",
            },
            target: { profile: "effect-typescript" },
            implementation: { binding: "bang-core-bridge-term" },
            evidence: { seed: 20260813, cases: 100 },
            extra: true,
          }),
          { onExcessProperty: "error" },
        ),
      ),
    );
    expect(selectionError).toBeDefined();

    const resultError = await Effect.runPromise(
      Effect.flip(
        Schema.decodeUnknownEffect(M019DecoderConformanceResultFromJson)(
          JSON.stringify({
            valid: {
              passed: true,
              requestedCases: 1,
              executedRuns: 1,
              seed: 1,
              numShrinks: 0,
              counterexamplePath: null,
              extra: true,
            },
            invalid: {
              passed: true,
              requestedCases: 1,
              executedRuns: 1,
              seed: 1,
              numShrinks: 0,
              counterexamplePath: null,
            },
            maximumObservedDepth: 1,
          }),
          { onExcessProperty: "error" },
        ),
      ),
    );
    expect(resultError).toBeDefined();
  });

  test("enforces lane policy invariants", async () => {
    const manifest = makeManifest();
    const seedDrift = M019SelfCheckEvidenceManifest.make({
      ...manifest,
      observations: {
        ...manifest.observations,
        invalid: { ...manifest.observations.invalid, seed: 9 },
      },
    });
    const seedError = await Effect.runPromise(Effect.flip(checkM019SelfCheckEvidence(seedDrift)));
    expect(seedError).toBeInstanceOf(M019SelfCheckEvidenceError);
    expect(seedError.reason).toBe("invalid-policy");

    const executedTooMany = M019SelfCheckEvidenceManifest.make({
      ...manifest,
      observations: {
        ...manifest.observations,
        valid: { ...manifest.observations.valid, executedRuns: 101 },
      },
    });
    const executedError = await Effect.runPromise(
      Effect.flip(checkM019SelfCheckEvidence(executedTooMany)),
    );
    expect(executedError.reason).toBe("invalid-policy");

    const passedWithCounterexample = M019SelfCheckEvidenceManifest.make({
      ...manifest,
      observations: {
        ...manifest.observations,
        valid: { ...manifest.observations.valid, counterexamplePath: "BridgeTerm" },
      },
    });
    const counterexampleError = await Effect.runPromise(
      Effect.flip(checkM019SelfCheckEvidence(passedWithCounterexample)),
    );
    expect(counterexampleError.reason).toBe("invalid-policy");

    const failedWithoutCounterexample = M019SelfCheckEvidenceManifest.make({
      ...manifest,
      observations: {
        ...manifest.observations,
        invalid: { ...manifest.observations.invalid, passed: false },
      },
    });
    const failedError = await Effect.runPromise(
      Effect.flip(checkM019SelfCheckEvidence(failedWithoutCounterexample)),
    );
    expect(failedError.reason).toBe("invalid-policy");
  });

  test("requires all six unique material roles and unique paths", async () => {
    const manifest = makeManifest();
    const missingRole = M019SelfCheckEvidenceManifest.make({
      ...manifest,
      materials: manifest.materials.slice(1),
    });
    const missingError = await Effect.runPromise(
      Effect.flip(checkM019SelfCheckEvidence(missingRole)),
    );
    expect(missingError.reason).toBe("missing-material-role");

    const duplicateRole = M019SelfCheckEvidenceManifest.make({
      ...manifest,
      materials: [
        ...manifest.materials.slice(0, 5),
        { ...manifest.materials[5]!, role: manifest.materials[0]!.role },
      ],
    });
    const duplicateRoleError = await Effect.runPromise(
      Effect.flip(checkM019SelfCheckEvidence(duplicateRole)),
    );
    expect(duplicateRoleError.reason).toBe("duplicate-material-role");

    const duplicatePath = M019SelfCheckEvidenceManifest.make({
      ...manifest,
      materials: [
        manifest.materials[0]!,
        { ...manifest.materials[1]!, path: manifest.materials[0]!.path },
        ...manifest.materials.slice(2),
      ],
    });
    const duplicatePathError = await Effect.runPromise(
      Effect.flip(checkM019SelfCheckEvidence(duplicatePath)),
    );
    expect(duplicatePathError.reason).toBe("duplicate-material-path");
  });

  test("formats both lanes and all qualifications deterministically", async () => {
    const manifest = makeManifest();
    const checked = await Effect.runPromise(checkM019SelfCheckEvidence(manifest));
    const first = formatM019SelfCheckReport(checked);
    expect(formatM019SelfCheckReport(checked)).toBe(first);
    expect(first).toContain("Result: passed");
    expect(first).toContain("valid: status=passed");
    expect(first).toContain("invalid: status=passed");
    expect(first).toContain("Maximum observed depth: 6");
    for (const role of [
      "core-source",
      "generated-boundary",
      "implementation-source",
      "adapter",
      "binding-registry",
      "evaluator",
    ]) {
      expect(first).toContain(`Material ${role}:`);
    }
    expect(first).toContain("Version provider: @bang/core@0.0.0");
    expect(first).toContain("Qualification target weakening: bounded generated corpus");
    expect(first).not.toContain("exhaustive");
    expect(first).not.toContain("proven");

    const failed = M019SelfCheckEvidenceManifest.make({
      ...manifest,
      observations: {
        ...manifest.observations,
        valid: {
          ...manifest.observations.valid,
          passed: false,
          executedRuns: 7,
          numShrinks: 2,
          counterexamplePath: "BridgeTerm.Application.arguments[0].Variable.id",
        },
      },
    });
    const failedChecked = await Effect.runPromise(checkM019SelfCheckEvidence(failed));
    const failedReport = formatM019SelfCheckReport(failedChecked);
    expect(failedReport).toContain("Result: failed");
    expect(failedReport).toContain(
      "valid: status=failed; seed=20260813; requested=100; executed=7; shrinks=2; counterexample=BridgeTerm.Application.arguments[0].Variable.id",
    );
    expect(failedReport).toContain("invalid: status=passed");
  });
});
