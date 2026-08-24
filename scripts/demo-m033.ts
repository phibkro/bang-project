import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const selection = "examples/tiny-bank/assemblies/supervised-exact-one.json";
const timeoutMs = 180_000;

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

let rejectRunTimeout: (reason?: unknown) => void = () => {};

const run = async (): Promise<CliResult> => {
  const child = Bun.spawn([executable, "assemble", selection], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).then(([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr }));
  const timeout = new Promise<CliResult>((_, reject) => {
    rejectRunTimeout = reject;
  });
  const timer = setTimeout(() => {
    child.kill();
    rejectRunTimeout(new Error(`M033 assembly exceeded ${timeoutMs}ms`));
  }, timeoutMs);
  try {
    return await Promise.race([output, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const result = await run();
if (result.exitCode !== 0 || result.stderr !== "") {
  throw new Error(`M033 canonical assembly failed\n${result.stderr}`);
}
if (
  !result.stdout.includes("Target: gleam-beam") ||
  !result.stdout.includes("Run: escript .bang/assemblies/")
) {
  throw new Error("M033 canonical assembly did not report the runnable Gleam artifact");
}

process.stdout.write(
  [
    "M033 selected realization assembly",
    "Selection: supervised exact-one",
    "Target: gleam-beam",
    "Artifact: published escript",
    "Execution: one bounded M031 observation",
  ].join("\n") + "\n",
);
