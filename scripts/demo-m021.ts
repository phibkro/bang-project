import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const selection = "examples/tiny-bank/normalization/selected-realization-change.json";

const child = Bun.spawn([executable, "normalize", selection], {
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
  throw new Error(`M021 normalization failed\n${stderr}`);
}
if (!stdout.endsWith("Clean parity: match\n")) {
  throw new Error("M021 normalization did not report clean parity");
}
process.stdout.write(stdout);
