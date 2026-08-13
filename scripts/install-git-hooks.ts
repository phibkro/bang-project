import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const hooksPath = ".githooks";

if (!existsSync(resolve(root, ".git"))) {
  console.log("Git hooks were not installed: no Git metadata is present.");
  process.exit(0);
}

const inspect = Bun.spawnSync(["git", "config", "--local", "--get-all", "core.hooksPath"], {
  cwd: root,
  stdout: "pipe",
  stderr: "pipe",
});
if (inspect.exitCode !== 0 && inspect.exitCode !== 1) {
  process.stderr.write(inspect.stderr);
  process.exit(inspect.exitCode);
}

const configured =
  inspect.exitCode === 0
    ? new TextDecoder()
        .decode(inspect.stdout)
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [];
const expected = resolve(root, hooksPath);
const conflict = configured.find((value) => resolve(root, value) !== expected);
if (conflict !== undefined) {
  console.error(`Refusing to overwrite core.hooksPath ${JSON.stringify(conflict)}.`);
  process.exit(1);
}

const install = Bun.spawnSync(["git", "config", "--local", "core.hooksPath", hooksPath], {
  cwd: root,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
if (install.exitCode !== 0) process.exit(install.exitCode);
console.log(`Installed native Git hooks from ${hooksPath}.`);
