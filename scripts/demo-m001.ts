import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { CoreDocumentFromJson, SemanticError, validateCore } from "@bang/core";
import { projectEffectRefinement } from "@bang/target-effect";
import { Effect, Schema } from "effect";

const validFixture = "examples/tiny-bank/core/balance.json";
const unknownBaseFixture = "examples/core-fixtures/invalid/unknown-refinement-base.json";
const illTypedFixture = "examples/core-fixtures/invalid/ill-typed-refinement-predicate.json";
const generatedPath = "generated/effect/Balance.ts";
const snapshotPath = "tests/snapshots/M001-Balance.ts";
const evidencePath = ".bang/evidence/M001.json";

const decode = async (path: string) =>
  Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(path).text());

const expectSemanticRejection = async (path: string, message: string) => {
  const document = await decode(path);
  const rejection = Effect.runSync(Effect.flip(validateCore(document)));
  if (!(rejection instanceof SemanticError) || !rejection.message.includes(message)) {
    throw new Error(`unexpected semantic rejection for ${path}: ${rejection.message}`);
  }
};

await rm(generatedPath, { force: true });
await rm(evidencePath, { force: true });

const document = await decode(validFixture);
console.log("PASS Balance Core decode");

const validated = Effect.runSync(validateCore(document));
console.log("PASS Balance predicate typing");

await expectSemanticRejection(unknownBaseFixture, "unknown base MissingInteger");
console.log("PASS unknown refinement base rejection");

await expectSemanticRejection(illTypedFixture, "self : String with Integer");
console.log("PASS ill-typed predicate rejection");

const generated = Effect.runSync(projectEffectRefinement(validated, "Balance"));
const snapshot = await Bun.file(snapshotPath).text();
if (generated !== snapshot) throw new Error(`generated refinement differs from ${snapshotPath}`);

await mkdir(dirname(generatedPath), { recursive: true });
await Bun.write(generatedPath, generated);
console.log("PASS deterministic Balance projection");

const compile = Bun.spawnSync(
  ["bun", "x", "tsc", "--noEmit", "--project", "examples/tiny-bank/refinement/tsconfig.json"],
  { stdout: "inherit", stderr: "inherit" },
);
if (compile.exitCode !== 0)
  throw new Error(`Balance TypeScript compilation exited ${compile.exitCode}`);
console.log("PASS nominal Balance type boundary");

const runtime = Bun.spawnSync(
  ["bun", "run", "examples/tiny-bank/refinement/balance-conformance.ts"],
  { stdout: "inherit", stderr: "inherit" },
);
if (runtime.exitCode !== 0) throw new Error(`Balance runtime checks exited ${runtime.exitCode}`);

const evidence = {
  bangEvidence: 1,
  mission: "M001",
  obligation: "runtime-refinement:Balance",
  declarations: ["Balance"],
  evidence: [
    {
      class: "target-static-analysis",
      observation: "TypeScript rejected ordinary bigint assignment to the generated brand",
      scope: "the committed negative type fixture at the recorded TypeScript version",
    },
    {
      class: "runtime-checked",
      observation: "the generated constructor accepted 0n and rejected -1n and number input",
      scope: "three executed boundary cases at the recorded Effect version",
    },
  ],
  assumptions: [
    "unsafe TypeScript casts and foreign JavaScript can bypass the nominal brand",
    "Effect Schema and bigint implement the recorded target projection",
  ],
  unsupported: [
    "universal proof of the refinement",
    "arbitrary predicates",
    "refinement preservation by later operations",
  ],
  sources: [validFixture, unknownBaseFixture, illTypedFixture, snapshotPath],
  target: {
    name: "effect-typescript",
    integerRepresentation: "bigint",
    effect: "4.0.0-rc.108",
    typescript: "7.0.2",
  },
} as const;

await mkdir(dirname(evidencePath), { recursive: true });
await Bun.write(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log("\nEvidence");
console.log("  target-static-analysis: Balance brand");
console.log("  runtime-checked: 3 boundary cases");
console.log("  assumptions: 2");
console.log("  universal proof: unsupported");
console.log(`  manifest: ${evidencePath}`);
