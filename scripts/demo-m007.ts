import { deriveStateInvariantObligations, validateCore } from "@bang/core";
import type { StateInvariantObligation } from "@bang/core";
import { sourceToCore } from "@bang/surface";
import {
  checkPropertyTestEvidenceRecord,
  EvidenceError,
  formatPropertyTestEvidenceReport,
  PropertyTestEvidenceRecord,
  PropertyTestEvidenceRecordFromJson,
} from "@bang/evidence";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Path, Result, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const StateLawObservationFromJson = Schema.fromJsonString(
  Schema.Struct({
    lawful: Schema.Array(
      Schema.Struct({
        obligation: Schema.String,
        operation: Schema.String,
        invariant: Schema.String,
        passed: Schema.Boolean,
        requestedCases: Schema.Finite,
        executedRuns: Schema.Finite,
        numSkips: Schema.Finite,
        seed: Schema.Finite,
        numShrinks: Schema.Finite,
        counterexamplePath: Schema.NullOr(Schema.String),
        counterexample: Schema.NullOr(Schema.Array(Schema.String)),
      }),
    ),
  }),
);

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", {
  message: Schema.String,
}) {}

const fixture = "examples/tiny-bank/account.bang";
const evidencePath = ".bang/evidence/M007.json";
const obligationId = "Account.withdraw.preserves.nonnegativeBalance";

const read = Effect.fn("demoM007.read")(function* (file: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.readFileString(file);
});

const run = Effect.fn("demoM007.run")(function* (
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

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.remove(evidencePath, { force: true });

  const document = yield* Effect.fromResult(sourceToCore(yield* read(fixture)));
  const checked = yield* validateCore(document);
  const obligations = deriveStateInvariantObligations(checked);
  const obligation = yield* findObligation(obligations);
  yield* Console.log(`PASS normalized Core obligation ${obligation.id}`);

  yield* run(["bun", "run", "scripts/prepare-m004.ts"]);
  const diagnostics = yield* Schema.decodeEffect(StateLawObservationFromJson)(
    yield* run(["bun", "run", "examples/tiny-bank/state/state-diagnostics.ts"], "pipe"),
  );
  const observation = diagnostics.lawful.find(({ obligation: id }) => id === obligation.id);
  if (observation === undefined) {
    return yield* new DemoError({ message: `target observation omitted ${obligation.id}` });
  }
  if (!observation.passed || observation.executedRuns !== 100 || observation.seed !== 20260813) {
    return yield* new DemoError({
      message: `unexpected property observation for ${obligation.id}`,
    });
  }
  yield* Console.log("PASS generated property observation: 100 sampled cases, seed 20260813");

  const record = PropertyTestEvidenceRecord.make({
    obligation,
    observation: {
      class: "property-tested",
      result: "passed",
      scope: "sampled",
      requestedCases: observation.requestedCases,
      executedCases: observation.executedRuns,
      seed: observation.seed,
      shrinkCount: observation.numShrinks,
      ...(observation.counterexample === null
        ? {}
        : { counterexample: observation.counterexample }),
      ...(observation.counterexamplePath === null
        ? {}
        : { replayPath: observation.counterexamplePath }),
    },
    provenance: {
      coreSource: fixture,
      generatedKit: "tests/snapshots/M004-AccountStateMachine.ts",
      realization: "examples/tiny-bank/implementation/account-withdrawal.ts",
      evaluator: "generated Effect FastCheck state-machine suite",
    },
    producer: {
      identity: "bun run examples/tiny-bank/state/state-diagnostics.ts",
      trust: "assumed-truthful",
    },
    environment: {
      toolVersions: {
        effect: "4.0.0-rc.108",
        effectVitest: "4.0.0-rc.108",
        vitest: "4.1.10",
      },
      target: { name: "effect-typescript", version: "TypeScript 7.0.2" },
    },
    qualification: {
      assumptions: [
        "the producer reports the executed property observation truthfully",
        "the independent realization is exercised through the generated conformance boundary",
      ],
      unsupportedClaims: [
        {
          claim: "Account.withdraw preserves nonnegativeBalance for all bigint inputs",
          reason: "100 generated cases are sampled evidence, not an exhaustive or proved result",
        },
        {
          claim: "arbitrary TypeScript preserves the generated boundary",
          reason: "unsafe casts, foreign JavaScript, or direct implementation calls can bypass it",
        },
      ],
      lifetime: "valid while the recorded dependencies and boundaries remain unchanged",
      invalidators: [
        "changes to the Core state machine, operation, or invariant",
        "changes to the generated kit, realization, evaluator, case count, or seed",
        "changes to the recorded tool or target versions",
        "unsafe code that bypasses the generated Schema or realization boundary",
      ],
    },
  });

  const checkedRecord = yield* checkPropertyTestEvidenceRecord(record, obligations);
  yield* Console.log("PASS evidence record references the normalized Core obligation");

  const unknownRecord = PropertyTestEvidenceRecord.make({
    ...record,
    obligation: { ...record.obligation, id: "Account.withdraw.preserves.missing" },
  });
  const unknownError = yield* Effect.flip(
    checkPropertyTestEvidenceRecord(unknownRecord, obligations),
  );
  if (!(unknownError instanceof EvidenceError) || unknownError.reason !== "unknown-obligation") {
    return yield* new DemoError({ message: "unknown obligation did not fail as EvidenceError" });
  }
  yield* Console.log("PASS unknown obligation reference rejected");

  const overstated = yield* Effect.result(
    Schema.decodeEffect(PropertyTestEvidenceRecordFromJson)(
      JSON.stringify({
        ...record,
        observation: { ...record.observation, scope: "unbounded" },
      }),
    ),
  );
  if (!Result.isFailure(overstated)) {
    return yield* new DemoError({ message: "unbounded property evidence was accepted" });
  }
  yield* Console.log("PASS property-tested evidence cannot claim unbounded scope");

  const evidenceText = yield* Schema.encodeEffect(PropertyTestEvidenceRecordFromJson)(
    checkedRecord,
  );
  yield* fileSystem.makeDirectory(path.dirname(evidencePath), { recursive: true });
  yield* fileSystem.writeFileString(evidencePath, `${evidenceText}\n`);

  yield* Console.log(`\n${formatPropertyTestEvidenceReport(checkedRecord)}`);
  yield* Console.log(`\nManifest: ${evidencePath}`);
});

// This executable module selects Bun's standard platform Layer at the composition root.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
