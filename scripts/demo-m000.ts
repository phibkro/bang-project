import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect, Schema } from "effect";
import { CoreDocumentFromJson, SemanticError, validateCore } from "../src/core.ts";
import { projectEffectService } from "../src/effect-projection.ts";

const validFixture = "examples/tiny-bank/core/account-service.json";
const invalidFixture = "examples/core-fixtures/invalid/unknown-type.json";
const generatedPath = "generated/effect/AccountService.ts";
const snapshotPath = "tests/snapshots/M000-AccountService.ts";
const evidencePath = ".bang/evidence/M000.json";

const decode = async (path: string) =>
  Schema.decodeUnknownSync(CoreDocumentFromJson)(await Bun.file(path).text());

await rm("generated", { recursive: true, force: true });
await rm(".bang/evidence", { recursive: true, force: true });

const document = await decode(validFixture);
console.log("PASS Core decode");

const validated = Effect.runSync(validateCore(document));
console.log("PASS semantic identities and references");

const invalid = await decode(invalidFixture);
const rejection = Effect.runSync(Effect.flip(validateCore(invalid)));
if (!(rejection instanceof SemanticError)) throw new Error("unexpected negative fixture failure");
console.log("PASS unknown type rejection");

const service = validated.declarations[0];
if (service === undefined) throw new Error("valid fixture declared no service");

const generated = projectEffectService(service);
const snapshot = await Bun.file(snapshotPath).text();
if (generated !== snapshot) throw new Error(`generated port differs from ${snapshotPath}`);

await mkdir(dirname(generatedPath), { recursive: true });
await Bun.write(generatedPath, generated);
console.log("PASS deterministic Effect projection");

const compile = Bun.spawnSync(["bun", "x", "tsc", "--noEmit"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (compile.exitCode !== 0) throw new Error(`TypeScript compilation exited ${compile.exitCode}`);
console.log("PASS implementation type-check");

const evidence = {
  bangEvidence: 1,
  mission: "M000",
  obligation: "structural-conformance:AccountService",
  declarations: ["AccountService"],
  evidence: {
    class: "structural-conformance",
    observation: "hand-written implementation type-checked against generated Effect port",
    scope: "TypeScript compilation at the recorded tool versions",
    assumptions: [
      "TypeScript host typing is not invalidated by casts, mutation, or foreign JavaScript",
    ],
    unsupported: ["behavioral laws", "runtime behavior", "universal proof"],
  },
  sources: [validFixture, invalidFixture, snapshotPath],
  target: {
    name: "effect-typescript",
    effect: "4.0.0-rc.108",
    typescript: "7.0.2",
  },
} as const;

await mkdir(dirname(evidencePath), { recursive: true });
await Bun.write(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log("\nEvidence");
console.log("  structural-conformance: AccountService");
console.log("  laws: none declared");
console.log("  assumptions: 1");
console.log(`  manifest: ${evidencePath}`);
