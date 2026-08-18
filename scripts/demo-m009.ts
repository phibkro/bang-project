import { CoreDocumentFromJson, validateCore } from "@bang/core";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const fixture = "examples/tiny-bank/core/balance.json";
const evidencePath = ".bang/evidence/M009.json";

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", { message: Schema.String }) {}

const run = (command: string, args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const process = yield* ChildProcess.make(command, args, { stdout: "pipe", stderr: "pipe" });
      const stdout = yield* process.stdout.pipe(Stream.decodeText(), Stream.runCollect);
      const stderr = yield* process.stderr.pipe(Stream.decodeText(), Stream.runCollect);
      const exitCode = yield* process.exitCode;
      return { exitCode, stdout: Array.from(stdout).join(""), stderr: Array.from(stderr).join("") };
    }),
  );

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const document = yield* Schema.decodeEffect(CoreDocumentFromJson)(
    yield* fileSystem.readFileString(fixture),
  );
  const checked = yield* validateCore(document);
  const balance = checked.declarations.find(
    (declaration) => declaration.kind === "refinement" && declaration.id === "Balance",
  );
  if (balance?.kind !== "refinement") {
    return yield* new DemoError({ message: "checked Core does not contain Balance refinement" });
  }

  yield* run("bun", ["run", "scripts/prepare-m009.ts"]);
  const rust = yield* run("nix", [
    "shell",
    "nixpkgs#rustc",
    "nixpkgs#cargo",
    "nixpkgs#stdenv.cc",
    "-c",
    "cargo",
    "run",
    "--quiet",
    "--manifest-path",
    "examples/tiny-bank/rust-balance/Cargo.toml",
  ]);
  if (rust.exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new DemoError({ message: `Rust consumer failed: ${rust.stderr}` });
  }
  if (!rust.stdout.includes("accepted=0") || !rust.stdout.includes("rejected=-1")) {
    return yield* new DemoError({ message: `unexpected Rust output: ${rust.stdout}` });
  }

  const compiler = yield* run("nix", ["shell", "nixpkgs#rustc", "-c", "rustc", "--version"]);
  const compileFail = yield* run("nix", [
    "shell",
    "nixpkgs#rustc",
    "-c",
    "rustc",
    "examples/tiny-bank/rust-balance/compile-fail/direct-construction.rs",
    "--out-dir",
    "/tmp/bang-m009-compile-fail",
  ]);
  if (compileFail.exitCode === ChildProcessSpawner.ExitCode(0)) {
    return yield* new DemoError({ message: "direct Balance construction unexpectedly compiled" });
  }
  if (
    !compileFail.stderr.includes("cannot initialize a tuple struct which contains private fields")
  ) {
    return yield* new DemoError({
      message: `unexpected compile-fail diagnostic: ${compileFail.stderr}`,
    });
  }

  const evidence = {
    action: "target-portability",
    source: { core: fixture, declaration: balance.id, identity: `refinement:${balance.id}` },
    observations: [
      { class: "runtime-checked", target: "rust", case: "0", result: "accepted" },
      { class: "runtime-checked", target: "rust", case: "-1", result: "rejected", retained: "-1" },
      {
        class: "target-static-analysis",
        target: "rust",
        claim: "private-field-construction",
        result: "rejected",
      },
      { class: "unsupported-by-target", target: "rust", claim: "Core Integer outside i128 range" },
    ],
    comparison: {
      effectTypeScript: { carrier: "arbitrary-precision bigint", construction: "Schema boundary" },
      rust: { carrier: "fixed-width i128", construction: "Result constructor and private newtype" },
    },
    provenance: {
      projector: "packages/target-rust/src/index.ts",
      generated: "generated/rust/balance.rs",
      consumer: "examples/tiny-bank/rust-balance/src/main.rs",
      compileFail: "examples/tiny-bank/rust-balance/compile-fail/direct-construction.rs",
    },
    environment: { rustc: compiler.stdout.trim(), effect: "4.0.0-rc.108", typescript: "7.0.2" },
    assumptions: [
      "generated source reflects checked Core",
      "Rust compiler observations are truthful",
    ],
    lifetime: "valid for the recorded generated source, consumer, compiler, and target versions",
    invalidators: [
      "Core refinement changes",
      "projector or generated source changes",
      "consumer or compiler changes",
      "unsafe or foreign construction bypasses the boundary",
    ],
    unsupportedClaims: [
      "arbitrary-precision Rust portability",
      "universal cross-target semantic equivalence",
      "formal proof",
    ],
  };
  yield* fileSystem.makeDirectory(".bang/evidence", { recursive: true });
  yield* fileSystem.writeFileString(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log("PASS unchanged Balance Core projected to Rust");
  console.log("PASS Rust accepts 0 and rejects -1 with retained value");
  console.log("PASS Rust private field blocks direct construction");
  console.log("PASS i128 target weakening reported");
  console.log(`Manifest: ${evidencePath}`);
});

import { Stream } from "effect";

// This executable module selects Bun's standard platform Layer at the composition root.
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
