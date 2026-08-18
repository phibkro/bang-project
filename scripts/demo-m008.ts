import { deriveStateInvariantObligations, validateCore } from "@bang/core";
import type { StateInvariantObligation } from "@bang/core";
import { sourceToCore } from "@bang/surface";
import {
  checkRuntimeTraceEvidenceRecord,
  formatRuntimeTraceEvidenceReport,
  RuntimeTraceEvidenceRecord,
  RuntimeTraceEvidenceRecordFromJson,
  RuntimeTraceEvent,
} from "@bang/evidence";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Path, Result, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const SerializedTraceEvent = Schema.TaggedUnion({
  Started: {
    sequence: Schema.Literal(0),
    invocationId: Schema.String,
    operationId: Schema.String,
    preState: Schema.Struct({ balance: Schema.String }),
    input: Schema.Struct({ amount: Schema.String }),
  },
  Succeeded: {
    sequence: Schema.Literal(1),
    invocationId: Schema.String,
    postState: Schema.Struct({ balance: Schema.String }),
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
const RuntimeDiagnosticsFromJson = Schema.fromJsonString(
  Schema.Struct({
    success: Schema.Array(SerializedTraceEvent),
    rejected: Schema.Array(SerializedTraceEvent),
    defect: Schema.Array(SerializedTraceEvent),
  }),
);

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", {
  message: Schema.String,
}) {}

const fixture = "examples/tiny-bank/account.bang";
const generatedKit = "tests/snapshots/M008-WithdrawAccountTrace.ts";
const evidencePath = ".bang/evidence/M008.json";
const obligationId = "Account.withdraw.preserves.nonnegativeBalance";

const read = Effect.fn("demoM008.read")(function* (file: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.readFileString(file);
});

const run = Effect.fn("demoM008.run")(function* (
  command: readonly [string, ...Array<string>],
  stdout: "inherit" | "pipe" = "inherit",
) {
  const handle = yield* ChildProcess.make(command[0], command.slice(1), {
    stdout,
    stderr: "inherit",
  });
  const output =
    stdout === "pipe" ? yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString) : "";
  const exitCode = yield* handle.exitCode;
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new DemoError({ message: `${command.join(" ")} exited ${exitCode}` });
  }
  return output;
}, Effect.scoped);

const findObligation = (
  obligations: ReadonlyArray<StateInvariantObligation>,
): Effect.Effect<StateInvariantObligation, DemoError> => {
  const obligation = obligations.find(({ id }) => id === obligationId);
  return obligation === undefined
    ? Effect.fail(new DemoError({ message: `normalized Core omitted ${obligationId}` }))
    : Effect.succeed(obligation);
};

const decodeTrace = (
  events: ReadonlyArray<typeof SerializedTraceEvent.Type>,
): Effect.Effect<ReadonlyArray<RuntimeTraceEvent>, DemoError> =>
  Schema.decodeUnknownEffect(Schema.Array(RuntimeTraceEvent))(events).pipe(
    Effect.mapError((issue) => new DemoError({ message: String(issue) })),
  );

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.remove(evidencePath, { force: true });

  const document = yield* Effect.fromResult(sourceToCore(yield* read(fixture)));
  const checked = yield* validateCore(document);
  const obligations = deriveStateInvariantObligations(checked);
  const obligation = yield* findObligation(obligations);
  yield* Console.log(`PASS normalized Core obligation ${obligation.id}`);

  yield* run(["bun", "run", "scripts/prepare-m008.ts"]);
  yield* run([
    "bun",
    "x",
    "tsc",
    "--noEmit",
    "--project",
    "examples/tiny-bank/capability/tsconfig.json",
  ]);
  yield* Console.log("PASS deterministic observable Effect boundary compiles");

  const diagnostics = yield* Schema.decodeEffect(RuntimeDiagnosticsFromJson)(
    yield* run(
      ["bun", "run", "examples/tiny-bank/capability/runtime-trace-diagnostics.ts"],
      "pipe",
    ),
  );
  const success = yield* decodeTrace(diagnostics.success);
  const rejected = yield* decodeTrace(diagnostics.rejected);
  const defect = yield* decodeTrace(diagnostics.defect);

  if (
    success[0]?._tag !== "Started" ||
    success[1]?._tag !== "Succeeded" ||
    String(success[1].postState) !== "[object Object]"
  ) {
    return yield* new DemoError({ message: "legal withdrawal did not produce a success trace" });
  }
  if (rejected[1]?._tag !== "TypedFailure" || rejected[1].failureId !== "WithdrawalRejected") {
    return yield* new DemoError({ message: "overdraft did not preserve typed rejection" });
  }
  if (defect[1]?._tag !== "Defect" || !defect[1].defect.includes("defecting withdrawal")) {
    return yield* new DemoError({ message: "defect trace was not preserved" });
  }
  yield* Console.log("PASS legal withdrawal trace: Started[0] then Succeeded[1]");
  yield* Console.log("PASS overdraft trace retains WithdrawalRejected");
  yield* Console.log("PASS implementation defect remains distinct");

  const violatingEvents = yield* Schema.decodeUnknownEffect(Schema.Array(RuntimeTraceEvent))([
    {
      _tag: "Started",
      sequence: 0,
      invocationId: "withdraw-violation-001",
      operationId: "withdraw",
      preState: { balance: "0" },
      input: { amount: "0" },
    },
    {
      _tag: "Succeeded",
      sequence: 1,
      invocationId: "withdraw-violation-001",
      postState: { balance: "-1" },
    },
  ]);

  const record = RuntimeTraceEvidenceRecord.make({
    obligation,
    observation: {
      class: "runtime-monitored",
      result: "violated",
      scope: "single-closed-trace",
      invocationId: "withdraw-violation-001",
      operationId: "withdraw",
      events: violatingEvents,
      firstViolation: {
        eventIndex: 1,
        reason: "nonnegativeBalance is false for returned balance -1",
      },
    },
    provenance: {
      coreSource: fixture,
      generatedKit,
      realization: "examples/tiny-bank/implementation/account-withdrawal-effect.ts",
      evaluator: "BANG finite runtime trace monitor",
    },
    producer: {
      identity: "bun run examples/tiny-bank/capability/runtime-trace-diagnostics.ts",
      trust: "assumed-truthful",
    },
    environment: {
      toolVersions: { effect: "4.0.0-rc.108", effectTsgo: "0.36.4" },
      target: { name: "effect-typescript", version: "TypeScript 7.0.2" },
    },
    qualification: {
      assumptions: [
        "the generated boundary reports every event for this invocation in order",
        "the producer reports the observed runtime values truthfully",
      ],
      unsupportedClaims: [
        {
          claim: "all Account.withdraw executions preserve nonnegativeBalance",
          reason: "one finite runtime trace is an observation, not universal proof",
        },
        {
          claim: "all implementation calls cross the generated monitor",
          reason: "direct calls, unsafe casts, or foreign JavaScript can bypass the boundary",
        },
      ],
      lifetime: "valid for this closed trace and recorded implementation boundary",
      invalidators: [
        "changes to the Core operation or invariant",
        "changes to the generated boundary, realization, monitor, or tool versions",
        "missing, reordered, fabricated, or bypassed events",
      ],
    },
  });
  const checkedRecord = yield* checkRuntimeTraceEvidenceRecord(record, obligations);
  yield* Console.log("PASS violation identifies event 1 and normalized obligation");

  const outcomeBeforeStart = yield* Effect.result(
    Schema.decodeUnknownEffect(RuntimeTraceEvidenceRecord)({
      ...record,
      observation: { ...record.observation, events: [record.observation.events[1]] },
    }),
  );
  const startOnly = yield* Effect.result(
    Schema.decodeUnknownEffect(RuntimeTraceEvidenceRecord)({
      ...record,
      observation: { ...record.observation, events: [record.observation.events[0]] },
    }),
  );
  if (!Result.isFailure(outcomeBeforeStart) || !Result.isFailure(startOnly)) {
    return yield* new DemoError({ message: "malformed closed trace was accepted" });
  }
  yield* Console.log("PASS outcome-before-start and start-only traces rejected");

  const evidenceText = yield* Schema.encodeEffect(RuntimeTraceEvidenceRecordFromJson)(
    checkedRecord,
  );
  yield* fileSystem.makeDirectory(path.dirname(evidencePath), { recursive: true });
  yield* fileSystem.writeFileString(evidencePath, `${evidenceText}\n`);
  yield* Console.log(`\n${formatRuntimeTraceEvidenceReport(checkedRecord)}`);
  yield* Console.log(`Manifest: ${evidencePath}`);
});

// This executable module selects Bun's standard platform Layer at the composition root.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
