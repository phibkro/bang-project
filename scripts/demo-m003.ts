import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { TheoryDeclaration } from "@bang/core";
import { CoreDocumentFromJson, validateCore } from "@bang/core";
import { projectEffectPropertySuite } from "@bang/target-effect";
import { Effect, Schema } from "effect";

interface PropertyLawResult {
  readonly law: string;
  readonly passed: boolean;
  readonly requestedCases: number;
  readonly executedRuns: number;
  readonly seed: number;
  readonly numShrinks: number;
  readonly counterexamplePath: string | null;
  readonly counterexample: ReadonlyArray<string> | null;
}

interface DiagnosticResult {
  readonly lawful: ReadonlyArray<PropertyLawResult>;
  readonly broken: ReadonlyArray<PropertyLawResult>;
}

const fixture = "examples/tiny-bank/core/integer-addition.json";
const unsupportedFixture =
  "examples/core-fixtures/target-unsupported/string-represented-theory.json";
const evidencePath = ".bang/evidence/M003.json";

const decode = async (path: string) =>
  Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(path).text());

const run = (command: ReadonlyArray<string>, stdout: "inherit" | "pipe" = "inherit") => {
  const result = Bun.spawnSync([...command], { stdout, stderr: "inherit" });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited ${result.exitCode}`);
  }
  return result.stdout;
};

await rm(evidencePath, { force: true });

const document = await decode(fixture);
console.log("PASS IntegerAddition Core decode");
const validated = Effect.runSync(validateCore(document));
const theory = validated.declarations.find(
  (declaration): declaration is TheoryDeclaration =>
    declaration.kind === "theory" && declaration.id === "IntegerAddition",
);
if (theory === undefined) throw new Error("IntegerAddition fixture declared no theory");
console.log("PASS represented Integer sort and law typing");

const unsupportedDocument = await decode(unsupportedFixture);
const unsupportedTheory = Effect.runSync(validateCore(unsupportedDocument)).declarations.find(
  (declaration): declaration is TheoryDeclaration => declaration.kind === "theory",
);
if (unsupportedTheory === undefined) throw new Error("unsupported fixture declared no theory");
let unsupportedRejected = false;
try {
  projectEffectPropertySuite(unsupportedTheory);
} catch (error) {
  unsupportedRejected =
    error instanceof TypeError && error.message.includes("requires Integer representation");
}
if (!unsupportedRejected)
  throw new Error("Effect accepted its unsupported String property carrier");
console.log("PASS target-unsupported represented sort rejection");

run(["bun", "run", "scripts/prepare-m003.ts"]);
console.log("PASS deterministic Effect Vitest property projection");
run(["bun", "x", "tsc", "--noEmit", "--project", "examples/tiny-bank/property/tsconfig.json"]);
console.log("PASS generated property suite type-check");
run(["bun", "x", "vitest", "run", "examples/tiny-bank/property/integer-addition.test.ts"]);
console.log("PASS lawful realization via Effect Vitest (100 generated cases)");

const diagnosticBytes = run(
  ["bun", "run", "examples/tiny-bank/property/property-diagnostics.ts"],
  "pipe",
);
const diagnostics = JSON.parse(new TextDecoder().decode(diagnosticBytes)) as DiagnosticResult;
const lawful = diagnostics.lawful[0];
const broken = diagnostics.broken[0];
if (
  lawful?.passed !== true ||
  lawful.executedRuns !== 100 ||
  broken?.passed !== false ||
  broken.counterexample?.[0] !== "0" ||
  broken.numShrinks < 1 ||
  broken.counterexamplePath === null
) {
  throw new Error(`unexpected property diagnostics: ${JSON.stringify(diagnostics)}`);
}
console.log(
  `PASS broken realization shrank to value = 0n (${broken.numShrinks} shrink, path ${broken.counterexamplePath})`,
);

const evidence = {
  bangEvidence: 1,
  mission: "M003",
  theory: theory.id,
  obligation: "law:IntegerAddition.rightIdentity",
  evidence: [
    {
      class: "property-tested",
      realization: "integerAddition",
      result: "passed",
      requestedCases: lawful.requestedCases,
      executedRuns: lawful.executedRuns,
      seed: lawful.seed,
    },
    {
      class: "property-tested",
      realization: "brokenIntegerAddition",
      result: "failed",
      requestedCases: broken.requestedCases,
      executedRuns: broken.executedRuns,
      seed: broken.seed,
      numShrinks: broken.numShrinks,
      counterexamplePath: broken.counterexamplePath,
      counterexample: { value: broken.counterexample[0] },
    },
  ],
  assumptions: [
    "FastCheck generation distribution and shrinker are those of version 4.9.0",
    "the represented Core Integer maps to Effect Schema.BigInt and JavaScript bigint",
    "sampled success does not cover every bigint",
  ],
  unsupported: [
    "universal proof of right identity",
    "finite-exhaustive evidence over Integer",
    "claims about realizations not executed by this suite",
  ],
  sources: [
    fixture,
    "tests/snapshots/M003-IntegerAdditionProperties.ts",
    "examples/tiny-bank/property/integer-addition.test.ts",
  ],
  target: {
    name: "effect-vitest",
    effect: "4.0.0-rc.108",
    effectVitest: "4.0.0-rc.108",
    vitest: "4.1.10",
    fastCheck: "4.9.0",
  },
} as const;

await mkdir(dirname(evidencePath), { recursive: true });
await Bun.write(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log("\nEvidence");
console.log("  property-tested: lawful realization, 100/100 cases");
console.log("  counterexample: broken realization at value = 0n");
console.log(`  replay: seed ${broken.seed}, path ${broken.counterexamplePath}`);
console.log("  universal proof: unsupported");
console.log(`  manifest: ${evidencePath}`);
