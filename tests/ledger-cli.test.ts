import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

let dataDir = "";

const runLedger = async (...args: ReadonlyArray<string>): Promise<CliResult> => {
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

const succeeds = async (...args: ReadonlyArray<string>): Promise<CliResult> => {
  const result = await runLedger(...args);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  return result;
};

beforeAll(async () => {
  dataDir = await mkdtemp("/tmp/bang-m020-ledger-");
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("M020 shipped persistent family ledger", () => {
  test("preserves an immutable balanced journal across separate CLI invocations", async () => {
    await succeeds("init", "family-1", "Family Ledger");
    await succeeds("account", "create", "cash", "Cash", "asset");
    await succeeds("account", "create", "salary", "Salary", "income");
    await succeeds("account", "create", "groceries", "Groceries", "expense");
    await succeeds("account", "create", "Savings", "Savings", "asset");

    await succeeds("post", "income", "income-1", "cash", "salary", "100000", "August salary");
    await succeeds("post", "expense", "expense-1", "cash", "groceries", "2500", "Groceries");
    await succeeds("post", "transfer", "transfer-1", "cash", "Savings", "10000", "Savings");
    const general = await succeeds("post", "entry", "examples/family-ledger/general-entry.json");
    expect(general.stdout).toContain("Replay: accepted");

    const replay = await succeeds(
      "post",
      "income",
      "income-1",
      "cash",
      "salary",
      "100000",
      "August salary",
    );
    expect(replay.stdout).toContain("Replay: replayed");

    const conflict = await runLedger(
      "post",
      "income",
      "income-1",
      "cash",
      "salary",
      "99999",
      "Changed salary",
    );
    expect(conflict.exitCode).not.toBe(0);
    expect(conflict.stdout).toBe("");
    expect(conflict.stderr).toContain("transaction-identity-conflict");

    const duplicateAccount = await runLedger(
      "account",
      "create",
      "cash",
      "Duplicate Cash",
      "asset",
    );
    expect(duplicateAccount.exitCode).not.toBe(0);
    expect(duplicateAccount.stdout).toBe("");
    expect(duplicateAccount.stderr).toContain("duplicate-account");

    const unknownAccount = await runLedger(
      "post",
      "transfer",
      "unknown-1",
      "cash",
      "missing",
      "1",
      "Unknown account",
    );
    expect(unknownAccount.exitCode).not.toBe(0);
    expect(unknownAccount.stdout).toBe("");
    expect(unknownAccount.stderr).toContain("unknown-account");

    const selfTransfer = await runLedger(
      "post",
      "transfer",
      "self-1",
      "cash",
      "cash",
      "1",
      "Self transfer",
    );
    expect(selfTransfer.exitCode).not.toBe(0);
    expect(selfTransfer.stdout).toBe("");
    expect(selfTransfer.stderr).toContain("self-transfer");

    const wrongReplayKind = await runLedger(
      "post",
      "income",
      "expense-1",
      "groceries",
      "cash",
      "2500",
      "Groceries",
    );
    expect(wrongReplayKind.exitCode).not.toBe(0);
    expect(wrongReplayKind.stdout).toBe("");
    expect(wrongReplayKind.stderr).toContain("wrong-account-type");

    const unbalanced = await runLedger(
      "post",
      "entry",
      "examples/family-ledger/unbalanced-entry.json",
    );
    expect(unbalanced.exitCode).not.toBe(0);
    expect(unbalanced.stdout).toBe("");
    expect(unbalanced.stderr).toContain("unbalanced-entry");

    const concurrent = await Promise.all([
      runLedger("post", "income", "race-1", "cash", "salary", "77", "Concurrent replay"),
      runLedger("post", "income", "race-1", "cash", "salary", "77", "Concurrent replay"),
    ]);
    expect(concurrent.every((result) => result.exitCode === 0 && result.stderr === "")).toBe(true);
    expect(concurrent.filter((result) => result.stdout.includes("Replay: accepted"))).toHaveLength(
      1,
    );
    expect(concurrent.filter((result) => result.stdout.includes("Replay: replayed"))).toHaveLength(
      1,
    );

    const journal = await succeeds("journal");
    expect(journal.stdout.match(/^Transaction ID:/gm)).toHaveLength(5);
    expect(journal.stdout).not.toContain("unbalanced-1");

    const balances = await succeeds("balances");
    expect(balances.stdout).toContain("Balance: account cash, minor units 87702");
    expect(balances.stdout).toContain("Balance: account groceries, minor units 2500");
    expect(balances.stdout).toContain("Balance: account salary, minor units 100202");
    expect(balances.stdout).toContain("Balance: account Savings, minor units 10000");

    const rebuilt = await succeeds("rebuild", "verify");
    expect(rebuilt.stdout).toContain("Rebuild: matches");
    expect(rebuilt.stdout).toContain("Evidence: runtime-checked");
    expect(rebuilt.stdout).toContain("Scope: single-local-sqlite-ledger");
  }, 30_000);
});
