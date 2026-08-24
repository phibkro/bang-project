import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const selection = "examples/tiny-bank/realizations/two-qualified-exact-one.json";
const qualificationBase = ".bang/qualifications/tiny-bank-two-qualified-exact-one";
const persistentPaths = [
  ".bang/artifacts/tiny-bank-packaged-exact-one.json",
  ".bang/theory-locks/tiny-bank-packaged-exact-one.json",
  `${qualificationBase}/effect-typescript/boundary.ts`,
  `${qualificationBase}/effect-typescript/evidence.json`,
  `${qualificationBase}/gleam-beam/src/bang/account_entity.gleam`,
  `${qualificationBase}/gleam-beam/evidence.json`,
  `${qualificationBase}/report.json`,
] as const;

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const run = async (): Promise<CliResult> => {
  const child = Bun.spawn([executable, "classify", selection], {
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

const bytes = async (): Promise<ReadonlyArray<Uint8Array>> =>
  Promise.all(persistentPaths.map((path) => Bun.file(join(root, path)).bytes()));

const sameBytes = (left: ReadonlyArray<Uint8Array>, right: ReadonlyArray<Uint8Array>): boolean =>
  left.length === right.length &&
  left.every(
    (first, index) =>
      first.length === right[index]!.length &&
      first.every((byte, offset) => byte === right[index]![offset]),
  );

const first = await run();
if (first.exitCode !== 0 || first.stderr !== "") {
  throw new Error(`M031 canonical classification failed\n${first.stderr}`);
}
const firstBytes = await bytes();
const second = await run();
const secondBytes = await bytes();
if (
  second.exitCode !== 0 ||
  second.stderr !== "" ||
  first.stdout !== second.stdout ||
  !sameBytes(firstBytes, secondBytes)
) {
  throw new Error("M031 report or persistent qualification bytes were not deterministic");
}
const qualified = first.stdout.split("\n").filter((line) => line.endsWith("-> qualified"));
const obligations = first.stdout
  .split("\n")
  .filter((line) => line.startsWith("- ExactOneCapabilityExecution.obligation."));
if (qualified.length !== 2 || obligations.length !== 8) {
  throw new Error(
    "M031 canonical classification did not report two qualified profiles with four obligations each",
  );
}

process.stdout.write(
  [
    "M031 fresh two-target exact-one qualification",
    "Targets: effect-typescript, gleam-beam",
    "Results: two qualified profiles",
    "Obligations: four per target",
    "Determinism: report and all persistent qualification bytes match",
  ].join("\n") + "\n",
);
