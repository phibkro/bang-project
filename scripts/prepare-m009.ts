import { CoreDocumentFromJson, validateCore } from "@bang/core";
import { projectRustRefinement } from "@bang/target-rust";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Path, Schema } from "effect";

const fixture = "examples/tiny-bank/core/balance.json";
const generatedPath = "generated/rust/balance.rs";
const snapshotPath = "tests/snapshots/M009-balance.rs";

class PreparationError extends Schema.TaggedError<PreparationError>()("PreparationError", {
  message: Schema.String,
}) {}

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const document = yield* Schema.decodeEffect(CoreDocumentFromJson)(
    yield* fileSystem.readFileString(fixture),
  );
  const checked = yield* validateCore(document);
  const projection = projectRustRefinement(checked, "Balance");
  if (!projection.ok) return yield* new PreparationError({ message: projection.error.message });
  const generated = projection.value;

  yield* fileSystem.makeDirectory(path.dirname(generatedPath), { recursive: true });
  yield* fileSystem.writeFileString(generatedPath, generated);
  if (process.env["BANG_UPDATE_SNAPSHOTS"] === "1") {
    yield* fileSystem.makeDirectory(path.dirname(snapshotPath), { recursive: true });
    yield* fileSystem.writeFileString(snapshotPath, generated);
    return;
  }
  const snapshot = yield* fileSystem.readFileString(snapshotPath);
  if (generated !== snapshot) {
    return yield* new PreparationError({ message: `generated Rust differs from ${snapshotPath}` });
  }
});

// This executable module selects Bun's standard platform Layer at the composition root.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
