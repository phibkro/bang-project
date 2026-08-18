import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const selection = "examples/tiny-bank/database/account.json";
const generatedDirectory = resolve(root, ".bang/semantic-database/tiny-bank-account");
const artifactNames = ["schema.sql", "bindings.ts", "report.json"] as const;

type Result = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

const runProcess = async (command: string[]): Promise<Result> => {
  const child = Bun.spawn(command, {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
};

const run = (path: string): Promise<Result> => runProcess([executable, "database", path]);

const readArtifacts = async (): Promise<Uint8Array[]> =>
  Promise.all(
    artifactNames.map(
      async (name) => new Uint8Array(await Bun.file(join(generatedDirectory, name)).arrayBuffer()),
    ),
  );

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const evidence = await runProcess(["bun", "run", "demo:m018"]);
if (evidence.exitCode !== 0) {
  throw new Error(`M026 evidence preparation failed\n${evidence.stderr || evidence.stdout}`);
}

const positive = await run(selection);
if (positive.exitCode !== 0 || positive.stderr !== "") {
  throw new Error(`M026 database command failed\n${positive.stderr}`);
}
const firstArtifacts = await readArtifacts();

const repeat = await run(selection);
if (repeat.exitCode !== 0 || repeat.stderr !== "" || repeat.stdout !== positive.stdout) {
  throw new Error("M026 database command was not byte deterministic");
}
const secondArtifacts = await readArtifacts();
if (!firstArtifacts.every((artifact, index) => equalBytes(artifact, secondArtifacts[index]!))) {
  throw new Error("M026 generated artifacts were not byte deterministic");
}

for (const required of [
  "M026 persistent reactive semantic database",
  "Initial subscription: revision 0, balance 10, withdrawal available yes",
  "Committed subscription: revision 1, balance 6, withdrawal available no",
  "Rejection: WithdrawalRejectedOnce",
  "Reactive query runs after rejection: 2",
  "Reopened query: revision 1, balance 6, withdrawal available no",
  "Incremental equals clean query: yes",
  "Reopened equals clean query: yes",
  "Effect binding type-check: passed",
]) {
  if (!positive.stdout.includes(required))
    throw new Error(`missing M026 journey marker: ${required}`);
}
if ((positive.stdout.match(/^M026 persistent reactive semantic database$/gm) ?? []).length !== 1) {
  throw new Error("M026 canonical report was not emitted exactly once");
}

const negativeFixtures = [
  ["examples/tiny-bank/database/unsafe-project-path.json", "unsafe-path"],
  ["examples/tiny-bank/database/unknown-state-machine.json", "unknown-state-machine"],
  ["examples/tiny-bank/database/unknown-state-field.json", "unknown-state-field"],
  ["examples/tiny-bank/database/unknown-capability.json", "unknown-capability"],
  ["examples/tiny-bank/database/wrong-realization-quantity.json", "quantity-mismatch"],
  ["examples/tiny-bank/database/bad-subscription-reference.json", "subscription-query-mismatch"],
  ["examples/tiny-bank/database/malformed.json", "malformed-decimal"],
  ["examples/tiny-bank/database/excess-selection.json", "schema"],
] as const;
const checkNegativeFixture = async (index: number): Promise<void> => {
  const fixture = negativeFixtures[index];
  if (fixture === undefined) return;
  const [negative, reason] = fixture;
  const result = await run(negative);
  const reportedReason = result.stderr.split("\n").find((line) => line.startsWith("reason: "));
  if (result.exitCode === 0 || result.stdout !== "" || reportedReason !== `reason: ${reason}`) {
    throw new Error(`negative M026 fixture failed exact rejection contract: ${negative}`);
  }
  return checkNegativeFixture(index + 1);
};
await checkNegativeFixture(0);

process.stdout.write("PASS canonical database journey\n");
process.stdout.write("PASS deterministic stdout and generated artifacts\n");
process.stdout.write("PASS eight negative fixtures rejected with exact reasons\n");
process.stdout.write(positive.stdout);
