import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");

const runExplain = async (selection: string) => {
  const child = Bun.spawn([executable, "explain", selection], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0 || stderr !== "") {
    throw new Error(`M022 explanation failed for ${selection}\n${stderr}`);
  }
  return stdout;
};

const applicableSelection = "examples/tiny-bank/theories/exact-one-capability.json";
const unboundedSelection = "examples/tiny-bank/theories/unbounded-capability.json";
const applicableArtifact = ".bang/artifacts/tiny-bank-exact-one-capability.json";

const applicable = await runExplain(applicableSelection);
const artifact = await Bun.file(join(root, applicableArtifact)).text();
const applicableRepeat = await runExplain(applicableSelection);
const artifactRepeat = await Bun.file(join(root, applicableArtifact)).text();
if (applicable !== applicableRepeat) {
  throw new Error("M022 applicable explanation was not deterministic");
}
if (artifact !== artifactRepeat) {
  throw new Error("M022 artifact was not deterministic");
}
if (!applicable.includes("Result: applicable")) {
  throw new Error("M022 applicable explanation did not report applicability");
}
if (applicable.match(/^Premise:/gm)?.length !== 4) {
  throw new Error("M022 applicable explanation did not report four premises");
}
if (applicable.match(/^Obligation:/gm)?.length !== 4) {
  throw new Error("M022 applicable explanation did not report four obligations");
}
if (!applicable.includes("Evidence status: unresolved")) {
  throw new Error("M022 applicable explanation did not report unresolved evidence");
}
for (const limitation of [
  "termination is not established",
  "productivity is not established",
  "memory or work bounds are not established",
  "capability lifetime is not established",
  "fairness is not established",
  "message delivery is not established",
  "distributed exactly-once execution is not established",
]) {
  if (!applicable.includes(`- ${limitation}`)) {
    throw new Error(`M022 applicable explanation omitted limitation: ${limitation}`);
  }
}

const unbounded = await runExplain(unboundedSelection);
if (!unbounded.includes("Result: not-applicable")) {
  throw new Error("M022 unbounded explanation did not fail applicability");
}
if (!unbounded.includes("Status: failed")) {
  throw new Error("M022 unbounded explanation did not report its failed premise");
}
if (unbounded.match(/^Obligation:/gm)?.length !== undefined) {
  throw new Error("M022 unbounded explanation reported a conclusion");
}
if (!unbounded.includes("Obligations: none")) {
  throw new Error("M022 unbounded explanation did not report no conclusions");
}

process.stdout.write(`${applicable}\n${unbounded}`);
