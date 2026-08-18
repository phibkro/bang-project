import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const selection = "examples/tiny-bank/database/transfer.json";
const generatedDirectory = resolve(root, ".bang/semantic-database/tiny-bank-transfer");
const artifactNames = ["schema.sql", "bindings.ts", "report.json"] as const;

type Result = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

const runProcess = async (command: readonly string[]): Promise<Result> => {
  const child = Bun.spawn([...command], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
};

const readArtifacts = async (): Promise<ReadonlyArray<Uint8Array>> =>
  Promise.all(
    artifactNames.map(
      async (name) => new Uint8Array(await Bun.file(join(generatedDirectory, name)).arrayBuffer()),
    ),
  );

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const m011 = await runProcess(["bun", "run", "demo:m011"]);
if (m011.exitCode !== 0) {
  throw new Error(`M011 evidence preparation failed\n${m011.stderr || m011.stdout}`);
}

const m016 = await runProcess(["bun", "run", "demo:m016"]);
if (m016.exitCode !== 0) {
  throw new Error(`M016 evidence preparation failed\n${m016.stderr || m016.stdout}`);
}

const m018 = await runProcess(["bun", "run", "demo:m018"]);
if (m018.exitCode !== 0) {
  throw new Error(`M018 evidence preparation failed\n${m018.stderr || m018.stdout}`);
}

const positive = await runProcess([executable, "database", selection]);
if (positive.exitCode !== 0 || positive.stderr !== "") {
  throw new Error(`M027 database command failed\n${positive.stderr || positive.stdout}`);
}
const firstArtifacts = await readArtifacts();

const repeat = await runProcess([executable, "database", selection]);
if (repeat.exitCode !== 0 || repeat.stderr !== "" || repeat.stdout !== positive.stdout) {
  throw new Error("M027 database command was not byte deterministic");
}
const secondArtifacts = await readArtifacts();
if (!firstArtifacts.every((artifact, index) => equalBytes(artifact, secondArtifacts[index]!))) {
  throw new Error("M027 generated artifacts were not byte deterministic");
}

for (const required of [
  "M027 cross-entity atomic TinyBank transfer",
  "Project: tiny-bank-transfer",
  "AccountLedger bridge:",
  "Transfer obligation: AccountLedger.transferPreservesTotal",
  "M016 evidence:",
  "Generated SQLite schema:",
  "Generated Effect binding:",
  "Generated report:",
  "Report SHA-256:",
  "Initial observations:",
  "Source: account-a, revision 0, balance 10",
  "Target: account-b, revision 0, balance 2",
  "TotalFunds: revision 0, total 12",
  "Committed observations:",
  "Source: account-a, revision 1, balance 6",
  "Target: account-b, revision 1, balance 6",
  "TotalFunds: revision 1, total 12",
  "Rejection: TransferRejected",
  "Source revision after rejection: 1",
  "Target revision after rejection: 1",
  "TotalFunds revision after rejection: 1",
  "Reactive query runs after rejection: 2",
  "Reopened observations:",
  "Incremental equals clean query: yes",
  "Reopened equals clean query: yes",
  "Effect binding type-check: passed",
  "Law dispositions:",
  "Limitations:",
]) {
  if (!positive.stdout.includes(required)) {
    throw new Error(`missing M027 journey marker: ${required}`);
  }
}
if ((positive.stdout.match(/^M027 cross-entity atomic TinyBank transfer$/gm) ?? []).length !== 1) {
  throw new Error("M027 canonical report was not emitted exactly once");
}

const negativeFixtures = [
  "examples/tiny-bank/database/transfer-wrong-account-identity.json",
  "examples/tiny-bank/database/transfer-wrong-bridge.json",
  "examples/tiny-bank/database/transfer-wrong-refinement.json",
  "examples/tiny-bank/database/transfer-wrong-link.json",
  "examples/tiny-bank/database/transfer-wrong-obligation.json",
  "examples/tiny-bank/database/transfer-wrong-evidence.json",
  "examples/tiny-bank/database/transfer-unsupported-target.json",
  "examples/tiny-bank/database/transfer-identical-accounts.json",
  "examples/tiny-bank/database/transfer-invalid-scenario.json",
  "examples/tiny-bank/database/transfer-excess-selection.json",
] as const;
const negativeResults = await Promise.all(
  negativeFixtures.map(
    async (fixture) => [fixture, await runProcess([executable, "database", fixture])] as const,
  ),
);
for (const [fixture, result] of negativeResults) {
  if (result.exitCode === 0 || result.stdout !== "") {
    throw new Error(`negative M027 fixture was accepted or published output: ${fixture}`);
  }
}

process.stdout.write("PASS canonical M027 transfer journey\n");
process.stdout.write("PASS deterministic stdout and generated artifacts\n");
process.stdout.write("PASS eleven negative M027 selection fixtures rejected\n");
process.stdout.write(positive.stdout);
