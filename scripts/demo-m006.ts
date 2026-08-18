import {
  CoreDocumentFromJson,
  type OperationRealizationDeclaration,
  validateCore,
} from "@bang/core";
import { sourceToCore } from "@bang/surface";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const SerializedState = Schema.Struct({ balance: Schema.String });
const CapabilityDiagnosticsFromJson = Schema.fromJsonString(
  Schema.Struct({
    success: Schema.TaggedStruct("Success", { state: SerializedState }),
    rejected: Schema.TaggedStruct("TypedFailure", {
      error: Schema.TaggedStruct("WithdrawalRejected", {
        state: SerializedState,
        amount: Schema.String,
      }),
    }),
    defect: Schema.TaggedStruct("Defect", { defect: Schema.String }),
  }),
);
const StateLaw = Schema.Struct({
  operation: Schema.String,
  passed: Schema.Boolean,
  executedRuns: Schema.Finite,
  seed: Schema.Finite,
});
const StateDiagnosticsFromJson = Schema.fromJsonString(
  Schema.Struct({ lawful: Schema.Array(StateLaw) }),
);

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", {
  message: Schema.String,
}) {}

const fixture = "examples/tiny-bank/account.bang";
const evidencePath = ".bang/evidence/M006.json";
const semanticInvalidFixtures = [
  [
    "examples/core-fixtures/invalid/unknown-realization-state-machine.json",
    "references unknown state machine MissingAccount",
  ],
  [
    "examples/core-fixtures/invalid/unknown-realization-operation.json",
    "references unknown transition Account.missing",
  ],
  [
    "examples/core-fixtures/invalid/unknown-realization-capability.json",
    "requires unknown capability MissingDebitAccount",
  ],
  [
    "examples/core-fixtures/invalid/duplicate-realization-capability.json",
    "capabilities contains duplicate identity DebitAccount",
  ],
  [
    "examples/core-fixtures/invalid/realization-binds-initializer.json",
    "binds initializer Account.initialize; expected transition",
  ],
  [
    "examples/core-fixtures/invalid/realization-failure-collision.json",
    "failure DebitAccount conflicts with a declaration identity",
  ],
] as const;

const read = Effect.fn("demoM006.read")(function* (file: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.readFileString(file);
});

const run = Effect.fn("demoM006.run")(function* (
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

  const document = yield* Effect.fromResult(sourceToCore(yield* read(fixture)));
  yield* Console.log("PASS Account source parse and Core lowering");
  const checked = yield* validateCore(document);
  const realization = checked.declarations.find(
    (declaration): declaration is OperationRealizationDeclaration =>
      declaration.kind === "operationRealization" && declaration.id === "WithdrawAccount",
  );
  if (realization === undefined) {
    return yield* new DemoError({ message: "checked Core did not contain WithdrawAccount" });
  }
  yield* Console.log(
    "PASS checked Account.withdraw, DebitAccount, and WithdrawalRejected references",
  );

  for (const [invalidPath, expected] of semanticInvalidFixtures) {
    const invalidDocument = yield* Schema.decodeEffect(CoreDocumentFromJson)(
      yield* read(invalidPath),
    );
    const error = yield* Effect.flip(validateCore(invalidDocument));
    if (!error.message.includes(expected)) {
      return yield* new DemoError({
        message: `unexpected realization diagnostic for ${invalidPath}: ${error.message}`,
      });
    }
  }
  yield* Console.log("PASS invalid realization references and capability sets rejected");

  yield* run(["bun", "run", "scripts/prepare-m006.ts"]);
  yield* Console.log("PASS deterministic Effect capability-boundary projection");
  yield* run([
    "bun",
    "x",
    "tsc",
    "--noEmit",
    "--project",
    "examples/tiny-bank/capability/tsconfig.json",
  ]);
  yield* Console.log(
    "PASS generated success, error, and DebitAccount requirement channels type-check",
  );
  yield* run([
    "bun",
    "x",
    "vitest",
    "run",
    "examples/tiny-bank/capability/account-withdrawal.test.ts",
  ]);
  yield* Console.log("PASS Layer-backed success, typed rejection, and defect scenarios");

  const diagnostics = yield* Schema.decodeEffect(CapabilityDiagnosticsFromJson)(
    yield* run(["bun", "run", "examples/tiny-bank/capability/capability-diagnostics.ts"], "pipe"),
  );
  if (
    diagnostics.success.state.balance !== "6" ||
    diagnostics.rejected.error.state.balance !== "10" ||
    diagnostics.rejected.error.amount !== "11" ||
    !diagnostics.defect.defect.includes("defecting withdrawal")
  ) {
    return yield* new DemoError({ message: "unexpected capability-boundary diagnostics" });
  }
  yield* Console.log("PASS legal withdrawal: balance 10 - amount 4 = balance 6");
  yield* Console.log("PASS overdraft: WithdrawalRejected retains balance 10 and amount 11");
  yield* Console.log("PASS defecting realization is not relabeled as WithdrawalRejected");

  yield* run(["bun", "run", "scripts/prepare-m004.ts"]);
  const stateDiagnostics = yield* Schema.decodeEffect(StateDiagnosticsFromJson)(
    yield* run(["bun", "run", "examples/tiny-bank/state/state-diagnostics.ts"], "pipe"),
  );
  const withdrawInvariant = stateDiagnostics.lawful.find(
    ({ operation }) => operation === "withdraw",
  );
  if (withdrawInvariant?.passed !== true || withdrawInvariant.executedRuns !== 100) {
    return yield* new DemoError({ message: "shared withdrawal failed M004 invariant evidence" });
  }
  yield* Console.log("PASS shared withdrawal preserves nonnegative balance in 100 generated cases");

  const evidence = {
    bangEvidence: 1,
    mission: "M006",
    subject: realization.id,
    evidence: [
      {
        class: "structural-conformance",
        obligation: "WithdrawAccount exposes typed success, failure, and DebitAccount requirements",
        result: "passed",
        mechanism: "Effect type-check plus exact requirement witness",
      },
      {
        class: "scenario-tested",
        obligation: "enabled Account.withdraw succeeds",
        result: "passed",
        state: { balance: "10" },
        input: { amount: "4" },
        nextState: diagnostics.success.state,
      },
      {
        class: "runtime-checked",
        obligation: "disabled Account.withdraw returns WithdrawalRejected",
        result: "passed",
        state: diagnostics.rejected.error.state,
        input: { amount: diagnostics.rejected.error.amount },
        enforcement: "generated checked transition guard",
      },
      {
        class: "scenario-tested",
        obligation: "implementation defects remain distinct from typed rejection",
        result: "passed",
        observation: "Defect",
      },
      {
        class: "property-tested",
        obligation: "Account.withdraw preserves nonnegativeBalance",
        result: "passed",
        executedRuns: withdrawInvariant.executedRuns,
        seed: withdrawInvariant.seed,
        realization: "shared withdrawAccountState",
      },
      {
        class: "unsupported-by-target",
        obligation: "DebitAccount is unforgeable authority",
        target: "effect-typescript",
        reason:
          "unsafe casts, foreign JavaScript, or a forged Layer can bypass the generated boundary",
      },
    ],
    assumptions: [
      "the selected DebitAccount Layer represents authority granted by the surrounding system",
      "independent implementations are invoked through the generated makeWithdrawAccountLayer adapter",
      "100 generated invariant cases are sampled evidence rather than exhaustive proof over bigint",
    ],
    unsupported: [
      "cryptographic authority, delegation, attenuation, revocation, or caller identity",
      "universal proof that withdrawal subtracts exactly the requested amount",
      "proof that arbitrary TypeScript cannot bypass or forge the generated services",
    ],
    invalidatedBy: [
      "changes to the Core declaration, generated kit, implementation, scenarios, seed, or tool versions",
      "unsafe casts or foreign JavaScript that bypass generated services and Schemas",
      "using the implementation directly instead of the generated capability adapter",
    ],
    sources: [
      fixture,
      "tests/snapshots/M006-WithdrawAccount.ts",
      "examples/tiny-bank/capability/account-withdrawal.test.ts",
      "examples/tiny-bank/implementation/account-withdrawal.ts",
    ],
    target: {
      name: "effect-typescript",
      effect: "4.0.0-rc.108",
      effectVitest: "4.0.0-rc.108",
      vitest: "4.1.10",
    },
  } as const;
  const evidenceText = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(evidence);
  yield* fileSystem.makeDirectory(path.dirname(evidencePath), { recursive: true });
  yield* fileSystem.writeFileString(evidencePath, `${evidenceText}\n`);

  yield* Console.log("\nEvidence");
  yield* Console.log("  structural-conformance: Effect success/error/requirement channels");
  yield* Console.log("  scenario-tested: enabled withdrawal and defect distinction");
  yield* Console.log("  runtime-checked: disabled request becomes WithdrawalRejected");
  yield* Console.log("  property-tested: shared transition preserved invariant, 100/100 cases");
  yield* Console.log("  assumed: DebitAccount Layer represents granted authority");
  yield* Console.log("  target weakening: TypeScript cannot make authority unforgeable");
  yield* Console.log(`  manifest: ${evidencePath}`);
});

// This executable module selects Bun's standard platform Layer at the composition root.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
