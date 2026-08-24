import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const qualificationBase = ".bang/qualifications/tiny-bank-two-qualified-exact-one";
const sharedPaths = [
  ".bang/artifacts/tiny-bank-packaged-exact-one.json",
  ".bang/theory-locks/tiny-bank-packaged-exact-one.json",
  `${qualificationBase}/effect-typescript/boundary.ts`,
  `${qualificationBase}/effect-typescript/evidence.json`,
  `${qualificationBase}/gleam-beam/src/bang/account_entity.gleam`,
  `${qualificationBase}/gleam-beam/evidence.json`,
  `${qualificationBase}/report.json`,
] as const;

const selections = [
  {
    id: "tiny-bank-supervised-exact-one",
    path: "examples/tiny-bank/plans/supervised-exact-one.json",
    result: "Selected",
    target: "gleam-beam",
  },
  {
    id: "tiny-bank-in-process-exact-one",
    path: "examples/tiny-bank/plans/in-process-exact-one.json",
    result: "Selected",
    target: "effect-typescript",
  },
  {
    id: "tiny-bank-exact-one-only",
    path: "examples/tiny-bank/plans/exact-one-only.json",
    result: "Incomparable",
    target: undefined,
  },
  {
    id: "tiny-bank-grant-survives-restart",
    path: "examples/tiny-bank/plans/grant-survives-restart.json",
    result: "NoPlan",
    target: undefined,
  },
] as const;

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const run = async (selection: string): Promise<CliResult> => {
  const child = Bun.spawn([executable, "plan", selection], {
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

const closurePaths = (planId: string): ReadonlyArray<string> => [
  ...sharedPaths,
  `.bang/plans/${planId}/report.json`,
];

const readClosure = async (planId: string): Promise<ReadonlyArray<Uint8Array>> =>
  Promise.all(closurePaths(planId).map((path) => Bun.file(join(root, path)).bytes()));

const sameBytes = (left: ReadonlyArray<Uint8Array>, right: ReadonlyArray<Uint8Array>): boolean =>
  left.length === right.length &&
  left.every(
    (first, index) =>
      first.length === right[index]!.length &&
      first.every((byte, offset) => byte === right[index]![offset]),
  );

for (const selection of selections) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- each run owns the shared publication closure.
  const first = await run(selection.path);
  if (first.exitCode !== 0 || first.stderr !== "") {
    throw new Error(`M032 ${selection.id} failed\n${first.stderr}`);
  }
  // oxlint-disable-next-line eslint/no-await-in-loop -- capture bytes before the next shared run.
  const firstBytes = await readClosure(selection.id);
  // oxlint-disable-next-line eslint/no-await-in-loop -- each run owns the shared publication closure.
  const second = await run(selection.path);
  // oxlint-disable-next-line eslint/no-await-in-loop -- compare bytes after the second shared run.
  const secondBytes = await readClosure(selection.id);
  if (
    second.exitCode !== 0 ||
    second.stderr !== "" ||
    first.stdout !== second.stdout ||
    !sameBytes(firstBytes, secondBytes)
  ) {
    throw new Error(`M032 ${selection.id} report or closure bytes were not deterministic`);
  }
  if (!first.stdout.includes(selection.result)) {
    throw new Error(`M032 ${selection.id} did not report ${selection.result}`);
  }
  if (selection.target !== undefined && !first.stdout.includes(selection.target)) {
    throw new Error(`M032 ${selection.id} did not mention ${selection.target}`);
  }
  if (selection.id === "tiny-bank-exact-one-only") {
    const effect = first.stdout.indexOf("effect-typescript");
    const gleam = first.stdout.indexOf("gleam-beam");
    if (effect < 0 || gleam < 0 || effect > gleam) {
      throw new Error("M032 exact-one-only candidates were not in target order");
    }
  }
  if (selection.id === "tiny-bank-grant-survives-restart") {
    if (!first.stdout.includes("effect-typescript") || !first.stdout.includes("unresolved")) {
      throw new Error("M032 grant-survival did not retain the Effect unresolved disposition");
    }
    if (!first.stdout.includes("gleam-beam") || !first.stdout.includes("contradicted")) {
      throw new Error("M032 grant-survival did not retain the Gleam contradiction");
    }
  }
}

process.stdout.write(
  [
    "M032 objective-relative realization planning",
    "Selections: supervised, in-process, exact-one-only, grant-survives-restart",
    "Results: Gleam selected, Effect selected, incomparable, no plan",
    "Determinism: report and complete publication closure bytes match",
  ].join("\n") + "\n",
);
