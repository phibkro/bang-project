import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const selection = "examples/tiny-bank/realizations/exact-one.json";

const run = async (path: string) => {
  const child = Bun.spawn([executable, "classify", path], {
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

const positive = await run(selection);
if (positive.exitCode !== 0 || positive.stderr !== "") {
  throw new Error(`M023 classification failed\n${positive.stderr}`);
}
const repeat = await run(selection);
if (repeat.exitCode !== 0 || repeat.stderr !== "" || repeat.stdout !== positive.stdout) {
  throw new Error("M023 classification was not byte deterministic");
}
for (const target of ["effect-typescript -> qualified", "gleam-beam -> rejected"]) {
  if (!positive.stdout.includes(target)) throw new Error(`missing result: ${target}`);
}
for (const obligation of [
  "ExactOneCapabilityExecution.obligation.check-before-consumption",
  "ExactOneCapabilityExecution.obligation.consume-atomically-before-execution",
  "ExactOneCapabilityExecution.obligation.reject-reuse-before-execution",
  "ExactOneCapabilityExecution.obligation.no-restore-after-start",
]) {
  if ((positive.stdout.match(new RegExp(`^- ${obligation}:`, "gm")) ?? []).length !== 2) {
    throw new Error(`expected one ${obligation} assessment per target`);
  }
}
for (const required of [
  "single-grant-two-call-trace",
  "assumed-truthful",
  "TypeScript and Effect cannot make the grant universally unforgeable",
  "generated boundary or independent realization changes",
  "operationRealization:WithdrawAccountOnce",
  "Gleam entity projection requires exactly one unbounded DebitAccount",
]) {
  if (!positive.stdout.includes(required)) throw new Error(`missing report detail: ${required}`);
}
if (positive.stdout.includes("M017") || positive.stdout.includes("gleam actor evidence")) {
  throw new Error("M023 report reused M017 evidence");
}

const negativeResults = await Promise.all(
  [
    "examples/tiny-bank/realizations/unsafe-path.json",
    "examples/tiny-bank/realizations/unsafe-evidence-path.json",
    "examples/tiny-bank/realizations/identity-mismatch.json",
    "examples/tiny-bank/realizations/source-mismatch.json",
    "examples/tiny-bank/realizations/stale-evidence.json",
    "examples/tiny-bank/realizations/inapplicable-theory.json",
  ].map(async (negative) => ({ negative, result: await run(negative) })),
);
for (const { negative, result } of negativeResults) {
  if (result.exitCode === 0 || result.stdout !== "") {
    throw new Error(`negative M023 fixture unexpectedly emitted a report: ${negative}`);
  }
}

process.stdout.write(positive.stdout);
