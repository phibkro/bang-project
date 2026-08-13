import { readFileSync } from "node:fs";

const stagedPathFile = process.env["BANG_STAGED_PATHS_FILE"];
const paths =
  stagedPathFile === undefined
    ? ["."]
    : readFileSync(stagedPathFile)
        .toString("utf8")
        .split("\0")
        .filter((path) => path.length > 0);

const run = (command: ReadonlyArray<string>): void => {
  const result = Bun.spawnSync([...command], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
};

const lintable = paths.filter((path) => path === "." || /\.[cm]?[jt]sx?$/.test(path));
const formattable = paths.filter(
  (path) => path === "." || /\.(?:[cm]?[jt]sx?|jsonc?|md|ya?ml|css|html)$/.test(path),
);

if (lintable.length > 0) run(["bun", "x", "oxlint", "--fix", ...lintable]);
if (formattable.length > 0) run(["bun", "x", "oxfmt", ...formattable]);
