import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const compatible = "examples/tiny-bank/evolution/transfer-compatible.json";
const breaking = "examples/tiny-bank/evolution/transfer-breaking.json";
const generatedDirectory = resolve(root, ".bang/semantic-evolution/tiny-bank-transfer-evolution");
const rejectedOutputDirectory = `.bang/m028-rejected-${crypto.randomUUID()}`;
const rejectedDirectory = resolve(
  root,
  rejectedOutputDirectory,
  "tiny-bank-transfer-evolution-breaking",
);
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

const prepare = async (script: "demo:m011" | "demo:m016" | "demo:m018") => {
  const result = await runProcess(["bun", "run", script]);
  if (result.exitCode !== 0) {
    throw new Error(`${script} evidence preparation failed\n${result.stderr || result.stdout}`);
  }
};

const readArtifacts = async (): Promise<ReadonlyArray<Uint8Array>> =>
  Promise.all(
    artifactNames.map(
      async (name) => new Uint8Array(await Bun.file(join(generatedDirectory, name)).arrayBuffer()),
    ),
  );

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

await prepare("demo:m011");
await prepare("demo:m016");
await prepare("demo:m018");

const accepted = await runProcess([executable, "evolve", compatible]);
if (accepted.exitCode !== 0 || accepted.stderr !== "") {
  throw new Error(`M028 compatible journey failed\n${accepted.stderr || accepted.stdout}`);
}
const firstArtifacts = await readArtifacts();

const repeat = await runProcess([executable, "evolve", compatible]);
if (repeat.exitCode !== 0 || repeat.stderr !== "" || repeat.stdout !== accepted.stdout) {
  throw new Error("M028 compatible command was not byte deterministic");
}
const secondArtifacts = await readArtifacts();
if (!firstArtifacts.every((artifact, index) => equalBytes(artifact, secondArtifacts[index]!))) {
  throw new Error("M028 generated artifacts were not byte deterministic");
}

for (const marker of [
  "M028 versioned semantic-service evolution",
  "Compatibility: compatible",
  "Changed constructs: 2",
  "Selected service conclusions reused: 8/8",
  "Evidence reused: 3/3",
  "Stored version before cutover: 1",
  "Stored version after cutover: 2",
  "Before cutover: 6/6/12",
  "After cutover: 6/6/12",
  "After transfer: 5/7/12",
  "Final reopen: 5/7/12",
  "Clean parity: match",
  "Report SHA-256:",
]) {
  if (!accepted.stdout.includes(marker)) {
    throw new Error(`missing M028 journey marker: ${marker}`);
  }
}
if ((accepted.stdout.match(/^M028 versioned semantic-service evolution$/gm) ?? []).length !== 1) {
  throw new Error("M028 canonical report was not emitted exactly once");
}

const rejected = await runProcess([
  executable,
  "evolve",
  breaking,
  "--output-dir",
  rejectedOutputDirectory,
]);
if (rejected.exitCode === 0 || rejected.stdout !== "") {
  throw new Error("M028 breaking candidate was accepted or emitted a partial report");
}
for (const marker of [
  "stage: compatibility",
  "reason: incompatible-service",
  "stateMachine:Account",
  "stateMachine:Account.invariant:nonnegativeBalance",
]) {
  if (!rejected.stderr.includes(marker)) {
    throw new Error(`missing M028 rejection marker: ${marker}`);
  }
}
if (await Bun.file(join(rejectedDirectory, "report.json")).exists()) {
  throw new Error("M028 rejected evolution wrote a partial report");
}

console.log(accepted.stdout.trimEnd());
console.log("Breaking candidate: rejected before cutover with no generated artifacts");
