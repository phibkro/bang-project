import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { validateCore } from "@bang/core";
import { sourceToCore } from "@bang/surface";
import { projectEffectStateMachine } from "@bang/target-effect";
import { Effect } from "effect";

const fixture = "examples/tiny-bank/account.bang";
const generatedPath = "generated/effect/AccountStateMachine.ts";
const snapshotPath = "tests/snapshots/M004-AccountStateMachine.ts";

const document = Effect.runSync(Effect.fromResult(sourceToCore(await Bun.file(fixture).text())));
const validated = Effect.runSync(validateCore(document));

await rm(generatedPath, { force: true });
await mkdir(dirname(generatedPath), { recursive: true });
await Bun.write(generatedPath, Effect.runSync(projectEffectStateMachine(validated, "Account")));

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
