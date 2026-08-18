import { validateCore } from "@bang/core";
import {
  checkM017GleamActorEvidenceManifest,
  decodeM017GleamActorEvidenceManifest,
  formatM017GleamActorEvidenceReport,
  M017GleamActorEvidenceError,
  M017GleamActorEvidenceManifest,
  M017GleamActorEvidenceManifestFromJson,
  verifyM017GleamActorEvidenceMaterials,
} from "@bang/evidence";
import { sourceToCore } from "@bang/surface";
import { projectGleamEntityOperationRealization } from "@bang/target-gleam";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Crypto, Effect, Encoding, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const corePath = "examples/tiny-bank/account.bang";
const generatedPath = "generated/gleam/account-entity/src/bang/account_entity.gleam";
const snapshotPath = "tests/snapshots/M017-AccountEntity.gleam";
const consumerPath = "examples/tiny-bank/gleam-account/src/main.gleam";
const toolchainPath = "nix/gleam.nix";
const generatedConfigPath = "generated/gleam/account-entity/gleam.toml";
const generatedManifestPath = "generated/gleam/account-entity/manifest.toml";
const consumerConfigPath = "examples/tiny-bank/gleam-account/gleam.toml";
const consumerManifestPath = "examples/tiny-bank/gleam-account/manifest.toml";
const consumerCwd = "examples/tiny-bank/gleam-account";
const evidencePath = ".bang/evidence/M017.json";

const prepareCommand = ["bun", "run", "scripts/prepare-m017.ts"] as const;
const formatCommand = [
  "nix",
  "shell",
  "-f",
  "./nix/gleam.nix",
  "-c",
  "gleam",
  "format",
  generatedPath,
] as const;
const buildCommand = [
  "nix",
  "shell",
  "-f",
  "../../../nix/gleam.nix",
  "-c",
  "gleam",
  "build",
] as const;
const runCommand = [
  "nix",
  "shell",
  "-f",
  "../../../nix/gleam.nix",
  "-c",
  "gleam",
  "run",
  "-m",
  "main",
] as const;
const gleamVersionCommand = [
  "nix",
  "shell",
  "-f",
  "../../../nix/gleam.nix",
  "-c",
  "gleam",
  "--version",
] as const;
const otpVersionCommand = [
  "nix",
  "eval",
  "--raw",
  "-f",
  "../../../nix/gleam.nix",
  "passthru.otpVersion",
] as const;
const otpReleaseCommand = [
  "nix",
  "shell",
  "-f",
  "../../../nix/gleam.nix",
  "-c",
  "erl",
  "-noshell",
  "-eval",
  'io:format("~s~n", [erlang:system_info(otp_release)]), halt().',
] as const;

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", {
  message: Schema.String,
}) {}

type Argv = readonly [string, ...Array<string>];

type M017Result = {
  readonly entityId: "account-1";
  readonly started: 10;
  readonly withdraw1: "succeeded:4:10:6";
  readonly withdraw2: "succeeded:2:6:4";
  readonly withdraw3: "typed-failure:WithdrawalRejected:9:4:4";
  readonly invalid: "unknown-message:before-dispatch:4:4";
  readonly oldTerminated: "true";
  readonly replacementObserved: "true";
  readonly identityChanged: "true";
  readonly replacementAlive: "true";
  readonly restartBalance: 10;
  readonly supervisorStopped: "true";
};

const expectedResultFields = [
  "entity",
  "started",
  "withdraw-1",
  "withdraw-2",
  "withdraw-3",
  "invalid",
  "old-terminated",
  "replacement-observed",
  "identity-changed",
  "replacement-alive",
  "restart-balance",
  "supervisor-stopped",
] as const;

const expectedResultValues: Record<(typeof expectedResultFields)[number], string> = {
  entity: "account-1",
  started: "10",
  "withdraw-1": "succeeded:4:10:6",
  "withdraw-2": "succeeded:2:6:4",
  "withdraw-3": "typed-failure:WithdrawalRejected:9:4:4",
  invalid: "unknown-message:before-dispatch:4:4",
  "old-terminated": "true",
  "replacement-observed": "true",
  "identity-changed": "true",
  "replacement-alive": "true",
  "restart-balance": "10",
  "supervisor-stopped": "true",
};

const parseResultLine = (stdout: string): M017Result => {
  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
  const resultLines = lines.filter((line) => line.startsWith("BANG_M017_RESULT"));
  if (resultLines.length !== 1) {
    throw new Error(`expected exactly one BANG_M017_RESULT line, found ${resultLines.length}`);
  }
  const line = resultLines[0];
  if (line === undefined || !line.startsWith("BANG_M017_RESULT|")) {
    throw new Error("missing or malformed BANG_M017_RESULT line");
  }
  const fields = line.split("|");
  if (fields.length !== expectedResultFields.length + 1 || fields[0] !== "BANG_M017_RESULT") {
    throw new Error("BANG_M017_RESULT has missing or extra fields");
  }
  const observed: Record<string, string> = {};
  for (let index = 1; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === undefined) throw new Error("BANG_M017_RESULT has an empty field");
    const separator = field.indexOf("=");
    if (separator <= 0 || separator !== field.lastIndexOf("=")) {
      throw new Error("BANG_M017_RESULT field is not key=value");
    }
    const key = field.slice(0, separator);
    const value = field.slice(separator + 1);
    const expectedKey = expectedResultFields[index - 1];
    if (key !== expectedKey || Object.hasOwn(observed, key)) {
      throw new Error(`BANG_M017_RESULT field order or identity differs at ${key}`);
    }
    observed[key] = value;
  }
  for (const key of expectedResultFields) {
    if (observed[key] !== expectedResultValues[key]) {
      throw new Error(`BANG_M017_RESULT value differs for ${key}`);
    }
  }
  return {
    entityId: "account-1",
    started: 10,
    withdraw1: "succeeded:4:10:6",
    withdraw2: "succeeded:2:6:4",
    withdraw3: "typed-failure:WithdrawalRejected:9:4:4",
    invalid: "unknown-message:before-dispatch:4:4",
    oldTerminated: "true",
    replacementObserved: "true",
    identityChanged: "true",
    replacementAlive: "true",
    restartBalance: 10,
    supervisorStopped: "true",
  };
};

const runProcess = Effect.fn("demoM017.runProcess")(function* (argv: Argv, cwd?: string) {
  const process = yield* ChildProcess.make(argv[0], argv.slice(1), {
    cwd,
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

const digestBytes = Effect.fn("demoM017.digestBytes")(function* (bytes: Uint8Array) {
  const crypto = yield* Crypto.Crypto;
  return Encoding.encodeHex(yield* crypto.digest("SHA-256", bytes));
});

const digestPath = Effect.fn("demoM017.digestPath")(function* (path: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* digestBytes(yield* fileSystem.readFile(path));
});

const failureReason = <R>(result: Effect.Effect<unknown, M017GleamActorEvidenceError, R>) =>
  Effect.gen(function* () {
    const outcome = yield* Effect.result(result);
    if (outcome._tag === "Success") {
      return yield* new DemoError({ message: "M017 rejection path unexpectedly succeeded" });
    }
    if (!(outcome.failure instanceof M017GleamActorEvidenceError)) {
      return yield* new DemoError({ message: "M017 rejection path lost its typed error" });
    }
    return outcome.failure.reason;
  });

const limitations = [
  "same-sender ordering only",
  "asynchronous send without handling acknowledgement",
  "selective receive and priority messages can change mailbox processing order",
  "distributed signal loss",
  "restart without durable state",
  "raw BEAM or foreign-function type bypass",
  "finite process, mailbox, atom, and memory resources",
] as const;

const program = Effect.scoped(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const preparation = yield* runProcess(prepareCommand, ".");
    yield* assert(
      preparation.exitCode === ChildProcessSpawner.ExitCode(0),
      `M017 preparation failed: ${preparation.stderr || preparation.stdout}`,
    );
    const sourceText = yield* fileSystem.readFileString(corePath);
    const document = yield* Effect.fromResult(sourceToCore(sourceText));
    const checkedCore = yield* validateCore(document);
    const identities = checkedCore.declarations.map(({ kind, id }) => `${kind}:${id}`);
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
    yield* Console.log(`PASS parsed and checked ${corePath}`);

    const projection = projectGleamEntityOperationRealization(
      checkedCore,
      "Account",
      "WithdrawAccount",
    );
    yield* assert(projection.ok, projection.ok ? "" : projection.error.message);
    if (!projection.ok) return yield* new DemoError({ message: projection.error.message });
    const repeatedProjection = projectGleamEntityOperationRealization(
      checkedCore,
      "Account",
      "WithdrawAccount",
    );
    yield* assert(
      repeatedProjection.ok && repeatedProjection.value === projection.value,
      "Gleam projection was not deterministic",
    );
    yield* fileSystem.makeDirectory(path.dirname(generatedPath), { recursive: true });
    yield* fileSystem.writeFileString(generatedPath, projection.value);
    const format = yield* runProcess(formatCommand, ".");
    yield* assert(
      format.exitCode === ChildProcessSpawner.ExitCode(0),
      `pinned Gleam format failed: ${format.stderr || format.stdout}`,
    );
    const formattedSource = yield* fileSystem.readFileString(generatedPath);
    const snapshot = yield* fileSystem.readFileString(snapshotPath);
    yield* assert(formattedSource === snapshot, `generated source differs from ${snapshotPath}`);
    yield* Console.log("PASS projected checked Account into deterministic Gleam source");

    const build = yield* runProcess(buildCommand, consumerCwd);
    yield* assert(
      build.exitCode === ChildProcessSpawner.ExitCode(0),
      `pinned Gleam build failed: ${build.stderr || build.stdout}`,
    );
    yield* Console.log("PASS built the independent pinned Gleam consumer");
    const gleamVersionExecution = yield* runProcess(gleamVersionCommand, consumerCwd);
    const otpVersionExecution = yield* runProcess(otpVersionCommand, consumerCwd);
    const otpReleaseExecution = yield* runProcess(otpReleaseCommand, consumerCwd);
    const gleamVersion = gleamVersionExecution.stdout.trim().replace(/^gleam /, "");
    const otpVersion = otpVersionExecution.stdout.trim();
    const otpRelease = otpReleaseExecution.stdout.trim();
    yield* assert(
      gleamVersionExecution.exitCode === ChildProcessSpawner.ExitCode(0) &&
        gleamVersion === "1.18.1",
      `unexpected pinned Gleam version: ${gleamVersionExecution.stderr || gleamVersionExecution.stdout}`,
    );
    yield* assert(
      otpVersionExecution.exitCode === ChildProcessSpawner.ExitCode(0) &&
        otpReleaseExecution.exitCode === ChildProcessSpawner.ExitCode(0) &&
        otpVersion === "29.0.5" &&
        otpRelease === "29",
      `unexpected pinned OTP version: ${otpVersionExecution.stderr || otpVersionExecution.stdout || otpReleaseExecution.stderr || otpReleaseExecution.stdout}`,
    );
    yield* Console.log("PASS observed pinned Gleam 1.18.1 and Erlang/OTP 29.0.5");

    const execution = yield* runProcess(runCommand, consumerCwd);
    yield* assert(
      execution.exitCode === ChildProcessSpawner.ExitCode(0),
      `pinned Gleam consumer failed: ${execution.stderr || execution.stdout}`,
    );
    const result = yield* Effect.try({
      try: () => parseResultLine(execution.stdout),
      catch: (error) => new DemoError({ message: String(error) }),
    });
    yield* assert(result.entityId === "account-1" && result.started === 10, "invalid start result");
    yield* Console.log("PASS parsed one strict supervised BEAM result line");
    yield* Console.log("PASS observed 10 -> 6 -> 4 and typed rejection preserving 4");
    yield* Console.log(
      "PASS observed pre-dispatch invalid input and restart identity/liveness/reset",
    );
    yield* Console.log("PASS observed clean supervisor shutdown");

    const coreSha256 = yield* digestPath(corePath);
    const generatedSha256 = yield* digestPath(generatedPath);
    const consumerSha256 = yield* digestPath(consumerPath);
    const toolchainSha256 = yield* digestPath(toolchainPath);
    const generatedConfigSha256 = yield* digestPath(generatedConfigPath);
    const generatedManifestSha256 = yield* digestPath(generatedManifestPath);
    const consumerConfigSha256 = yield* digestPath(consumerConfigPath);
    const consumerManifestSha256 = yield* digestPath(consumerManifestPath);
    const manifest = M017GleamActorEvidenceManifest.make({
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
        entityId: result.entityId,
        initialState: { balance: result.started },
        steps: [
          {
            sequence: 0,
            message: {
              _tag: "Withdraw",
              destination: result.entityId,
              messageId: "withdraw-1",
              amount: 4,
            },
            preState: { balance: 10 },
            reply: {
              _tag: "Succeeded",
              entityId: result.entityId,
              messageId: "withdraw-1",
              messageType: "Withdraw",
              state: { balance: 6 },
            },
          },
          {
            sequence: 1,
            message: {
              _tag: "Withdraw",
              destination: result.entityId,
              messageId: "withdraw-2",
              amount: 2,
            },
            preState: { balance: 6 },
            reply: {
              _tag: "Succeeded",
              entityId: result.entityId,
              messageId: "withdraw-2",
              messageType: "Withdraw",
              state: { balance: 4 },
            },
          },
          {
            sequence: 2,
            message: {
              _tag: "Withdraw",
              destination: result.entityId,
              messageId: "withdraw-3",
              amount: 9,
            },
            preState: { balance: 4 },
            reply: {
              _tag: "TypedFailure",
              entityId: result.entityId,
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
          oldTerminated: result.oldTerminated === "true",
          replacementObserved: result.replacementObserved === "true",
          identityChanged: result.identityChanged === "true",
          replacementAlive: result.replacementAlive === "true",
          restartState: { balance: result.restartBalance },
        },
        supervisorStopped: result.supervisorStopped === "true",
      },
      provenance: {
        coreSource: { path: corePath, sha256: coreSha256 },
        projector: "@bang/target-gleam/projectGleamEntityOperationRealization",
        generatedSource: { path: generatedPath, sha256: generatedSha256 },
        consumer: { path: consumerPath, sha256: consumerSha256 },
        toolchainDefinition: { path: toolchainPath, sha256: toolchainSha256 },
        generatedConfig: { path: generatedConfigPath, sha256: generatedConfigSha256 },
        generatedManifest: { path: generatedManifestPath, sha256: generatedManifestSha256 },
        consumerConfig: { path: consumerConfigPath, sha256: consumerConfigSha256 },
        consumerManifest: { path: consumerManifestPath, sha256: consumerManifestSha256 },
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
        gleam: { version: gleamVersion },
        otp: { version: otpVersion ?? "", release: otpRelease ?? "" },
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
          "checked Core identities remain the semantic source for the generated actor",
          "the independent consumer reports every handled request and supervised lifecycle observation",
        ],
        limitations,
        unsupportedClaims: [
          {
            claim: "Gleam, Erlang, or OTP is Core semantic authority",
            reason: "the target runtime only realizes checked Core identities",
          },
          {
            claim: "restart preserves durable state",
            reason:
              "the actor owns in-memory state and the replacement resets to its configured initial state",
          },
          {
            claim: "the journey proves delivery, fairness, or global order guarantees",
            reason: "the fixture has one sender, one destination, and finite observed calls",
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

    const checkedManifest = yield* checkM017GleamActorEvidenceManifest(manifest, checkedCore);
    const encodedManifest = yield* Schema.encodeEffect(M017GleamActorEvidenceManifestFromJson)(
      manifest,
    );
    yield* fileSystem.makeDirectory(path.dirname(evidencePath), { recursive: true });
    yield* fileSystem.writeFileString(evidencePath, `${encodedManifest}\n`);
    const reloaded = yield* decodeM017GleamActorEvidenceManifest(
      yield* fileSystem.readFileString(evidencePath),
    );
    const rechecked = yield* checkM017GleamActorEvidenceManifest(reloaded, checkedCore);
    yield* assert(
      formatM017GleamActorEvidenceReport(rechecked) ===
        formatM017GleamActorEvidenceReport(checkedManifest),
      "reloaded M017 evidence report changed",
    );
    yield* Console.log(`PASS wrote and strictly reloaded ${evidencePath}`);

    const identityDrift = M017GleamActorEvidenceManifest.make({
      ...manifest,
      source: { ...manifest.source, realization: "MissingWithdrawAccount" },
    });
    yield* assert(
      (yield* failureReason(checkM017GleamActorEvidenceManifest(identityDrift, checkedCore))) ===
        "unknown-core-identity",
      "identity rejection path did not remain typed",
    );
    yield* Console.log("PASS rejected Core identity drift");

    const stateDrift = M017GleamActorEvidenceManifest.make({
      ...manifest,
      observation: {
        ...manifest.observation,
        steps: manifest.observation.steps.map((step, index) =>
          index === 2 ? { ...step, reply: { ...step.reply, state: { balance: 3 } } } : step,
        ),
      },
    });
    yield* assert(
      (yield* failureReason(decodeM017GleamActorEvidenceManifest(stateDrift))) ===
        "state-changing-failure",
      "state rejection path did not remain typed",
    );
    yield* Console.log("PASS rejected typed-failure state change");

    const restartDrift = M017GleamActorEvidenceManifest.make({
      ...manifest,
      observation: {
        ...manifest.observation,
        restart: { ...manifest.observation.restart, identityChanged: false },
      },
    });
    yield* assert(
      (yield* failureReason(decodeM017GleamActorEvidenceManifest(restartDrift))) ===
        "restart-mismatch",
      "restart rejection path did not remain typed",
    );
    yield* Console.log("PASS rejected restart identity drift");

    const limitationDrift = M017GleamActorEvidenceManifest.make({
      ...manifest,
      qualification: {
        ...manifest.qualification,
        limitations: manifest.qualification.limitations.slice(0, 5),
      },
    });
    yield* assert(
      (yield* failureReason(decodeM017GleamActorEvidenceManifest(limitationDrift))) ===
        "missing-target-limitations",
      "limitation rejection path did not remain typed",
    );
    yield* Console.log("PASS rejected incomplete target limitations");

    const materialDrift = M017GleamActorEvidenceManifest.make({
      ...manifest,
      provenance: {
        ...manifest.provenance,
        generatedSource: { ...manifest.provenance.generatedSource, sha256: "0".repeat(64) },
      },
    });
    yield* assert(
      (yield* failureReason(verifyM017GleamActorEvidenceMaterials(materialDrift))) ===
        "stale-material",
      "material rejection path did not remain typed",
    );
    yield* Console.log("PASS rejected stale live material digest");
    yield* Console.log(formatM017GleamActorEvidenceReport(rechecked));
  }),
);

// This executable module selects Bun's standard platform Layer at the composition root.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
