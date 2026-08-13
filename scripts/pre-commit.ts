import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const decodePaths = (bytes: Uint8Array): Array<string> =>
  new TextDecoder()
    .decode(bytes)
    .split("\0")
    .filter((path) => path.length > 0);

const captureGitPaths = (arguments_: ReadonlyArray<string>): Array<string> => {
  const result = Bun.spawnSync(["git", ...arguments_], { stdout: "pipe", stderr: "inherit" });
  if (result.exitCode !== 0) process.exit(result.exitCode);
  return decodePaths(result.stdout);
};

const run = (command: ReadonlyArray<string>, env?: Record<string, string>): void => {
  const options = {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  } as const;
  const result = Bun.spawnSync([...command], options);
  if (result.exitCode !== 0) process.exit(result.exitCode);
};

const staged = captureGitPaths(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]);
if (staged.length === 0) process.exit(0);

const partiallyStaged = captureGitPaths([
  "diff",
  "--name-only",
  "--diff-filter=ACMR",
  "-z",
  "--",
  ...staged,
]);
if (partiallyStaged.length > 0) {
  console.error("pre-commit: refusing to rewrite partially staged files:");
  for (const path of partiallyStaged) console.error(`  ${path}`);
  console.error("Commit or stash their unstaged hunks, then retry.");
  process.exit(1);
}

const directory = mkdtempSync(join(tmpdir(), "bang-pre-commit-"));
const pathFile = join(directory, "staged-paths");
try {
  writeFileSync(pathFile, `${staged.join("\0")}\0`);
  run(["just", "fix"], { BANG_STAGED_PATHS_FILE: pathFile });
  run(["git", "add", "--", ...staged]);
  run(["just", "check"]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
