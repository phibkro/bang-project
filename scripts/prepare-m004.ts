import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { StateMachineDeclaration } from "@bang/core";
import { CoreDocumentFromJson, validateCore } from "@bang/core";
import { projectEffectStateMachine } from "@bang/target-effect";
import { Effect, Schema } from "effect";

const fixture = "examples/tiny-bank/core/account-state-machine.json";
const generatedPath = "generated/effect/AccountStateMachine.ts";
const snapshotPath = "tests/snapshots/M004-AccountStateMachine.ts";

const document = Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(fixture).text());
const validated = Effect.runSync(validateCore(document));
const machine = validated.declarations.find(
  (declaration): declaration is StateMachineDeclaration =>
    declaration.kind === "stateMachine" && declaration.id === "Account",
);
if (machine === undefined) throw new Error("Account fixture declared no state machine");

await rm(generatedPath, { force: true });
await mkdir(dirname(generatedPath), { recursive: true });
await Bun.write(generatedPath, projectEffectStateMachine(machine));

const format = Bun.spawnSync(
  [
    "bun",
    "x",
    "oxfmt",
    "--config=scripts/oxfmt-generated.json",
    "--ignore-path=/dev/null",
    "--disable-nested-config",
    generatedPath,
  ],
  {
    stdout: "pipe",
    stderr: "inherit",
  },
);
if (format.exitCode !== 0) throw new Error(`oxfmt exited ${format.exitCode}`);

const generated = await Bun.file(generatedPath).text();
const snapshot = await Bun.file(snapshotPath).text();
if (generated !== snapshot)
  throw new Error(`generated state-machine kit differs from ${snapshotPath}`);
