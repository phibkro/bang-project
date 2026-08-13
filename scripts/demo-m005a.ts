import { CheckedCoreDocumentFromJson, CoreDocumentFromJson, validateCore } from "@bang/core";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Path, Result, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const PropertyResult = Schema.Struct({
  passed: Schema.Boolean,
  requestedCases: Schema.Finite,
  executedRuns: Schema.Finite,
  seed: Schema.Finite,
  numShrinks: Schema.Finite,
  counterexamplePath: Schema.NullOr(Schema.String),
});
const DecoderResult = Schema.Struct({
  valid: PropertyResult,
  invalid: PropertyResult,
  maximumObservedDepth: Schema.Finite,
});
const DiagnosticsFromJson = Schema.fromJsonString(
  Schema.Struct({ lawful: DecoderResult, drifted: DecoderResult }),
);

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", {
  message: Schema.String,
}) {}

const fixture = "examples/bang-core/bridge-term-data.json";
const evidencePath = ".bang/evidence/M005A.json";
const semanticInvalidFixtures = [
  [
    "examples/core-fixtures/invalid/duplicate-data-constructor.json",
    "data DuplicateConstructor constructors contains duplicate identity value",
  ],
  [
    "examples/core-fixtures/invalid/duplicate-data-field.json",
    "constructor DuplicateField.value fields contains duplicate identity item",
  ],
  [
    "examples/core-fixtures/invalid/unknown-data-reference.json",
    "data UnknownReference constructor value field missing references unknown data MissingData",
  ],
  [
    "examples/core-fixtures/invalid/data-discriminator-field-conflict.json",
    "constructor DiscriminatorConflict.value field kind conflicts with data discriminator",
  ],
] as const;

const read = Effect.fn("demoM005A.read")(function* (file: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.readFileString(file);
});

const run = Effect.fn("demoM005A.run")(function* (
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

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.remove(evidencePath, { force: true });

  const checked = yield* Schema.decodeEffect(CheckedCoreDocumentFromJson)(yield* read(fixture));
  const data = checked.declarations[0];
  if (data?.kind !== "data" || data.id !== "BridgeTerm") {
    return yield* new DemoError({ message: "checked Core did not contain BridgeTerm data" });
  }
  yield* Console.log("PASS composed JSON, recursive data, and semantic Core decode");

  for (const [invalidPath, expected] of semanticInvalidFixtures) {
    const document = yield* Schema.decodeEffect(CoreDocumentFromJson)(yield* read(invalidPath));
    const error = yield* Effect.flip(validateCore(document));
    if (!error.message.includes(expected)) {
      return yield* new DemoError({
        message: `unexpected data diagnostic for ${invalidPath}: ${error.message}`,
      });
    }
  }
  const emptyConstructors = yield* Effect.result(
    Schema.decodeEffect(CoreDocumentFromJson)(
      yield* read("examples/core-fixtures/invalid/empty-data-constructors.json"),
    ),
  );
  if (!Result.isFailure(emptyConstructors)) {
    return yield* new DemoError({ message: "constructor-less data decoded successfully" });
  }
  yield* Console.log("PASS invalid recursive data shapes and references rejected");

  yield* run(["bun", "run", "scripts/prepare-m005a.ts"]);
  yield* Console.log("PASS deterministic Effect Schema and Match projection");
  yield* run(["bun", "x", "tsc", "--noEmit", "--project", "examples/bang-core/tsconfig.json"]);
  yield* Console.log("PASS existing @bang/core decoder implements generated port");
  yield* run(["bun", "x", "vitest", "run", "examples/bang-core/conformance/bridge-term.test.ts"]);
  yield* Console.log("PASS lawful decoder: 100 valid and 100 invalid generated cases");

  const diagnostics = yield* Schema.decodeEffect(DiagnosticsFromJson)(
    yield* run(["bun", "run", "examples/bang-core/conformance/bridge-term-diagnostics.ts"], "pipe"),
  );
  if (
    !diagnostics.lawful.valid.passed ||
    !diagnostics.lawful.invalid.passed ||
    diagnostics.drifted.valid.passed ||
    diagnostics.drifted.valid.counterexamplePath !==
      "BridgeTerm.Application.arguments[0].Variable.id"
  ) {
    return yield* new DemoError({ message: "unexpected BridgeTerm conformance diagnostics" });
  }
  yield* Console.log(
    `PASS drift shrank to ${diagnostics.drifted.valid.counterexamplePath} (${diagnostics.drifted.valid.numShrinks} shrinks)`,
  );

  const evidence = {
    bangEvidence: 1,
    mission: "M005A",
    subject: "BridgeTerm",
    evidence: [
      {
        class: "structural-conformance",
        obligation: "BridgeTerm recursive algebraic data is well formed",
        result: "passed",
        mechanism: "Effect Schema fromJsonString composed with checked Core decodeTo",
      },
      {
        class: "property-tested",
        obligation: "@bang/core BridgeTerm decoder accepts and preserves declared values",
        result: "passed",
        requestedCases: diagnostics.lawful.valid.requestedCases,
        executedRuns: diagnostics.lawful.valid.executedRuns,
        seed: diagnostics.lawful.valid.seed,
        maximumObservedDepth: diagnostics.lawful.maximumObservedDepth,
      },
      {
        class: "property-tested",
        obligation: "@bang/core BridgeTerm decoder rejects invalid discriminator mutations",
        result: "passed",
        requestedCases: diagnostics.lawful.invalid.requestedCases,
        executedRuns: diagnostics.lawful.invalid.executedRuns,
        seed: diagnostics.lawful.invalid.seed,
      },
      {
        class: "property-tested",
        obligation: "drifted BridgeTerm decoder conforms to recursive declaration",
        result: "failed",
        executedRuns: diagnostics.drifted.valid.executedRuns,
        seed: diagnostics.drifted.valid.seed,
        numShrinks: diagnostics.drifted.valid.numShrinks,
        counterexamplePath: diagnostics.drifted.valid.counterexamplePath,
      },
      {
        class: "unsupported-by-target",
        obligation: "generated and handwritten decoders accept identical languages",
        target: "effect-typescript",
        reason: "bounded property generation is not a universal language-equivalence proof",
      },
    ],
    assumptions: [
      "Effect Schema.toArbitrary and FastCheck supply the recorded generation and shrinking behavior",
      "100 generated valid values and 100 discriminator mutations do not exhaust all finite trees",
      "the bootstrap decoder is trusted outside the observed inputs and Effect Schema boundary",
    ],
    invalidatedBy: [
      "changes to the Core declaration, generated kit, decoder adapter, seed, cases, or tool versions",
      "unsafe TypeScript or foreign JavaScript that bypasses the generated decoder port",
    ],
    sources: [fixture, "tests/snapshots/M005A-BridgeTerm.ts"],
    target: {
      name: "effect-typescript",
      effect: "4.0.0-rc.108",
      effectVitest: "4.0.0-rc.108",
      vitest: "4.1.10",
      fastCheck: "4.9.0",
    },
  } as const;
  const evidenceText = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(evidence);
  yield* fileSystem.makeDirectory(path.dirname(evidencePath), { recursive: true });
  yield* fileSystem.writeFileString(evidencePath, `${evidenceText}\n`);

  yield* Console.log("\nEvidence");
  yield* Console.log("  structural-conformance: checked recursive Core declaration");
  yield* Console.log("  property-tested: valid 100/100; invalid mutations 100/100");
  yield* Console.log(`  counterexample: ${diagnostics.drifted.valid.counterexamplePath}`);
  yield* Console.log("  universal decoder equivalence: unsupported by target");
  yield* Console.log(`  manifest: ${evidencePath}`);
});

// This executable module selects Bun's standard platform Layer at the composition root.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
