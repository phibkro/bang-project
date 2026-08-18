import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const selection = "examples/tiny-bank/channels/two-owner.json";

const run = async (path: string) => {
  const child = Bun.spawn([executable, "trace", path], {
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
  throw new Error(`M024 trace failed\n${positive.stderr}`);
}
const repeat = await run(selection);
if (repeat.exitCode !== 0 || repeat.stderr !== "" || repeat.stdout !== positive.stdout) {
  throw new Error("M024 trace was not byte deterministic");
}
for (const schedule of [
  "Schedule: ordered",
  "Schedule: duplicate-prepare",
  "Schedule: duplicate-commit",
  "Schedule: commit-before-prepare",
  "Schedule: drop-ack",
  "Schedule: complete-without-ack",
]) {
  if (!positive.stdout.includes(schedule)) throw new Error(`missing schedule: ${schedule}`);
}
for (const result of ["Result: Satisfied", "Result: Violated", "Result: Unresolved"]) {
  if (!positive.stdout.includes(result)) throw new Error(`missing result class: ${result}`);
}
for (const obligation of [
  "BoundedChannelProtocol.obligation.logical-message-identity",
  "BoundedChannelProtocol.obligation.handle-after-causal-parent",
  "BoundedChannelProtocol.obligation.at-most-once-state-mutation",
  "BoundedChannelProtocol.obligation.acknowledged-coordination",
  "BoundedChannelProtocol.obligation.loss-remains-unresolved",
]) {
  if (!positive.stdout.includes(obligation)) throw new Error(`missing obligation: ${obligation}`);
}
for (const observation of [
  "Sent",
  "Delivered",
  "Handled",
  "Rejected",
  "Dropped",
  "DuplicateIgnored",
]) {
  if (!positive.stdout.includes(observation))
    throw new Error(`missing observation: ${observation}`);
}
for (const identity of [
  "logical=prepare-t1",
  "attempt=ordered-prepare-1",
  "owner-a=waiting",
  "owner-b=committed",
]) {
  if (!positive.stdout.includes(identity)) throw new Error(`missing identity/state: ${identity}`);
}
for (const limitation of [
  "no distributed exactly-once guarantee",
  "no durable delivery or mailbox",
  "no retry-safety or recovery guarantee",
  "no scheduler or network fairness guarantee",
  "no bounded latency, work, memory, or mailbox guarantee",
  "no liveness or productivity guarantee",
  "no behavior claim for unenumerated schedules",
  "the deterministic scheduler is not a real network",
]) {
  if (!positive.stdout.includes(limitation)) throw new Error(`missing limitation: ${limitation}`);
}

const negativeResults = await Promise.all(
  [
    "examples/tiny-bank/channels/duplicate-attempt.json",
    "examples/tiny-bank/channels/unknown-message.json",
    "examples/tiny-bank/channels/unknown-causal-parent.json",
    "examples/tiny-bank/channels/invalid-causal-parent.json",
    "examples/tiny-bank/channels/malformed-step.json",
    "examples/tiny-bank/channels/../channels/unsafe-path.json",
  ].map(async (negative) => ({ negative, result: await run(negative) })),
);
for (const { negative, result } of negativeResults) {
  if (result.exitCode === 0 || result.stdout !== "") {
    throw new Error(`negative M024 fixture unexpectedly emitted a report: ${negative}`);
  }
}

process.stdout.write(positive.stdout);
