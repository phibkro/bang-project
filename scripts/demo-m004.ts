import type { StateMachineDeclaration } from "@bang/core";
import { CoreDocumentFromJson, validateCore } from "@bang/core";
import { sourceToCore } from "@bang/surface";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { projectEffectStateMachine } from "@bang/target-effect";
import { Effect, Schema } from "effect";

interface StateMachineLawResult {
  readonly obligation: string;
  readonly operation: string;
  readonly invariant: string;
  readonly passed: boolean;
  readonly requestedCases: number;
  readonly executedRuns: number;
  readonly numSkips: number;
  readonly seed: number;
  readonly numShrinks: number;
  readonly counterexamplePath: string | null;
  readonly counterexample: ReadonlyArray<string> | null;
}

interface DiagnosticResult {
  readonly legalWithdrawal: boolean;
  readonly overdraftWithdrawal: boolean;
  readonly lawful: ReadonlyArray<StateMachineLawResult>;
  readonly broken: ReadonlyArray<StateMachineLawResult>;
  readonly brokenNextState: { readonly balance: string };
}

interface WithdrawCounterexample {
  readonly state: { readonly balance: string };
  readonly amount: string;
}

const fixture = "examples/tiny-bank/account.bang";
const unknownFieldFixture = "examples/core-fixtures/invalid/unknown-state-field.json";
const illTypedFixture = "examples/core-fixtures/invalid/ill-typed-state-predicate.json";
const initializerStateFixture = "examples/core-fixtures/invalid/initializer-observes-state.json";
const unsupportedFixture = "examples/core-fixtures/target-unsupported/string-state-machine.json";
const evidencePath = ".bang/evidence/M004.json";

const decode = async (path: string) =>
  Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(path).text());

const run = (command: ReadonlyArray<string>, stdout: "inherit" | "pipe" = "inherit") => {
  const result = Bun.spawnSync([...command], { stdout, stderr: "inherit" });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited ${result.exitCode}`);
  }
  return result.stdout;
};

const semanticErrorFor = async (path: string): Promise<string> => {
  const document = await decode(path);
  return Effect.runSync(Effect.flip(validateCore(document))).message;
};

await rm(evidencePath, { force: true });

const document = Effect.runSync(Effect.fromResult(sourceToCore(await Bun.file(fixture).text())));
console.log("PASS Account source parse and Core lowering");
const validated = Effect.runSync(validateCore(document));
const machine = validated.declarations.find(
  (declaration): declaration is StateMachineDeclaration =>
    declaration.kind === "stateMachine" && declaration.id === "Account",
);
if (machine === undefined) throw new Error("Account source declared no state machine");
console.log("PASS state, initializer, transition requirements, and invariant typing");

const unknownFieldError = await semanticErrorFor(unknownFieldFixture);
if (!unknownFieldError.includes("references unknown state field missing")) {
  throw new Error(`unexpected unknown-field diagnostic: ${unknownFieldError}`);
}
console.log("PASS unknown state-field rejection");

const illTypedError = await semanticErrorFor(illTypedFixture);
if (!illTypedError.includes("greaterThanOrEqual requires Integer operands")) {
  throw new Error(`unexpected predicate diagnostic: ${illTypedError}`);
}
console.log("PASS ill-typed state predicate rejection");

const initializerStateError = await semanticErrorFor(initializerStateFixture);
if (!initializerStateError.includes("cannot observe state field balance")) {
  throw new Error(`unexpected initializer-state diagnostic: ${initializerStateError}`);
}
console.log("PASS initializer pre-state observation rejection");
const unsupportedDocument = await decode(unsupportedFixture);

const unsupportedError = Effect.runSync(
  Effect.flip(
    projectEffectStateMachine(Effect.runSync(validateCore(unsupportedDocument)), "StringState"),
  ),
);
const unsupportedRejected =
  unsupportedError.reason === "unsupported-target" &&
  unsupportedError.message.includes("requires Integer field");
if (!unsupportedRejected) throw new Error("Effect accepted its unsupported String state field");
console.log("PASS target-unsupported state representation rejection");

run(["bun", "run", "scripts/prepare-m004.ts"]);
console.log("PASS deterministic Effect state-machine projection");
run(["bun", "x", "tsc", "--noEmit", "--project", "examples/tiny-bank/state/tsconfig.json"]);
console.log("PASS generated state-machine kit type-check");
run(["bun", "x", "vitest", "run", "examples/tiny-bank/state/account-state-machine.test.ts"]);
console.log("PASS lawful initialization and withdrawal via Effect Vitest (100 cases each)");

const diagnosticBytes = run(
  ["bun", "run", "examples/tiny-bank/state/state-diagnostics.ts"],
  "pipe",
);
const diagnostics = JSON.parse(new TextDecoder().decode(diagnosticBytes)) as DiagnosticResult;
const lawfulInitialize = diagnostics.lawful.find(({ operation }) => operation === "initialize");
const lawfulWithdraw = diagnostics.lawful.find(({ operation }) => operation === "withdraw");
const brokenWithdraw = diagnostics.broken.find(({ operation }) => operation === "withdraw");
const serializedCounterexample = brokenWithdraw?.counterexample?.[0];
const counterexample =
  serializedCounterexample === undefined
    ? undefined
    : (JSON.parse(serializedCounterexample) as WithdrawCounterexample);
if (
  diagnostics.legalWithdrawal !== true ||
  diagnostics.overdraftWithdrawal !== false ||
  lawfulInitialize?.passed !== true ||
  lawfulInitialize.executedRuns !== 100 ||
  lawfulWithdraw?.passed !== true ||
  lawfulWithdraw.executedRuns !== 100 ||
  brokenWithdraw?.passed !== false ||
  brokenWithdraw.numShrinks < 1 ||
  brokenWithdraw.counterexamplePath === null ||
  counterexample?.state.balance !== "0" ||
  counterexample.amount !== "0"
) {
  throw new Error(`unexpected state-machine diagnostics: ${JSON.stringify(diagnostics)}`);
}
console.log("PASS overdraft excluded from the legal transition relation");
console.log(
  `PASS broken withdrawal shrank to balance = 0n, amount = 0n (${brokenWithdraw.numShrinks} shrinks)`,
);

const evidence = {
  bangEvidence: 1,
  mission: "M004",
  stateMachine: machine.id,
  evidence: [
    ...diagnostics.lawful.map((result) => ({
      class: "property-tested",
      obligation: result.obligation,
      realization: "accountStateMachine",
      result: "passed",
      requestedCases: result.requestedCases,
      executedRuns: result.executedRuns,
      numSkips: result.numSkips,
      seed: result.seed,
    })),
    {
      class: "scenario-tested",
      obligation: "Account.withdraw.requires",
      result: "overdraft-rejected",
      state: { balance: "10" },
      input: { amount: "11" },
    },
    {
      class: "property-tested",
      obligation: brokenWithdraw.obligation,
      realization: "brokenAccountStateMachine",
      result: "failed",
      requestedCases: brokenWithdraw.requestedCases,
      executedRuns: brokenWithdraw.executedRuns,
      numSkips: brokenWithdraw.numSkips,
      seed: brokenWithdraw.seed,
      numShrinks: brokenWithdraw.numShrinks,
      counterexamplePath: brokenWithdraw.counterexamplePath,
      counterexample: {
        state: { balance: counterexample.state.balance },
        input: { amount: counterexample.amount },
        nextState: diagnostics.brokenNextState,
        violatedInvariant: brokenWithdraw.invariant,
      },
    },
    {
      class: "unsupported-by-target",
      obligation: "Account.withdraw.requires",
      target: "typescript",
      reason: "the dependent bigint precondition is exposed as a runtime guard, not a static type",
    },
  ],
  assumptions: [
    "FastCheck generation distribution and shrinker are those of version 4.9.0",
    "arbitrary filter retries are not represented by FastCheck numSkips",
    "sampled states and inputs are not every bigint state and input",
    "the implementation functions are pure during conformance evaluation",
  ],
  unsupported: [
    "universal proof of invariant establishment or preservation",
    "reachability beyond one transition",
    "withdrawal subtracts exactly the requested amount",
    "typed rejection behavior for illegal calls",
  ],
  invalidatedBy: [
    "unsafe casts or foreign JavaScript that bypass generated schemas",
    "mutation of state values outside the realization boundary",
    "changes to the realization, generated kit, Core declaration, or recorded tool versions",
  ],
  sources: [
    fixture,
    "tests/snapshots/M004-AccountStateMachine.ts",
    "examples/tiny-bank/state/account-state-machine.test.ts",
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
console.log("  property-tested: initialize and withdraw, 100/100 cases each");
console.log("  scenario-tested: overdraft excluded by generated guard");
console.log("  counterexample: broken withdraw produced balance = -1n");
console.log(
  `  replay: seed ${brokenWithdraw.seed}, ${brokenWithdraw.numShrinks}-step path recorded in manifest`,
);
console.log("  static dependent precondition: unsupported by TypeScript target");
console.log(`  manifest: ${evidencePath}`);
