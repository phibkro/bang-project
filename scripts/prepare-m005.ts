import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { CoreDocumentFromJson, validateCore } from "@bang/core";
import { projectEffectTheoryBridge } from "@bang/target-effect";
import { Effect, Schema } from "effect";

const fixture = "examples/tiny-bank/core/account-ledger-bridge.json";
const generatedPath = "generated/effect/AccountLedgerBridge.ts";
const snapshotPath = "tests/snapshots/M005-AccountLedgerBridge.ts";

const document = Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(fixture).text());
const checked = Effect.runSync(validateCore(document));
const source = Effect.runSync(projectEffectTheoryBridge(checked, "AccountLedger"));

await rm(generatedPath, { force: true });
await mkdir(dirname(generatedPath), { recursive: true });
await Bun.write(generatedPath, source);

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
if (process.env["BANG_UPDATE_SNAPSHOTS"] === "1") {
  await mkdir(dirname(snapshotPath), { recursive: true });
  await Bun.write(snapshotPath, generated);
} else {
  const snapshot = await Bun.file(snapshotPath).text();
  if (generated !== snapshot)
    throw new Error(`generated theory-bridge kit differs from ${snapshotPath}`);
}
