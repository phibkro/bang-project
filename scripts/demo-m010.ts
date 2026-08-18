import {
  M010ReplayManifest,
  M010ReplayManifestFromJson,
  M010ReplayError,
  PropertyTestEvidenceRecord,
  compareM010Observation,
  decodeM010ReplayManifest,
  formatM010AcceptedReport,
  formatM010RejectedReport,
  loadM010Core,
  loadM010Manifest,
  selectM010Obligation,
  verifyM010Inputs,
} from "@bang/evidence";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Crypto, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const evidencePath = ".bang/evidence/M010.json";
const obligationId = "Account.withdraw.preserves.nonnegativeBalance";
const requestedCases = 100;
const seed = 20260813;

const closure = [
  "examples/tiny-bank/account.bang",
  "generated/effect/AccountStateMachine.ts",
  "examples/tiny-bank/implementation/account-state-machine.ts",
  "examples/tiny-bank/state/state-diagnostics.ts",
] as const;

type Argv = readonly [string, ...Array<string>];

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

const runProcess = Effect.fn("demoM010.runProcess")(function* (argv: Argv) {
  const process = yield* ChildProcess.make(argv[0], argv.slice(1), {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = yield* process.stdout.pipe(Stream.decodeText(), Stream.mkString);
  const stderr = yield* process.stderr.pipe(Stream.decodeText(), Stream.mkString);
  const exitCode = yield* process.exitCode;
  return { argv, exitCode, stdout, stderr };
}, Effect.scoped);

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const assertFailure = (expected: M010ReplayError["reason"], error: unknown) =>
  Effect.gen(function* () {
    if (!(error instanceof M010ReplayError) || error.reason !== expected) {
      return yield* new DemoError({
        message: `expected ${expected}, received ${String(error)}`,
      });
    }
    yield* Console.log(`PASS ${expected}`);
    yield* Console.log(formatM010RejectedReport(error));
  });

const program = Effect.scoped(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    yield* fileSystem.remove(evidencePath, { force: true });

    const prepared = yield* runProcess(["bun", "run", "scripts/prepare-m004.ts"]);
    if (prepared.exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new DemoError({
        message: `M004 preparation failed: ${prepared.stderr || prepared.stdout}`,
      });
    }
    yield* Console.log("PASS prepared M004 generated state-machine kit");

    const diagnosticsProcess = yield* runProcess([
      "bun",
      "run",
      "examples/tiny-bank/state/state-diagnostics.ts",
    ]);
    if (diagnosticsProcess.exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new DemoError({
        message: `state diagnostics failed: ${diagnosticsProcess.stderr || diagnosticsProcess.stdout}`,
      });
    }
    const diagnostics = yield* Schema.decodeEffect(StateLawObservationFromJson)(
      diagnosticsProcess.stdout,
    );
    const observation = diagnostics.lawful.find(({ obligation }) => obligation === obligationId);
    if (observation === undefined) {
      return yield* new DemoError({ message: `state diagnostics omitted ${obligationId}` });
    }
    if (
      !observation.passed ||
      observation.requestedCases !== requestedCases ||
      observation.executedRuns !== requestedCases ||
      observation.seed !== seed
    ) {
      return yield* new DemoError({ message: "unexpected M007 property observation" });
    }
    yield* Console.log("PASS M007 observation: 100 sampled cases, seed 20260813");

    const inputs = [
      { role: "account-source", path: closure[0] },
      { role: "generated-kit", path: closure[1] },
      { role: "realization", path: closure[2] },
      { role: "evaluator", path: closure[3] },
    ] as const;
    const digestInputs = yield* Effect.forEach(inputs, ({ role, path: inputPath }) =>
      Effect.gen(function* () {
        const bytes = yield* fileSystem.readFile(inputPath);
        const digest = yield* crypto.digest("SHA-256", bytes);
        return { role, path: inputPath, sha256: hex(digest) };
      }),
    );

    const record = PropertyTestEvidenceRecord.make({
      obligation: {
        id: obligationId,
        stateMachine: "Account",
        operation: "withdraw",
        relation: "preserves",
        invariant: "nonnegativeBalance",
      },
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
        coreSource: closure[0],
        generatedKit: closure[1],
        realization: closure[2],
        evaluator: closure[3],
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
          "the four-file closure names every directly loaded material input",
        ],
        unsupportedClaims: [
          {
            claim: "Account.withdraw preserves nonnegativeBalance for all bigint inputs",
            reason: "100 generated cases are sampled evidence, not an exhaustive or proved result",
          },
          {
            claim: "arbitrary TypeScript preserves the generated boundary",
            reason:
              "unsafe casts, foreign JavaScript, or direct implementation calls can bypass it",
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

    const manifest = M010ReplayManifest.make({
      bangEvidence: 1,
      kind: "property-test-replay",
      inputs: digestInputs,
      coreInput: { path: closure[0] },
      record,
      replay: {
        argv: ["bun", "run", "examples/tiny-bank/state/state-diagnostics.ts"],
        obligationId,
        requestedCases,
        seed,
      },
      qualification: {
        inputClosure: "declared-not-proven-complete",
        producerTruth: "assumed-truthful",
        unsafeBoundary: "bypassable",
      },
    });

    const manifestText = yield* Schema.encodeEffect(M010ReplayManifestFromJson)(manifest);
    yield* fileSystem.makeDirectory(path.dirname(evidencePath), { recursive: true });
    yield* fileSystem.writeFileString(evidencePath, `${manifestText}\n`);
    yield* Console.log(`PASS recorded exact four-file SHA-256 closure`);
    for (const input of digestInputs) {
      yield* Console.log(`  ${input.path} sha256=${input.sha256}`);
    }

    const loaded = yield* loadM010Manifest(evidencePath);
    const checkedCore = yield* loadM010Core(loaded);
    const obligation = yield* selectM010Obligation(loaded, checkedCore);
    yield* Console.log(`PASS strict envelope loaded and all recorded bytes verified`);
    yield* Console.log(`PASS normalized Core obligation ${obligation.id}`);

    const replayProcess = yield* runProcess(loaded.replay.argv);
    if (replayProcess.exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new M010ReplayError({
        reason: "replay-failed",
        obligationId: loaded.replay.obligationId,
        message: `replay command failed: ${replayProcess.stderr || replayProcess.stdout}`,
      });
    }
    const replayResult = yield* Effect.result(
      Schema.decodeEffect(StateLawObservationFromJson)(replayProcess.stdout),
    );
    if (replayResult._tag === "Failure") {
      return yield* new M010ReplayError({
        reason: "replay-failed",
        obligationId: loaded.replay.obligationId,
        message: `replay output was invalid: ${String(replayResult.failure)}`,
      });
    }
    const replayRow = replayResult.success.lawful.find(
      ({ obligation: id }) => id === loaded.replay.obligationId,
    );
    if (replayRow === undefined) {
      return yield* new M010ReplayError({
        reason: "replay-failed",
        obligationId: loaded.replay.obligationId,
        message: `replay omitted ${loaded.replay.obligationId}`,
      });
    }
    const replayObservation = {
      class: "property-tested" as const,
      result: replayRow.passed ? ("passed" as const) : ("failed" as const),
      scope: "sampled" as const,
      requestedCases: replayRow.requestedCases,
      executedCases: replayRow.executedRuns,
      seed: replayRow.seed,
      shrinkCount: replayRow.numShrinks,
      ...(replayRow.counterexample === null ? {} : { counterexample: replayRow.counterexample }),
      ...(replayRow.counterexamplePath === null
        ? {}
        : { replayPath: replayRow.counterexamplePath }),
    };
    yield* compareM010Observation(loaded.record.observation, replayObservation);
    yield* Console.log(
      formatM010AcceptedReport(loaded, checkedCore, obligation, replayObservation),
    );
    yield* Console.log(`PASS replay accepted for ${loaded.replay.obligationId}`);

    const tempDirectory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "bang-m010-" });
    const temporaryInputs = yield* Effect.forEach(loaded.inputs, (input) =>
      Effect.gen(function* () {
        const temporaryPath = path.join(tempDirectory, input.path);
        yield* fileSystem.makeDirectory(path.dirname(temporaryPath), { recursive: true });
        yield* fileSystem.copyFile(input.path, temporaryPath);
        return { ...input, path: temporaryPath };
      }),
    );

    const changedInput = temporaryInputs[0];
    if (changedInput === undefined) {
      return yield* new DemoError({ message: "recorded input closure is unexpectedly empty" });
    }
    const changedPath = changedInput.path;
    const changedBytes = new Uint8Array(yield* fileSystem.readFile(changedPath));
    const firstByte = changedBytes[0];
    if (firstByte === undefined) {
      return yield* new DemoError({ message: `cannot change empty input ${changedPath}` });
    }
    changedBytes[0] = firstByte ^ 0xff;
    yield* fileSystem.writeFile(changedPath, changedBytes);
    const staleManifest = {
      ...loaded,
      inputs: temporaryInputs,
      coreInput: { path: changedInput.path },
    };
    yield* assertFailure("stale-input", yield* Effect.flip(verifyM010Inputs(staleManifest)));

    const missingInputs = loaded.inputs.map((input, index) =>
      index === 1 ? { ...input, path: path.join(tempDirectory, "missing-input.json") } : input,
    );
    const missingManifest = {
      ...loaded,
      inputs: missingInputs,
      coreInput: loaded.coreInput,
    };
    yield* assertFailure("missing-input", yield* Effect.flip(verifyM010Inputs(missingManifest)));
    const mismatchedRecord = {
      ...loaded.record,
      observation: { ...loaded.record.observation, seed: loaded.record.observation.seed + 1 },
    };
    yield* assertFailure(
      "replay-mismatch",
      yield* Effect.flip(compareM010Observation(mismatchedRecord.observation, replayObservation)),
    );

    const unknownEnvelope = { ...JSON.parse(manifestText), unexpected: true };
    yield* assertFailure(
      "invalid-manifest",
      yield* Effect.flip(decodeM010ReplayManifest(JSON.stringify(unknownEnvelope))),
    );

    const unknownObligationManifest = {
      ...loaded,
      replay: { ...loaded.replay, obligationId: "Account.withdraw.preserves.missing" },
    };
    yield* assertFailure(
      "unknown-obligation",
      yield* Effect.flip(selectM010Obligation(unknownObligationManifest, checkedCore)),
    );

    const secondManifestText = yield* Schema.encodeEffect(M010ReplayManifestFromJson)(loaded);
    if (manifestText !== secondManifestText) {
      return yield* new DemoError({ message: "consecutive M010 manifests are not byte-identical" });
    }
    yield* Console.log("PASS consecutive M010 manifests are byte-identical");
    yield* Console.log(`Manifest: ${evidencePath}`);
  }),
);

// This executable module selects Bun's standard platform Layer at the composition root.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
