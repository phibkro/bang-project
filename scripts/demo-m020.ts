import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const dataDir = await mkdtemp("/tmp/bang-m020-demo-");

interface Result {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const run = async (...args: ReadonlyArray<string>): Promise<Result> => {
  const child = Bun.spawn([executable, "--data-dir", dataDir, "ledger", ...args], {
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

const requireSuccess = async (...args: ReadonlyArray<string>): Promise<Result> => {
  const result = await run(...args);
  if (result.exitCode !== 0 || result.stderr !== "") {
    throw new Error(`ledger command failed: ${args.join(" ")}\n${result.stderr}`);
  }
  return result;
};

try {
  await requireSuccess("init", "family-1", "Family Ledger");
  await requireSuccess("account", "create", "cash", "Cash", "asset");
  await requireSuccess("account", "create", "salary", "Salary", "income");
  await requireSuccess("account", "create", "groceries", "Groceries", "expense");
  await requireSuccess("account", "create", "savings", "Savings", "asset");
  await requireSuccess("post", "income", "income-1", "cash", "salary", "100000", "August salary");
  await requireSuccess("post", "expense", "expense-1", "cash", "groceries", "2500", "Groceries");
  await requireSuccess("post", "transfer", "transfer-1", "cash", "savings", "10000", "Savings");
  await requireSuccess("post", "entry", "examples/family-ledger/general-entry.json");

  const replay = await requireSuccess(
    "post",
    "income",
    "income-1",
    "cash",
    "salary",
    "100000",
    "August salary",
  );
  if (!replay.stdout.includes("Replay: replayed"))
    throw new Error("idempotent replay was not classified");

  const conflict = await run(
    "post",
    "income",
    "income-1",
    "cash",
    "salary",
    "99999",
    "Changed salary",
  );
  if (
    conflict.exitCode === 0 ||
    conflict.stdout !== "" ||
    !conflict.stderr.includes("transaction-identity-conflict")
  ) {
    throw new Error("transaction identity conflict was not rejected without success output");
  }

  const unbalanced = await run("post", "entry", "examples/family-ledger/unbalanced-entry.json");
  if (
    unbalanced.exitCode === 0 ||
    unbalanced.stdout !== "" ||
    !unbalanced.stderr.includes("unbalanced-entry")
  ) {
    throw new Error("unbalanced general entry was not rejected without success output");
  }

  const journal = await requireSuccess("journal");
  if (
    (journal.stdout.match(/^Transaction ID:/gm) ?? []).length !== 4 ||
    journal.stdout.includes("unbalanced-1")
  ) {
    throw new Error("rejected or replayed transactions changed the immutable journal");
  }

  const rebuilt = await requireSuccess("rebuild", "verify");
  if (!rebuilt.stdout.includes("Rebuild: matches"))
    throw new Error("journal rebuild did not match SQL balances");
  console.log(rebuilt.stdout.trimEnd());
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
