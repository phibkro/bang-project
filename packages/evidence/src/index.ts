import {
  deriveStateInvariantObligations,
  encodeCanonicalJson,
  type CheckedCoreDocument,
  type StateInvariantObligation,
  validateCore,
} from "@bang/core";
import { sourceToCore } from "@bang/surface";
import {
  LEAN_ARCHIVE_SHA256,
  LEAN_IMPORTED_MODULE,
  LEAN_PROVIDER_COMMAND,
  LEAN_VERSION,
  RelationalObligationSchema,
  checkRelationalObligation,
  type RelationalObligation,
} from "@bang/obligations";
import { Crypto, Effect, Encoding, FileSystem, Schema } from "effect";

const ObligationReference = Schema.Struct({
  id: Schema.String,
  stateMachine: Schema.String,
  operation: Schema.String,
  relation: Schema.Literals(["establishes", "preserves"]),
  invariant: Schema.String,
});

const Counterexample = Schema.Unknown;

const Observation = Schema.Struct({
  class: Schema.Literal("property-tested"),
  result: Schema.Literals(["passed", "failed"]),
  scope: Schema.Literal("sampled"),
  requestedCases: Schema.Natural,
  executedCases: Schema.Natural,
  seed: Schema.Int,
  shrinkCount: Schema.Natural,
  counterexample: Schema.optional(Counterexample),
  replayPath: Schema.optional(Schema.String),
}).check(
  Schema.makeFilter((observation) => observation.executedCases <= observation.requestedCases, {
    expected: "executedCases to be at most requestedCases",
  }),
);

const Provenance = Schema.Struct({
  coreSource: Schema.String,
  generatedKit: Schema.String,
  realization: Schema.String,
  evaluator: Schema.String,
});

const Producer = Schema.Struct({
  identity: Schema.String,
  trust: Schema.Literal("assumed-truthful"),
});

const Environment = Schema.Struct({
  toolVersions: Schema.Record(Schema.String, Schema.String),
  target: Schema.Struct({
    name: Schema.String,
    version: Schema.String,
  }),
});

const UnsupportedClaim = Schema.Struct({
  claim: Schema.String,
  reason: Schema.String,
});

const Qualification = Schema.Struct({
  assumptions: Schema.Array(Schema.String),
  unsupportedClaims: Schema.Array(UnsupportedClaim),
  lifetime: Schema.String,
  invalidators: Schema.Array(Schema.String),
});

/** The checked-shape input for one sampled property-test observation. */
export const PropertyTestEvidenceRecord = Schema.Struct({
  obligation: ObligationReference,
  observation: Observation,
  provenance: Provenance,
  producer: Producer,
  environment: Environment,
  qualification: Qualification,
});

/** The public unbranded record type decoded by `PropertyTestEvidenceRecord`. */
export type PropertyTestEvidenceRecord = typeof PropertyTestEvidenceRecord.Type;

/** The JSON string boundary for property-test evidence records. */
export const PropertyTestEvidenceRecordFromJson = Schema.fromJsonString(PropertyTestEvidenceRecord);

const CheckedPropertyTestEvidenceRecordSchema = PropertyTestEvidenceRecord.pipe(
  Schema.brand("CheckedPropertyTestEvidenceRecord"),
);

/** A property-test record whose obligation reference has been checked against Core. */
export type CheckedPropertyTestEvidenceRecord = typeof CheckedPropertyTestEvidenceRecordSchema.Type;

export class EvidenceError extends Schema.TaggedError<EvidenceError>()("EvidenceError", {
  reason: Schema.Literals(["invalid-record", "unknown-obligation", "inconsistent-obligation"]),
  obligationId: Schema.String,
  message: Schema.String,
}) {}

const sameObligationComponents = (
  reference: PropertyTestEvidenceRecord["obligation"],
  obligation: StateInvariantObligation,
): boolean =>
  reference.stateMachine === obligation.stateMachine &&
  reference.operation === obligation.operation &&
  reference.relation === obligation.relation &&
  reference.invariant === obligation.invariant;

/** Check one evidence record against normalized Core obligations. */
export const checkPropertyTestEvidenceRecord = (
  record: PropertyTestEvidenceRecord,
  obligations: ReadonlyArray<StateInvariantObligation>,
): Effect.Effect<CheckedPropertyTestEvidenceRecord, EvidenceError> => {
  const obligation = obligations.find(({ id }) => id === record.obligation.id);
  if (obligation === undefined) {
    return Effect.fail(
      new EvidenceError({
        reason: "unknown-obligation",
        obligationId: record.obligation.id,
        message: `evidence references unknown obligation ${record.obligation.id}`,
      }),
    );
  }
  if (!sameObligationComponents(record.obligation, obligation)) {
    return Effect.fail(
      new EvidenceError({
        reason: "inconsistent-obligation",
        obligationId: record.obligation.id,
        message: `evidence obligation ${record.obligation.id} has inconsistent source components`,
      }),
    );
  }
  return Schema.decodeEffect(CheckedPropertyTestEvidenceRecordSchema)(record).pipe(
    Effect.mapError(
      (issue) =>
        new EvidenceError({
          reason: "invalid-record",
          obligationId: record.obligation.id,
          message: String(issue),
        }),
    ),
  );
};

const renderValue = (value: unknown): string => {
  try {
    return String(value);
  } catch {
    return "<unprintable>";
  }
};

const renderList = (values: ReadonlyArray<string>): string =>
  values.length === 0 ? "none" : values.join("; ");

const renderToolVersions = (versions: Readonly<Record<string, string>>): string => {
  const entries = Object.entries(versions).toSorted(([left], [right]) => left.localeCompare(right));
  return entries.length === 0
    ? "none"
    : entries.map(([name, version]) => `${name} ${version}`).join(", ");
};

/** Format checked evidence without implying that its producer was truthful. */
export const formatPropertyTestEvidenceReport = (
  checked: CheckedPropertyTestEvidenceRecord,
): string => {
  const { obligation, observation, provenance, producer, environment, qualification } = checked;
  const lines = [
    `Obligation: ${obligation.id}`,
    `Source: state machine ${obligation.stateMachine}, operation ${obligation.operation}, relation ${obligation.relation}, invariant ${obligation.invariant}`,
    `Evidence: ${observation.class}, result ${observation.result}, scope ${observation.scope}`,
    `Cases: ${observation.executedCases}/${observation.requestedCases} executed, seed ${observation.seed}, shrinks ${observation.shrinkCount}`,
    `Provenance: Core ${provenance.coreSource}; generated kit ${provenance.generatedKit}; realization ${provenance.realization}; evaluator ${provenance.evaluator}`,
    `Producer: ${producer.identity}; trust ${producer.trust}; truthfulness is not proven by this report`,
    `Environment: tools ${renderToolVersions(environment.toolVersions)}; target ${environment.target.name} ${environment.target.version}`,
    `Assumptions: ${renderList(qualification.assumptions)}`,
    `Unsupported claims: ${
      qualification.unsupportedClaims.length === 0
        ? "none"
        : qualification.unsupportedClaims
            .map(({ claim, reason }) => `${claim} (${reason})`)
            .join("; ")
    }`,
    `Lifetime: ${qualification.lifetime}`,
    `Invalidators: ${renderList(qualification.invalidators)}`,
  ];
  if (observation.counterexample !== undefined) {
    lines.push(`Counterexample: ${renderValue(observation.counterexample)}`);
  }
  if (observation.replayPath !== undefined) {
    lines.push(`Replay path: ${observation.replayPath}`);
  }
  return lines.join("\n");
};
/** The externally tagged event union for one invocation's finite runtime trace. */
export const RuntimeTraceEvent = Schema.TaggedUnion({
  Started: {
    sequence: Schema.Literal(0),
    invocationId: Schema.String,
    operationId: Schema.String,
    preState: Schema.Unknown,
    input: Schema.Unknown,
  },
  Succeeded: {
    sequence: Schema.Literal(1),
    invocationId: Schema.String,
    postState: Schema.Unknown,
  },
  TypedFailure: {
    sequence: Schema.Literal(1),
    invocationId: Schema.String,
    failureId: Schema.String,
  },
  Defect: {
    sequence: Schema.Literal(1),
    invocationId: Schema.String,
    defect: Schema.String,
  },
});

export type RuntimeTraceEvent = typeof RuntimeTraceEvent.Type;

const FirstRuntimeTraceViolation = Schema.Struct({
  eventIndex: Schema.Natural,
  reason: Schema.String,
});

const RuntimeTraceObservation = Schema.Struct({
  class: Schema.Literal("runtime-monitored"),
  result: Schema.Literals(["conforming", "violated"]),
  scope: Schema.Literal("single-closed-trace"),
  invocationId: Schema.String,
  operationId: Schema.String,
  events: Schema.Array(RuntimeTraceEvent),
  firstViolation: Schema.optional(FirstRuntimeTraceViolation),
}).check(
  Schema.makeFilter(
    (observation) => {
      if (observation.events.length !== 2) return false;
      const [started, terminal] = observation.events;
      if (started === undefined || terminal === undefined) return false;
      if (
        started._tag !== "Started" ||
        started.sequence !== 0 ||
        terminal._tag === "Started" ||
        terminal.sequence !== 1 ||
        started.invocationId !== observation.invocationId ||
        terminal.invocationId !== observation.invocationId ||
        started.operationId !== observation.operationId
      ) {
        return false;
      }
      if (observation.firstViolation !== undefined && observation.firstViolation.eventIndex !== 1) {
        return false;
      }
      return (
        (observation.result === "conforming" && observation.firstViolation === undefined) ||
        (observation.result === "violated" && observation.firstViolation !== undefined)
      );
    },
    {
      expected:
        "a single closed trace with Started at sequence 0, one terminal at sequence 1, matching identities, and consistent result",
    },
  ),
);

/** The checked-shape input for one monitored closed runtime trace. */
export const RuntimeTraceEvidenceRecord = Schema.Struct({
  obligation: ObligationReference,
  observation: RuntimeTraceObservation,
  provenance: Provenance,
  producer: Producer,
  environment: Environment,
  qualification: Qualification,
});

/** The public unbranded record type decoded by `RuntimeTraceEvidenceRecord`. */
export type RuntimeTraceEvidenceRecord = typeof RuntimeTraceEvidenceRecord.Type;

/** The JSON string boundary for runtime trace evidence records. */
export const RuntimeTraceEvidenceRecordFromJson = Schema.fromJsonString(RuntimeTraceEvidenceRecord);

const CheckedRuntimeTraceEvidenceRecordSchema = RuntimeTraceEvidenceRecord.pipe(
  Schema.brand("CheckedRuntimeTraceEvidenceRecord"),
);

/** A runtime trace record whose obligation reference has been checked against Core. */
export type CheckedRuntimeTraceEvidenceRecord = typeof CheckedRuntimeTraceEvidenceRecordSchema.Type;

/** Check one runtime trace record against normalized Core obligations. */
export const checkRuntimeTraceEvidenceRecord = (
  record: RuntimeTraceEvidenceRecord,
  obligations: ReadonlyArray<StateInvariantObligation>,
): Effect.Effect<CheckedRuntimeTraceEvidenceRecord, EvidenceError> => {
  const obligation = obligations.find(({ id }) => id === record.obligation.id);
  if (obligation === undefined) {
    return Effect.fail(
      new EvidenceError({
        reason: "unknown-obligation",
        obligationId: record.obligation.id,
        message: `evidence references unknown obligation ${record.obligation.id}`,
      }),
    );
  }
  if (!sameObligationComponents(record.obligation, obligation)) {
    return Effect.fail(
      new EvidenceError({
        reason: "inconsistent-obligation",
        obligationId: record.obligation.id,
        message: `evidence obligation ${record.obligation.id} has inconsistent source components`,
      }),
    );
  }
  return Schema.decodeEffect(CheckedRuntimeTraceEvidenceRecordSchema)(record).pipe(
    Effect.mapError(
      (issue) =>
        new EvidenceError({
          reason: "invalid-record",
          obligationId: record.obligation.id,
          message: String(issue),
        }),
    ),
  );
};

const formatRuntimeTraceEvent = (event: RuntimeTraceEvent): string => {
  switch (event._tag) {
    case "Started":
      return `Started [${event.sequence}] invocation ${event.invocationId}, operation ${event.operationId}, pre-state ${renderValue(event.preState)}, input ${renderValue(event.input)}`;
    case "Succeeded":
      return `Succeeded [${event.sequence}] invocation ${event.invocationId}, post-state ${renderValue(event.postState)}`;
    case "TypedFailure":
      return `TypedFailure [${event.sequence}] invocation ${event.invocationId}, failure ${event.failureId}`;
    case "Defect":
      return `Defect [${event.sequence}] invocation ${event.invocationId}, defect ${event.defect}`;
  }
};

/** Format checked runtime evidence without implying that its producer was truthful. */
export const formatRuntimeTraceEvidenceReport = (
  checked: CheckedRuntimeTraceEvidenceRecord,
): string => {
  const { obligation, observation, provenance, producer, environment, qualification } = checked;
  const lines = [
    `Obligation: ${obligation.id}`,
    `Source: state machine ${obligation.stateMachine}, operation ${obligation.operation}, relation ${obligation.relation}, invariant ${obligation.invariant}`,
    `Evidence: ${observation.class}, result ${observation.result}, scope ${observation.scope}`,
    `Invocation: ${observation.invocationId}`,
    `Operation: ${observation.operationId}`,
    "Events:",
    ...observation.events.map(formatRuntimeTraceEvent),
    `First violation: ${
      observation.firstViolation === undefined
        ? "none"
        : `event ${observation.firstViolation.eventIndex}, ${observation.firstViolation.reason}`
    }`,
    `Provenance: Core ${provenance.coreSource}; generated kit ${provenance.generatedKit}; realization ${provenance.realization}; evaluator ${provenance.evaluator}`,
    `Producer: ${producer.identity}; trust ${producer.trust}; truthfulness is not proven by this report`,
    `Environment: tools ${renderToolVersions(environment.toolVersions)}; target ${environment.target.name} ${environment.target.version}`,
    `Assumptions: ${renderList(qualification.assumptions)}`,
    `Unsupported claims: ${
      qualification.unsupportedClaims.length === 0
        ? "none"
        : qualification.unsupportedClaims
            .map(({ claim, reason }) => `${claim} (${reason})`)
            .join("; ")
    }`,
    `Lifetime: ${qualification.lifetime}`,
    `Invalidators: ${renderList(qualification.invalidators)}`,
  ];
  return lines.join("\n");
};
/**
 * The strict M010 property-test replay envelope.
 *
 * The envelope is intentionally narrower than the historical M007 record. It
 * binds the record to an explicit, byte-digested input closure and to one
 * normalized Core obligation.
 */
const ReplayInput = Schema.Struct({
  role: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  path: Schema.String.pipe(
    Schema.check(Schema.isNonEmpty()),
    Schema.check(
      Schema.makeFilter((path) => !path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path), {
        expected: "a repository-relative path",
      }),
    ),
  ),
  sha256: Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/))),
});

export const M010ReplayInput = ReplayInput;
export type M010ReplayInput = typeof M010ReplayInput.Type;

const ReplayConfiguration = Schema.Struct({
  argv: Schema.NonEmptyArray(Schema.String),
  obligationId: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  requestedCases: Schema.Natural,
  seed: Schema.Int,
});

export type M010ReplayConfiguration = typeof ReplayConfiguration.Type;

const M010Qualification = Schema.Struct({
  inputClosure: Schema.Literal("declared-not-proven-complete"),
  producerTruth: Schema.Literal("assumed-truthful"),
  unsafeBoundary: Schema.Literal("bypassable"),
});

export type M010Qualification = typeof M010Qualification.Type;

const M010ReplayManifestSchema = Schema.Struct({
  bangEvidence: Schema.Literal(1),
  kind: Schema.Literal("property-test-replay"),
  inputs: Schema.Array(ReplayInput).pipe(
    Schema.check(
      Schema.makeFilter((inputs) => inputs.length > 0, {
        expected: "a nonempty recorded input closure",
      }),
    ),
  ),
  coreInput: Schema.Struct({
    path: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  }),
  record: PropertyTestEvidenceRecord,
  replay: ReplayConfiguration,
  qualification: M010Qualification,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const M010ReplayManifest = M010ReplayManifestSchema;
export type M010ReplayManifest = typeof M010ReplayManifest.Type;

export const M010ReplayManifestFromJson = Schema.fromJsonString(M010ReplayManifestSchema);

export type M010ReplayFailureReason =
  | "invalid-manifest"
  | "missing-input"
  | "stale-input"
  | "unknown-obligation"
  | "replay-failed"
  | "replay-mismatch";

/** Typed failures emitted by the M010 loader and replay boundary. */
export class M010ReplayError extends Schema.TaggedError<M010ReplayError>()("M010ReplayError", {
  reason: Schema.Literals([
    "invalid-manifest",
    "missing-input",
    "stale-input",
    "unknown-obligation",
    "replay-failed",
    "replay-mismatch",
  ]),
  path: Schema.optional(Schema.String),
  obligationId: Schema.optional(Schema.String),
  message: Schema.String,
}) {}

const m010Error = (
  reason: M010ReplayFailureReason,
  message: string,
  fields?: { readonly path?: string; readonly obligationId?: string },
): M010ReplayError =>
  new M010ReplayError({
    reason,
    message,
    ...(fields?.path === undefined ? {} : { path: fields.path }),
    ...(fields?.obligationId === undefined ? {} : { obligationId: fields.obligationId }),
  });

const decodeM010ManifestValue = (value: unknown) =>
  Schema.decodeUnknownEffect(M010ReplayManifestSchema)(value, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      m010Error("invalid-manifest", `invalid M010 replay manifest: ${String(issue)}`),
    ),
    Effect.flatMap((manifest) => {
      const coreEntries = manifest.inputs.filter(({ path }) => path === manifest.coreInput.path);
      const distinctPaths = new Set(manifest.inputs.map(({ path }) => path));
      const consistent =
        coreEntries.length === 1 &&
        distinctPaths.size === manifest.inputs.length &&
        manifest.record.obligation.id === manifest.replay.obligationId &&
        manifest.record.observation.requestedCases === manifest.replay.requestedCases &&
        manifest.record.observation.seed === manifest.replay.seed;
      return consistent
        ? Effect.succeed(manifest)
        : Effect.fail(
            m010Error(
              "invalid-manifest",
              "M010 replay manifest must name one unique core input and keep obligation, case, and seed identities consistent",
            ),
          );
    }),
  );

/** Decode either a JSON string or an already parsed strict M010 envelope. */
export const decodeM010ReplayManifest = (
  input: unknown,
): Effect.Effect<M010ReplayManifest, M010ReplayError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M010ReplayManifestFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          m010Error("invalid-manifest", `invalid M010 replay manifest: ${String(issue)}`),
        ),
        Effect.flatMap((manifest) => decodeM010ManifestValue(manifest)),
      )
    : decodeM010ManifestValue(input);

const readM010Text = Effect.fn("readM010Text")(function* (path: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.readFileString(path);
});

/** Load and strictly decode an M010 manifest from a repository-relative path. */
export const loadM010Manifest = Effect.fn("loadM010Manifest")(function* (
  path: string,
): Effect.fn.Return<M010ReplayManifest, M010ReplayError, FileSystem.FileSystem> {
  const input = yield* readM010Text(path).pipe(
    Effect.mapError(() =>
      m010Error("missing-input", `manifest input is missing: ${path}`, { path }),
    ),
  );
  return yield* decodeM010ReplayManifest(input);
});

const digestM010Bytes = Effect.fn("digestM010Bytes")(function* (bytes: Uint8Array) {
  const crypto = yield* Crypto.Crypto;
  return Encoding.encodeHex(yield* crypto.digest("SHA-256", bytes));
});

const verifyM010Input = Effect.fn("verifyM010Input")(function* (
  input: M010ReplayInput,
): Effect.fn.Return<void, M010ReplayError, FileSystem.FileSystem | Crypto.Crypto> {
  const fileSystem = yield* FileSystem.FileSystem;
  const bytes = yield* fileSystem.readFile(input.path).pipe(
    Effect.mapError(() =>
      m010Error("missing-input", `recorded input is missing: ${input.path}`, {
        path: input.path,
      }),
    ),
  );
  const observed = yield* digestM010Bytes(bytes).pipe(
    Effect.mapError(() =>
      m010Error("stale-input", `could not compute SHA-256 for recorded input: ${input.path}`, {
        path: input.path,
      }),
    ),
  );
  if (observed !== input.sha256) {
    return yield* m010Error(
      "stale-input",
      `recorded input digest differs for ${input.path}: expected ${input.sha256}, observed ${observed}`,
      { path: input.path },
    );
  }
});

/** Verify every recorded input against the exact bytes currently on disk. */
export const verifyM010Inputs = Effect.fn("verifyM010Inputs")(function* (
  manifest: M010ReplayManifest,
): Effect.fn.Return<void, M010ReplayError, FileSystem.FileSystem | Crypto.Crypto> {
  for (const input of manifest.inputs) {
    yield* verifyM010Input(input);
  }
});

/** Parse and validate the recorded source after verifying its complete input closure. */
export const loadM010Core = Effect.fn("loadM010Core")(function* (
  manifest: M010ReplayManifest,
): Effect.fn.Return<CheckedCoreDocument, M010ReplayError, FileSystem.FileSystem | Crypto.Crypto> {
  yield* verifyM010Inputs(manifest);
  const coreText = yield* readM010Text(manifest.coreInput.path).pipe(
    Effect.mapError(() =>
      m010Error("missing-input", `recorded Core input is missing: ${manifest.coreInput.path}`, {
        path: manifest.coreInput.path,
      }),
    ),
  );
  const coreDocument = yield* Effect.fromResult(sourceToCore(coreText)).pipe(
    Effect.mapError((error) =>
      m010Error(
        "invalid-manifest",
        `recorded source input is not valid BANG source: ${error.message}`,
        { path: manifest.coreInput.path },
      ),
    ),
  );
  return yield* validateCore(coreDocument).pipe(
    Effect.mapError((error) =>
      m010Error(
        "invalid-manifest",
        `recorded source input lowers to invalid Core: ${error.message}`,
        { path: manifest.coreInput.path },
      ),
    ),
  );
});

/** Select an obligation derived from the checked Core document. */
export const selectM010Obligation = (
  manifest: M010ReplayManifest,
  checkedCore: CheckedCoreDocument,
): Effect.Effect<StateInvariantObligation, M010ReplayError> => {
  const obligation = deriveStateInvariantObligations(checkedCore).find(
    ({ id }) => id === manifest.replay.obligationId,
  );
  if (
    obligation === undefined ||
    !sameObligationComponents(manifest.record.obligation, obligation)
  ) {
    return Effect.fail(
      m010Error(
        "unknown-obligation",
        `checked Core does not derive replay obligation ${manifest.replay.obligationId}`,
        { obligationId: manifest.replay.obligationId },
      ),
    );
  }
  return Effect.succeed(obligation);
};

const sameM010ObservationValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameM010ObservationValue(value, right[index]));
  }
  if (typeof left === "object" && typeof right === "object") {
    try {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      const leftKeys = Object.keys(leftRecord).toSorted();
      const rightKeys = Object.keys(rightRecord).toSorted();
      return (
        leftKeys.length === rightKeys.length &&
        leftKeys.every(
          (key, index) =>
            key === rightKeys[index] && sameM010ObservationValue(leftRecord[key], rightRecord[key]),
        )
      );
    } catch {
      return false;
    }
  }
  return false;
};

/** Compare all replay-observable fields, including optional counterexample metadata. */
export const compareM010Observation = (
  expected: PropertyTestEvidenceRecord["observation"],
  actual: PropertyTestEvidenceRecord["observation"],
  obligationId = "",
): Effect.Effect<void, M010ReplayError> => {
  const same =
    expected.class === actual.class &&
    expected.result === actual.result &&
    expected.scope === actual.scope &&
    expected.requestedCases === actual.requestedCases &&
    expected.executedCases === actual.executedCases &&
    expected.seed === actual.seed &&
    expected.shrinkCount === actual.shrinkCount &&
    sameM010ObservationValue(expected.counterexample, actual.counterexample) &&
    sameM010ObservationValue(expected.replayPath, actual.replayPath);
  return same
    ? Effect.succeed(void 0)
    : Effect.fail(
        m010Error(
          "replay-mismatch",
          `replayed observation differs from the recorded observation for ${
            obligationId.length === 0 ? "the selected obligation" : obligationId
          }`,
          obligationId.length === 0 ? undefined : { obligationId },
        ),
      );
};

const formatM010Observation = (observation: PropertyTestEvidenceRecord["observation"]): string =>
  [
    `result ${observation.result}, scope ${observation.scope}`,
    `cases ${observation.executedCases}/${observation.requestedCases}`,
    `seed ${observation.seed}`,
    `shrinks ${observation.shrinkCount}`,
    `counterexample ${renderValue(observation.counterexample)}`,
    `replay path ${observation.replayPath ?? "none"}`,
  ].join(", ");

/** Format an accepted replay while retaining sampled scope and trust limitations. */
export const formatM010AcceptedReport = (
  manifest: M010ReplayManifest,
  checkedCore: CheckedCoreDocument,
  obligation: StateInvariantObligation,
  observation: PropertyTestEvidenceRecord["observation"] = manifest.record.observation,
): string =>
  [
    "M010 replay accepted",
    `Obligation: ${obligation.id}`,
    `Core input: ${manifest.coreInput.path} (source parsed, lowered, and checked)`,
    `Recorded inputs: ${manifest.inputs.map(({ path, sha256 }) => `${path} [${sha256}]`).join("; ")}`,
    `Replay: ${manifest.replay.argv.join(" ")}`,
    `Observation: ${formatM010Observation(observation)}`,
    `Qualification: input closure ${manifest.qualification.inputClosure}; producer truth ${manifest.qualification.producerTruth}; unsafe boundary ${manifest.qualification.unsafeBoundary}`,
    `Core declarations: ${checkedCore.declarations.length}`,
    "Sampled property evidence is not a proof; producer truthfulness and closure completeness remain assumptions.",
  ].join("\n");

/** Format a typed replay rejection without dropping its failure identity. */
export const formatM010RejectedReport = (error: M010ReplayError): string =>
  [
    "M010 replay rejected",
    `Reason: ${error.reason}`,
    ...(error.path === undefined ? [] : [`Path: ${error.path}`]),
    ...(error.obligationId === undefined ? [] : [`Obligation: ${error.obligationId}`]),
    `Diagnostic: ${error.message}`,
  ].join("\n");

/**
 * M011's strict, versioned solver-reported evidence envelope.
 *
 * The normalized obligation is imported from `@bang/obligations`; this package
 * only describes the provider observation and its qualifications.
 */
const M011ProviderResultSchema = Schema.Struct({
  obligationId: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  variant: Schema.Literals(["lawful", "faulty"]),
  status: Schema.Literals(["sat", "unsat", "unknown"]),
  result: Schema.Literals(["bounded-counterexample", "bounded-no-counterexample", "inconclusive"]),
  model: Schema.optional(Schema.Record(Schema.String, Schema.Int)),
  z3Version: Schema.optional(Schema.String.pipe(Schema.check(Schema.isNonEmpty()))),
});

const M011CounterexampleSchema = Schema.Struct({
  model: Schema.Record(Schema.String, Schema.Int),
  beforeTotal: Schema.Int,
  afterTotal: Schema.Int,
});

const M011ProviderSchema = Schema.Struct({
  name: Schema.Literal("z3"),
  version: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
});

const M011TimeoutSchema = Schema.Struct({
  solverMs: Schema.Literal(2000),
  processMs: Schema.Literal(5000),
});
const M011TrustSchema = Schema.Struct({
  class: Schema.Literal("solver-reported"),
  producer: Schema.Literal("z3"),
  limitations: Schema.Array(Schema.String),
});

const M011ObservationSchema = Schema.Struct({
  obligation: RelationalObligationSchema,
  result: M011ProviderResultSchema,
  smtLibSha256: Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/))),
  counterexample: Schema.optional(M011CounterexampleSchema),
});

const M011SolverEvidenceManifestSchema = Schema.Struct({
  bangEvidence: Schema.Literal(1),
  kind: Schema.Literal("solver-reported"),
  observations: Schema.Array(M011ObservationSchema),
  provider: M011ProviderSchema,
  timeouts: M011TimeoutSchema,
  trust: M011TrustSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict versioned M011 solver-reported evidence manifest. */
export const M011SolverEvidenceManifest = M011SolverEvidenceManifestSchema;
export type M011SolverEvidenceManifest = typeof M011SolverEvidenceManifest.Type;

/** The JSON string boundary for strict M011 solver evidence. */
export const M011SolverEvidenceManifestFromJson = Schema.fromJsonString(
  M011SolverEvidenceManifestSchema,
);

export type M011SolverEvidenceFailureReason = "invalid-manifest" | "impossible-result";

/** Typed failures from the M011 evidence decoding and consistency boundary. */
export class M011SolverEvidenceError extends Schema.TaggedError<M011SolverEvidenceError>()(
  "M011SolverEvidenceError",
  {
    reason: Schema.Literals(["invalid-manifest", "impossible-result"]),
    obligationId: Schema.optional(Schema.String),
    message: Schema.String,
  },
) {}

const m011EvidenceError = (
  reason: M011SolverEvidenceFailureReason,
  message: string,
  obligationId?: string,
): M011SolverEvidenceError =>
  new M011SolverEvidenceError({
    reason,
    message,
    ...(obligationId === undefined ? {} : { obligationId }),
  });

const sortedRecordEntries = (record: Readonly<Record<string, number>>) =>
  Object.entries(record).toSorted(([left], [right]) => left.localeCompare(right));

const sameM011Model = (
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean => {
  const leftEntries = sortedRecordEntries(left);
  const rightEntries = sortedRecordEntries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(
      ([name, value], index) =>
        rightEntries[index]?.[0] === name && rightEntries[index]?.[1] === value,
    )
  );
};

const checkM011ModelIdentity = (
  obligation: RelationalObligation,
  model: Readonly<Record<string, number>>,
): boolean => {
  const expected = obligation.variables.map(({ id }) => id).toSorted();
  const actual = Object.keys(model).toSorted();
  return expected.length === actual.length && expected.every((id, index) => id === actual[index]);
};

const validateM011Counterexample = (
  obligation: RelationalObligation,
  resultModel: Readonly<Record<string, number>> | undefined,
  counterexample: typeof M011CounterexampleSchema.Type | undefined,
): boolean => {
  if (resultModel === undefined || counterexample === undefined) return false;
  if (
    !checkM011ModelIdentity(obligation, resultModel) ||
    !checkM011ModelIdentity(obligation, counterexample.model) ||
    !sameM011Model(resultModel, counterexample.model)
  ) {
    return false;
  }
  const { model } = counterexample;
  const sourceBefore = model.sourceBefore;
  const targetBefore = model.targetBefore;
  const sourceAfter = model.sourceAfter;
  const targetAfter = model.targetAfter;
  return (
    sourceBefore !== undefined &&
    targetBefore !== undefined &&
    sourceAfter !== undefined &&
    targetAfter !== undefined &&
    sourceBefore + targetBefore === counterexample.beforeTotal &&
    sourceAfter + targetAfter === counterexample.afterTotal
  );
};

const validateM011Manifest = (
  manifest: M011SolverEvidenceManifest,
): Effect.Effect<M011SolverEvidenceManifest, M011SolverEvidenceError> => {
  const variants = new Set<string>();
  for (const observation of manifest.observations) {
    const { obligation, result, counterexample } = observation;
    const obligationId = obligation.id;
    if (variants.has(obligation.variant)) {
      return Effect.fail(
        m011EvidenceError(
          "impossible-result",
          "M011 manifest must contain one observation for each lawful and faulty variant",
          obligationId,
        ),
      );
    }
    variants.add(obligation.variant);
    if (result.obligationId !== obligation.id || result.variant !== obligation.variant) {
      return Effect.fail(
        m011EvidenceError(
          "impossible-result",
          "provider result identity does not match the normalized obligation",
          obligationId,
        ),
      );
    }
    if (result.z3Version !== undefined && result.z3Version !== manifest.provider.version) {
      return Effect.fail(
        m011EvidenceError(
          "impossible-result",
          "provider result version does not match the manifest provider version",
          obligationId,
        ),
      );
    }

    const statusMatchesResult =
      (result.status === "sat" && result.result === "bounded-counterexample") ||
      (result.status === "unsat" && result.result === "bounded-no-counterexample") ||
      (result.status === "unknown" && result.result === "inconclusive");
    if (!statusMatchesResult) {
      return Effect.fail(
        m011EvidenceError(
          "impossible-result",
          `provider status ${result.status} cannot produce result ${result.result}`,
          obligationId,
        ),
      );
    }

    if (result.result === "bounded-counterexample") {
      if (!validateM011Counterexample(obligation, result.model, counterexample)) {
        return Effect.fail(
          m011EvidenceError(
            "impossible-result",
            "bounded-counterexample requires a complete checked provider model",
            obligationId,
          ),
        );
      }
    } else if (result.model !== undefined || counterexample !== undefined) {
      return Effect.fail(
        m011EvidenceError(
          "impossible-result",
          `${result.result} cannot carry a model or counterexample`,
          obligationId,
        ),
      );
    }
  }
  if (manifest.observations.length !== 2 || !variants.has("lawful") || !variants.has("faulty")) {
    return Effect.fail(
      m011EvidenceError(
        "impossible-result",
        "M011 manifest must contain exactly one lawful and one faulty observation",
      ),
    );
  }
  return Effect.succeed(manifest);
};

const decodeM011SolverEvidenceManifestValue = (
  value: unknown,
): Effect.Effect<M011SolverEvidenceManifest, M011SolverEvidenceError> =>
  Schema.decodeUnknownEffect(M011SolverEvidenceManifestSchema)(value, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      m011EvidenceError(
        "invalid-manifest",
        `invalid M011 solver evidence manifest: ${String(issue)}`,
      ),
    ),
    Effect.flatMap(validateM011Manifest),
  );

/** Decode a JSON string or parsed strict M011 solver evidence manifest. */
export const decodeM011SolverEvidenceManifest = (
  input: unknown,
): Effect.Effect<M011SolverEvidenceManifest, M011SolverEvidenceError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M011SolverEvidenceManifestFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          m011EvidenceError(
            "invalid-manifest",
            `invalid M011 solver evidence manifest: ${String(issue)}`,
          ),
        ),
        Effect.flatMap(validateM011Manifest),
      )
    : decodeM011SolverEvidenceManifestValue(input);

const formatM011Model = (model: Readonly<Record<string, number>>): string =>
  sortedRecordEntries(model)
    .map(([name, value]) => `${name}=${value}`)
    .join(", ");

const m011VariantOrder = (variant: "lawful" | "faulty"): number => (variant === "lawful" ? 0 : 1);

/** Format M011 evidence without overstating bounded solver output as a proof. */
export const formatM011SolverEvidenceReport = (manifest: M011SolverEvidenceManifest): string => {
  const observations = manifest.observations.toSorted(
    (left, right) =>
      m011VariantOrder(left.obligation.variant) - m011VariantOrder(right.obligation.variant),
  );
  const lines = [
    "M011 solver-reported evidence",
    `Provider: ${manifest.provider.name} ${manifest.provider.version}`,
    `Timeouts: solver ${manifest.timeouts.solverMs} ms; process ${manifest.timeouts.processMs} ms`,
  ];
  for (const { obligation, result, smtLibSha256, counterexample } of observations) {
    const bounds = obligation.variables
      .toSorted((left, right) => left.id.localeCompare(right.id))
      .map(({ id, lower, upper }) => `${id} in [${lower}, ${upper}]`)
      .join("; ");
    lines.push(
      `Obligation: ${obligation.id} (${obligation.variant})`,
      `Source: Core ${obligation.source.core}; bridge ${obligation.source.bridge}; relation ${obligation.source.relation}`,
      `Bounds: ${bounds}`,
      `SMT-LIB SHA-256: ${smtLibSha256}`,
      `Result: ${result.result} (${result.status})`,
      `Z3: ${result.z3Version}`,
    );
    if (result.model !== undefined) lines.push(`Model: ${formatM011Model(result.model)}`);
    if (counterexample !== undefined) {
      lines.push(
        `Counterexample totals: before ${counterexample.beforeTotal}; after ${counterexample.afterTotal}`,
        `Checked counterexample: ${formatM011Model(counterexample.model)}`,
      );
    }
  }
  lines.push(
    `Trust: ${manifest.trust.class}; producer ${manifest.trust.producer}`,
    `Limitations: ${
      manifest.trust.limitations.length === 0
        ? "none"
        : manifest.trust.limitations.toSorted().join("; ")
    }`,
    "Qualification: all results are bounded and solver-reported; no result is an unbounded proof.",
  );
  return lines.join("\n");
};

/**
 * The strict legacy M005 bridge-law evidence envelope.
 *
 * M005 predates the normalized evidence records. Its shape is retained here
 * instead of being flattened into a universal evidence representation.
 */
const M005BridgePropertyObservationSchema = Schema.Struct({
  class: Schema.Literal("property-tested"),
  obligation: Schema.String,
  realizations: Schema.Array(Schema.String),
  result: Schema.Literals(["passed", "failed"]),
  requestedCases: Schema.Natural,
  executedRuns: Schema.Natural,
  seed: Schema.Int,
  numShrinks: Schema.optional(Schema.Natural),
  counterexamplePath: Schema.optional(Schema.String),
  counterexample: Schema.optional(Schema.Unknown),
});

const M005BridgeUnsupportedObservationSchema = Schema.Struct({
  class: Schema.Literal("unsupported-by-target"),
  obligation: Schema.String,
  target: Schema.String,
  reason: Schema.String,
});

const M005BridgeGraphSchema = Schema.Struct({
  nodes: Schema.Array(Schema.String),
  edge: Schema.String,
  sharedSorts: Schema.Array(Schema.String),
});

const M005BridgeTargetSchema = Schema.Struct({
  name: Schema.String,
  effect: Schema.String,
  effectVitest: Schema.String,
  vitest: Schema.String,
  fastCheck: Schema.String,
});

const M005BridgeEvidenceManifestSchema = Schema.Struct({
  bangEvidence: Schema.Literal(1),
  mission: Schema.Literal("M005"),
  graph: M005BridgeGraphSchema,
  evidence: Schema.Array(
    Schema.Union([M005BridgePropertyObservationSchema, M005BridgeUnsupportedObservationSchema]),
  ),
  assumptions: Schema.Array(Schema.String),
  unsupported: Schema.Array(Schema.String),
  invalidatedBy: Schema.Array(Schema.String),
  sources: Schema.Array(Schema.String),
  target: M005BridgeTargetSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict historical M005 bridge-law evidence manifest. */
export const M005BridgeEvidenceManifest = M005BridgeEvidenceManifestSchema;
export type M005BridgeEvidenceManifest = typeof M005BridgeEvidenceManifest.Type;

/** The JSON string boundary for strict M005 bridge-law evidence. */
export const M005BridgeEvidenceManifestFromJson = Schema.fromJsonString(
  M005BridgeEvidenceManifestSchema,
);
/** Typed failure from strict M005 bridge-evidence decoding. */
export class M005BridgeEvidenceError extends Schema.TaggedError<M005BridgeEvidenceError>()(
  "M005BridgeEvidenceError",
  {
    reason: Schema.Literal("invalid-manifest"),
    message: Schema.String,
  },
) {}

const decodeM005BridgeEvidenceManifestValue = (input: unknown) =>
  Schema.decodeUnknownEffect(M005BridgeEvidenceManifestSchema)(input);

/** Decode a JSON string or parsed strict M005 bridge-law evidence manifest. */
export const decodeM005BridgeEvidenceManifest = (
  input: unknown,
): Effect.Effect<M005BridgeEvidenceManifest, M005BridgeEvidenceError> =>
  (typeof input === "string"
    ? Schema.decodeEffect(M005BridgeEvidenceManifestFromJson)(input)
    : decodeM005BridgeEvidenceManifestValue(input)
  ).pipe(
    Effect.mapError(
      (issue) =>
        new M005BridgeEvidenceError({
          reason: "invalid-manifest",
          message: `invalid M005 bridge evidence manifest: ${String(issue)}`,
        }),
    ),
  );

/**
 * The strict legacy M009 portability evidence envelope.
 *
 * M009 records target observations and its explicit arbitrary-precision to
 * fixed-width weakening. The observations remain in their original classes.
 */
const M009RuntimeObservationSchema = Schema.Struct({
  class: Schema.Literal("runtime-checked"),
  target: Schema.String,
  case: Schema.String,
  result: Schema.Literals(["accepted", "rejected"]),
  retained: Schema.optional(Schema.String),
});

const M009StaticObservationSchema = Schema.Struct({
  class: Schema.Literal("target-static-analysis"),
  target: Schema.String,
  claim: Schema.String,
  result: Schema.Literal("rejected"),
});

const M009UnsupportedObservationSchema = Schema.Struct({
  class: Schema.Literal("unsupported-by-target"),
  target: Schema.String,
  claim: Schema.String,
});

const M009PortabilitySourceSchema = Schema.Struct({
  core: Schema.String,
  declaration: Schema.String,
  identity: Schema.String,
});

const M009PortabilityComparisonSchema = Schema.Struct({
  effectTypeScript: Schema.Struct({
    carrier: Schema.String,
    construction: Schema.String,
  }),
  rust: Schema.Struct({
    carrier: Schema.String,
    construction: Schema.String,
  }),
});

const M009PortabilityProvenanceSchema = Schema.Struct({
  projector: Schema.String,
  generated: Schema.String,
  consumer: Schema.String,
  compileFail: Schema.String,
});

const M009PortabilityEvidenceManifestSchema = Schema.Struct({
  action: Schema.Literal("target-portability"),
  source: M009PortabilitySourceSchema,
  observations: Schema.Array(
    Schema.Union([
      M009RuntimeObservationSchema,
      M009StaticObservationSchema,
      M009UnsupportedObservationSchema,
    ]),
  ),
  comparison: M009PortabilityComparisonSchema,
  provenance: M009PortabilityProvenanceSchema,
  environment: Schema.Record(Schema.String, Schema.String),
  assumptions: Schema.Array(Schema.String),
  lifetime: Schema.String,
  invalidators: Schema.Array(Schema.String),
  unsupportedClaims: Schema.Array(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict historical M009 portability evidence manifest. */
export const M009PortabilityEvidenceManifest = M009PortabilityEvidenceManifestSchema;
export type M009PortabilityEvidenceManifest = typeof M009PortabilityEvidenceManifest.Type;

/** The JSON string boundary for strict M009 portability evidence. */
export const M009PortabilityEvidenceManifestFromJson = Schema.fromJsonString(
  M009PortabilityEvidenceManifestSchema,
);
/** Typed failure from strict M009 portability-evidence decoding. */
export class M009PortabilityEvidenceError extends Schema.TaggedError<M009PortabilityEvidenceError>()(
  "M009PortabilityEvidenceError",
  {
    reason: Schema.Literal("invalid-manifest"),
    message: Schema.String,
  },
) {}

const decodeM009PortabilityEvidenceManifestValue = (input: unknown) =>
  Schema.decodeUnknownEffect(M009PortabilityEvidenceManifestSchema)(input);

/** Decode a JSON string or parsed strict M009 portability evidence manifest. */
export const decodeM009PortabilityEvidenceManifest = (
  input: unknown,
): Effect.Effect<M009PortabilityEvidenceManifest, M009PortabilityEvidenceError> =>
  (typeof input === "string"
    ? Schema.decodeEffect(M009PortabilityEvidenceManifestFromJson)(input)
    : decodeM009PortabilityEvidenceManifestValue(input)
  ).pipe(
    Effect.mapError(
      (issue) =>
        new M009PortabilityEvidenceError({
          reason: "invalid-manifest",
          message: `invalid M009 portability evidence manifest: ${String(issue)}`,
        }),
    ),
  );

const M012SourceRoleSchema = Schema.Struct({
  path: Schema.String,
  declaration: Schema.String,
});

const M012SourceRolesSchema = Schema.Struct({
  refinement: M012SourceRoleSchema,
  state: M012SourceRoleSchema,
  bridge: M012SourceRoleSchema,
});

const M012ParticipantModelSchema = Schema.Struct({
  participant: Schema.String,
  theory: Schema.String,
  realization: Schema.String,
});

const M012SelectionDetailsSchema = Schema.Struct({
  transition: Schema.String,
  realization: Schema.String,
  capability: Schema.String,
  disabledFailure: Schema.String,
  bridgeLaw: Schema.String,
  participantModels: Schema.Array(M012ParticipantModelSchema),
  stateObligation: Schema.String,
  relationalObligation: Schema.String,
});

const M012CompositionLinkSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("representation-compatible"),
  from: Schema.String,
  to: Schema.String,
});

const M012EvidencePathsSchema = Schema.Struct({
  bridge: Schema.String,
  property: Schema.String,
  runtime: Schema.String,
  portability: Schema.String,
  replay: Schema.String,
  solver: Schema.String,
});

const M012SystemSelectionSchema = Schema.Struct({
  bangSystem: Schema.Literal(1),
  id: Schema.String,
  sources: M012SourceRolesSchema,
  selection: M012SelectionDetailsSchema,
  compositionLinks: Schema.Array(M012CompositionLinkSchema),
  evidence: M012EvidencePathsSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict, mission-local M012 Account/Ledger system selection. */
export const M012SystemSelection = M012SystemSelectionSchema;
export type M012SystemSelection = typeof M012SystemSelection.Type;

/** The JSON string boundary for an M012 system selection. */
export const M012SystemSelectionFromJson = Schema.fromJsonString(M012SystemSelectionSchema);

const M012DeclarationIdentitySchema = Schema.Struct({
  kind: Schema.String,
  id: Schema.String,
});

const M012SelectedObligationsSchema = Schema.Struct({
  state: Schema.String,
  bridgeLaw: Schema.String,
  relational: Schema.String,
});

const M012CompositionQualificationSchema = Schema.Struct({
  assumptions: Schema.Array(Schema.String),
  unsupportedClaims: Schema.Array(UnsupportedClaim),
  weakenings: Schema.Array(Schema.String),
  invalidators: Schema.Array(Schema.String),
});

const M012EvidencePayloadsSchema = Schema.Struct({
  bridge: M005BridgeEvidenceManifestSchema,
  property: PropertyTestEvidenceRecord,
  runtime: RuntimeTraceEvidenceRecord,
  portability: M009PortabilityEvidenceManifestSchema,
  replay: M010ReplayManifestSchema,
  solver: M011SolverEvidenceManifestSchema,
});

const M012SystemReportSchema = Schema.Struct({
  bangEvidence: Schema.Literal(1),
  mission: Schema.Literal("M012"),
  kind: Schema.Literal("accumulated-system-report"),
  system: Schema.String,
  sources: M012SourceRolesSchema,
  selection: M012SystemSelectionSchema,
  declarations: Schema.Array(M012DeclarationIdentitySchema),
  obligations: M012SelectedObligationsSchema,
  evidence: M012EvidencePayloadsSchema,
  composition: M012CompositionQualificationSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict accumulated M012 system report. */
export const M012SystemReport = M012SystemReportSchema;
export type M012SystemReport = typeof M012SystemReport.Type;

/** The JSON string boundary for an M012 system report. */
export const M012SystemReportFromJson = Schema.fromJsonString(M012SystemReportSchema);

export type M012SystemReportFailureReason =
  | "invalid-selection"
  | "invalid-report"
  | "unknown-identity"
  | "representation-incompatible"
  | "obligation-source-mismatch"
  | "evidence-source-mismatch"
  | "evidence-mismatch"
  | "bridge-law-failed";

/** Typed failures emitted while composing the M012 accumulated report. */
export class M012SystemReportError extends Schema.TaggedError<M012SystemReportError>()(
  "M012SystemReportError",
  {
    reason: Schema.Literals([
      "invalid-selection",
      "invalid-report",
      "unknown-identity",
      "representation-incompatible",
      "obligation-source-mismatch",
      "evidence-source-mismatch",
      "evidence-mismatch",
      "bridge-law-failed",
    ]),
    identity: Schema.String,
    message: Schema.String,
  },
) {}

const m012Failure = (
  reason: M012SystemReportFailureReason,
  identity: string,
  message: string,
): M012SystemReportError => new M012SystemReportError({ reason, identity, message });

export interface M012SystemReportInputs {
  readonly selection: M012SystemSelection;
  readonly checkedCore: CheckedCoreDocument;
  readonly bridgeEvidence: M005BridgeEvidenceManifest;
  readonly propertyEvidence: PropertyTestEvidenceRecord;
  readonly runtimeEvidence: RuntimeTraceEvidenceRecord;
  readonly portabilityEvidence: M009PortabilityEvidenceManifest;
  readonly replayEvidence: M010ReplayManifest;
  readonly solverEvidence: M011SolverEvidenceManifest;
}

const sameStrings = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sameStringSet = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  sameStrings(left.toSorted(), right.toSorted());

const splitIdentity = (value: string): readonly [string, string] | undefined => {
  const parts = value.split(".");
  const left = parts[0];
  const right = parts[1];
  return parts.length === 2 && left !== undefined && right !== undefined
    ? [left, right]
    : undefined;
};

const m012StateIdentityMatches = (
  reference: PropertyTestEvidenceRecord["obligation"],
  obligation: StateInvariantObligation,
): boolean => reference.id === obligation.id && sameObligationComponents(reference, obligation);

/**
 * Compile a selected checked Core aggregate and six typed evidence payloads
 * into one deterministic, non-flattened M012 report.
 */
export const compileM012SystemReport = (
  input: M012SystemReportInputs,
): Effect.Effect<M012SystemReport, M012SystemReportError> =>
  Effect.gen(function* () {
    const { selection, checkedCore, bridgeEvidence, propertyEvidence, runtimeEvidence } = input;
    const declarations = checkedCore.declarations;
    const selectionState = selection.selection;

    const transitionIdentity = splitIdentity(selectionState.transition);
    if (transitionIdentity === undefined) {
      return yield* m012Failure(
        "invalid-selection",
        selectionState.transition,
        `selection transition must be stateMachine.operation: ${selectionState.transition}`,
      );
    }
    const bridgeLawIdentity = splitIdentity(selectionState.bridgeLaw);
    if (bridgeLawIdentity === undefined) {
      return yield* m012Failure(
        "invalid-selection",
        selectionState.bridgeLaw,
        `selection bridge law must be bridge.law: ${selectionState.bridgeLaw}`,
      );
    }

    const refinement = declarations.find(
      (declaration) =>
        declaration.kind === "refinement" &&
        declaration.id === selection.sources.refinement.declaration,
    );
    if (refinement === undefined || refinement.kind !== "refinement") {
      return yield* m012Failure(
        "unknown-identity",
        `refinement:${selection.sources.refinement.declaration}`,
        `checked Core does not contain refinement ${selection.sources.refinement.declaration}`,
      );
    }

    const stateMachine = declarations.find(
      (declaration) =>
        declaration.kind === "stateMachine" &&
        declaration.id === selection.sources.state.declaration,
    );
    if (stateMachine === undefined || stateMachine.kind !== "stateMachine") {
      return yield* m012Failure(
        "unknown-identity",
        `stateMachine:${selection.sources.state.declaration}`,
        `checked Core does not contain state machine ${selection.sources.state.declaration}`,
      );
    }

    const bridge = declarations.find(
      (declaration) =>
        declaration.kind === "theoryBridge" &&
        declaration.id === selection.sources.bridge.declaration,
    );
    if (bridge === undefined || bridge.kind !== "theoryBridge") {
      return yield* m012Failure(
        "unknown-identity",
        `theoryBridge:${selection.sources.bridge.declaration}`,
        `checked Core does not contain bridge ${selection.sources.bridge.declaration}`,
      );
    }

    if (transitionIdentity[0] !== stateMachine.id) {
      return yield* m012Failure(
        "unknown-identity",
        selectionState.transition,
        `selected transition ${selectionState.transition} does not belong to ${stateMachine.id}`,
      );
    }
    const transition = stateMachine.transitions.find(({ id }) => id === transitionIdentity[1]);
    if (transition === undefined) {
      return yield* m012Failure(
        "unknown-identity",
        selectionState.transition,
        `checked Core does not contain transition ${selectionState.transition}`,
      );
    }

    const realization = declarations.find(
      (declaration) =>
        declaration.kind === "operationRealization" &&
        declaration.id === selectionState.realization,
    );
    if (realization === undefined || realization.kind !== "operationRealization") {
      return yield* m012Failure(
        "unknown-identity",
        `operationRealization:${selectionState.realization}`,
        `checked Core does not contain realization ${selectionState.realization}`,
      );
    }
    if (
      realization.operation.stateMachine !== stateMachine.id ||
      realization.operation.operation !== transition.id
    ) {
      return yield* m012Failure(
        "obligation-source-mismatch",
        selectionState.realization,
        `realization ${selectionState.realization} does not realize ${selectionState.transition}`,
      );
    }
    if (realization.disabled.id !== selectionState.disabledFailure) {
      return yield* m012Failure(
        "obligation-source-mismatch",
        selectionState.disabledFailure,
        `realization ${selectionState.realization} disables ${realization.disabled.id}, not ${selectionState.disabledFailure}`,
      );
    }

    const capability = declarations.find(
      (declaration) =>
        declaration.kind === "capability" && declaration.id === selectionState.capability,
    );
    if (capability === undefined || capability.kind !== "capability") {
      return yield* m012Failure(
        "unknown-identity",
        `capability:${selectionState.capability}`,
        `checked Core does not contain capability ${selectionState.capability}`,
      );
    }
    if (
      !realization.requires.some(
        ({ capability: requiredCapability, quantity }) =>
          requiredCapability === capability.id && quantity.kind === "unbounded",
      )
    ) {
      return yield* m012Failure(
        "obligation-source-mismatch",
        capability.id,
        `realization ${realization.id} does not require capability ${capability.id}`,
      );
    }

    if (bridgeLawIdentity[0] !== bridge.id) {
      return yield* m012Failure(
        "unknown-identity",
        selectionState.bridgeLaw,
        `selected bridge law ${selectionState.bridgeLaw} does not belong to ${bridge.id}`,
      );
    }
    const bridgeLaw = bridge.laws.find(({ id }) => id === bridgeLawIdentity[1]);
    if (bridgeLaw === undefined) {
      return yield* m012Failure(
        "unknown-identity",
        selectionState.bridgeLaw,
        `checked Core does not contain bridge law ${selectionState.bridgeLaw}`,
      );
    }

    const accountParticipant = bridge.participants.find(({ id }) => id === "account");
    const ledgerParticipant = bridge.participants.find(({ id }) => id === "ledger");
    if (accountParticipant === undefined || ledgerParticipant === undefined) {
      return yield* m012Failure(
        "unknown-identity",
        bridge.id,
        `checked bridge ${bridge.id} does not expose account and ledger participants`,
      );
    }
    const accountModel = selectionState.participantModels.find(
      ({ participant }) => participant === accountParticipant.id,
    );
    const ledgerModel = selectionState.participantModels.find(
      ({ participant }) => participant === ledgerParticipant.id,
    );
    if (accountModel === undefined || ledgerModel === undefined) {
      return yield* m012Failure(
        "unknown-identity",
        bridge.id,
        "selection must resolve one model realization for each bridge participant",
      );
    }
    if (
      accountModel.theory !== accountParticipant.theory ||
      ledgerModel.theory !== ledgerParticipant.theory ||
      selectionState.participantModels.length !== bridge.participants.length
    ) {
      return yield* m012Failure(
        "obligation-source-mismatch",
        bridge.id,
        "selected participant theories do not match the checked bridge participants",
      );
    }

    const accountTheory = declarations.find(
      (declaration) =>
        declaration.kind === "theory" && declaration.id === accountParticipant.theory,
    );
    const ledgerTheory = declarations.find(
      (declaration) => declaration.kind === "theory" && declaration.id === ledgerParticipant.theory,
    );
    if (
      accountTheory === undefined ||
      accountTheory.kind !== "theory" ||
      ledgerTheory === undefined ||
      ledgerTheory.kind !== "theory"
    ) {
      return yield* m012Failure(
        "unknown-identity",
        bridge.id,
        "checked Core does not contain both participant theories",
      );
    }

    const selectedBalanceSharing = bridge.sharedSorts.find(({ id }) => id === "Balance");
    const accountBalanceSort = accountTheory.sorts.find(({ id }) => id === "Balance");
    const ledgerBalanceSort = ledgerTheory.sorts.find(({ id }) => id === "Balance");
    const stateBalanceField = stateMachine.state.fields.find(({ id }) => id === "balance");
    if (
      refinement.base !== "Integer" ||
      stateBalanceField?.type !== "Integer" ||
      accountBalanceSort?.representation?.kind !== "builtin" ||
      accountBalanceSort.representation.type !== "Integer" ||
      ledgerBalanceSort?.representation?.kind !== "builtin" ||
      ledgerBalanceSort.representation.type !== "Integer" ||
      selectedBalanceSharing === undefined ||
      selectedBalanceSharing.members.length !== bridge.participants.length ||
      !selectedBalanceSharing.members.every((member) => {
        const participant =
          member.participant === accountParticipant.id ? accountTheory : ledgerTheory;
        const sort = participant.sorts.find(({ id }) => id === member.sort);
        return sort?.representation?.kind === "builtin" && sort.representation.type === "Integer";
      })
    ) {
      return yield* m012Failure(
        "representation-incompatible",
        "Balance",
        "selected Balance carriers are not all Core Integer representations",
      );
    }

    const expectedLinks = [
      {
        id: "Balance.refinement-to-account-state",
        kind: "representation-compatible" as const,
        from: `refinement:${refinement.id}`,
        to: `stateMachine:${stateMachine.id}.state.balance`,
      },
      {
        id: "Balance.refinement-to-ledger-bridge",
        kind: "representation-compatible" as const,
        from: `refinement:${refinement.id}`,
        to: `theoryBridge:${bridge.id}.sharedSort.Balance`,
      },
    ];
    if (
      selection.compositionLinks.length !== expectedLinks.length ||
      expectedLinks.some(
        (expected) =>
          !selection.compositionLinks.some(
            (actual) =>
              actual.id === expected.id &&
              actual.kind === expected.kind &&
              actual.from === expected.from &&
              actual.to === expected.to,
          ),
      )
    ) {
      return yield* m012Failure(
        "invalid-selection",
        "compositionLinks",
        "selection composition links do not describe the checked Balance carriers",
      );
    }

    if (
      bridgeEvidence.graph.edge !== bridge.id ||
      !sameStringSet(bridgeEvidence.graph.nodes, [
        accountParticipant.theory,
        ledgerParticipant.theory,
      ]) ||
      !sameStringSet(
        bridgeEvidence.graph.sharedSorts,
        bridge.sharedSorts.map(({ id }) => id),
      )
    ) {
      return yield* m012Failure(
        "evidence-source-mismatch",
        bridge.id,
        "M005 graph evidence does not identify the selected checked bridge",
      );
    }

    const derivedStateObligation = deriveStateInvariantObligations(checkedCore).find(
      ({ id }) => id === selectionState.stateObligation,
    );
    if (
      derivedStateObligation === undefined ||
      derivedStateObligation.stateMachine !== stateMachine.id ||
      derivedStateObligation.operation !== transition.id ||
      derivedStateObligation.relation !== "preserves"
    ) {
      return yield* m012Failure(
        "obligation-source-mismatch",
        selectionState.stateObligation,
        `checked Core does not derive selected state obligation ${selectionState.stateObligation}`,
      );
    }
    if (
      !m012StateIdentityMatches(propertyEvidence.obligation, derivedStateObligation) ||
      !m012StateIdentityMatches(runtimeEvidence.obligation, derivedStateObligation) ||
      runtimeEvidence.observation.operationId !== transition.id ||
      !m012StateIdentityMatches(input.replayEvidence.record.obligation, derivedStateObligation) ||
      input.replayEvidence.replay.obligationId !== derivedStateObligation.id
    ) {
      return yield* m012Failure(
        "obligation-source-mismatch",
        derivedStateObligation.id,
        "property, runtime, and replay evidence do not reference the rederived state obligation",
      );
    }
    if (
      propertyEvidence.provenance.coreSource !== selection.sources.state.path ||
      runtimeEvidence.provenance.coreSource !== selection.sources.state.path ||
      input.replayEvidence.coreInput.path !== selection.sources.state.path ||
      input.replayEvidence.record.provenance.coreSource !== selection.sources.state.path ||
      input.replayEvidence.inputs.filter(({ path }) => path === selection.sources.state.path)
        .length !== 1
    ) {
      return yield* m012Failure(
        "evidence-source-mismatch",
        derivedStateObligation.id,
        "state evidence does not identify the selected Core source",
      );
    }

    const expectedBridgePair = [
      `${accountParticipant.id}:${accountModel.realization}`,
      `${ledgerParticipant.id}:${ledgerModel.realization}`,
    ];
    const bridgeObservations = bridgeEvidence.evidence.filter(
      (observation): observation is typeof M005BridgePropertyObservationSchema.Type =>
        observation.class === "property-tested" &&
        observation.obligation === selectionState.bridgeLaw,
    );
    const matchingBridgePassed = bridgeObservations.find(
      (observation) =>
        observation.class === "property-tested" &&
        sameStrings(observation.realizations, expectedBridgePair) &&
        observation.result === "passed",
    );
    if (matchingBridgePassed === undefined) {
      const matchingBridgeFailure = bridgeObservations.find(
        (observation) =>
          observation.class === "property-tested" &&
          sameStrings(observation.realizations, expectedBridgePair) &&
          observation.result === "failed",
      );
      if (matchingBridgeFailure !== undefined) {
        const recordedCounterexample =
          matchingBridgeFailure.counterexample === undefined
            ? "none"
            : JSON.stringify(matchingBridgeFailure.counterexample);
        return yield* m012Failure(
          "bridge-law-failed",
          selectionState.bridgeLaw,
          `selected bridge realizations ${expectedBridgePair.join(
            " and ",
          )} failed with recorded counterexample ${recordedCounterexample}`,
        );
      }
      return yield* m012Failure(
        "evidence-mismatch",
        selectionState.bridgeLaw,
        `M005 has no passed observation for ${expectedBridgePair.join(" and ")}`,
      );
    }

    if (
      input.portabilityEvidence.source.core !== selection.sources.refinement.path ||
      input.portabilityEvidence.source.declaration !== selection.sources.refinement.declaration ||
      input.portabilityEvidence.source.identity !== `refinement:${refinement.id}`
    ) {
      return yield* m012Failure(
        "evidence-source-mismatch",
        `refinement:${refinement.id}`,
        "M009 portability evidence does not identify the selected refinement source",
      );
    }
    const portabilityHasRangeWeakening = input.portabilityEvidence.observations.some(
      (observation) =>
        observation.class === "unsupported-by-target" &&
        observation.target === "rust" &&
        observation.claim === "Core Integer outside i128 range",
    );
    if (
      input.portabilityEvidence.comparison.effectTypeScript.carrier !==
        "arbitrary-precision bigint" ||
      input.portabilityEvidence.comparison.rust.carrier !== "fixed-width i128" ||
      !portabilityHasRangeWeakening
    ) {
      return yield* m012Failure(
        "evidence-mismatch",
        `refinement:${refinement.id}`,
        "M009 evidence does not retain the selected arbitrary-precision to i128 weakening",
      );
    }

    const solverObservations = input.solverEvidence.observations.filter(
      ({ obligation }) => obligation.id === selectionState.relationalObligation,
    );
    if (
      solverObservations.length !== 2 ||
      solverObservations.some(
        ({ obligation }) =>
          obligation.source.core !== selection.sources.bridge.path ||
          obligation.source.bridge !== bridge.id ||
          obligation.source.relation !== selectionState.relationalObligation.split(".")[1],
      )
    ) {
      return yield* m012Failure(
        "obligation-source-mismatch",
        selectionState.relationalObligation,
        "M011 relational obligations do not identify the selected bridge source",
      );
    }
    for (const observation of solverObservations) {
      yield* checkRelationalObligation(checkedCore, observation.obligation).pipe(
        Effect.mapError((error) =>
          m012Failure("obligation-source-mismatch", observation.obligation.id, error.message),
        ),
      );
    }

    const reportValue = {
      bangEvidence: 1 as const,
      mission: "M012" as const,
      kind: "accumulated-system-report" as const,
      system: selection.id,
      sources: selection.sources,
      selection,
      declarations: [
        refinement,
        stateMachine,
        bridge,
        realization,
        capability,
        accountTheory,
        ledgerTheory,
      ].map(({ kind, id }) => ({ kind, id })),
      obligations: {
        state: derivedStateObligation.id,
        bridgeLaw: selectionState.bridgeLaw,
        relational: selectionState.relationalObligation,
      },
      evidence: {
        bridge: bridgeEvidence,
        property: propertyEvidence,
        runtime: runtimeEvidence,
        portability: input.portabilityEvidence,
        replay: input.replayEvidence,
        solver: input.solverEvidence,
      },
      composition: {
        assumptions: [
          "representation-compatible links compare Core Integer carriers only",
          "the bridge-law acceptance is sampled M005 evidence",
          "the transfer relation is bounded and mission-local M011 evidence",
        ],
        unsupportedClaims: [
          {
            claim: "the selected bridge law holds for every input",
            reason: "M005 records sampled property evidence, not an exhaustive proof",
          },
          {
            claim: "the selected transfer relation is universally valid",
            reason: "M011 records bounded solver observations, not a proof certificate",
          },
          {
            claim: "Core and Rust are semantically equivalent",
            reason: "M009 records target observations and an explicit representation weakening",
          },
        ],
        weakenings: [
          "Rust represents Core Integer with fixed-width i128",
          "M005 bridge acceptance is sampled at the recorded case count",
          "M011 transfer analysis is bounded to the recorded integer ranges",
        ],
        invalidators: [
          ...selection.compositionLinks.map(({ id }) => `change to ${id}`),
          "changes to a selected Core declaration or evidence producer",
          "unsafe or foreign code that bypasses a recorded evidence boundary",
        ],
      },
    };
    return yield* Schema.decodeEffect(M012SystemReportSchema)(reportValue, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError((issue) =>
        m012Failure("invalid-report", "M012SystemReport", `invalid M012 report: ${String(issue)}`),
      ),
    );
  });

/** Format an M012 report while retaining each evidence class and scope. */
export const formatM012SystemReport = (report: M012SystemReport): string => {
  const lines = [
    "M012 accumulated system report",
    `System: ${report.system}`,
    `Sources: refinement ${report.sources.refinement.path}; state ${report.sources.state.path}; bridge ${report.sources.bridge.path}`,
    `Selection: transition ${report.selection.selection.transition}; realization ${report.selection.selection.realization}; capability ${report.selection.selection.capability}`,
    `Declarations: ${report.declarations
      .toSorted((left, right) => left.id.localeCompare(right.id))
      .map(({ kind, id }) => `${kind}:${id}`)
      .join(", ")}`,
    `Obligations: state ${report.obligations.state}; bridge law ${report.obligations.bridgeLaw}; relational ${report.obligations.relational}`,
  ];
  const bridgeObservations = report.evidence.bridge.evidence.toSorted((left, right) =>
    `${left.class}:${left.obligation}`.localeCompare(`${right.class}:${right.obligation}`),
  );
  for (const observation of bridgeObservations) {
    if (observation.class === "property-tested") {
      lines.push(
        `Bridge evidence: ${observation.class}, result ${observation.result}, scope sampled, realizations ${observation.realizations.join(
          " and ",
        )}`,
      );
    } else {
      lines.push(`Bridge evidence: ${observation.class}, target ${observation.target}`);
    }
  }
  lines.push(
    `Property evidence: ${report.evidence.property.observation.class}, result ${report.evidence.property.observation.result}, scope ${report.evidence.property.observation.scope}`,
    `Runtime evidence: ${report.evidence.runtime.observation.class}, result ${report.evidence.runtime.observation.result}, scope ${report.evidence.runtime.observation.scope}`,
  );
  for (const observation of report.evidence.portability.observations.toSorted((left, right) =>
    left.class.localeCompare(right.class),
  )) {
    lines.push(`Portability evidence: ${observation.class}, target ${observation.target}`);
  }
  lines.push(
    `Replay evidence: ${report.evidence.replay.record.observation.class}, scope ${report.evidence.replay.record.observation.scope}, closure ${report.evidence.replay.qualification.inputClosure}`,
  );
  for (const observation of report.evidence.solver.observations.toSorted((left, right) =>
    left.obligation.variant.localeCompare(right.obligation.variant),
  )) {
    lines.push(
      `Solver evidence: ${observation.obligation.variant}, ${observation.result.result}, scope bounded`,
    );
  }
  lines.push(
    `Assumptions: ${renderList(report.composition.assumptions)}`,
    `Unsupported claims: ${report.composition.unsupportedClaims
      .map(({ claim, reason }) => `${claim} (${reason})`)
      .join("; ")}`,
    `Weakenings: ${renderList(report.composition.weakenings)}`,
    `Invalidators: ${renderList(report.composition.invalidators)}`,
  );
  return lines.join("\n");
};
/**
 * M015 entity-message evidence.
 *
 * The record is intentionally mission-local. It records one scenario-tested
 * Account entity journey without claiming a general actor or mailbox model.
 */
const M015BigInt = Schema.Union([Schema.BigIntFromString, Schema.BigInt]);

const M015AccountStateSchema = Schema.Struct({
  balance: M015BigInt,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M015SourceSchema = Schema.Struct({
  stateMachine: Schema.String,
  initializer: Schema.String,
  operation: Schema.String,
  realization: Schema.String,
  capability: Schema.String,
  failure: Schema.String,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The generated Account message shape captured by M015 evidence. */
const EntityMessageSchema = Schema.TaggedUnion({
  Withdraw: {
    destination: Schema.String,
    messageId: Schema.String,
    amount: M015BigInt,
  },
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The generated Account reply shape captured by M015 evidence. */
const EntityReplySchema = Schema.TaggedUnion({
  Succeeded: {
    entityId: Schema.String,
    messageId: Schema.String,
    messageType: Schema.Literal("Withdraw"),
    state: M015AccountStateSchema,
  },
  TypedFailure: {
    entityId: Schema.String,
    messageId: Schema.String,
    messageType: Schema.Literal("Withdraw"),
    failureId: Schema.Literal("WithdrawalRejected"),
    state: M015AccountStateSchema,
  },
  WrongDestination: {
    entityId: Schema.String,
    messageId: Schema.String,
    messageType: Schema.Literal("Withdraw"),
    destination: Schema.String,
    state: M015AccountStateSchema,
  },
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const EntityMessageStepSchema = Schema.Struct({
  sequence: Schema.Natural,
  message: EntityMessageSchema,
  preState: M015AccountStateSchema,
  reply: EntityReplySchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const EntityMessageObservationSchema = Schema.Struct({
  class: Schema.Literal("scenario-tested"),
  result: Schema.Literals(["passed", "failed"]),
  scope: Schema.Literal("single-entity-sequential-dispatch"),
  entityId: Schema.String,
  initialState: M015AccountStateSchema,
  steps: Schema.Array(EntityMessageStepSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M015UnsupportedClaimSchema = Schema.Struct({
  claim: Schema.String,
  reason: Schema.String,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M015ProvenanceSchema = Schema.Struct({
  coreSource: Schema.String,
  generatedKit: Schema.String,
  realization: Schema.String,
  evaluator: Schema.String,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M015ProducerSchema = Schema.Struct({
  identity: Schema.String,
  trust: Schema.Literal("assumed-truthful"),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M015EnvironmentSchema = Schema.Struct({
  toolVersions: Schema.Record(Schema.String, Schema.String),
  target: Schema.Struct({
    name: Schema.String,
    version: Schema.String,
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M015QualificationSchema = Schema.Struct({
  assumptions: Schema.Array(Schema.String),
  unsupportedClaims: Schema.Array(M015UnsupportedClaimSchema),
  lifetime: Schema.String,
  invalidators: Schema.Array(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/**
 * The strict M015 record. Its decoded state and amounts are bigint values;
 * `M015BigInt` also accepts decimal strings so JSON evidence can be loaded.
 */
export const EntityMessageEvidenceRecord = Schema.Struct({
  source: M015SourceSchema,
  observation: EntityMessageObservationSchema,
  provenance: M015ProvenanceSchema,
  producer: M015ProducerSchema,
  environment: M015EnvironmentSchema,
  qualification: M015QualificationSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type EntityMessageEvidenceRecord = typeof EntityMessageEvidenceRecord.Type;

/** The JSON string boundary for strict M015 entity-message evidence. */
export const EntityMessageEvidenceRecordFromJson = Schema.fromJsonString(
  EntityMessageEvidenceRecord,
);

const CheckedEntityMessageEvidenceRecordSchema = EntityMessageEvidenceRecord.pipe(
  Schema.brand("CheckedEntityMessageEvidenceRecord"),
);

export type CheckedEntityMessageEvidenceRecord =
  typeof CheckedEntityMessageEvidenceRecordSchema.Type;

export type EntityMessageEvidenceFailureReason =
  | "invalid-record"
  | "unknown-core-identity"
  | "identity-drift"
  | "duplicate-message"
  | "broken-chain"
  | "state-changing-failure"
  | "missing-accepted-withdrawals"
  | "state-reset";

/** Typed failures emitted by the M015 semantic evidence checker. */
export class EntityMessageEvidenceError extends Schema.TaggedError<EntityMessageEvidenceError>()(
  "EntityMessageEvidenceError",
  {
    reason: Schema.Literals([
      "invalid-record",
      "unknown-core-identity",
      "identity-drift",
      "duplicate-message",
      "broken-chain",
      "state-changing-failure",
      "missing-accepted-withdrawals",
      "state-reset",
    ]),
    identity: Schema.String,
    message: Schema.String,
  },
) {}

const entityMessageEvidenceFailure = (
  reason: EntityMessageEvidenceFailureReason,
  identity: string,
  message: string,
): EntityMessageEvidenceError => new EntityMessageEvidenceError({ reason, identity, message });

const sameM015State = (
  left: typeof M015AccountStateSchema.Type,
  right: typeof M015AccountStateSchema.Type,
): boolean => left.balance === right.balance;

const sourceIdentity = (
  field: keyof EntityMessageEvidenceRecord["source"],
  source: EntityMessageEvidenceRecord["source"],
): string => `${field}:${source[field]}`;

/**
 * Check one M015 record against a checked Core document.
 *
 * Core proves the selected declaration identities and operation binding.
 * The ordered ownership and dispatch properties remain scenario-tested facts.
 */
export const checkEntityMessageEvidenceRecord = (
  record: EntityMessageEvidenceRecord,
  checkedDocument: CheckedCoreDocument,
): Effect.Effect<CheckedEntityMessageEvidenceRecord, EntityMessageEvidenceError> =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeEffect(EntityMessageEvidenceRecord)(record).pipe(
      Effect.mapError((issue) =>
        entityMessageEvidenceFailure(
          "invalid-record",
          "EntityMessageEvidenceRecord",
          `invalid M015 entity-message evidence: ${String(issue)}`,
        ),
      ),
    );
    const source = decoded.source;
    const stateMachine = checkedDocument.declarations.find(
      (declaration) =>
        declaration.kind === "stateMachine" && declaration.id === source.stateMachine,
    );
    if (stateMachine?.kind !== "stateMachine") {
      return yield* entityMessageEvidenceFailure(
        "unknown-core-identity",
        sourceIdentity("stateMachine", source),
        `M015 evidence references unknown state machine ${source.stateMachine}`,
      );
    }
    if (!stateMachine.initializers.some(({ id }) => id === source.initializer)) {
      return yield* entityMessageEvidenceFailure(
        "unknown-core-identity",
        sourceIdentity("initializer", source),
        `M015 evidence references unknown initializer ${source.initializer}`,
      );
    }
    if (!stateMachine.transitions.some(({ id }) => id === source.operation)) {
      return yield* entityMessageEvidenceFailure(
        "unknown-core-identity",
        sourceIdentity("operation", source),
        `M015 evidence references unknown operation ${source.operation}`,
      );
    }
    const realization = checkedDocument.declarations.find(
      (declaration) =>
        declaration.kind === "operationRealization" && declaration.id === source.realization,
    );
    if (realization?.kind !== "operationRealization") {
      return yield* entityMessageEvidenceFailure(
        "unknown-core-identity",
        sourceIdentity("realization", source),
        `M015 evidence references unknown realization ${source.realization}`,
      );
    }
    const capability = checkedDocument.declarations.find(
      (declaration) => declaration.kind === "capability" && declaration.id === source.capability,
    );
    if (capability?.kind !== "capability") {
      return yield* entityMessageEvidenceFailure(
        "unknown-core-identity",
        sourceIdentity("capability", source),
        `M015 evidence references unknown capability ${source.capability}`,
      );
    }
    if (
      realization.operation.stateMachine !== source.stateMachine ||
      realization.operation.operation !== source.operation ||
      !realization.requires.some(
        ({ capability: requiredCapability, quantity }) =>
          requiredCapability === source.capability && quantity.kind === "unbounded",
      ) ||
      realization.disabled.id !== source.failure
    ) {
      return yield* entityMessageEvidenceFailure(
        "identity-drift",
        `realization:${source.realization}`,
        "M015 source identities do not match the selected Core realization binding",
      );
    }

    const observation = decoded.observation;
    const steps = observation.steps;
    const first = steps[0];
    const second = steps[1];
    if (
      first === undefined ||
      second === undefined ||
      first.reply._tag !== "Succeeded" ||
      second.reply._tag !== "Succeeded"
    ) {
      return yield* entityMessageEvidenceFailure(
        "missing-accepted-withdrawals",
        observation.entityId,
        "M015 evidence must begin with two accepted withdrawals",
      );
    }
    const seenMessageIds = new Set<string>();
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (step === undefined) continue;
      if (seenMessageIds.has(step.message.messageId)) {
        return yield* entityMessageEvidenceFailure(
          "duplicate-message",
          step.message.messageId,
          `M015 evidence repeats message identity ${step.message.messageId}`,
        );
      }
      seenMessageIds.add(step.message.messageId);
      if (step.sequence !== index) {
        return yield* entityMessageEvidenceFailure(
          "broken-chain",
          `sequence:${step.sequence}`,
          `M015 evidence sequence expected ${index} but found ${step.sequence}`,
        );
      }
      if (step.message._tag !== "Withdraw") {
        return yield* entityMessageEvidenceFailure(
          "identity-drift",
          step.message.messageId,
          "M015 evidence contains a message outside the selected Withdraw protocol",
        );
      }
      if (step.reply.entityId !== observation.entityId) {
        return yield* entityMessageEvidenceFailure(
          "identity-drift",
          step.reply.entityId,
          `M015 reply entity ${step.reply.entityId} differs from ${observation.entityId}`,
        );
      }
      if (step.reply.messageId !== step.message.messageId) {
        return yield* entityMessageEvidenceFailure(
          "identity-drift",
          step.message.messageId,
          `M015 reply message identity differs from ${step.message.messageId}`,
        );
      }
      if (step.reply.messageType !== step.message._tag) {
        return yield* entityMessageEvidenceFailure(
          "identity-drift",
          step.message.messageId,
          `M015 reply message type differs from ${step.message._tag}`,
        );
      }
      if (step.reply._tag === "TypedFailure" && step.reply.failureId !== decoded.source.failure) {
        return yield* entityMessageEvidenceFailure(
          "identity-drift",
          step.reply.failureId,
          `M015 reply failure ${step.reply.failureId} differs from ${decoded.source.failure}`,
        );
      }
      if (index === 0 && !sameM015State(step.preState, observation.initialState)) {
        return yield* entityMessageEvidenceFailure(
          "broken-chain",
          "initialState",
          "M015 first dispatch does not start from the recorded initial state",
        );
      }
      const previous = steps[index - 1];
      if (previous !== undefined && !sameM015State(step.preState, previous.reply.state)) {
        return yield* entityMessageEvidenceFailure(
          "broken-chain",
          `sequence:${step.sequence}`,
          "M015 dispatch pre-state differs from the preceding reply state",
        );
      }
      if (step.reply._tag === "Succeeded" || step.reply._tag === "TypedFailure") {
        if (step.message.destination !== observation.entityId) {
          return yield* entityMessageEvidenceFailure(
            "identity-drift",
            step.message.messageId,
            `M015 ${step.reply._tag} message targets ${step.message.destination}, not ${observation.entityId}`,
          );
        }
      } else if (step.message.destination === observation.entityId) {
        return yield* entityMessageEvidenceFailure(
          "identity-drift",
          step.message.messageId,
          "M015 WrongDestination reply carries the entity's own destination",
        );
      }
      if (step.reply._tag === "TypedFailure" || step.reply._tag === "WrongDestination") {
        if (!sameM015State(step.preState, step.reply.state)) {
          return yield* entityMessageEvidenceFailure(
            "state-changing-failure",
            step.message.messageId,
            `M015 ${step.reply._tag} changed state on a rejected dispatch`,
          );
        }
      } else if (
        index > 0 &&
        sameM015State(step.reply.state, observation.initialState) &&
        !sameM015State(step.preState, observation.initialState)
      ) {
        return yield* entityMessageEvidenceFailure(
          "state-reset",
          step.message.messageId,
          "M015 accepted dispatch reset the entity to its initial state",
        );
      }
    }
    return yield* Schema.decodeEffect(CheckedEntityMessageEvidenceRecordSchema)(decoded).pipe(
      Effect.mapError((issue) =>
        entityMessageEvidenceFailure(
          "invalid-record",
          "CheckedEntityMessageEvidenceRecord",
          `invalid checked M015 entity-message evidence: ${String(issue)}`,
        ),
      ),
    );
  });

const formatM015State = (state: typeof M015AccountStateSchema.Type): string =>
  `balance=${String(state.balance)}`;
const formatM015UnsupportedClaims = (
  claims: ReadonlyArray<typeof M015UnsupportedClaimSchema.Type>,
): string =>
  claims.length === 0
    ? "none"
    : claims.map(({ claim, reason }) => `${claim} (${reason})`).join("; ");

/** Format checked M015 evidence without overstating a scenario as a proof. */
export const formatEntityMessageEvidenceRecord = (
  record: CheckedEntityMessageEvidenceRecord,
): string => {
  const { source, observation, provenance, producer, environment, qualification } = record;
  const lines = [
    "M015 entity-message evidence",
    `Entity: ${observation.entityId}`,
    `Source: state machine ${source.stateMachine}; initializer ${source.initializer}; operation ${source.operation}; realization ${source.realization}; capability ${source.capability}; failure ${source.failure}`,
    `Evidence: ${observation.class}, result ${observation.result}, scope ${observation.scope}`,
    `Initial state: ${formatM015State(observation.initialState)}`,
  ];
  for (const step of observation.steps) {
    const replyState = formatM015State(step.reply.state);
    const destination =
      step.message.destination === observation.entityId
        ? "local"
        : `destination ${step.message.destination}`;
    lines.push(
      `Step ${step.sequence}: ${step.message._tag} ${step.message.messageId} amount=${String(step.message.amount)} ${destination}; pre ${formatM015State(step.preState)}; outcome ${step.reply._tag}; post ${replyState}`,
    );
  }
  lines.push(
    `Producer: ${producer.identity}, trust ${producer.trust}`,
    `Versions: target ${environment.target.name}@${environment.target.version}; tools ${Object.entries(
      environment.toolVersions,
    )
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([name, version]) => `${name}@${version}`)
      .join(", ")}`,
    `Provenance: Core ${provenance.coreSource}; generated ${provenance.generatedKit}; realization ${provenance.realization}; evaluator ${provenance.evaluator}`,
    `Assumptions: ${qualification.assumptions.length === 0 ? "none" : qualification.assumptions.join("; ")}`,
    `Unsupported claims: ${formatM015UnsupportedClaims(qualification.unsupportedClaims)}`,
    `Lifetime: ${qualification.lifetime}`,
    `Invalidators: ${qualification.invalidators.length === 0 ? "none" : qualification.invalidators.join("; ")}`,
  );
  return lines.join("\n");
};

/**
 * M016's strict dual-provider manifest. The existing M011 solver envelope is
 * nested unchanged; Lean proof observations live in a separate section so
 * bounded solver output cannot be mistaken for a kernel proof.
 */
const M016Sha256 = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/)));

const M016ArchiveHash = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^sha256-[A-Za-z0-9+/]+={0,2}$/)),
);

const M016RepositoryPath = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.check(
    Schema.makeFilter((path) => !path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path), {
      expected: "a repository-relative path",
    }),
  ),
);

const M016ArtifactSchema = Schema.Struct({
  path: M016RepositoryPath,
  sha256: M016Sha256,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016ObligationIdentitySchema = Schema.Struct({
  id: Schema.Literal("AccountLedger.transferPreservesTotal"),
  variant: Schema.Literals(["lawful", "faulty"]),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016TheoremSchema = Schema.Struct({
  id: Schema.Literals([
    "AccountLedger_transferPreservesTotal_lawful",
    "AccountLedger_transferPreservesTotal_faulty_refuted",
  ]),
  result: Schema.Literals(["kernel-proven", "kernel-refuted"]),
  axioms: Schema.Array(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016ProviderImportSchema = Schema.Struct({
  module: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  version: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  sha256: M016ArchiveHash,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016KernelProviderSchema = Schema.Struct({
  name: Schema.Literal("lean"),
  version: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  archiveSha256: M016ArchiveHash,
  imports: Schema.NonEmptyArray(M016ProviderImportSchema),
  command: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016KernelTrustSchema = Schema.Struct({
  class: Schema.Literal("kernel-checked"),
  producer: Schema.Literal("lean-kernel"),
  limitations: Schema.Array(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016UnsupportedClaimSchema = Schema.Struct({
  claim: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  reason: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016QualificationSchema = Schema.Struct({
  assumptions: Schema.Array(Schema.String),
  limitations: Schema.Array(Schema.String),
  unsupportedClaims: Schema.Array(M016UnsupportedClaimSchema),
  lifetime: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  invalidators: Schema.Array(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016RefutationSchema = Schema.Struct({
  witness: Schema.Struct({
    sourceBefore: Schema.Int,
    targetBefore: Schema.Int,
    amount: Schema.Int,
    sourceAfter: Schema.Int,
    targetAfter: Schema.Int,
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  beforeTotal: Schema.Int,
  afterTotal: Schema.Int,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016KernelProvenanceSchema = Schema.Struct({
  coreSource: M016ArtifactSchema,
  normalizedObligationSha256: M016Sha256,
  generatedLean: M016ArtifactSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016KernelObservationSchema = Schema.Struct({
  obligation: M016ObligationIdentitySchema,
  theorem: M016TheoremSchema,
  provenance: M016KernelProvenanceSchema,
  qualification: M016QualificationSchema,
  refutation: Schema.optional(M016RefutationSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016KernelProofSectionSchema = Schema.Struct({
  kind: Schema.Literal("kernel-proof"),
  provider: M016KernelProviderSchema,
  observations: Schema.Array(M016KernelObservationSchema),
  trust: M016KernelTrustSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M016DualProviderEvidenceManifestSchema = Schema.Struct({
  bangEvidence: Schema.Literal(1),
  mission: Schema.Literal("M016"),
  kind: Schema.Literal("dual-provider-relational-evidence"),
  solver: M011SolverEvidenceManifest,
  kernelProof: M016KernelProofSectionSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict M016 manifest containing distinct M011 and Lean evidence. */
export const M016DualProviderEvidenceManifest = M016DualProviderEvidenceManifestSchema;
export type M016DualProviderEvidenceManifest = typeof M016DualProviderEvidenceManifest.Type;

/** The JSON string boundary for strict M016 dual-provider evidence. */
export const M016DualProviderEvidenceManifestFromJson = Schema.fromJsonString(
  M016DualProviderEvidenceManifestSchema,
);

export type M016DualProviderEvidenceFailureReason =
  | "invalid-manifest"
  | "duplicate-variant"
  | "missing-variant"
  | "identity-mismatch"
  | "result-mismatch"
  | "invalid-witness"
  | "unexpected-axiom"
  | "stale-material"
  | "unsupported-conformance";

/** Typed failures from the M016 strict evidence boundary. */
export class M016DualProviderEvidenceError extends Schema.TaggedError<M016DualProviderEvidenceError>()(
  "M016DualProviderEvidenceError",
  {
    reason: Schema.Literals([
      "invalid-manifest",
      "duplicate-variant",
      "missing-variant",
      "identity-mismatch",
      "result-mismatch",
      "invalid-witness",
      "unexpected-axiom",
      "stale-material",
      "unsupported-conformance",
    ]),
    obligationId: Schema.optional(Schema.String),
    message: Schema.String,
  },
) {}

const m016EvidenceError = (
  reason: M016DualProviderEvidenceFailureReason,
  message: string,
  obligationId?: string,
): M016DualProviderEvidenceError =>
  new M016DualProviderEvidenceError({
    reason,
    message,
    ...(obligationId === undefined ? {} : { obligationId }),
  });

const m016ExpectedTheorem = (
  variant: "lawful" | "faulty",
): {
  readonly id:
    | "AccountLedger_transferPreservesTotal_lawful"
    | "AccountLedger_transferPreservesTotal_faulty_refuted";
  readonly result: "kernel-proven" | "kernel-refuted";
} =>
  variant === "lawful"
    ? {
        id: "AccountLedger_transferPreservesTotal_lawful",
        result: "kernel-proven",
      }
    : {
        id: "AccountLedger_transferPreservesTotal_faulty_refuted",
        result: "kernel-refuted",
      };

const m016HasUnsupportedImplementationClaim = (
  claims: ReadonlyArray<typeof M016UnsupportedClaimSchema.Type>,
  target: "effect" | "rust",
): boolean =>
  claims.some(({ claim }) => claim.toLowerCase() === `${target} implementation conformance`);

const m016ValidFaultyRefutation = (
  refutation: typeof M016RefutationSchema.Type | undefined,
): boolean =>
  refutation !== undefined &&
  refutation.witness.sourceBefore === 1 &&
  refutation.witness.targetBefore === 0 &&
  refutation.witness.amount === 1 &&
  refutation.witness.sourceAfter === 0 &&
  refutation.witness.targetAfter === 2 &&
  refutation.beforeTotal === 1 &&
  refutation.afterTotal === 2;

const validateM016Manifest = (
  manifest: M016DualProviderEvidenceManifest,
): Effect.Effect<M016DualProviderEvidenceManifest, M016DualProviderEvidenceError> => {
  const provider = manifest.kernelProof.provider;
  const importedModule = provider.imports[0];
  if (
    provider.name !== "lean" ||
    provider.version !== LEAN_VERSION ||
    provider.archiveSha256 !== LEAN_ARCHIVE_SHA256 ||
    provider.command !== LEAN_PROVIDER_COMMAND ||
    provider.imports.length !== 1 ||
    importedModule === undefined ||
    importedModule.module !== LEAN_IMPORTED_MODULE ||
    importedModule.version !== LEAN_VERSION ||
    importedModule.sha256 !== LEAN_ARCHIVE_SHA256
  ) {
    return Effect.fail(
      m016EvidenceError(
        "identity-mismatch",
        "M016 kernel provider metadata does not match the pinned Lean toolchain",
      ),
    );
  }
  const variants = new Set<string>();
  for (const observation of manifest.kernelProof.observations) {
    const { obligation, theorem, qualification, refutation } = observation;
    if (variants.has(obligation.variant)) {
      return Effect.fail(
        m016EvidenceError(
          "duplicate-variant",
          `M016 kernel evidence repeats ${obligation.variant} observation`,
          obligation.id,
        ),
      );
    }
    variants.add(obligation.variant);

    const expected = m016ExpectedTheorem(obligation.variant);
    if (theorem.id !== expected.id) {
      return Effect.fail(
        m016EvidenceError(
          "identity-mismatch",
          `M016 theorem ${theorem.id} does not belong to ${obligation.variant} obligation ${obligation.id}`,
          obligation.id,
        ),
      );
    }
    if (theorem.result !== expected.result) {
      return Effect.fail(
        m016EvidenceError(
          "result-mismatch",
          `M016 theorem ${theorem.id} cannot report ${theorem.result}`,
          obligation.id,
        ),
      );
    }
    const allowedAxioms = new Set(["propext", "Classical.choice", "Quot.sound"]);
    if (
      new Set(theorem.axioms).size !== theorem.axioms.length ||
      theorem.axioms.some((axiom) => !allowedAxioms.has(axiom))
    ) {
      return Effect.fail(
        m016EvidenceError(
          "unexpected-axiom",
          `M016 theorem ${theorem.id} records an unapproved or duplicate axiom`,
          obligation.id,
        ),
      );
    }

    if (
      !m016HasUnsupportedImplementationClaim(qualification.unsupportedClaims, "effect") ||
      !m016HasUnsupportedImplementationClaim(qualification.unsupportedClaims, "rust")
    ) {
      return Effect.fail(
        m016EvidenceError(
          "unsupported-conformance",
          "M016 kernel evidence must explicitly disclaim Effect and Rust implementation conformance",
          obligation.id,
        ),
      );
    }

    if (obligation.variant === "faulty") {
      if (!m016ValidFaultyRefutation(refutation)) {
        return Effect.fail(
          m016EvidenceError(
            "invalid-witness",
            "M016 faulty kernel refutation requires witness (1,0,1,0,2) with totals 1 and 2",
            obligation.id,
          ),
        );
      }
    } else if (refutation !== undefined) {
      return Effect.fail(
        m016EvidenceError(
          "invalid-witness",
          "M016 lawful kernel proof cannot carry a faulty refutation witness",
          obligation.id,
        ),
      );
    }
  }

  if (
    manifest.kernelProof.observations.length !== 2 ||
    !variants.has("lawful") ||
    !variants.has("faulty")
  ) {
    return Effect.fail(
      m016EvidenceError(
        "missing-variant",
        "M016 kernel evidence must contain exactly one lawful and one faulty observation",
      ),
    );
  }
  return Effect.succeed(manifest);
};

const checkDecodedM016DualProviderEvidenceManifest = (
  manifest: M016DualProviderEvidenceManifest,
): Effect.Effect<M016DualProviderEvidenceManifest, M016DualProviderEvidenceError> =>
  decodeM011SolverEvidenceManifest(manifest.solver).pipe(
    Effect.mapError((error) =>
      m016EvidenceError(
        "invalid-manifest",
        `invalid nested M011 solver evidence: ${error.message}`,
      ),
    ),
    Effect.flatMap(() => validateM016Manifest(manifest)),
  );

const decodeM016DualProviderEvidenceManifestValue = (
  value: unknown,
): Effect.Effect<M016DualProviderEvidenceManifest, M016DualProviderEvidenceError> =>
  Schema.decodeUnknownEffect(M016DualProviderEvidenceManifestSchema)(value, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      m016EvidenceError(
        "invalid-manifest",
        `invalid M016 dual-provider evidence manifest: ${String(issue)}`,
      ),
    ),
    Effect.flatMap(checkDecodedM016DualProviderEvidenceManifest),
  );

/** Decode a JSON string or parsed strict M016 dual-provider manifest. */
export const decodeM016DualProviderEvidenceManifest = (
  input: unknown,
): Effect.Effect<M016DualProviderEvidenceManifest, M016DualProviderEvidenceError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M016DualProviderEvidenceManifestFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          m016EvidenceError(
            "invalid-manifest",
            `invalid M016 dual-provider evidence manifest: ${String(issue)}`,
          ),
        ),
        Effect.flatMap(checkDecodedM016DualProviderEvidenceManifest),
      )
    : decodeM016DualProviderEvidenceManifestValue(input);

/** Recompute every recorded M016 material digest against the live artifacts. */
export const verifyM016EvidenceMaterials = Effect.fn("verifyM016EvidenceMaterials")(function* (
  manifest: M016DualProviderEvidenceManifest,
): Effect.fn.Return<
  M016DualProviderEvidenceManifest,
  M016DualProviderEvidenceError,
  FileSystem.FileSystem | Crypto.Crypto
> {
  const fileSystem = yield* FileSystem.FileSystem;
  for (const observation of manifest.kernelProof.observations) {
    const { variant } = observation.obligation;
    const solverObservation = manifest.solver.observations.find(
      ({ obligation }) => obligation.variant === variant,
    );
    if (
      solverObservation === undefined ||
      solverObservation.obligation.id !== observation.obligation.id ||
      solverObservation.obligation.source.core !== observation.provenance.coreSource.path
    ) {
      return yield* m016EvidenceError(
        "identity-mismatch",
        `M016 ${variant} kernel evidence does not match the nested solver obligation`,
        observation.obligation.id,
      );
    }

    const normalizedDigest = yield* digestM010Bytes(
      new TextEncoder().encode(JSON.stringify(solverObservation.obligation)),
    ).pipe(
      Effect.mapError(() =>
        m016EvidenceError(
          "stale-material",
          `M016 could not digest the ${variant} normalized obligation`,
          observation.obligation.id,
        ),
      ),
    );
    if (normalizedDigest !== observation.provenance.normalizedObligationSha256) {
      return yield* m016EvidenceError(
        "stale-material",
        `M016 ${variant} normalized obligation digest does not match the nested solver obligation`,
        observation.obligation.id,
      );
    }

    for (const artifact of [
      observation.provenance.coreSource,
      observation.provenance.generatedLean,
    ]) {
      const bytes = yield* fileSystem
        .readFile(artifact.path)
        .pipe(
          Effect.mapError(() =>
            m016EvidenceError(
              "stale-material",
              `M016 material is unavailable: ${artifact.path}`,
              observation.obligation.id,
            ),
          ),
        );
      const observedDigest = yield* digestM010Bytes(bytes).pipe(
        Effect.mapError(() =>
          m016EvidenceError(
            "stale-material",
            `M016 could not digest material ${artifact.path}`,
            observation.obligation.id,
          ),
        ),
      );
      if (observedDigest !== artifact.sha256) {
        return yield* m016EvidenceError(
          "stale-material",
          `M016 material digest differs for ${artifact.path}`,
          observation.obligation.id,
        );
      }
    }
  }
  return manifest;
});

const m016FormatClaims = (claims: ReadonlyArray<typeof M016UnsupportedClaimSchema.Type>): string =>
  claims.length === 0
    ? "none"
    : claims.map(({ claim, reason }) => `${claim} (${reason})`).join("; ");

const m016FormatImports = (imports: ReadonlyArray<typeof M016ProviderImportSchema.Type>): string =>
  imports
    .toSorted((left, right) => left.module.localeCompare(right.module))
    .map(({ module, version, sha256 }) => `${module}@${version} [${sha256}]`)
    .join("; ");

/** Format M016 without flattening bounded solver and kernel evidence. */
export const formatM016DualProviderEvidenceReport = (
  manifest: M016DualProviderEvidenceManifest,
): string => {
  const observations = manifest.kernelProof.observations.toSorted(
    (left, right) =>
      (left.obligation.variant === "lawful" ? 0 : 1) -
      (right.obligation.variant === "lawful" ? 0 : 1),
  );
  const lines = [
    "M016 dual-provider evidence",
    "Z3 solver section",
    formatM011SolverEvidenceReport(manifest.solver),
    "Lean kernel-proof section",
    "M016 kernel-proof evidence",
    `Provider: ${manifest.kernelProof.provider.name} ${manifest.kernelProof.provider.version}`,
    `Archive SHA-256: ${manifest.kernelProof.provider.archiveSha256}`,
    `Command: ${manifest.kernelProof.provider.command}`,
    `Imports: ${m016FormatImports(manifest.kernelProof.provider.imports)}`,
  ];
  for (const observation of observations) {
    const { obligation, theorem, provenance, qualification, refutation } = observation;
    lines.push(
      `Obligation: ${obligation.id} (${obligation.variant})`,
      `Theorem: ${theorem.id}`,
      `Result: ${theorem.result}`,
      `Axioms: ${theorem.axioms.length === 0 ? "none" : theorem.axioms.toSorted().join(", ")}`,
      `Normalized obligation SHA-256: ${provenance.normalizedObligationSha256}`,
      `Core: ${provenance.coreSource.path} [${provenance.coreSource.sha256}]`,
      `Generated Lean: ${provenance.generatedLean.path} [${provenance.generatedLean.sha256}]`,
      `Assumptions: ${
        qualification.assumptions.length === 0 ? "none" : qualification.assumptions.join("; ")
      }`,
      `Limitations: ${
        qualification.limitations.length === 0 ? "none" : qualification.limitations.join("; ")
      }`,
      `Unsupported claims: ${m016FormatClaims(qualification.unsupportedClaims)}`,
      `Lifetime: ${qualification.lifetime}`,
      `Invalidators: ${
        qualification.invalidators.length === 0 ? "none" : qualification.invalidators.join("; ")
      }`,
    );
    if (refutation !== undefined) {
      lines.push(
        `Refutation witness: (${refutation.witness.sourceBefore},${refutation.witness.targetBefore},${refutation.witness.amount},${refutation.witness.sourceAfter},${refutation.witness.targetAfter})`,
        `Refutation totals: before ${refutation.beforeTotal}; after ${refutation.afterTotal}`,
      );
    }
  }
  lines.push(
    `Trust: ${manifest.kernelProof.trust.class}; producer ${manifest.kernelProof.trust.producer}`,
    `Trust limitations: ${
      manifest.kernelProof.trust.limitations.length === 0
        ? "none"
        : manifest.kernelProof.trust.limitations.join("; ")
    }`,
    "Effect implementation conformance: unsupported",
    "Rust implementation conformance: unsupported",
    "No combined evidence grade: solver-reported and kernel-checked evidence remain distinct.",
  );
  return lines.join("\n");
};
/**
 * M017's strict Gleam/BEAM actor runtime evidence.
 *
 * This manifest deliberately records only target observations. Core remains the
 * authority for declaration identities; the process, mailbox, supervision, and
 * restart observations are bounded runtime evidence.
 */
const M017Sha256 = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/)));

const M017RepositoryPath = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.check(
    Schema.makeFilter(
      (path) =>
        !path.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/.test(path) &&
        !path.split("/").some((segment) => segment === ".."),
      { expected: "a repository-relative path without parent traversal" },
    ),
  ),
);

const M017StateSchema = Schema.Struct({
  balance: Schema.Int,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017SourceSchema = Schema.Struct({
  stateMachine: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  state: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  initializer: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  operation: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  invariant: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  realization: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  capability: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  failure: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017MessageSchema = Schema.TaggedUnion({
  Withdraw: {
    destination: Schema.String,
    messageId: Schema.String,
    amount: Schema.Int,
  },
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017ReplySchema = Schema.TaggedUnion({
  Succeeded: {
    entityId: Schema.String,
    messageId: Schema.String,
    messageType: Schema.String,
    state: M017StateSchema,
  },
  TypedFailure: {
    entityId: Schema.String,
    messageId: Schema.String,
    messageType: Schema.String,
    failureId: Schema.String,
    state: M017StateSchema,
  },
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017TraceStepSchema = Schema.Struct({
  sequence: Schema.Natural,
  message: M017MessageSchema,
  preState: M017StateSchema,
  reply: M017ReplySchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017InvalidInputSchema = Schema.Struct({
  kind: Schema.Literal("unknown-message"),
  phase: Schema.Literal("before-dispatch"),
  beforeState: M017StateSchema,
  afterState: M017StateSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017RestartObservationSchema = Schema.Struct({
  oldTerminated: Schema.Boolean,
  replacementObserved: Schema.Boolean,
  identityChanged: Schema.Boolean,
  replacementAlive: Schema.Boolean,
  restartState: M017StateSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017RuntimeObservationSchema = Schema.Struct({
  class: Schema.Literal("runtime-checked"),
  result: Schema.Literal("passed"),
  scope: Schema.Literal("single-caller-supervised-beam-actor"),
  entityId: Schema.String,
  initialState: M017StateSchema,
  steps: Schema.Array(M017TraceStepSchema),
  invalidInput: M017InvalidInputSchema,
  restart: M017RestartObservationSchema,
  supervisorStopped: Schema.Boolean,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017ArtifactSchema = Schema.Struct({
  path: M017RepositoryPath,
  sha256: M017Sha256,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017ProvenanceSchema = Schema.Struct({
  coreSource: M017ArtifactSchema,
  projector: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  generatedSource: M017ArtifactSchema,
  consumer: M017ArtifactSchema,
  toolchainDefinition: M017ArtifactSchema,
  generatedConfig: M017ArtifactSchema,
  generatedManifest: M017ArtifactSchema,
  consumerConfig: M017ArtifactSchema,
  consumerManifest: M017ArtifactSchema,
  evaluator: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017DependencySchema = Schema.Struct({
  name: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  version: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  sha256: M017Sha256,
});

const M017ToolchainSchema = Schema.Struct({
  nixpkgs: Schema.Struct({
    revision: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
    sha256: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  gleam: Schema.Struct({
    version: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  otp: Schema.Struct({
    version: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
    release: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  dependencies: Schema.Array(M017DependencySchema),
  commands: Schema.Struct({
    build: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
    run: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017UnsupportedClaimSchema = Schema.Struct({
  claim: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  reason: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017QualificationSchema = Schema.Struct({
  assumptions: Schema.Array(Schema.String),
  limitations: Schema.Array(Schema.String),
  unsupportedClaims: Schema.Array(M017UnsupportedClaimSchema),
  lifetime: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  invalidators: Schema.Array(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017ProducerSchema = Schema.Struct({
  identity: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  trust: Schema.Literal("assumed-truthful"),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M017GleamActorEvidenceManifestSchema = Schema.Struct({
  bangEvidence: Schema.Literal(1),
  mission: Schema.Literal("M017"),
  version: Schema.Literal(1),
  kind: Schema.Literal("gleam-beam-actor-runtime"),
  source: M017SourceSchema,
  observation: M017RuntimeObservationSchema,
  provenance: M017ProvenanceSchema,
  producer: M017ProducerSchema,
  toolchain: M017ToolchainSchema,
  qualification: M017QualificationSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict, versioned M017 Gleam/BEAM runtime evidence manifest. */
export const M017GleamActorEvidenceManifest = M017GleamActorEvidenceManifestSchema;
export type M017GleamActorEvidenceManifest = typeof M017GleamActorEvidenceManifest.Type;

/** The JSON string boundary for strict M017 runtime evidence. */
export const M017GleamActorEvidenceManifestFromJson = Schema.fromJsonString(
  M017GleamActorEvidenceManifestSchema,
);

const CheckedM017GleamActorEvidenceManifestSchema = M017GleamActorEvidenceManifestSchema.pipe(
  Schema.brand("CheckedM017GleamActorEvidenceManifest"),
);

/** An M017 manifest whose Core identities and runtime observations are checked. */
export type CheckedM017GleamActorEvidenceManifest =
  typeof CheckedM017GleamActorEvidenceManifestSchema.Type;

export type M017GleamActorEvidenceFailureReason =
  | "invalid-manifest"
  | "unknown-core-identity"
  | "identity-drift"
  | "duplicate-message"
  | "broken-chain"
  | "trace-mismatch"
  | "state-changing-failure"
  | "invalid-input"
  | "restart-mismatch"
  | "shutdown-mismatch"
  | "missing-target-limitations"
  | "toolchain-mismatch"
  | "stale-material";

/** Typed failures emitted by the M017 strict evidence boundary. */
export class M017GleamActorEvidenceError extends Schema.TaggedError<M017GleamActorEvidenceError>()(
  "M017GleamActorEvidenceError",
  {
    reason: Schema.Literals([
      "invalid-manifest",
      "unknown-core-identity",
      "identity-drift",
      "duplicate-message",
      "broken-chain",
      "trace-mismatch",
      "state-changing-failure",
      "invalid-input",
      "restart-mismatch",
      "shutdown-mismatch",
      "missing-target-limitations",
      "toolchain-mismatch",
      "stale-material",
    ]),
    identity: Schema.String,
    message: Schema.String,
  },
) {}

const m017EvidenceError = (
  reason: M017GleamActorEvidenceFailureReason,
  identity: string,
  message: string,
): M017GleamActorEvidenceError => new M017GleamActorEvidenceError({ reason, identity, message });

const M017_TARGET_LIMITATIONS = [
  "same-sender ordering only",
  "asynchronous send without handling acknowledgement",
  "selective receive and priority messages can change mailbox processing order",
  "distributed signal loss",
  "restart without durable state",
  "raw BEAM or foreign-function type bypass",
  "finite process, mailbox, atom, and memory resources",
] as const;

const M017_DEPENDENCIES = [
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
] as const;

const M017_CORE_PATH = "examples/tiny-bank/account.bang";
const M017_GENERATED_PATH = "generated/gleam/account-entity/src/bang/account_entity.gleam";
const M017_CONSUMER_PATH = "examples/tiny-bank/gleam-account/src/main.gleam";
const M017_TOOLCHAIN_PATH = "nix/gleam.nix";
const M017_GENERATED_CONFIG_PATH = "generated/gleam/account-entity/gleam.toml";
const M017_GENERATED_MANIFEST_PATH = "generated/gleam/account-entity/manifest.toml";
const M017_CONSUMER_CONFIG_PATH = "examples/tiny-bank/gleam-account/gleam.toml";
const M017_CONSUMER_MANIFEST_PATH = "examples/tiny-bank/gleam-account/manifest.toml";

const sameM017Strings = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sameM017State = (
  left: typeof M017StateSchema.Type,
  right: typeof M017StateSchema.Type,
): boolean => left.balance === right.balance;

const m017SourceIdentity = (
  field: keyof M017GleamActorEvidenceManifest["source"],
  source: M017GleamActorEvidenceManifest["source"],
): string => `${field}:${source[field]}`;

const m017CheckToolchain = (
  toolchain: M017GleamActorEvidenceManifest["toolchain"],
): M017GleamActorEvidenceError | undefined => {
  if (
    toolchain.nixpkgs.revision !== "0e251e24a4f24e036a084b6b4b2d2491af4167f4" ||
    toolchain.nixpkgs.sha256 !== "118n3xlp9fyf52588yhxa0a5xyi0gchci09l0vblrm7m8zimvln8" ||
    toolchain.gleam.version !== "1.18.1" ||
    toolchain.otp.version !== "29.0.5" ||
    toolchain.otp.release !== "29"
  ) {
    return m017EvidenceError(
      "toolchain-mismatch",
      "toolchain",
      "M017 toolchain identity does not match the pinned Gleam and OTP versions",
    );
  }
  if (
    toolchain.commands.build !== "nix shell -f ../../../nix/gleam.nix -c gleam build" ||
    toolchain.commands.run !== "nix shell -f ../../../nix/gleam.nix -c gleam run -m main"
  ) {
    return m017EvidenceError(
      "toolchain-mismatch",
      "commands",
      "M017 build and run commands do not match the pinned consumer commands",
    );
  }
  if (
    toolchain.dependencies.length !== M017_DEPENDENCIES.length ||
    toolchain.dependencies.some(
      (dependency, index) =>
        dependency.name !== M017_DEPENDENCIES[index]?.name ||
        dependency.version !== M017_DEPENDENCIES[index]?.version ||
        dependency.sha256 !== M017_DEPENDENCIES[index]?.sha256,
    )
  ) {
    return m017EvidenceError(
      "toolchain-mismatch",
      "dependencies",
      "M017 direct Gleam dependency identities do not match the pinned lock",
    );
  }
  return undefined;
};

const validateM017Manifest = (
  manifest: M017GleamActorEvidenceManifest,
): Effect.Effect<M017GleamActorEvidenceManifest, M017GleamActorEvidenceError> => {
  const toolchainError = m017CheckToolchain(manifest.toolchain);
  if (toolchainError !== undefined) return Effect.fail(toolchainError);

  if (!sameM017Strings(manifest.qualification.limitations, M017_TARGET_LIMITATIONS)) {
    return Effect.fail(
      m017EvidenceError(
        "missing-target-limitations",
        "qualification.limitations",
        "M017 qualification must list the exact seven target limitations",
      ),
    );
  }

  const { observation, source } = manifest;
  if (
    observation.entityId !== "account-1" ||
    observation.initialState.balance !== 10 ||
    observation.steps.length !== 3
  ) {
    return Effect.fail(
      m017EvidenceError(
        "trace-mismatch",
        "observation",
        "M017 runtime evidence must record account-1 with exactly three trace steps from balance 10",
      ),
    );
  }

  const expectedSteps = [
    { messageId: "withdraw-1", amount: 4, pre: 10, post: 6, reply: "Succeeded" as const },
    { messageId: "withdraw-2", amount: 2, pre: 6, post: 4, reply: "Succeeded" as const },
    { messageId: "withdraw-3", amount: 9, pre: 4, post: 4, reply: "TypedFailure" as const },
  ] as const;
  const seenMessageIds = new Set<string>();
  for (let index = 0; index < expectedSteps.length; index += 1) {
    const step = observation.steps[index];
    const expected = expectedSteps[index];
    if (step === undefined || expected === undefined) {
      return Effect.fail(
        m017EvidenceError("broken-chain", `sequence:${index}`, "M017 trace step is missing"),
      );
    }
    if (seenMessageIds.has(step.message.messageId)) {
      return Effect.fail(
        m017EvidenceError(
          "duplicate-message",
          step.message.messageId,
          `M017 trace repeats message identity ${step.message.messageId}`,
        ),
      );
    }
    seenMessageIds.add(step.message.messageId);
    if (
      step.sequence !== index ||
      step.message._tag !== "Withdraw" ||
      step.message.destination !== observation.entityId ||
      step.message.messageId !== expected.messageId ||
      step.message.amount !== expected.amount
    ) {
      return Effect.fail(
        m017EvidenceError(
          "trace-mismatch",
          step.message.messageId,
          `M017 trace step ${index} does not match the checked Withdraw journey`,
        ),
      );
    }
    if (step.preState.balance !== expected.pre) {
      return Effect.fail(
        m017EvidenceError(
          "broken-chain",
          `sequence:${index}`,
          `M017 trace step ${index} starts from balance ${step.preState.balance}, expected ${expected.pre}`,
        ),
      );
    }
    if (
      step.reply.entityId !== observation.entityId ||
      step.reply.messageId !== step.message.messageId ||
      step.reply.messageType !== "Withdraw"
    ) {
      return Effect.fail(
        m017EvidenceError(
          "identity-drift",
          step.message.messageId,
          "M017 reply must retain the entity and message identities",
        ),
      );
    }
    if (
      step.reply._tag === "TypedFailure" &&
      (step.reply.failureId !== source.failure || !sameM017State(step.preState, step.reply.state))
    ) {
      return Effect.fail(
        m017EvidenceError(
          "state-changing-failure",
          step.message.messageId,
          "M017 WithdrawalRejected must preserve the actor state",
        ),
      );
    }
    if (step.reply._tag !== expected.reply || step.reply.state.balance !== expected.post) {
      return Effect.fail(
        m017EvidenceError(
          "trace-mismatch",
          step.message.messageId,
          `M017 trace step ${index} has an unexpected outcome or post-state`,
        ),
      );
    }
    if (index > 0) {
      const previous = observation.steps[index - 1];
      if (previous !== undefined && !sameM017State(step.preState, previous.reply.state)) {
        return Effect.fail(
          m017EvidenceError(
            "broken-chain",
            `sequence:${index}`,
            "M017 trace pre-state differs from the preceding reply state",
          ),
        );
      }
    }
  }

  if (
    observation.invalidInput.kind !== "unknown-message" ||
    observation.invalidInput.phase !== "before-dispatch" ||
    observation.invalidInput.beforeState.balance !== 4 ||
    observation.invalidInput.afterState.balance !== 4 ||
    !sameM017State(observation.invalidInput.beforeState, observation.invalidInput.afterState)
  ) {
    return Effect.fail(
      m017EvidenceError(
        "invalid-input",
        "invalidInput",
        "M017 invalid external input must be rejected before dispatch without changing balance 4",
      ),
    );
  }

  const restart = observation.restart;
  if (
    !restart.oldTerminated ||
    !restart.replacementObserved ||
    !restart.identityChanged ||
    !restart.replacementAlive ||
    restart.restartState.balance !== 10
  ) {
    return Effect.fail(
      m017EvidenceError(
        "restart-mismatch",
        "restart",
        "M017 restart evidence must observe termination, a different live replacement, and reset balance 10",
      ),
    );
  }
  if (!observation.supervisorStopped) {
    return Effect.fail(
      m017EvidenceError(
        "shutdown-mismatch",
        "supervisorStopped",
        "M017 evidence must observe clean supervisor shutdown",
      ),
    );
  }
  return Effect.succeed(manifest);
};

const decodeM017GleamActorEvidenceManifestValue = (
  input: unknown,
): Effect.Effect<M017GleamActorEvidenceManifest, M017GleamActorEvidenceError> =>
  Schema.decodeUnknownEffect(M017GleamActorEvidenceManifestSchema)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      m017EvidenceError(
        "invalid-manifest",
        "M017GleamActorEvidenceManifest",
        `invalid M017 Gleam actor evidence manifest: ${String(issue)}`,
      ),
    ),
    Effect.flatMap(validateM017Manifest),
  );

/** Decode a JSON string or parsed strict M017 runtime evidence manifest. */
export const decodeM017GleamActorEvidenceManifest = (
  input: unknown,
): Effect.Effect<M017GleamActorEvidenceManifest, M017GleamActorEvidenceError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M017GleamActorEvidenceManifestFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          m017EvidenceError(
            "invalid-manifest",
            "M017GleamActorEvidenceManifest",
            `invalid M017 Gleam actor evidence manifest: ${String(issue)}`,
          ),
        ),
        Effect.flatMap(validateM017Manifest),
      )
    : decodeM017GleamActorEvidenceManifestValue(input);

/**
 * Check M017's recorded identities against a checked Core document, then
 * return a branded manifest suitable for formatting or persistence.
 */
export const checkM017GleamActorEvidenceManifest = (
  manifest: M017GleamActorEvidenceManifest,
  checkedDocument: CheckedCoreDocument,
): Effect.Effect<CheckedM017GleamActorEvidenceManifest, M017GleamActorEvidenceError> =>
  Effect.gen(function* () {
    const decoded = yield* decodeM017GleamActorEvidenceManifestValue(manifest);
    const source = decoded.source;
    const stateMachine = checkedDocument.declarations.find(
      (declaration) =>
        declaration.kind === "stateMachine" && declaration.id === source.stateMachine,
    );
    if (stateMachine?.kind !== "stateMachine") {
      return yield* m017EvidenceError(
        "unknown-core-identity",
        m017SourceIdentity("stateMachine", source),
        `M017 evidence references unknown state machine ${source.stateMachine}`,
      );
    }
    if (stateMachine.state.id !== source.state) {
      return yield* m017EvidenceError(
        "identity-drift",
        m017SourceIdentity("state", source),
        `M017 state identity ${source.state} differs from Core ${stateMachine.state.id}`,
      );
    }
    if (!stateMachine.initializers.some(({ id }) => id === source.initializer)) {
      return yield* m017EvidenceError(
        "unknown-core-identity",
        m017SourceIdentity("initializer", source),
        `M017 evidence references unknown initializer ${source.initializer}`,
      );
    }
    if (!stateMachine.transitions.some(({ id }) => id === source.operation)) {
      return yield* m017EvidenceError(
        "unknown-core-identity",
        m017SourceIdentity("operation", source),
        `M017 evidence references unknown operation ${source.operation}`,
      );
    }
    if (!stateMachine.invariants.some(({ id }) => id === source.invariant)) {
      return yield* m017EvidenceError(
        "unknown-core-identity",
        m017SourceIdentity("invariant", source),
        `M017 evidence references unknown invariant ${source.invariant}`,
      );
    }
    const realization = checkedDocument.declarations.find(
      (declaration) =>
        declaration.kind === "operationRealization" && declaration.id === source.realization,
    );
    if (realization?.kind !== "operationRealization") {
      return yield* m017EvidenceError(
        "unknown-core-identity",
        m017SourceIdentity("realization", source),
        `M017 evidence references unknown realization ${source.realization}`,
      );
    }
    const capability = checkedDocument.declarations.find(
      (declaration) => declaration.kind === "capability" && declaration.id === source.capability,
    );
    if (capability?.kind !== "capability") {
      return yield* m017EvidenceError(
        "unknown-core-identity",
        m017SourceIdentity("capability", source),
        `M017 evidence references unknown capability ${source.capability}`,
      );
    }
    if (
      realization.operation.stateMachine !== source.stateMachine ||
      realization.operation.operation !== source.operation ||
      realization.requires.length !== 1 ||
      realization.requires[0]?.capability !== source.capability ||
      realization.requires[0]?.quantity.kind !== "unbounded" ||
      realization.disabled.id !== source.failure
    ) {
      return yield* m017EvidenceError(
        "identity-drift",
        `realization:${source.realization}`,
        "M017 source identities do not match the selected Core realization binding",
      );
    }
    return yield* Schema.decodeEffect(CheckedM017GleamActorEvidenceManifestSchema)(decoded).pipe(
      Effect.mapError((issue) =>
        m017EvidenceError(
          "invalid-manifest",
          "CheckedM017GleamActorEvidenceManifest",
          `invalid checked M017 manifest: ${String(issue)}`,
        ),
      ),
    );
  });

const m017ArtifactEntries = (
  provenance: M017GleamActorEvidenceManifest["provenance"],
): ReadonlyArray<typeof M017ArtifactSchema.Type> => [
  provenance.coreSource,
  provenance.generatedSource,
  provenance.consumer,
  provenance.toolchainDefinition,
  provenance.generatedConfig,
  provenance.generatedManifest,
  provenance.consumerConfig,
  provenance.consumerManifest,
];

/** Recompute every recorded M017 material digest against the live artifacts. */
export const verifyM017GleamActorEvidenceMaterials = Effect.fn(
  "verifyM017GleamActorEvidenceMaterials",
)(function* (
  manifest: M017GleamActorEvidenceManifest,
): Effect.fn.Return<
  M017GleamActorEvidenceManifest,
  M017GleamActorEvidenceError,
  FileSystem.FileSystem | Crypto.Crypto
> {
  const decoded = yield* decodeM017GleamActorEvidenceManifestValue(manifest);
  const expectedPaths = [
    M017_CORE_PATH,
    M017_GENERATED_PATH,
    M017_CONSUMER_PATH,
    M017_TOOLCHAIN_PATH,
    M017_GENERATED_CONFIG_PATH,
    M017_GENERATED_MANIFEST_PATH,
    M017_CONSUMER_CONFIG_PATH,
    M017_CONSUMER_MANIFEST_PATH,
  ];
  const artifacts = m017ArtifactEntries(decoded.provenance);
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    const expectedPath = expectedPaths[index];
    if (artifact === undefined || expectedPath === undefined || artifact.path !== expectedPath) {
      return yield* m017EvidenceError(
        "stale-material",
        artifact?.path ?? `artifact:${index}`,
        "M017 material path does not match the checked artifact closure",
      );
    }
  }

  const fileSystem = yield* FileSystem.FileSystem;
  for (const artifact of artifacts) {
    const bytes = yield* fileSystem
      .readFile(artifact.path)
      .pipe(
        Effect.mapError(() =>
          m017EvidenceError(
            "stale-material",
            artifact.path,
            `M017 material is unavailable: ${artifact.path}`,
          ),
        ),
      );
    const observedDigest = yield* digestM010Bytes(bytes).pipe(
      Effect.mapError(() =>
        m017EvidenceError(
          "stale-material",
          artifact.path,
          `M017 could not digest material ${artifact.path}`,
        ),
      ),
    );
    if (observedDigest !== artifact.sha256) {
      return yield* m017EvidenceError(
        "stale-material",
        artifact.path,
        `M017 material digest differs for ${artifact.path}`,
      );
    }
  }
  return decoded;
});

const m017FormatState = (state: typeof M017StateSchema.Type): string => `balance=${state.balance}`;

/** Format checked M017 runtime evidence without claiming durable restart state. */
export const formatM017GleamActorEvidenceReport = (
  manifest: CheckedM017GleamActorEvidenceManifest,
): string => {
  const { source, observation, provenance, producer, toolchain, qualification } = manifest;
  const lines = [
    "M017 Gleam/BEAM actor runtime evidence",
    `Entity: ${observation.entityId}`,
    `Source: state ${source.stateMachine}.${source.state}; initializer ${source.initializer}; operation ${source.operation}; invariant ${source.invariant}; realization ${source.realization}; capability ${source.capability}; failure ${source.failure}`,
    `Evidence: ${observation.class}, result ${observation.result}, scope ${observation.scope}`,
    `Initial state: ${m017FormatState(observation.initialState)}`,
  ];
  for (const step of observation.steps) {
    const outcome =
      step.reply._tag === "TypedFailure"
        ? `${step.reply._tag}:${step.reply.failureId}`
        : step.reply._tag;
    lines.push(
      `Step ${step.sequence}: ${step.message._tag} ${step.message.messageId} amount=${step.message.amount} destination=${step.message.destination}; pre ${m017FormatState(step.preState)}; outcome ${outcome}; post ${m017FormatState(step.reply.state)}; reply entity=${step.reply.entityId} message=${step.reply.messageId}`,
    );
  }
  lines.push(
    `Invalid input: ${observation.invalidInput.kind} ${observation.invalidInput.phase}; before ${m017FormatState(observation.invalidInput.beforeState)}; after ${m017FormatState(observation.invalidInput.afterState)}`,
    `Restart: old terminated=${observation.restart.oldTerminated}; replacement observed=${observation.restart.replacementObserved}; identity changed=${observation.restart.identityChanged}; replacement alive=${observation.restart.replacementAlive}; state ${m017FormatState(observation.restart.restartState)}`,
    `Supervisor stopped: ${observation.supervisorStopped}`,
    `Producer: ${producer.identity}, trust ${producer.trust}`,
    `Toolchain: Gleam ${toolchain.gleam.version}; OTP ${toolchain.otp.version} (release ${toolchain.otp.release}); Nixpkgs ${toolchain.nixpkgs.revision}`,
    `Dependencies: ${toolchain.dependencies.map(({ name, version, sha256 }) => `${name}@${version} [${sha256}]`).join("; ")}`,
    `Commands: build ${toolchain.commands.build}; run ${toolchain.commands.run}`,
    `Provenance: Core ${provenance.coreSource.path} [${provenance.coreSource.sha256}]; generated ${provenance.generatedSource.path} [${provenance.generatedSource.sha256}]; consumer ${provenance.consumer.path} [${provenance.consumer.sha256}]`,
    `Material closure: toolchain ${provenance.toolchainDefinition.path} [${provenance.toolchainDefinition.sha256}]; generated config ${provenance.generatedConfig.path} [${provenance.generatedConfig.sha256}]; generated lock ${provenance.generatedManifest.path} [${provenance.generatedManifest.sha256}]; consumer config ${provenance.consumerConfig.path} [${provenance.consumerConfig.sha256}]; consumer lock ${provenance.consumerManifest.path} [${provenance.consumerManifest.sha256}]`,
    `Projector: ${provenance.projector}; evaluator: ${provenance.evaluator}`,
    `Assumptions: ${qualification.assumptions.length === 0 ? "none" : qualification.assumptions.join("; ")}`,
    `Target limitations: ${qualification.limitations.join("; ")}`,
    `Unsupported claims: ${
      qualification.unsupportedClaims.length === 0
        ? "none"
        : qualification.unsupportedClaims
            .map(({ claim, reason }) => `${claim} (${reason})`)
            .join("; ")
    }`,
    `Lifetime: ${qualification.lifetime}`,
    `Invalidators: ${qualification.invalidators.length === 0 ? "none" : qualification.invalidators.join("; ")}`,
  );
  return lines.join("\n");
};

/**
 * M018's strict single-use capability evidence.
 *
 * The manifest records observations made by the target. It does not define
 * capability quantity: `checkM018SingleUseCapabilityEvidenceManifest` derives
 * that fact from checked Core and rejects a drifted manifest.
 */
const M018Sha256 = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/)));

const M018RepositoryPath = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.check(
    Schema.makeFilter(
      (path) =>
        !path.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/.test(path) &&
        !path.split("/").some((segment) => segment === ".."),
      { expected: "a repository-relative path without parent traversal" },
    ),
  ),
);

const M018Identifier = Schema.String.pipe(Schema.check(Schema.isNonEmpty()));
const M018PositiveDecimalInteger = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[1-9][0-9]*$/)),
);

const M018QuantitySchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("unbounded"),
  }),
  Schema.Struct({
    kind: Schema.Literal("exactly"),
    uses: M018PositiveDecimalInteger,
  }),
]).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict JSON representation of a checked M018 capability quantity. */
export const M018CapabilityQuantity = M018QuantitySchema;
export type M018CapabilityQuantity = typeof M018QuantitySchema.Type;

const M018StateSchema = Schema.Struct({
  balance: Schema.Int,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M018SourceSchema = Schema.Struct({
  stateMachine: M018Identifier,
  operation: M018Identifier,
  realization: M018Identifier,
  capability: M018Identifier,
  quantity: M018QuantitySchema,
  failure: M018Identifier,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M018ObservationOutcomeSchema = Schema.TaggedUnion({
  Success: {
    state: M018StateSchema,
    remainingUses: Schema.Natural,
    implementationCalls: Schema.Natural,
  },
  DomainRejected: {
    failure: Schema.Literal("WithdrawalRejectedOnce"),
    state: M018StateSchema,
    remainingUses: Schema.Natural,
    implementationCalls: Schema.Natural,
  },
  CapabilityUseRejected: {
    failure: Schema.Literal("DebitAccountGrantAlreadyConsumed"),
    state: M018StateSchema,
    remainingUses: Schema.Natural,
    implementationCalls: Schema.Natural,
  },
  WrongDestination: {
    state: M018StateSchema,
    remainingUses: Schema.Natural,
    implementationCalls: Schema.Natural,
  },
  Defect: {
    failure: M018Identifier,
    state: M018StateSchema,
    remainingUses: Schema.Natural,
    implementationCalls: Schema.Natural,
  },
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M018CallSchema = Schema.Struct({
  sequence: Schema.Natural,
  invocationId: M018Identifier,
  grantId: M018Identifier,
  destination: M018Identifier,
  amount: Schema.Int,
  preState: M018StateSchema,
  remainingUsesBefore: Schema.Natural,
  outcome: M018ObservationOutcomeSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M018DefectObservationSchema = Schema.Struct({
  grantId: M018Identifier,
  first: M018CallSchema,
  reuse: M018CallSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M018RuntimeObservationSchema = Schema.Struct({
  class: Schema.Literal("runtime-checked"),
  result: Schema.Literal("passed"),
  scope: Schema.Literal("single-grant-two-call-trace"),
  entityId: M018Identifier,
  initialState: M018StateSchema,
  grantId: M018Identifier,
  calls: Schema.Array(M018CallSchema),
  defect: M018DefectObservationSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M018ArtifactSchema = Schema.Struct({
  path: M018RepositoryPath,
  sha256: M018Sha256,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M018ProvenanceSchema = Schema.Struct({
  coreSource: M018ArtifactSchema,
  generatedBoundary: M018ArtifactSchema,
  realization: M018ArtifactSchema,
  evaluator: M018Identifier,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M018ProducerSchema = Schema.Struct({
  identity: M018Identifier,
  trust: Schema.Literal("assumed-truthful"),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M018QualificationSchema = Schema.Struct({
  assumptions: Schema.Array(Schema.String),
  weakenings: Schema.Array(Schema.String),
  lifetime: M018Identifier,
  invalidators: Schema.Array(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M018SingleUseCapabilityEvidenceManifestSchema = Schema.Struct({
  bangEvidence: Schema.Literal(1),
  mission: Schema.Literal("M018"),
  version: Schema.Literal(1),
  kind: Schema.Literal("single-use-capability-runtime"),
  source: M018SourceSchema,
  observation: M018RuntimeObservationSchema,
  provenance: M018ProvenanceSchema,
  producer: M018ProducerSchema,
  qualification: M018QualificationSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict, versioned M018 single-use capability evidence manifest. */
export const M018SingleUseCapabilityEvidenceManifest =
  M018SingleUseCapabilityEvidenceManifestSchema;
export type M018SingleUseCapabilityEvidenceManifest =
  typeof M018SingleUseCapabilityEvidenceManifestSchema.Type;

/** The JSON string boundary for strict M018 evidence. */
export const M018SingleUseCapabilityEvidenceManifestFromJson = Schema.fromJsonString(
  M018SingleUseCapabilityEvidenceManifestSchema,
);

const CheckedM018SingleUseCapabilityEvidenceManifestSchema =
  M018SingleUseCapabilityEvidenceManifestSchema.pipe(
    Schema.brand("CheckedM018SingleUseCapabilityEvidenceManifest"),
  );

/** An M018 manifest whose source and runtime trace agree with checked Core. */
export type CheckedM018SingleUseCapabilityEvidenceManifest =
  typeof CheckedM018SingleUseCapabilityEvidenceManifestSchema.Type;

export type M018SingleUseCapabilityEvidenceFailureReason =
  | "invalid-manifest"
  | "unknown-core-identity"
  | "quantity-mismatch"
  | "broken-trace"
  | "implementation-reached-after-reuse"
  | "grant-restored"
  | "missing-target-weakening"
  | "stale-material";

/** Typed failures emitted by the M018 evidence boundary. */
export class M018SingleUseCapabilityEvidenceError extends Schema.TaggedError<M018SingleUseCapabilityEvidenceError>()(
  "M018SingleUseCapabilityEvidenceError",
  {
    reason: Schema.Literals([
      "invalid-manifest",
      "unknown-core-identity",
      "quantity-mismatch",
      "broken-trace",
      "implementation-reached-after-reuse",
      "grant-restored",
      "missing-target-weakening",
      "stale-material",
    ]),
    identity: Schema.String,
    message: Schema.String,
  },
) {}

const m018EvidenceError = (
  reason: M018SingleUseCapabilityEvidenceFailureReason,
  identity: string,
  message: string,
): M018SingleUseCapabilityEvidenceError =>
  new M018SingleUseCapabilityEvidenceError({ reason, identity, message });

/** Target limitations that must be recorded in every M018 qualification. */
export const M018_TARGET_WEAKENINGS = [
  "TypeScript and Effect cannot make the grant universally unforgeable",
  "unsafe casts, foreign JavaScript, or direct implementation calls can bypass the boundary",
  "this runtime journey observes one grant in one process and does not prove distributed exactly-once delivery",
  "the target proves no lifetime, elapsed-time, memory, termination, fairness, or delivery guarantee",
] as const;

const sameM018State = (
  left: typeof M018StateSchema.Type,
  right: typeof M018StateSchema.Type,
): boolean => left.balance === right.balance;

const sameM018Quantity = (left: M018CapabilityQuantity, right: M018CapabilityQuantity): boolean => {
  if (left.kind === "unbounded" || right.kind === "unbounded") {
    return left.kind === "unbounded" && right.kind === "unbounded";
  }
  return left.kind === "exactly" && right.kind === "exactly" && left.uses === right.uses;
};

const m018CheckWeakening = (
  weakenings: ReadonlyArray<string>,
): M018SingleUseCapabilityEvidenceError | undefined =>
  M018_TARGET_WEAKENINGS.every((required) => weakenings.includes(required))
    ? undefined
    : m018EvidenceError(
        "missing-target-weakening",
        "qualification.weakenings",
        "M018 qualification must record every target weakening",
      );

const m018CheckCallIdentity = (
  call: typeof M018CallSchema.Type,
  expectedSequence: number,
  expectedInvocationId: string,
  expectedGrantId: string,
  expectedDestination: string,
  expectedAmount: number,
): M018SingleUseCapabilityEvidenceError | undefined => {
  if (
    call.sequence !== expectedSequence ||
    call.invocationId !== expectedInvocationId ||
    call.grantId !== expectedGrantId ||
    call.destination !== expectedDestination ||
    call.amount !== expectedAmount
  ) {
    return m018EvidenceError(
      "broken-trace",
      call.invocationId,
      `M018 call ${expectedSequence} does not match the checked invocation identity`,
    );
  }
  return undefined;
};

const validateM018Manifest = (
  manifest: M018SingleUseCapabilityEvidenceManifest,
): Effect.Effect<M018SingleUseCapabilityEvidenceManifest, M018SingleUseCapabilityEvidenceError> =>
  Effect.gen(function* () {
    const weakeningError = m018CheckWeakening(manifest.qualification.weakenings);
    if (weakeningError !== undefined) return yield* weakeningError;
    if (
      manifest.source.stateMachine !== "Account" ||
      manifest.source.operation !== "withdraw" ||
      manifest.source.realization !== "WithdrawAccountOnce" ||
      manifest.source.capability !== "DebitAccount" ||
      manifest.source.failure !== "WithdrawalRejectedOnce"
    ) {
      return yield* m018EvidenceError(
        "unknown-core-identity",
        "source",
        "M018 evidence must select WithdrawAccountOnce, DebitAccount, and WithdrawalRejectedOnce",
      );
    }
    if (manifest.source.quantity.kind !== "exactly" || manifest.source.quantity.uses !== "1") {
      return yield* m018EvidenceError(
        "quantity-mismatch",
        "source.quantity",
        "M018 target evidence supports only exactly one capability use",
      );
    }

    const observation = manifest.observation;
    if (
      observation.entityId !== "account-1" ||
      observation.initialState.balance !== 10 ||
      observation.grantId.length === 0 ||
      observation.calls.length !== 2
    ) {
      return yield* m018EvidenceError(
        "broken-trace",
        "observation",
        "M018 evidence must record account-1 from balance 10 with exactly two calls",
      );
    }
    const first = observation.calls[0];
    const second = observation.calls[1];
    if (first === undefined || second === undefined) {
      return yield* m018EvidenceError(
        "broken-trace",
        "observation.calls",
        "M018 evidence is missing one of the two calls",
      );
    }
    const firstIdentityError = m018CheckCallIdentity(
      first,
      0,
      "withdraw-1",
      observation.grantId,
      observation.entityId,
      4,
    );
    if (firstIdentityError !== undefined) return yield* firstIdentityError;
    const secondIdentityError = m018CheckCallIdentity(
      second,
      1,
      "withdraw-2",
      observation.grantId,
      observation.entityId,
      1,
    );
    if (secondIdentityError !== undefined) return yield* secondIdentityError;
    if (first.invocationId === second.invocationId) {
      return yield* m018EvidenceError(
        "broken-trace",
        "observation.calls",
        "M018 call identities must be unique",
      );
    }
    if (
      first.preState.balance !== 10 ||
      first.remainingUsesBefore !== 1 ||
      first.outcome._tag !== "Success" ||
      first.outcome.state.balance !== 6 ||
      first.outcome.remainingUses !== 0 ||
      first.outcome.implementationCalls !== 1
    ) {
      return yield* m018EvidenceError(
        "broken-trace",
        first.invocationId,
        "M018 first call must consume one use and succeed at balance 6",
      );
    }
    if (
      second.preState.balance !== 6 ||
      second.remainingUsesBefore !== 0 ||
      second.outcome._tag !== "CapabilityUseRejected" ||
      second.outcome.failure !== "DebitAccountGrantAlreadyConsumed" ||
      second.outcome.state.balance !== 6 ||
      second.outcome.remainingUses !== 0
    ) {
      return yield* m018EvidenceError(
        "broken-trace",
        second.invocationId,
        "M018 reuse must be rejected with balance 6 and zero remaining uses",
      );
    }
    if (
      second.outcome.implementationCalls !== 1 ||
      first.outcome.implementationCalls !== 1 ||
      second.outcome.implementationCalls !== first.outcome.implementationCalls
    ) {
      return yield* m018EvidenceError(
        "implementation-reached-after-reuse",
        second.invocationId,
        "M018 reuse must not increment the implementation invocation count",
      );
    }
    if (
      !sameM018State(second.preState, first.outcome.state) ||
      !sameM018State(second.outcome.state, first.outcome.state)
    ) {
      return yield* m018EvidenceError(
        "broken-trace",
        second.invocationId,
        "M018 reuse must preserve the Account state",
      );
    }
    const defect = observation.defect;
    if (
      defect.grantId.length === 0 ||
      defect.first.sequence !== 0 ||
      defect.first.grantId !== defect.grantId ||
      defect.first.destination !== observation.entityId ||
      defect.first.amount !== 4 ||
      defect.reuse.sequence !== 1 ||
      defect.reuse.grantId !== defect.grantId ||
      defect.reuse.destination !== observation.entityId ||
      defect.reuse.amount !== 1 ||
      defect.first.invocationId === defect.reuse.invocationId ||
      defect.first.invocationId === first.invocationId ||
      defect.first.invocationId === second.invocationId ||
      defect.reuse.invocationId === first.invocationId ||
      defect.reuse.invocationId === second.invocationId ||
      defect.first.outcome._tag !== "Defect" ||
      defect.first.remainingUsesBefore !== 1 ||
      defect.first.outcome.remainingUses !== 0 ||
      defect.first.outcome.implementationCalls !== 1 ||
      defect.reuse.remainingUsesBefore !== 0 ||
      defect.reuse.outcome._tag !== "CapabilityUseRejected" ||
      defect.reuse.outcome.failure !== "DebitAccountGrantAlreadyConsumed" ||
      defect.reuse.outcome.remainingUses !== 0 ||
      defect.reuse.outcome.implementationCalls !== 1
    ) {
      return yield* m018EvidenceError(
        "grant-restored",
        "observation.defect",
        "M018 defect evidence must show consumption persists across a defect and reuse",
      );
    }
    if (!sameM018State(defect.first.preState, defect.first.outcome.state)) {
      return yield* m018EvidenceError(
        "broken-trace",
        "observation.defect",
        "M018 defect fixture must record a stable Account state",
      );
    }
    return manifest;
  });

const decodeM018SingleUseCapabilityEvidenceManifestValue = (
  value: unknown,
): Effect.Effect<M018SingleUseCapabilityEvidenceManifest, M018SingleUseCapabilityEvidenceError> =>
  Schema.decodeUnknownEffect(M018SingleUseCapabilityEvidenceManifestSchema)(value, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      m018EvidenceError(
        "invalid-manifest",
        "M018SingleUseCapabilityEvidenceManifest",
        `invalid M018 single-use capability evidence manifest: ${String(issue)}`,
      ),
    ),
    Effect.flatMap(validateM018Manifest),
  );

/** Decode a JSON string or parsed strict M018 manifest. */
export const decodeM018SingleUseCapabilityEvidenceManifest = (
  input: unknown,
): Effect.Effect<M018SingleUseCapabilityEvidenceManifest, M018SingleUseCapabilityEvidenceError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M018SingleUseCapabilityEvidenceManifestFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          m018EvidenceError(
            "invalid-manifest",
            "M018SingleUseCapabilityEvidenceManifest",
            `invalid M018 single-use capability evidence manifest: ${String(issue)}`,
          ),
        ),
        Effect.flatMap(validateM018Manifest),
      )
    : decodeM018SingleUseCapabilityEvidenceManifestValue(input);

/**
 * Check M018 source identities and quantity against the checked Core
 * document. Quantity is read from Core, never trusted from target metadata.
 */
export const checkM018SingleUseCapabilityEvidenceManifest = (
  manifest: M018SingleUseCapabilityEvidenceManifest,
  checkedDocument: CheckedCoreDocument,
): Effect.Effect<
  CheckedM018SingleUseCapabilityEvidenceManifest,
  M018SingleUseCapabilityEvidenceError
> =>
  Effect.gen(function* () {
    const decoded = yield* decodeM018SingleUseCapabilityEvidenceManifestValue(manifest);
    const source = decoded.source;
    const stateMachine = checkedDocument.declarations.find(
      (declaration) =>
        declaration.kind === "stateMachine" && declaration.id === source.stateMachine,
    );
    if (stateMachine?.kind !== "stateMachine") {
      return yield* m018EvidenceError(
        "unknown-core-identity",
        `stateMachine:${source.stateMachine}`,
        `M018 evidence references unknown state machine ${source.stateMachine}`,
      );
    }
    if (!stateMachine.transitions.some(({ id }) => id === source.operation)) {
      return yield* m018EvidenceError(
        "unknown-core-identity",
        `operation:${source.operation}`,
        `M018 evidence references unknown operation ${source.operation}`,
      );
    }
    const capability = checkedDocument.declarations.find(
      (declaration) => declaration.kind === "capability" && declaration.id === source.capability,
    );
    if (capability?.kind !== "capability") {
      return yield* m018EvidenceError(
        "unknown-core-identity",
        `capability:${source.capability}`,
        `M018 evidence references unknown capability ${source.capability}`,
      );
    }
    const realization = checkedDocument.declarations.find(
      (declaration) =>
        declaration.kind === "operationRealization" && declaration.id === source.realization,
    );
    if (realization?.kind !== "operationRealization") {
      return yield* m018EvidenceError(
        "unknown-core-identity",
        `realization:${source.realization}`,
        `M018 evidence references unknown realization ${source.realization}`,
      );
    }
    if (
      realization.operation.stateMachine !== source.stateMachine ||
      realization.operation.operation !== source.operation ||
      realization.disabled.id !== source.failure
    ) {
      return yield* m018EvidenceError(
        "unknown-core-identity",
        `realization:${source.realization}`,
        "M018 source identities do not match the checked realization binding",
      );
    }
    const requirement = realization.requires.find(
      ({ capability: requiredCapability }) => requiredCapability === source.capability,
    );
    if (requirement === undefined) {
      return yield* m018EvidenceError(
        "unknown-core-identity",
        `requirement:${source.capability}`,
        "M018 realization does not require the selected capability",
      );
    }
    if (!sameM018Quantity(source.quantity, requirement.quantity)) {
      return yield* m018EvidenceError(
        "quantity-mismatch",
        `quantity:${source.capability}`,
        "M018 evidence quantity differs from checked Core",
      );
    }
    if (requirement.quantity.kind !== "exactly" || requirement.quantity.uses !== "1") {
      return yield* m018EvidenceError(
        "quantity-mismatch",
        `quantity:${source.capability}`,
        "M018 target supports only exactly one checked capability use",
      );
    }
    return yield* Schema.decodeEffect(CheckedM018SingleUseCapabilityEvidenceManifestSchema)(
      decoded,
    ).pipe(
      Effect.mapError((issue) =>
        m018EvidenceError(
          "invalid-manifest",
          "CheckedM018SingleUseCapabilityEvidenceManifest",
          `invalid checked M018 manifest: ${String(issue)}`,
        ),
      ),
    );
  });

const m018ArtifactEntries = (
  provenance: M018SingleUseCapabilityEvidenceManifest["provenance"],
): ReadonlyArray<typeof M018ArtifactSchema.Type> => [
  provenance.coreSource,
  provenance.generatedBoundary,
  provenance.realization,
];

/** Recompute every M018 material digest against the live repository files. */
export const verifyM018SingleUseCapabilityEvidenceMaterials = Effect.fn(
  "verifyM018SingleUseCapabilityEvidenceMaterials",
)(function* (
  manifest: M018SingleUseCapabilityEvidenceManifest,
): Effect.fn.Return<
  M018SingleUseCapabilityEvidenceManifest,
  M018SingleUseCapabilityEvidenceError,
  FileSystem.FileSystem | Crypto.Crypto
> {
  const decoded = yield* decodeM018SingleUseCapabilityEvidenceManifestValue(manifest);
  const fileSystem = yield* FileSystem.FileSystem;
  for (const artifact of m018ArtifactEntries(decoded.provenance)) {
    const bytes = yield* fileSystem
      .readFile(artifact.path)
      .pipe(
        Effect.mapError(() =>
          m018EvidenceError(
            "stale-material",
            artifact.path,
            `M018 material is unavailable: ${artifact.path}`,
          ),
        ),
      );
    const observedDigest = yield* digestM010Bytes(bytes).pipe(
      Effect.mapError(() =>
        m018EvidenceError(
          "stale-material",
          artifact.path,
          `M018 could not digest material ${artifact.path}`,
        ),
      ),
    );
    if (observedDigest !== artifact.sha256) {
      return yield* m018EvidenceError(
        "stale-material",
        artifact.path,
        `M018 material digest differs for ${artifact.path}`,
      );
    }
  }
  return decoded;
});

const m018FormatState = (state: typeof M018StateSchema.Type): string => `balance=${state.balance}`;

const m018FormatOutcome = (outcome: typeof M018ObservationOutcomeSchema.Type): string => {
  const failure = "failure" in outcome ? `:${outcome.failure}` : "";
  return `${outcome._tag}${failure}; state ${m018FormatState(outcome.state)}; remaining uses ${outcome.remainingUses}; implementation calls ${outcome.implementationCalls}`;
};

/** Format checked M018 evidence without claiming universal linearity. */
export const formatM018SingleUseCapabilityEvidenceReport = (
  manifest: CheckedM018SingleUseCapabilityEvidenceManifest,
): string => {
  const { source, observation, provenance, producer, qualification } = manifest;
  const lines = [
    "M018 single-use capability evidence",
    `Source: ${source.stateMachine}.${source.operation}; realization ${source.realization}; capability ${source.capability}; quantity ${source.quantity.kind === "exactly" ? `exactly ${source.quantity.uses}` : "unbounded"}; failure ${source.failure}`,
    `Evidence: ${observation.class}, result ${observation.result}, scope ${observation.scope}`,
    `Entity: ${observation.entityId}; initial ${m018FormatState(observation.initialState)}; grant ${observation.grantId}`,
  ];
  for (const call of observation.calls) {
    lines.push(
      `Call ${call.sequence}: ${call.invocationId}; destination ${call.destination}; amount ${call.amount}; pre ${m018FormatState(call.preState)}; remaining before ${call.remainingUsesBefore}; outcome ${m018FormatOutcome(call.outcome)}`,
    );
  }
  lines.push(
    `Defect: grant ${observation.defect.grantId}; first ${m018FormatOutcome(observation.defect.first.outcome)}; reuse ${m018FormatOutcome(observation.defect.reuse.outcome)}`,
    `Materials: Core ${provenance.coreSource.path} [${provenance.coreSource.sha256}]; generated ${provenance.generatedBoundary.path} [${provenance.generatedBoundary.sha256}]; realization ${provenance.realization.path} [${provenance.realization.sha256}]`,
    `Evaluator: ${provenance.evaluator}; producer ${producer.identity}; trust ${producer.trust}`,
    `Assumptions: ${qualification.assumptions.length === 0 ? "none" : qualification.assumptions.join("; ")}`,
    `Weakenings: ${qualification.weakenings.length === 0 ? "none" : qualification.weakenings.join("; ")}`,
    `Lifetime: ${qualification.lifetime}`,
    `Invalidators: ${qualification.invalidators.length === 0 ? "none" : qualification.invalidators.join("; ")}`,
  );
  return lines.join("\n");
};
/**
 * M019's strict, fresh self-check evidence boundary.
 *
 * The selection and conformance-result codecs are intentionally kept separate
 * from the manifest. The application owns selection loading and execution;
 * this module owns the qualified, deterministic evidence record.
 */
const M019Identifier = Schema.String.pipe(Schema.check(Schema.isNonEmpty()));

const M019RepositoryPath = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.check(
    Schema.makeFilter(
      (path) =>
        !path.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/.test(path) &&
        !path.split("/").some((segment) => segment === ".."),
      { expected: "a stable repository-relative path without parent traversal" },
    ),
  ),
);

const M019Sha256 = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/)));

const M019SelfCheckSelectionSchema = Schema.Struct({
  bangSelfCheck: Schema.Literal(1),
  core: Schema.Struct({
    path: M019RepositoryPath,
    declaration: M019Identifier,
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  target: Schema.Struct({
    profile: Schema.Literal("effect-typescript"),
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  implementation: Schema.Struct({
    binding: M019Identifier,
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  evidence: Schema.Struct({
    seed: Schema.Int,
    cases: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict JSON string boundary for an M019 self-check selection. */
export const M019SelfCheckSelectionFromJson = Schema.fromJsonString(M019SelfCheckSelectionSchema);

/** The decoded M019 self-check selection. */
export type M019SelfCheckSelection = typeof M019SelfCheckSelectionSchema.Type;

const M019DecoderPropertyResultSchema = Schema.Struct({
  passed: Schema.Boolean,
  requestedCases: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  executedRuns: Schema.Natural,
  seed: Schema.Int,
  numShrinks: Schema.Natural,
  counterexamplePath: Schema.NullOr(M019Identifier),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M019DecoderConformanceResultSchema = Schema.Struct({
  valid: M019DecoderPropertyResultSchema,
  invalid: M019DecoderPropertyResultSchema,
  maximumObservedDepth: Schema.Natural,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict JSON string boundary for an M019 decoder conformance result. */
export const M019DecoderConformanceResultFromJson = Schema.fromJsonString(
  M019DecoderConformanceResultSchema,
);

/** The decoded M019 decoder conformance result. */
export type M019DecoderConformanceResult = typeof M019DecoderConformanceResultSchema.Type;

const M019MaterialRoleSchema = Schema.Literals([
  "core-source",
  "generated-boundary",
  "implementation-source",
  "adapter",
  "binding-registry",
  "evaluator",
]);

const M019MaterialSchema = Schema.Struct({
  role: M019MaterialRoleSchema,
  path: M019RepositoryPath,
  sha256: M019Sha256,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M019VersionsSchema = Schema.Struct({
  provider: M019Identifier,
  target: M019Identifier,
  runtime: M019Identifier,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M019QualificationSchema = Schema.Struct({
  assumptions: Schema.Array(Schema.String),
  targetWeakening: Schema.Array(Schema.String),
  lifetime: M019Identifier,
  invalidators: Schema.Array(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M019SelfCheckEvidenceManifestSchema = Schema.Struct({
  bangEvidence: Schema.Literal(1),
  mission: Schema.Literal("M019"),
  kind: Schema.Literal("property-tested-self-check"),
  declarationIdentity: Schema.Struct({
    path: M019RepositoryPath,
    declaration: M019Identifier,
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  implementationBinding: Schema.Struct({
    binding: M019Identifier,
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  targetProfile: Schema.Literal("effect-typescript"),
  observations: M019DecoderConformanceResultSchema,
  materials: Schema.Array(M019MaterialSchema),
  versions: M019VersionsSchema,
  qualification: M019QualificationSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict, versioned M019 self-check evidence manifest. */
export const M019SelfCheckEvidenceManifest = M019SelfCheckEvidenceManifestSchema;
export type M019SelfCheckEvidenceManifest = typeof M019SelfCheckEvidenceManifestSchema.Type;

export type M019SelfCheckEvidenceFailureReason =
  | "invalid-manifest"
  | "invalid-policy"
  | "missing-material-role"
  | "duplicate-material-role"
  | "duplicate-material-path";

/** Typed failures emitted by the M019 evidence boundary. */
export class M019SelfCheckEvidenceError extends Schema.TaggedError<M019SelfCheckEvidenceError>()(
  "M019SelfCheckEvidenceError",
  {
    reason: Schema.Literals([
      "invalid-manifest",
      "invalid-policy",
      "missing-material-role",
      "duplicate-material-role",
      "duplicate-material-path",
    ]),
    path: Schema.String,
    message: Schema.String,
  },
) {}

const m019EvidenceError = (
  reason: M019SelfCheckEvidenceFailureReason,
  path: string,
  message: string,
): M019SelfCheckEvidenceError => new M019SelfCheckEvidenceError({ reason, path, message });

const M019_MATERIAL_ROLES = [
  "core-source",
  "generated-boundary",
  "implementation-source",
  "adapter",
  "binding-registry",
  "evaluator",
] as const;

const decodeM019SelfCheckEvidenceValue = (
  value: unknown,
): Effect.Effect<M019SelfCheckEvidenceManifest, M019SelfCheckEvidenceError> =>
  Schema.decodeUnknownEffect(M019SelfCheckEvidenceManifestSchema)(value, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      m019EvidenceError(
        "invalid-manifest",
        "M019SelfCheckEvidenceManifest",
        `invalid M019 self-check evidence manifest: ${String(issue)}`,
      ),
    ),
  );

const m019CheckLane = (
  lane: M019DecoderConformanceResult["valid"],
  name: "valid" | "invalid",
): M019SelfCheckEvidenceError | undefined => {
  if (lane.executedRuns > lane.requestedCases) {
    return m019EvidenceError(
      "invalid-policy",
      `observations.${name}.executedRuns`,
      `M019 ${name} lane executed more runs than requested`,
    );
  }
  if (lane.passed && (lane.counterexamplePath !== null || lane.numShrinks !== 0)) {
    return m019EvidenceError(
      "invalid-policy",
      `observations.${name}`,
      `M019 passed ${name} lane must have no counterexample and zero shrinks`,
    );
  }
  if (!lane.passed && lane.counterexamplePath === null) {
    return m019EvidenceError(
      "invalid-policy",
      `observations.${name}.counterexamplePath`,
      `M019 failed ${name} lane must retain a domain counterexample path`,
    );
  }
  return undefined;
};

const validateM019SelfCheckEvidence = (
  manifest: M019SelfCheckEvidenceManifest,
): Effect.Effect<M019SelfCheckEvidenceManifest, M019SelfCheckEvidenceError> =>
  Effect.gen(function* () {
    const { valid, invalid } = manifest.observations;
    const validLaneError = m019CheckLane(valid, "valid");
    if (validLaneError !== undefined) return yield* validLaneError;
    const invalidLaneError = m019CheckLane(invalid, "invalid");
    if (invalidLaneError !== undefined) return yield* invalidLaneError;
    if (valid.seed !== invalid.seed || valid.requestedCases !== invalid.requestedCases) {
      return yield* m019EvidenceError(
        "invalid-policy",
        "observations",
        "M019 valid and invalid lanes must use the same seed and requested case count",
      );
    }

    const seenRoles = new Set<string>();
    const seenPaths = new Set<string>();
    for (const material of manifest.materials) {
      if (seenRoles.has(material.role)) {
        return yield* m019EvidenceError(
          "duplicate-material-role",
          "materials",
          `M019 material role occurs more than once: ${material.role}`,
        );
      }
      seenRoles.add(material.role);
      if (seenPaths.has(material.path)) {
        return yield* m019EvidenceError(
          "duplicate-material-path",
          "materials",
          `M019 material path occurs more than once: ${material.path}`,
        );
      }
      seenPaths.add(material.path);
    }
    for (const role of M019_MATERIAL_ROLES) {
      if (!seenRoles.has(role)) {
        return yield* m019EvidenceError(
          "missing-material-role",
          "materials",
          `M019 material role is missing: ${role}`,
        );
      }
    }
    return manifest;
  });

/**
 * Validate one freshly produced M019 manifest without reading prior evidence.
 */
export const checkM019SelfCheckEvidence = Effect.fn("checkM019SelfCheckEvidence")(function* (
  manifest: M019SelfCheckEvidenceManifest,
): Effect.fn.Return<M019SelfCheckEvidenceManifest, M019SelfCheckEvidenceError> {
  const decoded = yield* decodeM019SelfCheckEvidenceValue(manifest);
  return yield* validateM019SelfCheckEvidence(decoded);
});

const m019FormatList = (values: ReadonlyArray<string>): string =>
  values.length === 0 ? "none" : values.toSorted().join("; ");

const m019FormatLane = (
  name: "valid" | "invalid",
  lane: M019DecoderConformanceResult["valid"],
): string =>
  `${name}: status=${lane.passed ? "passed" : "failed"}; seed=${lane.seed}; requested=${lane.requestedCases}; executed=${lane.executedRuns}; shrinks=${lane.numShrinks}; counterexample=${lane.counterexamplePath ?? "none"}`;

/** Format M019 evidence deterministically without overstating bounded testing. */
export const formatM019SelfCheckReport = (manifest: M019SelfCheckEvidenceManifest): string => {
  const overallPassed = manifest.observations.valid.passed && manifest.observations.invalid.passed;
  const materials = manifest.materials
    .toSorted(
      (left, right) =>
        M019_MATERIAL_ROLES.indexOf(left.role) - M019_MATERIAL_ROLES.indexOf(right.role),
    )
    .map(({ role, path, sha256 }) => `Material ${role}: ${path} [${sha256}]`);
  const lines = [
    `M019 self-check report`,
    `Result: ${overallPassed ? "passed" : "failed"}`,
    `Declaration: ${manifest.declarationIdentity.path}#${manifest.declarationIdentity.declaration}`,
    `Implementation binding: ${manifest.implementationBinding.binding}`,
    `Target profile: ${manifest.targetProfile}`,
    `Evidence: property-tested; scope: sampled`,
    `Observation ${m019FormatLane("valid", manifest.observations.valid)}`,
    `Observation ${m019FormatLane("invalid", manifest.observations.invalid)}`,
    `Maximum observed depth: ${manifest.observations.maximumObservedDepth}`,
    ...materials,
    `Version provider: ${manifest.versions.provider}`,
    `Version target: ${manifest.versions.target}`,
    `Version runtime: ${manifest.versions.runtime}`,
    `Qualification assumptions: ${m019FormatList(manifest.qualification.assumptions)}`,
    `Qualification target weakening: ${m019FormatList(manifest.qualification.targetWeakening)}`,
    `Qualification lifetime: ${manifest.qualification.lifetime}`,
    `Qualification invalidators: ${m019FormatList(manifest.qualification.invalidators)}`,
  ];
  return lines.join("\n");
};
/**
 * M031's target-owned exact-one qualification evidence boundary.
 *
 * This envelope deliberately does not reuse M018's manifest. M018 remains the
 * historical single-use trace, while M031 records one fresh, target-specific
 * probe for each heterogeneous realization. The target reports bounded
 * observations; this module checks their shape, identities, and internal
 * consistency without promoting them to a universal proof.
 */
const M031Identifier = Schema.String.pipe(Schema.check(Schema.isNonEmpty()));

const M031RepositoryPath = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.check(
    Schema.makeFilter(
      (value) =>
        !value.includes("\\") &&
        !value.includes("\u0000") &&
        !value.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/u.test(value) &&
        value
          .split("/")
          .every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
      { expected: "a repository-relative path without traversal or machine-specific prefixes" },
    ),
  ),
);

const M031Sha256 = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u)));

const M031SemanticDigest = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => /^sha256:[0-9a-f]{64}$/u.test(value), {
      expected: "a sha256-prefixed lowercase hexadecimal digest",
    }),
  ),
);

const M031TargetIdSchema = Schema.Literals(["effect-typescript", "gleam-beam"]);
export type M031TargetId = typeof M031TargetIdSchema.Type;

const M031TheoryIdentitySchema = Schema.Struct({
  id: Schema.Literal("ExactOneCapabilityExecution"),
  version: Schema.Literal(1),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M031PackageIdentitySchema = Schema.Struct({
  id: Schema.Literal("ExactOneCapabilityExecution"),
  version: Schema.Literal(1),
  semanticDigest: M031SemanticDigest,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M031TraceEntrySchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(
      (value) => {
        const separator = value.indexOf(">");
        return (
          separator > 0 &&
          separator === value.lastIndexOf(">") &&
          separator < value.length - 1 &&
          !value.includes("\u0000")
        );
      },
      {
        expected: "a deterministic before>after observation",
      },
    ),
  ),
);

const M031TraceSchema = Schema.Struct({
  valid: M031TraceEntrySchema,
  reuse: M031TraceEntrySchema,
  competing: M031TraceEntrySchema,
  wrongDestination: M031TraceEntrySchema,
  disabled: M031TraceEntrySchema,
  defect: M031TraceEntrySchema,
  stale: M031TraceEntrySchema,
  replacement: M031TraceEntrySchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const m031TracePair = (value: string): readonly [number, number] | undefined => {
  const match = /^([0-9]+)>([0-9]+)$/u.exec(value);
  if (match === null) return undefined;
  const before = Number.parseInt(match[1]!, 10);
  const after = Number.parseInt(match[2]!, 10);
  return Number.isSafeInteger(before) && Number.isSafeInteger(after) ? [before, after] : undefined;
};

const M031ActorRestartObservationSchema = Schema.Struct({
  oldGrantRejected: Schema.Boolean,
  freshGrantDistinct: Schema.Boolean,
  replacementGrantAccepted: Schema.Boolean,
  supervised: Schema.Boolean,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/**
 * Normalized observations emitted by both M031 target probes.
 *
 * The booleans identify each bounded journey. The competing counts make
 * "exactly one" checkable instead of trusting one summary bit. State and
 * remaining-use traces retain every before/after observation in a
 * target-neutral, deterministic representation.
 */
const M031ObservationsSchema = Schema.Struct({
  target: M031TargetIdSchema,
  realization: Schema.Literal("WithdrawAccountOnce"),
  entity: Schema.Literal("account-1"),
  validCall: Schema.Boolean,
  reuse: Schema.Boolean,
  competing: Schema.Boolean,
  competingSuccesses: Schema.Natural,
  competingRejections: Schema.Natural,
  wrongDestination: Schema.Boolean,
  disabled: Schema.Boolean,
  defect: Schema.Boolean,
  stateTrace: M031TraceSchema,
  remainingTrace: M031TraceSchema,
  actorRestart: Schema.optional(M031ActorRestartObservationSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const M031TargetQualificationObservations = M031ObservationsSchema;
export type M031TargetQualificationObservations = typeof M031ObservationsSchema.Type;

const M031MaterialSchema = Schema.Struct({
  role: M031Identifier,
  path: M031RepositoryPath,
  sha256: M031Sha256,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const M031TargetQualificationMaterial = M031MaterialSchema;
export type M031TargetQualificationMaterial = typeof M031MaterialSchema.Type;

const M031ProducerSchema = Schema.Struct({
  identity: M031Identifier,
  version: M031Identifier,
  targetId: M031TargetIdSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const M031TargetQualificationProducer = M031ProducerSchema;
export type M031TargetQualificationProducer = typeof M031ProducerSchema.Type;

const M031QualificationText = Schema.String.pipe(Schema.check(Schema.isNonEmpty()));

export const M031TargetQualificationEvidenceSchema = Schema.Struct({
  bangTargetQualificationEvidence: Schema.Literal(1),
  selectionId: M031Identifier,
  targetId: M031TargetIdSchema,
  realizationId: Schema.Literal("WithdrawAccountOnce"),
  artifactId: M031Identifier,
  artifactFormat: Schema.Literal("bangSemanticArtifact:1"),
  theory: M031TheoryIdentitySchema,
  package: M031PackageIdentitySchema,
  requirementAddress: M031Identifier,
  observations: M031ObservationsSchema,
  materials: Schema.NonEmptyArray(M031MaterialSchema),
  producer: M031ProducerSchema,
  assumptions: Schema.NonEmptyArray(M031QualificationText),
  weakenings: Schema.NonEmptyArray(M031QualificationText),
  limitations: Schema.NonEmptyArray(M031QualificationText),
  lifetime: M031QualificationText,
  invalidators: Schema.NonEmptyArray(M031QualificationText),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The strict, versioned M031 target qualification evidence manifest. */
export const M031TargetQualificationEvidence = M031TargetQualificationEvidenceSchema;
export type M031TargetQualificationEvidence = typeof M031TargetQualificationEvidenceSchema.Type;

/** Explicit manifest spelling for callers that use the historical M018 name. */
export const M031TargetQualificationEvidenceManifest = M031TargetQualificationEvidenceSchema;
export type M031TargetQualificationEvidenceManifest =
  typeof M031TargetQualificationEvidenceSchema.Type;

/** The strict JSON string boundary for one M031 target evidence record. */
export const M031TargetQualificationEvidenceFromJson = Schema.fromJsonString(
  M031TargetQualificationEvidenceSchema,
);
export const M031TargetQualificationEvidenceManifestFromJson =
  M031TargetQualificationEvidenceFromJson;

const CheckedM031TargetQualificationEvidenceSchema = M031TargetQualificationEvidenceSchema.pipe(
  Schema.brand("CheckedM031TargetQualificationEvidence"),
);

/** A target evidence record whose bounded observations and identities were checked. */
export type CheckedM031TargetQualificationEvidence =
  typeof CheckedM031TargetQualificationEvidenceSchema.Type;

export type M031TargetQualificationEvidenceFailureReason =
  | "invalid-manifest"
  | "identity-mismatch"
  | "target-mismatch"
  | "core-identity-mismatch"
  | "package-mismatch"
  | "package-digest-mismatch"
  | "result-mismatch"
  | "observation-missing"
  | "contradictory-observation"
  | "shared-evidence"
  | "duplicate-material"
  | "unsafe-material"
  | "missing-target-metadata"
  | "stale-material";

/** Typed failures emitted by the M031 target evidence boundary. */
export class M031TargetQualificationEvidenceError extends Schema.TaggedError<M031TargetQualificationEvidenceError>()(
  "M031TargetQualificationEvidenceError",
  {
    reason: Schema.Literals([
      "invalid-manifest",
      "identity-mismatch",
      "target-mismatch",
      "core-identity-mismatch",
      "package-mismatch",
      "package-digest-mismatch",
      "result-mismatch",
      "observation-missing",
      "contradictory-observation",
      "shared-evidence",
      "duplicate-material",
      "unsafe-material",
      "missing-target-metadata",
      "stale-material",
    ]),
    identity: Schema.String,
    message: Schema.String,
  },
) {}

const m031EvidenceError = (
  reason: M031TargetQualificationEvidenceFailureReason,
  identity: string,
  message: string,
): M031TargetQualificationEvidenceError =>
  new M031TargetQualificationEvidenceError({ reason, identity, message });

/** Identity fields copied from an applicable exact-one theory result. */
export interface M031TargetQualificationResultIdentity {
  readonly artifactId: string;
  readonly artifactFormat: "bangSemanticArtifact:1";
  readonly theory: {
    readonly id: "ExactOneCapabilityExecution";
    readonly version: 1;
  };
  readonly requirementAddress: string;
}

/**
 * Optional authority supplied by the application at the checked boundary.
 * Omitting a field is useful for a producer-only probe check; supplying it
 * makes identity drift explicit and rejects a record that belongs elsewhere.
 */
export interface M031TargetQualificationEvidenceContext {
  readonly selectionId?: string;
  readonly targetId?: M031TargetId;
  readonly realizationId?: "WithdrawAccountOnce";
  readonly artifactId?: string;
  readonly artifactFormat?: "bangSemanticArtifact:1";
  readonly theory?: {
    readonly id: string;
    readonly version: number;
  };
  readonly package?: {
    readonly id: string;
    readonly version: number;
    readonly semanticDigest: string;
  };
  readonly packageSemanticDigest?: string;
  readonly requirementAddress?: string;
  readonly result?: M031TargetQualificationResultIdentity;
  readonly core?: CheckedCoreDocument;
}

const m031ExpectedRequirementAddress = (realizationId: string): string =>
  `operationRealization:${realizationId}.requirement:DebitAccount`;

const m031CheckMaterialUniqueness = (
  manifest: M031TargetQualificationEvidence,
): M031TargetQualificationEvidenceError | undefined => {
  const roles = new Set<string>();
  const paths = new Set<string>();
  for (const material of manifest.materials) {
    if (roles.has(material.role) || paths.has(material.path)) {
      return m031EvidenceError(
        "duplicate-material",
        material.path,
        `M031 material role and path must each be unique: ${material.role}`,
      );
    }
    roles.add(material.role);
    paths.add(material.path);
  }
  return undefined;
};

const m031CheckTargetMaterialPaths = (
  manifest: M031TargetQualificationEvidence,
): M031TargetQualificationEvidenceError | undefined => {
  for (const material of manifest.materials) {
    const path = material.path.toLowerCase();
    if (
      manifest.targetId === "effect-typescript" &&
      (path.includes("gleam") || path.includes("gleam-beam"))
    ) {
      return m031EvidenceError(
        "target-mismatch",
        material.path,
        "Effect M031 evidence cannot use a Gleam target material",
      );
    }
    if (
      manifest.targetId === "gleam-beam" &&
      (path.includes("target-effect") || path.includes("effect-typescript"))
    ) {
      return m031EvidenceError(
        "target-mismatch",
        material.path,
        "Gleam M031 evidence cannot use an Effect target material",
      );
    }
  }
  return undefined;
};

const m031CheckObservations = (
  manifest: M031TargetQualificationEvidence,
): M031TargetQualificationEvidenceError | undefined => {
  const observation = manifest.observations;
  if (
    observation.target !== manifest.targetId ||
    observation.realization !== manifest.realizationId ||
    observation.entity !== "account-1"
  ) {
    return m031EvidenceError(
      "target-mismatch",
      "observations",
      "M031 observations must identify the selected target, realization, and Account entity",
    );
  }
  if (
    !observation.validCall ||
    !observation.reuse ||
    !observation.competing ||
    !observation.wrongDestination ||
    !observation.disabled ||
    !observation.defect
  ) {
    return m031EvidenceError(
      "contradictory-observation",
      "observations",
      "M031 evidence must report every bounded exact-one journey as passed",
    );
  }
  if (observation.competingSuccesses !== 1 || observation.competingRejections !== 1) {
    return m031EvidenceError(
      "contradictory-observation",
      "observations.competing",
      "M031 competing calls must record exactly one success and one rejection",
    );
  }
  const stateTraceValues = Object.values(observation.stateTrace);
  const remainingTraceValues = Object.values(observation.remainingTrace);
  if (
    stateTraceValues.some((value) => m031TracePair(value) === undefined) ||
    remainingTraceValues.some((value) => m031TracePair(value) === undefined)
  ) {
    return m031EvidenceError(
      "contradictory-observation",
      "observations",
      "M031 state and remaining-use traces must contain numeric before>after pairs",
    );
  }
  const expectedRemaining: ReadonlyArray<
    readonly [keyof typeof observation.remainingTrace, number, number]
  > = [
    ["valid", 1, 0],
    ["reuse", 0, 0],
    ["competing", 1, 0],
    ["wrongDestination", 1, 1],
    ["disabled", 1, 1],
    ["defect", 1, 0],
    ["stale", 0, 0],
    ["replacement", 1, manifest.targetId === "gleam-beam" ? 0 : 1],
  ];
  for (const [name, expectedBefore, expectedAfter] of expectedRemaining) {
    const pair = m031TracePair(observation.remainingTrace[name]);
    if (pair === undefined || pair[0] !== expectedBefore || pair[1] !== expectedAfter) {
      return m031EvidenceError(
        "contradictory-observation",
        `observations.remainingTrace.${name}`,
        `M031 ${name} remaining-use trace must be ${expectedBefore}>${expectedAfter}`,
      );
    }
  }
  const restart = observation.actorRestart;
  if (manifest.targetId === "gleam-beam") {
    if (restart === undefined) {
      return m031EvidenceError(
        "observation-missing",
        "observations.actorRestart",
        "Gleam M031 evidence must record supervised actor replacement",
      );
    }
    if (
      !restart.oldGrantRejected ||
      !restart.freshGrantDistinct ||
      !restart.replacementGrantAccepted ||
      !restart.supervised
    ) {
      return m031EvidenceError(
        "contradictory-observation",
        "observations.actorRestart",
        "Gleam M031 evidence must reject the old grant, supervise replacement, and accept a distinct fresh grant",
      );
    }
  } else if (restart !== undefined) {
    return m031EvidenceError(
      "target-mismatch",
      "observations.actorRestart",
      "Effect M031 evidence must not contain Gleam actor-restart observations",
    );
  }
  return undefined;
};

const m031CheckCore = (
  manifest: M031TargetQualificationEvidence,
  core: CheckedCoreDocument,
): M031TargetQualificationEvidenceError | undefined => {
  const stateMachine = core.declarations.find(
    (declaration) => declaration.kind === "stateMachine" && declaration.id === "Account",
  );
  if (stateMachine?.kind !== "stateMachine") {
    return m031EvidenceError(
      "core-identity-mismatch",
      "stateMachine:Account",
      "M031 evidence requires the checked Account state machine",
    );
  }
  const operation = stateMachine.transitions.find(({ id }) => id === "withdraw");
  if (operation === undefined) {
    return m031EvidenceError(
      "core-identity-mismatch",
      "operation:Account.withdraw",
      "M031 evidence requires Account.withdraw",
    );
  }
  const capability = core.declarations.find(
    (declaration) => declaration.kind === "capability" && declaration.id === "DebitAccount",
  );
  if (capability?.kind !== "capability") {
    return m031EvidenceError(
      "core-identity-mismatch",
      "capability:DebitAccount",
      "M031 evidence requires the checked DebitAccount capability",
    );
  }
  const realization = core.declarations.find(
    (declaration) =>
      declaration.kind === "operationRealization" && declaration.id === manifest.realizationId,
  );
  if (realization?.kind !== "operationRealization") {
    return m031EvidenceError(
      "core-identity-mismatch",
      `operationRealization:${manifest.realizationId}`,
      "M031 evidence references an unknown checked operation realization",
    );
  }
  const requirement = realization.requires.find(
    ({ capability: requiredCapability }) => requiredCapability === "DebitAccount",
  );
  if (
    requirement === undefined ||
    realization.operation.stateMachine !== "Account" ||
    realization.operation.operation !== "withdraw" ||
    realization.disabled.kind !== "failure" ||
    realization.disabled.id !== "WithdrawalRejectedOnce" ||
    requirement.quantity.kind !== "exactly" ||
    requirement.quantity.uses !== "1"
  ) {
    return m031EvidenceError(
      "core-identity-mismatch",
      `operationRealization:${manifest.realizationId}`,
      "M031 evidence does not match the checked WithdrawAccountOnce exact-one binding",
    );
  }
  return undefined;
};

const m031CheckContext = (
  manifest: M031TargetQualificationEvidence,
  context: M031TargetQualificationEvidenceContext,
): M031TargetQualificationEvidenceError | undefined => {
  const identityChecks: ReadonlyArray<
    readonly [
      string,
      string | number | undefined,
      string | number | undefined,
      M031TargetQualificationEvidenceFailureReason,
    ]
  > = [
    ["selectionId", manifest.selectionId, context.selectionId, "identity-mismatch"],
    ["targetId", manifest.targetId, context.targetId, "target-mismatch"],
    ["realizationId", manifest.realizationId, context.realizationId, "identity-mismatch"],
    ["artifactId", manifest.artifactId, context.artifactId, "identity-mismatch"],
    ["artifactFormat", manifest.artifactFormat, context.artifactFormat, "identity-mismatch"],
    [
      "requirementAddress",
      manifest.requirementAddress,
      context.requirementAddress,
      "identity-mismatch",
    ],
  ];
  for (const [field, actual, expected, reason] of identityChecks) {
    if (expected !== undefined && actual !== expected) {
      return m031EvidenceError(
        reason,
        field,
        `M031 evidence ${field} does not match its authority`,
      );
    }
  }
  if (
    context.theory !== undefined &&
    (manifest.theory.id !== context.theory.id || manifest.theory.version !== context.theory.version)
  ) {
    return m031EvidenceError(
      "identity-mismatch",
      "theory",
      "M031 evidence theory identity differs from the checked result",
    );
  }
  if (context.package !== undefined) {
    if (
      manifest.package.id !== context.package.id ||
      manifest.package.version !== context.package.version ||
      manifest.package.semanticDigest !== context.package.semanticDigest
    ) {
      return m031EvidenceError(
        "package-mismatch",
        "package",
        "M031 evidence package identity or semantic digest differs from the resolved package",
      );
    }
  }
  if (
    context.packageSemanticDigest !== undefined &&
    manifest.package.semanticDigest !== context.packageSemanticDigest
  ) {
    return m031EvidenceError(
      "package-digest-mismatch",
      "package.semanticDigest",
      "M031 evidence package semantic digest differs from the resolved package",
    );
  }
  if (context.result !== undefined) {
    if (
      manifest.artifactId !== context.result.artifactId ||
      manifest.artifactFormat !== context.result.artifactFormat ||
      manifest.theory.id !== context.result.theory.id ||
      manifest.theory.version !== context.result.theory.version ||
      manifest.requirementAddress !== context.result.requirementAddress
    ) {
      return m031EvidenceError(
        "result-mismatch",
        "result",
        "M031 evidence does not belong to the checked theory result",
      );
    }
  }
  if (context.core !== undefined) {
    const coreError = m031CheckCore(manifest, context.core);
    if (coreError !== undefined) return coreError;
  }
  return undefined;
};

const decodeM031TargetQualificationEvidenceValue = (
  value: unknown,
): Effect.Effect<M031TargetQualificationEvidence, M031TargetQualificationEvidenceError> =>
  Schema.decodeUnknownEffect(M031TargetQualificationEvidenceSchema)(value, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      m031EvidenceError(
        "invalid-manifest",
        "M031TargetQualificationEvidence",
        `invalid M031 target qualification evidence: ${String(issue)}`,
      ),
    ),
    Effect.flatMap((manifest) => {
      const materialError = m031CheckMaterialUniqueness(manifest);
      if (materialError !== undefined) return Effect.fail(materialError);
      const targetMaterialError = m031CheckTargetMaterialPaths(manifest);
      if (targetMaterialError !== undefined) return Effect.fail(targetMaterialError);
      const observationError = m031CheckObservations(manifest);
      if (observationError !== undefined) return Effect.fail(observationError);
      if (manifest.producer.targetId !== manifest.targetId) {
        return Effect.fail(
          m031EvidenceError(
            "target-mismatch",
            "producer.targetId",
            "M031 producer target does not match the evidence target",
          ),
        );
      }
      if (manifest.requirementAddress !== m031ExpectedRequirementAddress(manifest.realizationId)) {
        return Effect.fail(
          m031EvidenceError(
            "identity-mismatch",
            "requirementAddress",
            "M031 evidence must select the DebitAccount requirement of WithdrawAccountOnce",
          ),
        );
      }
      return Effect.succeed(manifest);
    }),
  );

/** Decode strict M031 JSON or an already parsed evidence record. */
export const decodeM031TargetQualificationEvidence = (
  input: unknown,
): Effect.Effect<M031TargetQualificationEvidence, M031TargetQualificationEvidenceError> =>
  typeof input === "string"
    ? Schema.decodeUnknownEffect(M031TargetQualificationEvidenceFromJson)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((issue) =>
          m031EvidenceError(
            "invalid-manifest",
            "M031TargetQualificationEvidence",
            `invalid M031 target qualification evidence JSON: ${String(issue)}`,
          ),
        ),
        Effect.flatMap((manifest) => decodeM031TargetQualificationEvidenceValue(manifest)),
      )
    : decodeM031TargetQualificationEvidenceValue(input);

/** Validate M031 evidence and brand it after identity checks. */
export const checkM031TargetQualificationEvidence = (
  manifest: M031TargetQualificationEvidence,
  context: M031TargetQualificationEvidenceContext = {},
): Effect.Effect<CheckedM031TargetQualificationEvidence, M031TargetQualificationEvidenceError> =>
  Effect.gen(function* () {
    const decoded = yield* decodeM031TargetQualificationEvidenceValue(manifest);
    const contextError = m031CheckContext(decoded, context);
    if (contextError !== undefined) return yield* contextError;
    return yield* Schema.decodeEffect(CheckedM031TargetQualificationEvidenceSchema)(decoded).pipe(
      Effect.mapError((issue) =>
        m031EvidenceError(
          "invalid-manifest",
          "CheckedM031TargetQualificationEvidence",
          `invalid checked M031 target qualification evidence: ${String(issue)}`,
        ),
      ),
    );
  });

/** Convenience form matching the historical M018 Core-check signature. */
export const checkM031TargetQualificationEvidenceAgainstCore = (
  manifest: M031TargetQualificationEvidence,
  core: CheckedCoreDocument,
  context: Omit<M031TargetQualificationEvidenceContext, "core"> = {},
): Effect.Effect<CheckedM031TargetQualificationEvidence, M031TargetQualificationEvidenceError> =>
  checkM031TargetQualificationEvidence(manifest, { ...context, core });

/** Check the ordered Effect/Gleam pair without allowing shared target evidence. */
export const checkM031TargetQualificationEvidenceSet = Effect.fn(
  "checkM031TargetQualificationEvidenceSet",
)(function* (
  manifests: ReadonlyArray<M031TargetQualificationEvidence>,
  context: Omit<M031TargetQualificationEvidenceContext, "targetId"> = {},
): Effect.fn.Return<
  ReadonlyArray<CheckedM031TargetQualificationEvidence>,
  M031TargetQualificationEvidenceError
> {
  if (manifests.length !== 2) {
    return yield* m031EvidenceError(
      "shared-evidence",
      "manifests",
      "M031 qualification requires exactly one Effect and one Gleam evidence record",
    );
  }
  if (manifests[0]?.targetId !== "effect-typescript" || manifests[1]?.targetId !== "gleam-beam") {
    return yield* m031EvidenceError(
      "target-mismatch",
      "manifests.targetId",
      "M031 target evidence must be ordered Effect TypeScript followed by Gleam/BEAM",
    );
  }
  const checked: Array<CheckedM031TargetQualificationEvidence> = [];
  for (const manifest of manifests) {
    checked.push(
      yield* checkM031TargetQualificationEvidence(manifest, {
        ...context,
        targetId: manifest.targetId,
      }),
    );
  }
  const effect = checked.find(({ targetId }) => targetId === "effect-typescript");
  const gleam = checked.find(({ targetId }) => targetId === "gleam-beam");
  if (effect === undefined || gleam === undefined) {
    return yield* m031EvidenceError(
      "shared-evidence",
      "manifests.targetId",
      "M031 qualification evidence must contain distinct Effect and Gleam targets",
    );
  }
  if (
    effect.selectionId !== gleam.selectionId ||
    effect.artifactId !== gleam.artifactId ||
    effect.artifactFormat !== gleam.artifactFormat ||
    effect.theory.id !== gleam.theory.id ||
    effect.theory.version !== gleam.theory.version ||
    effect.package.semanticDigest !== gleam.package.semanticDigest ||
    effect.requirementAddress !== gleam.requirementAddress
  ) {
    return yield* m031EvidenceError(
      "identity-mismatch",
      "manifests",
      "M031 target evidence records must share the checked selection, artifact, package, and requirement identity",
    );
  }
  const gleamPaths = new Set(gleam.materials.map(({ path }) => path));
  for (const material of effect.materials) {
    if (!gleamPaths.has(material.path)) continue;
    const sharedRole = material.role.toLowerCase();
    if (
      !sharedRole.includes("core") &&
      !sharedRole.includes("package") &&
      !sharedRole.includes("theory")
    ) {
      return yield* m031EvidenceError(
        "shared-evidence",
        material.path,
        "M031 target evidence must not share target-specific material paths",
      );
    }
  }
  return checked;
});

/**
 * Verify every repository material against its recorded SHA-256 digest.
 * PIDs and temporary directories never enter this boundary: only stable,
 * repository-relative material references are accepted by the schema.
 */
export const verifyM031TargetQualificationEvidenceMaterials = Effect.fn(
  "verifyM031TargetQualificationEvidenceMaterials",
)(function* (
  manifest: M031TargetQualificationEvidence,
): Effect.fn.Return<
  M031TargetQualificationEvidence,
  M031TargetQualificationEvidenceError,
  FileSystem.FileSystem | Crypto.Crypto
> {
  const decoded = yield* decodeM031TargetQualificationEvidenceValue(manifest);
  const fileSystem = yield* FileSystem.FileSystem;
  for (const material of decoded.materials) {
    const bytes = yield* fileSystem
      .readFile(material.path)
      .pipe(
        Effect.mapError(() =>
          m031EvidenceError(
            "stale-material",
            material.path,
            `M031 material is unavailable: ${material.path}`,
          ),
        ),
      );
    const observedDigest = yield* digestM010Bytes(bytes).pipe(
      Effect.mapError(() =>
        m031EvidenceError(
          "stale-material",
          material.path,
          `M031 could not digest material ${material.path}`,
        ),
      ),
    );
    if (observedDigest !== material.sha256) {
      return yield* m031EvidenceError(
        "stale-material",
        material.path,
        `M031 material digest differs for ${material.path}`,
      );
    }
  }
  return decoded;
});

/** Verify generated or temporary material bytes before atomic publication. */
export const verifyM031TargetQualificationEvidenceMaterialBytes = Effect.fn(
  "verifyM031TargetQualificationEvidenceMaterialBytes",
)(function* (
  manifest: M031TargetQualificationEvidence,
  materialBytes: Readonly<Record<string, Uint8Array>>,
): Effect.fn.Return<
  M031TargetQualificationEvidence,
  M031TargetQualificationEvidenceError,
  Crypto.Crypto
> {
  const decoded = yield* decodeM031TargetQualificationEvidenceValue(manifest);
  for (const material of decoded.materials) {
    const bytes = materialBytes[material.path];
    if (bytes === undefined) {
      return yield* m031EvidenceError(
        "stale-material",
        material.path,
        `M031 generated material bytes are unavailable: ${material.path}`,
      );
    }
    const observedDigest = yield* digestM010Bytes(bytes).pipe(
      Effect.mapError(() =>
        m031EvidenceError(
          "stale-material",
          material.path,
          `M031 could not digest generated material ${material.path}`,
        ),
      ),
    );
    if (observedDigest !== material.sha256) {
      return yield* m031EvidenceError(
        "stale-material",
        material.path,
        `M031 generated material digest differs for ${material.path}`,
      );
    }
  }
  return decoded;
});

/** Verify the package bytes against the semantic digest retained by evidence. */
export const verifyM031TargetQualificationEvidencePackageDigest = Effect.fn(
  "verifyM031TargetQualificationEvidencePackageDigest",
)(function* (
  encodedPackage: string,
  expectedDigest: string,
): Effect.fn.Return<void, M031TargetQualificationEvidenceError, Crypto.Crypto> {
  if (!/^sha256:[0-9a-f]{64}$/u.test(expectedDigest)) {
    return yield* m031EvidenceError(
      "package-digest-mismatch",
      "package.semanticDigest",
      "M031 expected package digest is not a sha256-prefixed lowercase digest",
    );
  }
  const observed = yield* digestM010Bytes(new TextEncoder().encode(encodedPackage)).pipe(
    Effect.mapError(() =>
      m031EvidenceError(
        "package-digest-mismatch",
        "package",
        "M031 could not compute the package semantic digest",
      ),
    ),
  );
  if (`sha256:${observed}` !== expectedDigest) {
    return yield* m031EvidenceError(
      "package-digest-mismatch",
      "package.semanticDigest",
      "M031 package semantic digest differs from the recorded digest",
    );
  }
});

const m031SortedStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...values].toSorted();

/**
 * Encode M031 evidence with canonical object-key ordering and stable
 * set-like metadata/material ordering. This is synchronous because encoding
 * a checked in-memory record has no external authority or failure path.
 */
export const encodeM031TargetQualificationEvidence = (
  manifest: M031TargetQualificationEvidence,
): string =>
  encodeCanonicalJson({
    ...manifest,
    materials: [...manifest.materials].toSorted(
      (left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path),
    ),
    assumptions: m031SortedStrings(manifest.assumptions),
    weakenings: m031SortedStrings(manifest.weakenings),
    limitations: m031SortedStrings(manifest.limitations),
    invalidators: m031SortedStrings(manifest.invalidators),
  });

const m031FormatList = (values: ReadonlyArray<string>): string =>
  values.length === 0 ? "none" : [...values].toSorted().join("; ");

const m031FormatTrace = (trace: typeof M031TraceSchema.Type): string =>
  [
    `valid=${trace.valid}`,
    `reuse=${trace.reuse}`,
    `competing=${trace.competing}`,
    `wrongDestination=${trace.wrongDestination}`,
    `disabled=${trace.disabled}`,
    `defect=${trace.defect}`,
    `stale=${trace.stale}`,
    `replacement=${trace.replacement}`,
  ].join("; ");

/** Format checked M031 evidence without claiming universal exact-once behavior. */
export const formatM031TargetQualificationEvidenceReport = (
  manifest: M031TargetQualificationEvidence,
): string => {
  const observation = manifest.observations;
  const materials = [...manifest.materials]
    .toSorted(
      (left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path),
    )
    .map(({ role, path, sha256 }) => `Material ${role}: ${path} [${sha256}]`);
  const lines = [
    "M031 target qualification evidence",
    `Selection: ${manifest.selectionId}`,
    `Target: ${manifest.targetId}; realization ${manifest.realizationId}; entity ${observation.entity}`,
    `Artifact: ${manifest.artifactId} (${manifest.artifactFormat})`,
    `Theory: ${manifest.theory.id} v${manifest.theory.version}`,
    `Package: ${manifest.package.id} v${manifest.package.version} [${manifest.package.semanticDigest}]`,
    `Requirement: ${manifest.requirementAddress}`,
    "Bounded observations:",
    `  valid call consumes grant: ${observation.validCall}`,
    `  reuse rejected before handler: ${observation.reuse}`,
    `  competing calls have one success and one rejection: ${observation.competing} (${observation.competingSuccesses}/${observation.competingRejections})`,
    `  wrong destination preserves grant: ${observation.wrongDestination}`,
    `  disabled transition preserves grant: ${observation.disabled}`,
    `  defect does not restore grant: ${observation.defect}`,
    `  state trace: ${m031FormatTrace(observation.stateTrace)}`,
    `  remaining-use trace: ${m031FormatTrace(observation.remainingTrace)}`,
    `  actor restart: ${
      observation.actorRestart === undefined
        ? "not applicable"
        : `old grant rejected=${observation.actorRestart.oldGrantRejected}; fresh grant distinct=${observation.actorRestart.freshGrantDistinct}; replacement accepted=${observation.actorRestart.replacementGrantAccepted}; supervised=${observation.actorRestart.supervised}`
    }`,
    ...materials,
    `Producer: ${manifest.producer.identity} v${manifest.producer.version} (${manifest.producer.targetId})`,
    `Assumptions: ${m031FormatList(manifest.assumptions)}`,
    `Weakenings: ${m031FormatList(manifest.weakenings)}`,
    `Limitations: ${m031FormatList(manifest.limitations)}`,
    `Lifetime: ${manifest.lifetime}`,
    `Invalidators: ${m031FormatList(manifest.invalidators)}`,
  ];
  return lines.join("\n");
};

/** Explicit manifest aliases for applications migrating from M018 naming. */
export const decodeM031TargetQualificationEvidenceManifest = decodeM031TargetQualificationEvidence;
export const checkM031TargetQualificationEvidenceManifest = checkM031TargetQualificationEvidence;
export const verifyM031TargetQualificationEvidenceManifestMaterials =
  verifyM031TargetQualificationEvidenceMaterials;
export const encodeM031TargetQualificationEvidenceManifest = encodeM031TargetQualificationEvidence;
