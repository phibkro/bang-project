import { validateCore } from "@bang/core";
import { sourceToCore } from "@bang/surface";
import {
  checkEntityMessageEvidenceRecord,
  EntityMessageEvidenceRecordFromJson,
  EntityMessageEvidenceError,
  formatEntityMessageEvidenceRecord,
  type EntityMessageEvidenceRecord as EntityMessageEvidenceRecordType,
} from "@bang/evidence";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const M015State = Schema.Struct({
  balance: Schema.BigIntFromString,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M015Message = Schema.TaggedUnion({
  Withdraw: {
    destination: Schema.String,
    messageId: Schema.String,
    amount: Schema.BigIntFromString,
  },
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const M015Reply = Schema.TaggedUnion({
  Succeeded: {
    entityId: Schema.String,
    messageId: Schema.String,
    messageType: Schema.Literal("Withdraw"),
    state: M015State,
  },
  TypedFailure: {
    entityId: Schema.String,
    messageId: Schema.String,
    messageType: Schema.Literal("Withdraw"),
    failureId: Schema.Literal("WithdrawalRejected"),
    state: M015State,
  },
  WrongDestination: {
    entityId: Schema.String,
    messageId: Schema.String,
    messageType: Schema.Literal("Withdraw"),
    destination: Schema.String,
    state: M015State,
  },
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
const EntityJourneyFromJson = Schema.fromJsonString(
  Schema.Struct({
    entityId: Schema.String,
    initialState: M015State,
    unknownEncodedRejected: Schema.Boolean,
    stateCarryingEncodedRejected: Schema.Boolean,
    invalidInitializationRejected: Schema.Boolean,
    steps: Schema.Array(
      Schema.Struct({
        sequence: Schema.Natural,
        message: M015Message,
        preState: M015State,
        reply: M015Reply,
      }).annotate({
        parseOptions: { onExcessProperty: "error" },
      }),
    ),
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
);
type EntityJourney = typeof EntityJourneyFromJson.Type;
const sourcePath = "examples/tiny-bank/account.bang";
const generatedPath = "generated/effect/AccountEntity.ts";
const snapshotPath = "tests/snapshots/M015-AccountEntity.ts";
const evidencePath = ".bang/evidence/M015.json";

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", {
  message: Schema.String,
}) {}

type Argv = readonly [string, ...Array<string>];

const runProcess = Effect.fn("demoM015.runProcess")(function* (argv: Argv) {
  const process = yield* ChildProcess.make(argv[0], argv.slice(1), {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = yield* process.stdout.pipe(Stream.decodeText(), Stream.mkString);
  const stderr = yield* process.stderr.pipe(Stream.decodeText(), Stream.mkString);
  const exitCode = yield* process.exitCode;
  return { argv, exitCode, stdout, stderr };
}, Effect.scoped);

const assert = (condition: boolean, message: string): Effect.Effect<void, DemoError> =>
  condition ? Effect.void : Effect.fail(new DemoError({ message }));

type EntityReply = typeof M015Reply.Type;

const stateBalance = (reply: EntityReply): bigint => reply.state.balance;

const scenarioRecord = (journey: EntityJourney): EntityMessageEvidenceRecordType => ({
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
    entityId: journey.entityId,
    initialState: journey.initialState,
    steps: journey.steps,
  },
  provenance: {
    coreSource: sourcePath,
    generatedKit: generatedPath,
    realization: "examples/tiny-bank/entity/account-withdrawal-effect.ts",
    evaluator: "scripts/demo-m015.ts",
  },
  producer: {
    identity: "bun run scripts/demo-m015.ts",
    trust: "assumed-truthful",
  },
  environment: {
    toolVersions: {
      effect: "4.0.0-rc.108",
      typescript: "7.0.2",
      bun: "1.3.13",
    },
    target: {
      name: "effect-typescript",
      version: "7.0.2",
    },
  },
  qualification: {
    assumptions: [
      "the checked Account declaration and selected realization remain the semantic source",
      "the generated entity closure owns current state in a private SynchronizedRef",
      "the producer records every dispatch in this bounded scenario",
    ],
    unsupportedClaims: [
      {
        claim: "the scenario proves a general actor, mailbox, or concurrent entity model",
        reason: "M015 records one sequential in-process entity and does not exercise concurrency",
      },
      {
        claim: "the producer is complete or truthful for unrecorded inputs",
        reason:
          "the evidence checker validates the supplied record but cannot observe arbitrary producer behavior",
      },
      {
        claim: "the recorded scenarios establish implementation equivalence or bisimilarity",
        reason:
          "M015 compares no implementations and observes only one bounded sequential interaction",
      },
    ],
    lifetime:
      "valid while the checked source, generated boundary, realization, evaluator, and tool versions remain unchanged",
    invalidators: [
      "changes to Account declarations, realization binding, or failure identity",
      "changes to generated entity source or the independent withdrawal realization",
      "changes to the recorded scenarios, dispatch ordering, or tool versions",
      "unsafe code that bypasses generated message and reply schemas",
    ],
  },
});

const program = Effect.scoped(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = yield* fileSystem.readFileString(sourcePath);
    const document = yield* Effect.fromResult(sourceToCore(source));
    const checked = yield* validateCore(document);
    const identities = checked.declarations.map(({ kind, id }) => `${kind}:${id}`);
    yield* assert(
      identities.join("\n") ===
        [
          "stateMachine:Account",
          "capability:DebitAccount",
          "operationRealization:WithdrawAccount",
          "operationRealization:WithdrawAccountOnce",
        ].join("\n"),
      `unexpected checked declaration identities: ${identities.join(", ")}`,
    );
    yield* Console.log(`PASS parsed and checked ${sourcePath}`);
    yield* Console.log(
      "PASS selected Account, initialize, withdraw, WithdrawAccount, DebitAccount, WithdrawalRejected",
    );

    const preparation = yield* runProcess(["bun", "run", "scripts/prepare-m015.ts"]);
    yield* assert(
      preparation.exitCode === ChildProcessSpawner.ExitCode(0),
      `generated entity boundary differs from ${snapshotPath}: ${preparation.stderr || preparation.stdout}`,
    );
    yield* Console.log("PASS generated entity boundary matches the committed M015 snapshot");

    const typecheck = yield* runProcess([
      "bun",
      "x",
      "tsc",
      "--noEmit",
      "--project",
      "examples/tiny-bank/entity/tsconfig.json",
    ]);
    yield* assert(
      typecheck.exitCode === ChildProcessSpawner.ExitCode(0),
      `entity boundary typecheck failed: ${typecheck.stderr || typecheck.stdout}`,
    );
    yield* Console.log(
      "PASS typechecked generated entity boundary with independent withdrawal realization",
    );

    const diagnostics = yield* runProcess([
      "bun",
      "run",
      "examples/tiny-bank/entity/entity-diagnostics.ts",
    ]);
    yield* assert(
      diagnostics.exitCode === ChildProcessSpawner.ExitCode(0),
      `entity journey failed: ${diagnostics.stderr || diagnostics.stdout}`,
    );
    const journey = yield* Schema.decodeEffect(EntityJourneyFromJson)(diagnostics.stdout);
    const first = journey.steps[0];
    const second = journey.steps[1];
    const overdraft = journey.steps[2];
    const wrongDestination = journey.steps[3];
    if (
      first === undefined ||
      second === undefined ||
      overdraft === undefined ||
      wrongDestination === undefined
    ) {
      return yield* new DemoError({
        message: "entity journey omitted one of the required scenarios",
      });
    }
    yield* assert(
      first.reply._tag === "Succeeded" && stateBalance(first.reply) === 6n,
      "withdraw-1 did not produce Succeeded(balance 6)",
    );
    yield* assert(
      first.reply.entityId === "account-1" && first.reply.messageId === "withdraw-1",
      "withdraw-1 reply lost entity or message identity",
    );
    yield* Console.log("PASS dispatch withdraw-1 without state produced Succeeded(balance 6)");
    yield* assert(
      second.preState.balance === 6n &&
        second.reply._tag === "Succeeded" &&
        stateBalance(second.reply) === 4n,
      "withdraw-2 did not start from balance 6 and produce balance 4",
    );
    yield* assert(
      second.reply.entityId === "account-1" && second.reply.messageId === "withdraw-2",
      "withdraw-2 reply lost entity or message identity",
    );
    yield* Console.log("PASS dispatch withdraw-2 without state produced Succeeded(balance 4)");
    yield* assert(
      overdraft.preState.balance === 4n &&
        overdraft.reply._tag === "TypedFailure" &&
        overdraft.reply.failureId === "WithdrawalRejected" &&
        stateBalance(overdraft.reply) === 4n,
      "overdraft did not preserve balance 4 as WithdrawalRejected",
    );
    yield* Console.log("PASS overdraft returned WithdrawalRejected with unchanged balance 4");
    yield* assert(
      wrongDestination.reply._tag === "WrongDestination" &&
        wrongDestination.reply.destination === "account-2" &&
        stateBalance(wrongDestination.reply) === 4n,
      "wrong destination changed the owned state",
    );
    yield* Console.log("PASS wrong destination returned WrongDestination with unchanged balance 4");

    yield* assert(
      journey.unknownEncodedRejected,
      "unknown encoded message unexpectedly reached the typed dispatch boundary",
    );
    yield* Console.log("PASS unknown encoded message rejected by generated Schema before dispatch");
    yield* assert(
      journey.stateCarryingEncodedRejected,
      "state-carrying encoded message unexpectedly crossed the strict message boundary",
    );
    yield* Console.log("PASS state-carrying encoded message rejected before dispatch");
    yield* assert(
      journey.invalidInitializationRejected,
      "invalid initial state unexpectedly created an entity",
    );
    yield* Console.log("PASS invalid initial state rejected by checked initializer requirement");

    const record = scenarioRecord(journey);
    const checkedRecord = yield* checkEntityMessageEvidenceRecord(record, checked);
    const encodedRecord = yield* Schema.encodeEffect(EntityMessageEvidenceRecordFromJson)(record);
    yield* fileSystem.makeDirectory(path.dirname(evidencePath), { recursive: true });
    yield* fileSystem.writeFileString(evidencePath, `${encodedRecord}\n`);
    const reloadedRecord = yield* Schema.decodeEffect(EntityMessageEvidenceRecordFromJson)(
      yield* fileSystem.readFileString(evidencePath),
    );
    const recheckedRecord = yield* checkEntityMessageEvidenceRecord(reloadedRecord, checked);
    yield* assert(
      formatEntityMessageEvidenceRecord(recheckedRecord) ===
        formatEntityMessageEvidenceRecord(checkedRecord),
      "reloaded M015 evidence report changed",
    );
    yield* Console.log(`PASS wrote and strictly reloaded ${evidencePath}`);

    const duplicateSteps = [...record.observation.steps];
    const firstStep = duplicateSteps[0];
    if (firstStep === undefined) {
      return yield* new DemoError({
        message: "first evidence step missing from duplicate fixture",
      });
    }
    const duplicate = {
      ...record,
      observation: {
        ...record.observation,
        steps: [firstStep, ...duplicateSteps],
      },
    };
    const duplicateResult = yield* Effect.result(
      checkEntityMessageEvidenceRecord(duplicate, checked),
    );
    yield* assert(
      duplicateResult._tag === "Failure" &&
        duplicateResult.failure instanceof EntityMessageEvidenceError &&
        duplicateResult.failure.reason === "duplicate-message",
      "evidence checker accepted a duplicate message identity",
    );
    yield* Console.log("PASS evidence checker rejected duplicate message identity");

    const secondStep = record.observation.steps[1];
    if (secondStep === undefined || secondStep.reply._tag !== "Succeeded") {
      return yield* new DemoError({
        message: "accepted second withdrawal missing from evidence record",
      });
    }
    const reset = {
      ...record,
      observation: {
        ...record.observation,
        steps: [
          firstStep,
          { ...secondStep, reply: { ...secondStep.reply, state: record.observation.initialState } },
          ...record.observation.steps.slice(2),
        ],
      },
    };
    const resetResult = yield* Effect.result(checkEntityMessageEvidenceRecord(reset, checked));
    yield* assert(
      resetResult._tag === "Failure" &&
        resetResult.failure instanceof EntityMessageEvidenceError &&
        resetResult.failure.reason === "state-reset",
      "evidence checker accepted an accepted-message state reset",
    );
    yield* Console.log("PASS evidence checker rejected accepted-message state reset");
    yield* Console.log(formatEntityMessageEvidenceRecord(recheckedRecord));
  }),
);

// This executable module selects Bun's standard platform Layer at the composition root.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
