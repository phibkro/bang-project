import { validateCore } from "@bang/core";
import { sourceToCore } from "@bang/surface";
import { projectEffectEntityOperationRealization } from "@bang/target-effect";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const fixture = "examples/tiny-bank/account.bang";
const generatedPath = "generated/effect/AccountEntity.ts";
const snapshotPath = "tests/snapshots/M015-AccountEntity.ts";

class PreparationError extends Schema.TaggedError<PreparationError>()("PreparationError", {
  message: Schema.String,
}) {}

const program = Effect.scoped(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const document = yield* Effect.fromResult(
      sourceToCore(yield* fileSystem.readFileString(fixture)),
    );
    const checked = yield* validateCore(document);
    const source = yield* projectEffectEntityOperationRealization(
      checked,
      "Account",
      "WithdrawAccount",
    );

    yield* fileSystem.remove(generatedPath, { force: true });
    yield* fileSystem.makeDirectory(path.dirname(generatedPath), { recursive: true });
    yield* fileSystem.writeFileString(generatedPath, source);

    const format = yield* ChildProcess.make(
      "bun",
      [
        "x",
        "oxfmt",
        "--config=scripts/oxfmt-generated.json",
        "--ignore-path=/dev/null",
        "--disable-nested-config",
        generatedPath,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    const exitCode = yield* format.exitCode;
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new PreparationError({ message: `oxfmt exited ${exitCode}` });
    }

    const generated = yield* fileSystem.readFileString(generatedPath);

    if (process.env["BANG_UPDATE_SNAPSHOTS"] === "1") {
      yield* fileSystem.makeDirectory(path.dirname(snapshotPath), { recursive: true });
      yield* fileSystem.writeFileString(snapshotPath, generated);
      return;
    }

    const snapshot = yield* fileSystem.readFileString(snapshotPath);
    if (generated !== snapshot) {
      return yield* new PreparationError({
        message: `generated entity boundary differs from ${snapshotPath}`,
      });
    }
  }),
);

// This executable module selects Bun's standard platform Layer at the composition root.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
