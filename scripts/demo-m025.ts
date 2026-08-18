import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const selection = "examples/tiny-bank/project.json";

const run = async (path: string) => {
  const child = Bun.spawn([executable, "project", path], {
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
  throw new Error(`M025 project failed\n${positive.stderr}`);
}
const repeat = await run(selection);
if (repeat.exitCode !== 0 || repeat.stderr !== "" || repeat.stdout !== positive.stdout) {
  throw new Error("M025 project was not byte deterministic");
}
if ((positive.stdout.match(/^M025 single-authority project report$/gm) ?? []).length !== 1) {
  throw new Error("M025 report did not establish one project authority");
}
if ((positive.stdout.match(/^Project: /gm) ?? []).length !== 1) {
  throw new Error("M025 report did not contain one project identity");
}
for (const required of [
  "Project: tiny-bank",
  "Theory: ExactOneCapabilityExecution v1",
  "Result: Applicable",
  "effect-typescript -> qualified",
  "gleam-beam -> rejected",
  "Project policy: Accepted",
]) {
  if (!positive.stdout.includes(required)) throw new Error(`missing result: ${required}`);
}
for (const result of [
  ["Result: Satisfied", 3],
  ["Result: Violated", 2],
  ["Result: Unresolved", 1],
] as const) {
  if ((positive.stdout.match(new RegExp(`^${result[0]}$`, "gm")) ?? []).length !== result[1]) {
    throw new Error(`expected ${result[1]} ${result[0]} channel results`);
  }
}
for (const condition of [
  "Policy condition: assumptions -> reported; subjects=withdraw-once-effect",
  "Policy condition: unsupported-by-target -> reported; subjects=withdraw-once-gleam",
  "Policy condition: unresolved -> reported; subjects=two-owner-transfer",
]) {
  if (!positive.stdout.includes(condition))
    throw new Error(`missing policy condition: ${condition}`);
}

const negativeResults = await Promise.all(
  (
    [
      ["examples/tiny-bank/projects/duplicate-source-id.json", "duplicate-identity"],
      ["examples/tiny-bank/projects/duplicate-source-path.json", "duplicate-identity"],
      ["examples/tiny-bank/projects/unknown-reference.json", "unresolved-reference"],
      ["examples/tiny-bank/projects/unsafe-input-path.json", "unsafe-path"],
      ["examples/tiny-bank/projects/unbounded-capability.json", "inapplicable-theory"],
      ["examples/tiny-bank/projects/source-mismatch.json", "evidence-source-mismatch"],
      ["examples/tiny-bank/projects/stale-evidence.json", "stale-material"],
      ["examples/tiny-bank/projects/invalid-channel.json", "invalid-causal-parent"],
      ["examples/tiny-bank/projects/reject-unsupported.json", "policy-rejected"],
      ["examples/tiny-bank/projects/malformed.json", "schema"],
    ] as const
  ).map(async ([negative, reason]) => ({ negative, reason, result: await run(negative) })),
);
for (const { negative, reason, result } of negativeResults) {
  if (result.exitCode === 0 || result.stdout !== "") {
    throw new Error(`negative M025 fixture unexpectedly emitted a report: ${negative}`);
  }
  if (!result.stderr.includes(`reason: ${reason}`)) {
    throw new Error(`negative M025 fixture reported the wrong reason: ${negative}`);
  }
}

process.stdout.write(positive.stdout);
