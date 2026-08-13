import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { FiniteModelDeclaration, TheoryDeclaration } from "@bang/core";
import { CoreDocumentFromJson, evaluateFiniteModel, SemanticError, validateCore } from "@bang/core";
import { projectEffectFiniteModel } from "@bang/target-effect";
import { Effect, Schema } from "effect";

const fixture = "examples/tiny-bank/core/account-lifecycle.json";
const incompleteFixture = "examples/core-fixtures/invalid/incomplete-finite-model.json";
const generatedPath = "generated/effect/AccountLifecycleModel.ts";
const snapshotPath = "tests/snapshots/M002-AccountLifecycleModel.ts";
const evidencePath = ".bang/evidence/M002.json";

const decode = async (path: string) =>
  Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(path).text());

await rm(generatedPath, { force: true });
await rm(evidencePath, { force: true });

const document = await decode(fixture);
console.log("PASS AccountLifecycle Core decode");

const validated = Effect.runSync(validateCore(document));
const theory = validated.declarations.find(
  (declaration): declaration is TheoryDeclaration =>
    declaration.kind === "theory" && declaration.id === "AccountLifecycle",
);
const model = validated.declarations.find(
  (declaration): declaration is FiniteModelDeclaration =>
    declaration.kind === "finiteModel" && declaration.id === "AccountLifecycleValid",
);
if (theory === undefined || model === undefined) {
  throw new Error("AccountLifecycle fixture omitted its theory or valid model");
}
console.log("PASS theory terms and finite model typing");

const incomplete = await decode(incompleteFixture);
const incompleteRejection = Effect.runSync(Effect.flip(validateCore(incomplete)));
if (
  !(incompleteRejection instanceof SemanticError) ||
  !incompleteRejection.message.includes("is incomplete")
) {
  throw new Error(`unexpected incomplete-model result: ${incompleteRejection.message}`);
}
console.log("PASS incomplete operation-table rejection");

const validResult = Effect.runSync(evaluateFiniteModel(document, model.id));
if (!validResult.satisfies || validResult.checkedAssignments !== 3) {
  throw new Error(`valid model did not satisfy its finite scope: ${JSON.stringify(validResult)}`);
}
console.log("PASS valid model satisfaction (3 exhaustive assignments)");

const brokenResult = Effect.runSync(evaluateFiniteModel(document, "AccountLifecycleBroken"));
if (
  brokenResult.satisfies ||
  brokenResult.counterexample.assignment[0]?.element !== "Open" ||
  brokenResult.counterexample.left !== "Open" ||
  brokenResult.counterexample.right !== "Frozen"
) {
  throw new Error(`unexpected broken-model result: ${JSON.stringify(brokenResult)}`);
}
console.log("PASS broken model counterexample (status = Open, left = Open, right = Frozen)");

const generated = projectEffectFiniteModel(theory, model);
const snapshot = await Bun.file(snapshotPath).text();
if (generated !== snapshot) throw new Error(`generated model kit differs from ${snapshotPath}`);
await mkdir(dirname(generatedPath), { recursive: true });
await Bun.write(generatedPath, generated);
console.log("PASS deterministic AccountLifecycle Effect projection");

const compile = Bun.spawnSync(
  ["bun", "x", "tsc", "--noEmit", "--project", "examples/tiny-bank/model/tsconfig.json"],
  { stdout: "inherit", stderr: "inherit" },
);
if (compile.exitCode !== 0) {
  throw new Error(`AccountLifecycle TypeScript compilation exited ${compile.exitCode}`);
}
console.log("PASS AccountLifecycle realization type-check");

const conformance = Bun.spawnSync(
  ["bun", "run", "examples/tiny-bank/model/account-lifecycle-conformance.ts"],
  { stdout: "inherit", stderr: "inherit" },
);
if (conformance.exitCode !== 0) {
  throw new Error(`AccountLifecycle conformance exited ${conformance.exitCode}`);
}

const evidence = {
  bangEvidence: 1,
  mission: "M002",
  theory: theory.id,
  models: [model.id, brokenResult.model],
  obligation: "law:AccountLifecycle.freezeIdempotent",
  evidence: [
    {
      class: "finite-exhaustive",
      subject: model.id,
      result: "satisfied",
      scope: {
        carriers: { Status: ["Open", "Frozen", "Closed"] },
        checkedAssignments: validResult.checkedAssignments,
      },
    },
    {
      class: "counterexample-observation",
      subject: brokenResult.model,
      result: "violated",
      checkedAssignments: brokenResult.checkedAssignments,
      counterexample: brokenResult.counterexample,
    },
    {
      class: "runtime-conformance",
      subject: "AccountLifecycle realization",
      result: "agreed",
      scope: { operation: "freeze", checkedRows: 3 },
    },
  ],
  assumptions: [
    "the authored finite carrier is the intended scope of this evaluation",
    "the Effect target does not receive values outside its generated literal Schema",
  ],
  unsupported: [
    "proof for all AccountLifecycle models",
    "claims about unbounded or different Status carriers",
    "termination or temporal behavior",
  ],
  sources: [fixture, incompleteFixture, snapshotPath],
  target: { name: "effect-typescript", effect: "4.0.0-rc.108", typescript: "7.0.2" },
} as const;

await mkdir(dirname(evidencePath), { recursive: true });
await Bun.write(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log("\nEvidence");
console.log("  finite-exhaustive: 3/3 assignments satisfied");
console.log("  counterexample: AccountLifecycleBroken at status = Open");
console.log("  runtime-conformance: 3/3 rows agreed");
console.log("  universal proof: unsupported");
console.log(`  manifest: ${evidencePath}`);
