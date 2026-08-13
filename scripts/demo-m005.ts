import { buildTheoryGraph, CoreDocumentFromJson, validateCore } from "@bang/core";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Graph, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const BridgeCounterexample = Schema.Struct({
  assignment: Schema.Array(Schema.Struct({ parameter: Schema.String, value: Schema.String })),
  leftObservation: Schema.String,
  rightObservation: Schema.String,
});
const BridgeLawResult = Schema.Struct({
  obligation: Schema.String,
  bridge: Schema.String,
  law: Schema.String,
  participants: Schema.Array(Schema.String),
  passed: Schema.Boolean,
  requestedCases: Schema.Finite,
  executedRuns: Schema.Finite,
  numSkips: Schema.Finite,
  seed: Schema.Finite,
  numShrinks: Schema.Finite,
  counterexamplePath: Schema.NullOr(Schema.String),
  counterexample: Schema.NullOr(BridgeCounterexample),
});
const BridgeDiagnosticsFromJson = Schema.fromJsonString(
  Schema.Struct({
    lawful: Schema.Array(BridgeLawResult),
    inconsistent: Schema.Array(BridgeLawResult),
  }),
);

export class DemoError extends Schema.TaggedError<DemoError>()("DemoError", {
  message: Schema.String,
}) {}

const fixture = "examples/tiny-bank/core/account-ledger-bridge.json";
const invalidFixtures = [
  [
    "examples/core-fixtures/invalid/unknown-bridge-theory.json",
    "participant ledger references unknown theory MissingLedger",
  ],
  [
    "examples/core-fixtures/invalid/duplicate-bridge-participant.json",
    "participants contains duplicate identity account",
  ],
  [
    "examples/core-fixtures/invalid/unknown-bridge-sort.json",
    "references unknown sort ledger.MissingAccountId",
  ],
  [
    "examples/core-fixtures/invalid/unknown-bridge-operation.json",
    "references unknown operation account.missingBalance",
  ],
  [
    "examples/core-fixtures/invalid/unshared-bridge-result.json",
    "result sort Balance is not shared by the bridge",
  ],
] as const;
const evidencePath = ".bang/evidence/M005.json";

const read = Effect.fn("demoM005.read")(function* (path: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.readFileString(path);
});

const decode = Effect.fn("demoM005.decode")(function* (path: string) {
  const text = yield* read(path);
  return yield* Schema.decodeEffect(CoreDocumentFromJson)(text);
});

const run = Effect.fn("demoM005.run")(function* (
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
  const pathService = yield* Path.Path;
  yield* fileSystem.remove(evidencePath, { force: true });

  const document = yield* decode(fixture);
  yield* Console.log("PASS Account/Ledger bridge Core decode");
  const checked = yield* validateCore(document);
  yield* Console.log("PASS qualified participants, shared sorts, and bridge-law typing");

  const graph = yield* buildTheoryGraph(checked);
  if (Graph.nodeCount(graph) !== 2 || Graph.edgeCount(graph) !== 1) {
    return yield* new DemoError({ message: "unexpected normalized Account/Ledger graph" });
  }
  yield* Console.log("PASS normalized theory graph: 2 nodes, 1 typed sharing edge");

  for (const [path, expected] of invalidFixtures) {
    const invalid = yield* decode(path);
    const error = yield* Effect.flip(validateCore(invalid));
    if (!error.message.includes(expected)) {
      return yield* new DemoError({
        message: `unexpected bridge diagnostic for ${path}: ${error.message}`,
      });
    }
  }
  yield* Console.log("PASS invalid bridge references and sharing rejected");

  yield* run(["bun", "run", "scripts/prepare-m005.ts"]);
  yield* Console.log("PASS deterministic Effect bridge projection");
  yield* run([
    "bun",
    "x",
    "tsc",
    "--noEmit",
    "--project",
    "examples/tiny-bank/bridge/tsconfig.json",
  ]);
  yield* Console.log("PASS independent Account and Ledger ports type-check");
  yield* run(["bun", "x", "vitest", "run", "examples/tiny-bank/bridge/account-ledger.test.ts"]);
  yield* Console.log("PASS conforming pair via Effect Vitest (100 cases)");

  const diagnosticText = yield* run(
    ["bun", "run", "examples/tiny-bank/bridge/bridge-diagnostics.ts"],
    "pipe",
  );
  const diagnostics = yield* Schema.decodeEffect(BridgeDiagnosticsFromJson)(diagnosticText);
  const lawful = diagnostics.lawful[0];
  const inconsistent = diagnostics.inconsistent[0];
  if (
    lawful?.passed !== true ||
    lawful.executedRuns !== 100 ||
    inconsistent?.passed !== false ||
    inconsistent.counterexamplePath === null ||
    inconsistent.counterexample?.assignment[0]?.value !== "0" ||
    inconsistent.counterexample.leftObservation !== "0" ||
    inconsistent.counterexample.rightObservation !== "1"
  ) {
    return yield* new DemoError({ message: "unexpected Account/Ledger bridge diagnostics" });
  }
  yield* Console.log(
    `PASS inconsistent pair shrank to accountId = 0n (${inconsistent.numShrinks} shrink)`,
  );

  const evidence = {
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
        obligation: lawful.obligation,
        realizations: lawful.participants,
        result: "passed",
        requestedCases: lawful.requestedCases,
        executedRuns: lawful.executedRuns,
        seed: lawful.seed,
      },
      {
        class: "property-tested",
        obligation: inconsistent.obligation,
        realizations: ["account:AccountBalance", "ledger:InconsistentLedgerBalance"],
        result: "failed",
        requestedCases: inconsistent.requestedCases,
        executedRuns: inconsistent.executedRuns,
        seed: inconsistent.seed,
        numShrinks: inconsistent.numShrinks,
        counterexamplePath: inconsistent.counterexamplePath,
        counterexample: inconsistent.counterexample,
      },
      {
        class: "unsupported-by-target",
        obligation: "AccountLedger.balancesAgree",
        target: "typescript",
        reason: "the universal law is sampled at runtime and is not encoded as a TypeScript proof",
      },
    ],
    assumptions: [
      "FastCheck generation distribution and shrinker are those of version 4.9.0",
      "sampled AccountId values are not every mathematical integer",
      "both realization functions are pure during conformance evaluation",
    ],
    unsupported: [
      "universal proof that every Account and Ledger balance agrees",
      "state synchronization, persistence, transactionality, or temporal consistency",
      "theories or bridges with more than two participants",
    ],
    invalidatedBy: [
      "unsafe casts or foreign JavaScript that bypass the generated model ports",
      "changes to either realization, generated kit, Core declaration, or recorded tool versions",
    ],
    sources: [fixture, "tests/snapshots/M005-AccountLedgerBridge.ts"],
    target: {
      name: "effect-vitest",
      effect: "4.0.0-rc.108",
      effectVitest: "4.0.0-rc.108",
      vitest: "4.1.10",
      fastCheck: "4.9.0",
    },
  } as const;
  const evidenceText = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(evidence);
  yield* fileSystem.makeDirectory(pathService.dirname(evidencePath), { recursive: true });
  yield* fileSystem.writeFileString(evidencePath, `${evidenceText}\n`);

  yield* Console.log("\nEvidence");
  yield* Console.log("  graph: AccountBalance --AccountLedger-- LedgerBalance");
  yield* Console.log("  property-tested: conforming pair, 100/100 cases");
  yield* Console.log("  counterexample: accountId 0n observed Account 0n, Ledger 1n");
  yield* Console.log("  universal bridge law: unsupported by TypeScript target");
  yield* Console.log(`  manifest: ${evidencePath}`);
});

// This executable module is the composition root that selects Bun's standard platform Layer.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
