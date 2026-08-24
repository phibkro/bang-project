import { describe, expect, test } from "bun:test";
import {
  consumeSemanticArtifact,
  encodeSemanticArtifact,
  produceSemanticArtifact,
  SemanticArtifactError,
  type CheckedCoreDocument,
  validateCore,
} from "@bang/core";
import {
  classifyRealization,
  consumeExactOneCapabilityExecution,
  decodeExactOneCapabilityExecutionPackage,
  decodeM023ClassificationResult,
  decodeM023RealizationProfile,
  M023_EXACT_ONE_OBLIGATION_IDS,
  decodeM024ChannelReport,
  decodeM024ChannelTrace,
  decodeM024ChannelSelection,
  encodeM023RealizationProfile,
  evaluateM024ChannelTrace,
  encodeExactOneCapabilityExecutionLock,
  ExactOneCapabilityExecutionError,
  ExactOneCapabilityExecutionPackage,
  makeExactOneCapabilityExecutionLock,
  ExactOneCapabilityExecutionResultFromJson,
  M024ChannelReportFromJson,
  M024ChannelSelectionFromJson,
  M024ChannelTraceFromJson,
  M023RealizationClassificationError,
  resolveExactOneCapabilityExecutionPackage,
  type ExactOneCapabilityExecutionResult,
  type M024ChannelObservation,
  type M024ChannelSelection,
  type M024ChannelTrace,
  type M023AssessmentDisposition,
  type M023EvidenceClass,
  type M023RealizationProfile,
  verifyExactOneCapabilityExecutionPackageResult,
} from "@bang/theories";
import { Crypto, Effect, Result, Schema } from "effect";
import { sourceToCore } from "@bang/surface";

const normalizationCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) =>
    Effect.promise(() => crypto.subtle.digest("SHA-256", Uint8Array.from(data).buffer)).pipe(
      Effect.map((hash) => new Uint8Array(hash)),
    ),
});

const makeArtifact = async () => {
  const source = await Bun.file("examples/tiny-bank/account.bang").text();
  const parsed = sourceToCore(source);
  if (Result.isFailure(parsed)) throw parsed.failure;
  const checked: CheckedCoreDocument = Effect.runSync(validateCore(parsed.success));
  const provenance = checked.declarations.map((declaration) => ({
    declaration: declaration.id,
    path: "examples/tiny-bank/account.bang",
  }));
  return Effect.runPromise(
    Effect.provideService(
      produceSemanticArtifact(checked, provenance, "m022-test-artifact"),
      Crypto.Crypto,
      normalizationCrypto,
    ),
  );
};

type M023ObligationId = (typeof M023_EXACT_ONE_OBLIGATION_IDS)[number];

type M023ProfileOptions = {
  readonly targetId?: string;
  readonly realizationId?: string;
  readonly dispositions?: Partial<Record<M023ObligationId, M023AssessmentDisposition>>;
  readonly evidenceClass?: M023EvidenceClass;
  readonly evidenceClasses?: Partial<Record<M023ObligationId, M023EvidenceClass>>;
  readonly assumptions?: ReadonlyArray<string>;
  readonly weakenings?: ReadonlyArray<string>;
  readonly limitations?: ReadonlyArray<string>;
  readonly lifetime?: string;
  readonly invalidators?: ReadonlyArray<string>;
  readonly targetRejection?: M023RealizationProfile["targetRejection"];
};

const makeTheoryResult = async (
  requirementAddress = "operationRealization:WithdrawAccountOnce.requirement:DebitAccount",
): Promise<ExactOneCapabilityExecutionResult> => {
  const artifact = await makeArtifact();
  return Effect.runPromise(
    Effect.provideService(
      consumeExactOneCapabilityExecution(encodeSemanticArtifact(artifact), requirementAddress),
      Crypto.Crypto,
      normalizationCrypto,
    ),
  );
};

const makeM023Profile = (
  theoryResult: ExactOneCapabilityExecutionResult,
  options: M023ProfileOptions = {},
): M023RealizationProfile => {
  const requirementMarker = ".requirement:";
  const markerIndex = theoryResult.requirementAddress.indexOf(requirementMarker);
  const realizationId =
    options.realizationId ??
    (markerIndex > "operationRealization:".length
      ? theoryResult.requirementAddress.slice("operationRealization:".length, markerIndex)
      : "WithdrawAccountOnce");
  const assessments = M023_EXACT_ONE_OBLIGATION_IDS.map((obligationId) => {
    const disposition = options.dispositions?.[obligationId] ?? "supported";
    const evidenceClass =
      options.evidenceClasses?.[obligationId] ??
      (disposition === "rejected"
        ? "unsupported-by-target"
        : disposition === "unresolved"
          ? "unresolved"
          : (options.evidenceClass ?? "structurally-derived"));
    return {
      obligationId,
      disposition,
      evidence: [
        {
          class: evidenceClass,
          scope: options.lifetime ?? "m023-test-scope",
          producer: "m023-theory-tests",
          materials:
            evidenceClass === "unresolved"
              ? []
              : [
                  {
                    path: "tests/theories.test.ts",
                    sha256: "0".repeat(64),
                  },
                ],
        },
      ],
      ...(disposition === "rejected" ? { reason: "target-adapter-rejected" } : {}),
    };
  });

  return {
    bangRealizationProfile: 1,
    artifactId: theoryResult.artifactId,
    artifactFormat: theoryResult.artifactFormat,
    theoryResultIdentity: {
      artifactId: theoryResult.artifactId,
      artifactFormat: theoryResult.artifactFormat,
      theory: theoryResult.theory,
      requirementAddress: theoryResult.requirementAddress,
    },
    realizationId,
    targetId: options.targetId ?? "m023-test-target",
    assessments,
    assumptions: [...(options.assumptions ?? [])],
    weakenings: [...(options.weakenings ?? [])],
    limitations: [...(options.limitations ?? [])],
    lifetime: options.lifetime ?? "m023-test-lifetime",
    invalidators: [...(options.invalidators ?? [])],
    ...(options.targetRejection === undefined ? {} : { targetRejection: options.targetRejection }),
  };
};

const expectM023Failure = async (
  effect: Effect.Effect<unknown, M023RealizationClassificationError>,
  reason: M023RealizationClassificationError["reason"],
) => {
  const error = await Effect.runPromise(Effect.flip(effect));
  expect(error).toBeInstanceOf(M023RealizationClassificationError);
  expect(error.reason).toBe(reason);
};

describe("M022 semantic artifact and theory boundary", () => {
  test("rejects an incompatible artifact version with a schema failure", async () => {
    const artifact = await makeArtifact();
    const encoded = JSON.stringify({ ...artifact, bangSemanticArtifact: 2 });
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provideService(consumeSemanticArtifact(encoded), Crypto.Crypto, normalizationCrypto),
      ),
    );
    expect(error).toBeInstanceOf(SemanticArtifactError);
    expect(error.reason).toBe("schema");
  });

  test("rejects changed normalized bytes after clean parity recomputation", async () => {
    const artifact = await makeArtifact();
    const firstNode = artifact.normalized.nodes[0];
    if (firstNode === undefined) throw new Error("M022 artifact has no normalized nodes");
    const encoded = encodeSemanticArtifact({
      ...artifact,
      normalized: {
        ...artifact.normalized,
        nodes: [
          { ...firstNode, fingerprint: `${firstNode.fingerprint}-drift` },
          ...artifact.normalized.nodes.slice(1),
        ],
      },
    });
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provideService(consumeSemanticArtifact(encoded), Crypto.Crypto, normalizationCrypto),
      ),
    );

    expect(error).toBeInstanceOf(SemanticArtifactError);
    expect(error.reason).toBe("parity");
  });

  test("returns a typed error for an unknown requirement address", async () => {
    const artifact = await makeArtifact();
    const encoded = encodeSemanticArtifact(artifact);
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provideService(
          consumeExactOneCapabilityExecution(
            encoded,
            "operationRealization:Missing.requirement:DebitAccount",
          ),
          Crypto.Crypto,
          normalizationCrypto,
        ),
      ),
    );

    expect(error).toBeInstanceOf(ExactOneCapabilityExecutionError);
    expect(error.reason).toBe("unknown-requirement-address");
  });

  test("produces deterministic artifact bytes for unchanged checked Core", async () => {
    const first = encodeSemanticArtifact(await makeArtifact());
    const second = encodeSemanticArtifact(await makeArtifact());

    expect(first).toBe(second);
  });

  test("crosses the result Schema before returning an applicable explanation", async () => {
    const artifact = await makeArtifact();
    const result = await Effect.runPromise(
      Effect.provideService(
        consumeExactOneCapabilityExecution(
          encodeSemanticArtifact(artifact),
          "operationRealization:WithdrawAccountOnce.requirement:DebitAccount",
        ),
        Crypto.Crypto,
        normalizationCrypto,
      ),
    );

    expect(result._tag).toBe("Applicable");
    expect(result.obligations).toHaveLength(4);
    expect(result.premises.map(({ id }) => id)).toEqual([
      "ExactOneCapabilityExecution.premise.realization-exists",
      "ExactOneCapabilityExecution.premise.operation-binding-checked",
      "ExactOneCapabilityExecution.premise.capability-exists",
      "ExactOneCapabilityExecution.premise.exact-one-authored-quantity",
    ]);
    expect(result.premises.every(({ status }) => status === "satisfied")).toBe(true);
  });
  test("rejects illegal Applicable result combinations at the public Schema", async () => {
    const artifact = await makeArtifact();
    const result = await Effect.runPromise(
      Effect.provideService(
        consumeExactOneCapabilityExecution(
          encodeSemanticArtifact(artifact),
          "operationRealization:WithdrawAccountOnce.requirement:DebitAccount",
        ),
        Crypto.Crypto,
        normalizationCrypto,
      ),
    );
    if (result._tag !== "Applicable") throw new Error("M022 fixture is not applicable");

    const emptyObligations = await Effect.runPromise(
      Effect.flip(
        Schema.decodeEffect(ExactOneCapabilityExecutionResultFromJson)(
          JSON.stringify({ ...result, obligations: [] }),
        ),
      ),
    );
    const resultWithFailedPremise = structuredClone(result);
    Object.assign(resultWithFailedPremise.premises[0]!, { status: "failed" });
    const failedPremise = await Effect.runPromise(
      Effect.flip(
        Schema.decodeEffect(ExactOneCapabilityExecutionResultFromJson)(
          JSON.stringify(resultWithFailedPremise),
        ),
      ),
    );

    expect(emptyObligations).toBeDefined();
    expect(failedPremise).toBeDefined();
  });
});

describe("M023 realization classification boundary", () => {
  test("round-trips a qualified realization profile through strict JSON", async () => {
    const theoryResult = await makeTheoryResult();
    const profile = makeM023Profile(theoryResult, {
      targetId: "effect-typescript",
      evidenceClass: "runtime-checked",
      assumptions: ["assumed-truthful"],
      weakenings: ["bounded-runtime-observation"],
      limitations: ["termination is not established"],
      lifetime: "single-grant-two-call-trace",
      invalidators: ["M018 material drift"],
    });

    const encoded = await Effect.runPromise(encodeM023RealizationProfile(profile));
    const decoded = await Effect.runPromise(decodeM023RealizationProfile(encoded));

    expect(decoded).toEqual(profile);
    expect(JSON.parse(encoded)).toMatchObject({
      bangRealizationProfile: 1,
      artifactFormat: "bangSemanticArtifact:1",
      targetId: "effect-typescript",
    });
  });

  test("classifies a fully structurally-supported profile as Admissible", async () => {
    const theoryResult = await makeTheoryResult();
    const result = await Effect.runPromise(
      classifyRealization(makeM023Profile(theoryResult), theoryResult),
    );

    expect(result._tag).toBe("Admissible");
    expect(result.assessments.every(({ disposition }) => disposition === "supported")).toBe(true);
  });

  test("classifies an Effect-like bounded profile as Qualified", async () => {
    const theoryResult = await makeTheoryResult();
    const result = await Effect.runPromise(
      classifyRealization(
        makeM023Profile(theoryResult, {
          targetId: "effect-typescript",
          evidenceClass: "runtime-checked",
          assumptions: ["assumed-truthful"],
          weakenings: ["bounded-runtime-observation"],
          lifetime: "single-grant-two-call-trace",
        }),
        theoryResult,
      ),
    );

    expect(result._tag).toBe("Qualified");
    expect(result.assumptions).toEqual(["assumed-truthful"]);
    expect(result.weakenings).toEqual(["bounded-runtime-observation"]);
  });

  test("classifies a Gleam-like target rejection as Rejected", async () => {
    const theoryResult = await makeTheoryResult();
    const result = await Effect.runPromise(
      classifyRealization(
        makeM023Profile(theoryResult, {
          targetId: "gleam-beam",
          dispositions: {
            [M023_EXACT_ONE_OBLIGATION_IDS[1]]: "rejected",
          },
          targetRejection: {
            adapter: "gleam-beam",
            address: "operationRealization:WithdrawAccountOnce.requires",
            reason: "Gleam projection supports only unbounded DebitAccount requirements",
          },
        }),
        theoryResult,
      ),
    );

    expect(result._tag).toBe("Rejected");
    expect(result.targetRejection).toMatchObject({
      adapter: "gleam-beam",
      address: "operationRealization:WithdrawAccountOnce.requires",
    });
  });

  test("classifies a missing observation as Unknown", async () => {
    const theoryResult = await makeTheoryResult();
    const result = await Effect.runPromise(
      classifyRealization(
        makeM023Profile(theoryResult, {
          dispositions: {
            [M023_EXACT_ONE_OBLIGATION_IDS[3]]: "unresolved",
          },
        }),
        theoryResult,
      ),
    );

    expect(result._tag).toBe("Unknown");
    expect(result.assessments.some(({ disposition }) => disposition === "unresolved")).toBe(true);
  });
  test("rejects unsupported target evidence mislabeled as unresolved", async () => {
    const theoryResult = await makeTheoryResult();
    const obligationId = M023_EXACT_ONE_OBLIGATION_IDS[0];
    const malformed = makeM023Profile(theoryResult, {
      dispositions: { [obligationId]: "unresolved" },
      evidenceClasses: { [obligationId]: "unsupported-by-target" },
    });

    await expectM023Failure(decodeM023RealizationProfile(malformed), "invalid-profile");
  });

  test("rejects a profile with a missing obligation assessment", async () => {
    const theoryResult = await makeTheoryResult();
    const profile = makeM023Profile(theoryResult);
    const malformed = {
      ...profile,
      assessments: profile.assessments.slice(1),
    };

    await expectM023Failure(decodeM023RealizationProfile(malformed), "invalid-profile");
  });

  test("rejects a profile with a duplicate obligation assessment", async () => {
    const theoryResult = await makeTheoryResult();
    const profile = makeM023Profile(theoryResult);
    const first = profile.assessments[0];
    if (first === undefined) throw new Error("M023 profile has no assessments");
    const malformed = {
      ...profile,
      assessments: [first, ...profile.assessments.slice(1, -1), first],
    };

    await expectM023Failure(decodeM023RealizationProfile(malformed), "invalid-profile");
  });

  test("rejects a profile with an unknown obligation identity", async () => {
    const theoryResult = await makeTheoryResult();
    const profile = makeM023Profile(theoryResult);
    const first = profile.assessments[0];
    if (first === undefined) throw new Error("M023 profile has no assessments");
    const malformed = {
      ...profile,
      assessments: [
        { ...first, obligationId: "ExactOneCapabilityExecution.obligation.unknown" },
        ...profile.assessments.slice(1),
      ],
    };

    await expectM023Failure(decodeM023RealizationProfile(malformed), "invalid-profile");
  });

  test("reports a missing derived obligation from the M022 result", async () => {
    const theoryResult = await makeTheoryResult();
    const malformed = {
      ...theoryResult,
      obligations: theoryResult.obligations.slice(0, -1),
    };

    await expectM023Failure(
      classifyRealization(
        makeM023Profile(theoryResult),
        malformed as unknown as ExactOneCapabilityExecutionResult,
      ),
      "missing-obligation",
    );
  });

  test("reports a duplicate derived obligation from the M022 result", async () => {
    const theoryResult = await makeTheoryResult();
    const first = theoryResult.obligations[0];
    if (first === undefined) throw new Error("M022 result has no obligations");
    const malformed = {
      ...theoryResult,
      obligations: [first, ...theoryResult.obligations.slice(1, -1), first],
    };

    await expectM023Failure(
      classifyRealization(
        makeM023Profile(theoryResult),
        malformed as unknown as ExactOneCapabilityExecutionResult,
      ),
      "duplicate-obligation",
    );
  });

  test("reports an unknown derived obligation from the M022 result", async () => {
    const theoryResult = await makeTheoryResult();
    const first = theoryResult.obligations[0];
    if (first === undefined) throw new Error("M022 result has no obligations");
    const malformed = {
      ...theoryResult,
      obligations: [
        { ...first, id: "ExactOneCapabilityExecution.obligation.unknown" },
        ...theoryResult.obligations.slice(1),
      ],
    };

    await expectM023Failure(
      classifyRealization(
        makeM023Profile(theoryResult),
        malformed as unknown as ExactOneCapabilityExecutionResult,
      ),
      "unknown-obligation",
    );
  });

  test("rejects an identity mismatch between profile and M022 result", async () => {
    const theoryResult = await makeTheoryResult();
    const mismatchedTheoryResult = {
      ...theoryResult,
      artifactId: `${theoryResult.artifactId}-mismatch`,
    };

    await expectM023Failure(
      classifyRealization(makeM023Profile(theoryResult), mismatchedTheoryResult),
      "identity-mismatch",
    );
  });

  test("rejects an inapplicable M022 theory result", async () => {
    const theoryResult = await makeTheoryResult(
      "operationRealization:WithdrawAccount.requirement:DebitAccount",
    );
    expect(theoryResult._tag).toBe("NotApplicable");

    await expectM023Failure(
      classifyRealization(makeM023Profile(theoryResult), theoryResult),
      "inapplicable-theory-result",
    );
  });

  test("rejects a rejected profile without target rejection details", async () => {
    const theoryResult = await makeTheoryResult();
    const malformed = makeM023Profile(theoryResult, {
      targetId: "gleam-beam",
      dispositions: {
        [M023_EXACT_ONE_OBLIGATION_IDS[1]]: "rejected",
      },
    });

    await expectM023Failure(decodeM023RealizationProfile(malformed), "invalid-profile");
  });

  test("rejects an Effect-like Qualified result mislabeled Admissible", async () => {
    const theoryResult = await makeTheoryResult();
    const qualified = await Effect.runPromise(
      classifyRealization(
        makeM023Profile(theoryResult, {
          targetId: "effect-typescript",
          evidenceClass: "runtime-checked",
          assumptions: ["assumed-truthful"],
          weakenings: ["bounded-runtime-observation"],
        }),
        theoryResult,
      ),
    );
    expect(qualified._tag).toBe("Qualified");

    await expectM023Failure(
      decodeM023ClassificationResult({ ...qualified, _tag: "Admissible" }),
      "invalid-classification",
    );
  });

  test("rejects a Gleam-like Rejected result mislabeled Unknown", async () => {
    const theoryResult = await makeTheoryResult();
    const rejected = await Effect.runPromise(
      classifyRealization(
        makeM023Profile(theoryResult, {
          targetId: "gleam-beam",
          dispositions: {
            [M023_EXACT_ONE_OBLIGATION_IDS[1]]: "rejected",
          },
          targetRejection: {
            adapter: "gleam-beam",
            address: "operationRealization:WithdrawAccountOnce.requires",
            reason: "Gleam projection supports only unbounded DebitAccount requirements",
          },
        }),
        theoryResult,
      ),
    );
    expect(rejected._tag).toBe("Rejected");

    await expectM023Failure(
      decodeM023ClassificationResult({ ...rejected, _tag: "Unknown" }),
      "invalid-classification",
    );
  });
});

const m024Protocol = {
  id: "bounded-two-owner",
  version: 1,
  owners: ["owner-a", "owner-b"],
  messages: [
    {
      id: "prepare-t1",
      operation: "Prepare",
      transaction: "t1",
      sender: "owner-a",
      receiver: "owner-b",
      amount: 4,
    },
    {
      id: "commit-t1",
      operation: "Commit",
      transaction: "t1",
      sender: "owner-a",
      receiver: "owner-b",
      causalParent: "prepare-t1",
    },
    {
      id: "ack-t1",
      operation: "Ack",
      transaction: "t1",
      sender: "owner-b",
      receiver: "owner-a",
      causalParent: "commit-t1",
    },
  ],
} as const;

const m024Schedules = [
  {
    id: "ordered",
    steps: [
      { action: "deliver", attemptId: "ordered-p", messageId: "prepare-t1" },
      { action: "deliver", attemptId: "ordered-c", messageId: "commit-t1" },
      { action: "deliver", attemptId: "ordered-a", messageId: "ack-t1" },
    ],
  },
  {
    id: "duplicate-prepare",
    steps: [
      { action: "deliver", attemptId: "duplicate-p-1", messageId: "prepare-t1" },
      { action: "deliver", attemptId: "duplicate-p-2", messageId: "prepare-t1" },
      { action: "deliver", attemptId: "duplicate-c", messageId: "commit-t1" },
      { action: "deliver", attemptId: "duplicate-a", messageId: "ack-t1" },
    ],
  },
  {
    id: "duplicate-commit",
    steps: [
      { action: "deliver", attemptId: "duplicate-commit-p", messageId: "prepare-t1" },
      { action: "deliver", attemptId: "duplicate-commit-c-1", messageId: "commit-t1" },
      { action: "deliver", attemptId: "duplicate-commit-c-2", messageId: "commit-t1" },
      { action: "deliver", attemptId: "duplicate-commit-a", messageId: "ack-t1" },
    ],
  },
  {
    id: "commit-before-prepare",
    steps: [
      { action: "deliver", attemptId: "causal-c", messageId: "commit-t1" },
      { action: "deliver", attemptId: "causal-p", messageId: "prepare-t1" },
    ],
  },
  {
    id: "drop-ack",
    steps: [
      { action: "deliver", attemptId: "drop-p", messageId: "prepare-t1" },
      { action: "deliver", attemptId: "drop-c", messageId: "commit-t1" },
      { action: "drop", attemptId: "drop-a", messageId: "ack-t1" },
    ],
  },
  {
    id: "complete-without-ack",
    steps: [
      { action: "deliver", attemptId: "force-p", messageId: "prepare-t1" },
      { action: "deliver", attemptId: "force-c", messageId: "commit-t1" },
      { action: "complete", ownerId: "owner-a" },
    ],
  },
] as const;

const makeM024Selection = (
  schedules: M024ChannelSelection["schedules"] = m024Schedules,
): M024ChannelSelection =>
  ({
    bangChannelSelection: 1,
    protocol: m024Protocol,
    schedules,
    limitations: [
      "no distributed exactly-once guarantee",
      "no durable delivery or mailbox",
      "no retry-safety or recovery guarantee",
      "no scheduler or network fairness guarantee",
      "no bounded latency, work, memory, or mailbox guarantee",
      "no liveness or productivity guarantee",
      "no behavior claim for unenumerated schedules",
      "the deterministic scheduler is not a real network",
    ],
  }) as M024ChannelSelection;

const m024Delivery = (
  sequence: number,
  attemptId: string,
  messageId: string,
  ownerId: string,
  terminal: "Handled" | "DuplicateIgnored" | "Rejected" = "Handled",
  reason?:
    | "causal-parent-not-handled"
    | "wrong-state"
    | "wrong-recipient"
    | "duplicate-attempt"
    | "unknown-message",
): ReadonlyArray<M024ChannelObservation> => [
  { _tag: "Sent", sequence, attemptId, messageId },
  { _tag: "Delivered", sequence: sequence + 1, attemptId, messageId },
  terminal === "Rejected"
    ? {
        _tag: "Rejected",
        sequence: sequence + 2,
        attemptId,
        messageId,
        ownerId,
        reason: reason ?? "wrong-state",
      }
    : { _tag: terminal, sequence: sequence + 2, attemptId, messageId, ownerId },
];

const m024OrderedTrace = (
  selection: M024ChannelSelection,
  observations: ReadonlyArray<M024ChannelObservation> = [
    ...m024Delivery(1, "ordered-p", "prepare-t1", "owner-b"),
    ...m024Delivery(4, "ordered-c", "commit-t1", "owner-b"),
    ...m024Delivery(7, "ordered-a", "ack-t1", "owner-a"),
  ],
  finalStates: M024ChannelTrace["schedules"][number]["finalStates"] = {
    ownerA: "complete",
    ownerB: "committed",
  },
  stateMutations = 3,
): M024ChannelTrace =>
  ({
    bangChannelTrace: 1,
    protocolId: selection.protocol.id,
    protocolVersion: selection.protocol.version,
    schedules: [
      {
        scheduleId: selection.schedules[0]!.id,
        observations,
        finalStates,
        stateMutations,
      },
    ],
  }) as M024ChannelTrace;

describe("M024 bounded channel theory", () => {
  test("round-trips strict selection, trace, and report JSON", async () => {
    const selection = makeM024Selection([m024Schedules[0]!]);
    const selectionJson = await Effect.runPromise(
      Schema.encodeEffect(M024ChannelSelectionFromJson)(selection),
    );
    const decodedSelection = await Effect.runPromise(decodeM024ChannelSelection(selectionJson));
    expect(decodedSelection).toEqual(selection);

    const trace = m024OrderedTrace(selection);
    const traceJson = await Effect.runPromise(Schema.encodeEffect(M024ChannelTraceFromJson)(trace));
    const decodedTrace = await Effect.runPromise(decodeM024ChannelTrace(traceJson));
    expect(decodedTrace).toEqual(trace);

    const report = await Effect.runPromise(evaluateM024ChannelTrace(selection, trace));
    const reportJson = await Effect.runPromise(
      Schema.encodeEffect(M024ChannelReportFromJson)(report),
    );
    expect(await Effect.runPromise(decodeM024ChannelReport(reportJson))).toEqual(report);
    expect(report.schedules[0]!.result).toBe("Satisfied");
  });

  test("rejects duplicate owners, attempts, and unknown message references", async () => {
    const selection = makeM024Selection([m024Schedules[0]!]);
    const duplicateOwner = {
      ...selection,
      protocol: { ...selection.protocol, owners: ["owner-a", "owner-a"] },
    } as unknown as M024ChannelSelection;
    const duplicateOwnerError = await Effect.runPromise(
      Effect.flip(decodeM024ChannelSelection(duplicateOwner)),
    );
    expect(duplicateOwnerError.reason).toBe("owner");

    const duplicateAttempt = {
      ...selection,
      schedules: [
        {
          id: "bad",
          steps: [
            { action: "deliver", attemptId: "same", messageId: "prepare-t1" },
            { action: "deliver", attemptId: "same", messageId: "commit-t1" },
          ],
        },
      ],
    } as unknown as M024ChannelSelection;
    const duplicateAttemptError = await Effect.runPromise(
      Effect.flip(decodeM024ChannelSelection(duplicateAttempt)),
    );
    expect(duplicateAttemptError.reason).toBe("duplicate-attempt");

    const unknownMessage = {
      ...selection,
      schedules: [
        {
          id: "bad-reference",
          steps: [{ action: "deliver", attemptId: "unknown", messageId: "missing" }],
        },
      ],
    } as unknown as M024ChannelSelection;
    const unknownMessageError = await Effect.runPromise(
      Effect.flip(decodeM024ChannelSelection(unknownMessage)),
    );
    expect(unknownMessageError.reason).toBe("unknown-message");
  });

  test("rejects unknown and operation-invalid causal parents before execution", async () => {
    const selection = makeM024Selection([m024Schedules[0]!]);
    const unknownParent = {
      ...selection,
      protocol: {
        ...selection.protocol,
        messages: selection.protocol.messages.map((message) =>
          message.id === "commit-t1" ? { ...message, causalParent: "missing" } : message,
        ),
      },
    } as unknown as M024ChannelSelection;
    const unknownParentError = await Effect.runPromise(
      Effect.flip(decodeM024ChannelSelection(unknownParent)),
    );
    expect(unknownParentError.reason).toBe("unknown-causal-parent");

    const invalidParent = {
      ...selection,
      protocol: {
        ...selection.protocol,
        messages: selection.protocol.messages.map((message) =>
          message.id === "prepare-t1"
            ? Object.assign({}, message, { causalParent: "ack-t1" })
            : message,
        ),
      },
    } as unknown as M024ChannelSelection;
    const invalidParentError = await Effect.runPromise(
      Effect.flip(decodeM024ChannelSelection(invalidParent)),
    );
    expect(invalidParentError.reason).toBe("invalid-causal-parent");
  });

  test("classifies commit-before-prepare as a causal violation", async () => {
    const selection = makeM024Selection([m024Schedules[3]!]);
    const trace = m024OrderedTrace(
      selection,
      [
        ...m024Delivery(
          1,
          "causal-c",
          "commit-t1",
          "owner-b",
          "Rejected",
          "causal-parent-not-handled",
        ),
        ...m024Delivery(4, "causal-p", "prepare-t1", "owner-b"),
      ],
      { ownerA: "waiting", ownerB: "prepared" },
      1,
    );
    const report = await Effect.runPromise(evaluateM024ChannelTrace(selection, trace));
    const schedule = report.schedules[0]!;
    expect(schedule.result).toBe("Violated");
    expect(schedule.obligations[1]!.obligationId).toBe(
      "BoundedChannelProtocol.obligation.handle-after-causal-parent",
    );
    expect(schedule.obligations[1]!.status).toBe("Violated");
  });

  test("keeps dropped acknowledgement unresolved rather than violated", async () => {
    const selection = makeM024Selection([m024Schedules[4]!]);
    const trace = m024OrderedTrace(
      selection,
      [
        ...m024Delivery(1, "drop-p", "prepare-t1", "owner-b"),
        ...m024Delivery(4, "drop-c", "commit-t1", "owner-b"),
        { _tag: "Sent", sequence: 7, attemptId: "drop-a", messageId: "ack-t1" },
        { _tag: "Dropped", sequence: 8, attemptId: "drop-a", messageId: "ack-t1" },
      ],
      { ownerA: "waiting", ownerB: "committed" },
      2,
    );
    const report = await Effect.runPromise(evaluateM024ChannelTrace(selection, trace));
    const schedule = report.schedules[0]!;
    expect(schedule.result).toBe("Unresolved");
    expect(schedule.obligations[4]!.status).toBe("Unresolved");
    expect(schedule.obligations[3]!.status).toBe("Satisfied");
  });

  test("treats a handled redelivery after a dropped acknowledgement as satisfied", async () => {
    const schedule = {
      id: "drop-then-redeliver",
      steps: [
        { action: "deliver", attemptId: "redeliver-p", messageId: "prepare-t1" },
        { action: "deliver", attemptId: "redeliver-c", messageId: "commit-t1" },
        { action: "drop", attemptId: "redeliver-a-1", messageId: "ack-t1" },
        { action: "deliver", attemptId: "redeliver-a-2", messageId: "ack-t1" },
      ],
    } as const;
    const selection = makeM024Selection([schedule]);
    const trace = m024OrderedTrace(
      selection,
      [
        ...m024Delivery(1, "redeliver-p", "prepare-t1", "owner-b"),
        ...m024Delivery(4, "redeliver-c", "commit-t1", "owner-b"),
        { _tag: "Sent", sequence: 7, attemptId: "redeliver-a-1", messageId: "ack-t1" },
        { _tag: "Dropped", sequence: 8, attemptId: "redeliver-a-1", messageId: "ack-t1" },
        ...m024Delivery(9, "redeliver-a-2", "ack-t1", "owner-a"),
      ],
      { ownerA: "complete", ownerB: "committed" },
      3,
    );
    const report = await Effect.runPromise(evaluateM024ChannelTrace(selection, trace));
    expect(report.schedules[0]!.result).toBe("Satisfied");
    expect(report.schedules[0]!.obligations[4]!.status).toBe("Satisfied");
  });

  test("classifies forced completion without acknowledgement as coordination violation", async () => {
    const selection = makeM024Selection([m024Schedules[5]!]);
    const trace = m024OrderedTrace(
      selection,
      [
        ...m024Delivery(1, "force-p", "prepare-t1", "owner-b"),
        ...m024Delivery(4, "force-c", "commit-t1", "owner-b"),
        {
          _tag: "ForcedCompletion",
          sequence: 7,
          ownerId: "owner-a",
          previousState: "waiting",
          nextState: "complete",
        },
      ],
      { ownerA: "complete", ownerB: "committed" },
      3,
    );
    const report = await Effect.runPromise(evaluateM024ChannelTrace(selection, trace));
    const schedule = report.schedules[0]!;
    expect(schedule.result).toBe("Violated");
    expect(schedule.obligations[3]!.status).toBe("Violated");
    expect(schedule.obligations[3]!.obligationId).toBe(
      "BoundedChannelProtocol.obligation.acknowledged-coordination",
    );
    expect(schedule.obligations[3]!.counterexample?.observationSequence).toBe(7);
  });

  test("duplicate delivery attempts are ignored without a second mutation", async () => {
    const selection = makeM024Selection([m024Schedules[1]!]);
    const trace = m024OrderedTrace(
      selection,
      [
        ...m024Delivery(1, "duplicate-p-1", "prepare-t1", "owner-b"),
        ...m024Delivery(4, "duplicate-p-2", "prepare-t1", "owner-b", "DuplicateIgnored"),
        ...m024Delivery(7, "duplicate-c", "commit-t1", "owner-b"),
        ...m024Delivery(10, "duplicate-a", "ack-t1", "owner-a"),
      ],
      { ownerA: "complete", ownerB: "committed" },
      3,
    );
    const report = await Effect.runPromise(evaluateM024ChannelTrace(selection, trace));
    expect(report.schedules[0]!.result).toBe("Satisfied");
    expect(report.schedules[0]!.obligations[2]!.status).toBe("Satisfied");
  });
});

describe("M030 versioned local theory package", () => {
  const packagePath = "packages/theories/theory-packages/exact-one-capability.json";
  const semanticDigest = "sha256:f5688125437b19929b78f813b74a6595e09d92fdfd8ac6005066ff1cb3557071";

  test("resolves the canonical package by identity, version, and digest", async () => {
    const encoded = await Bun.file(packagePath).text();
    const decoded = decodeExactOneCapabilityExecutionPackage(encoded);
    expect(decoded).toEqual(ExactOneCapabilityExecutionPackage);

    const resolved = await Effect.runPromise(
      Effect.provideService(
        resolveExactOneCapabilityExecutionPackage(encoded, {
          path: packagePath,
          id: "ExactOneCapabilityExecution",
          version: 1,
          semanticDigest,
        }),
        Crypto.Crypto,
        normalizationCrypto,
      ),
    );
    expect(resolved.semanticDigest).toBe(semanticDigest);
    expect(resolved.package.evaluator.id).toBe("ExactOneCapabilityExecutionEvaluator");

    const lock = makeExactOneCapabilityExecutionLock("m030-test", packagePath, resolved);
    expect(JSON.parse(encodeExactOneCapabilityExecutionLock(lock))).toEqual(lock);
  });

  test("rejects a mismatched package digest before evaluation", async () => {
    const encoded = await Bun.file(packagePath).text();
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provideService(
          resolveExactOneCapabilityExecutionPackage(encoded, {
            path: packagePath,
            id: "ExactOneCapabilityExecution",
            version: 1,
            semanticDigest:
              "sha256:0000000000000000000000000000000000000000000000000000000000000000",
          }),
          Crypto.Crypto,
          normalizationCrypto,
        ),
      ),
    );
    expect(error.reason).toBe("digest-mismatch");
  });

  test("rejects evaluator output that disagrees with package meaning", async () => {
    const packageValue = decodeExactOneCapabilityExecutionPackage(
      await Bun.file(
        "packages/theories/theory-packages/invalid/evaluator-disagreement.json",
      ).text(),
    );
    const error = await Effect.runPromise(
      Effect.flip(
        verifyExactOneCapabilityExecutionPackageResult(packageValue, await makeTheoryResult()),
      ),
    );
    expect(error.reason).toBe("evaluator-disagreement");
  });
});
