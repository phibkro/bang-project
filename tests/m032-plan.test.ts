import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const root = resolve(import.meta.dir, "..");

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const runCli = async (selectionPath: string): Promise<CliResult> => {
  const child = Bun.spawn([join(root, "node_modules/.bin/bang"), "plan", selectionPath], {
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

const sharedClosure = [
  ".bang/artifacts/tiny-bank-packaged-exact-one.json",
  ".bang/theory-locks/tiny-bank-packaged-exact-one.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/boundary.ts",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/evidence.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/src/bang/account_entity.gleam",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/evidence.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/report.json",
] as const;

const readBytes = async (paths: ReadonlyArray<string>): Promise<ReadonlyArray<Uint8Array>> =>
  Promise.all(paths.map((path) => Bun.file(join(root, path)).bytes()));

const sameBytes = (left: ReadonlyArray<Uint8Array>, right: ReadonlyArray<Uint8Array>): boolean =>
  left.length === right.length &&
  left.every(
    (first, index) =>
      first.length === right[index]!.length &&
      first.every((byte, offset) => byte === right[index]![offset]),
  );

let temporaryRoot: string;

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(root, ".m032-cli-test-"));
});

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("M032 objective-relative realization planning CLI", () => {
  test("selects, compares, and rejects the four canonical objectives deterministically", async () => {
    const cases = [
      ["examples/tiny-bank/plans/supervised-exact-one.json", "Selected", "gleam-beam"],
      ["examples/tiny-bank/plans/in-process-exact-one.json", "Selected", "effect-typescript"],
      ["examples/tiny-bank/plans/exact-one-only.json", "Incomparable", undefined],
      ["examples/tiny-bank/plans/grant-survives-restart.json", "NoPlan", undefined],
    ] as const;
    for (const [selection, result, target] of cases) {
      const planId =
        selection === "examples/tiny-bank/plans/supervised-exact-one.json"
          ? "tiny-bank-supervised-exact-one"
          : selection === "examples/tiny-bank/plans/in-process-exact-one.json"
            ? "tiny-bank-in-process-exact-one"
            : selection === "examples/tiny-bank/plans/exact-one-only.json"
              ? "tiny-bank-exact-one-only"
              : "tiny-bank-grant-survives-restart";
      const closure = [...sharedClosure, `.bang/plans/${planId}/report.json`];
      // oxlint-disable-next-line eslint/no-await-in-loop -- each run owns the shared publication closure.
      const first = await runCli(selection);
      // oxlint-disable-next-line eslint/no-await-in-loop -- capture bytes before the next shared run.
      const firstBytes = await readBytes(closure);
      // oxlint-disable-next-line eslint/no-await-in-loop -- each run owns the shared publication closure.
      const second = await runCli(selection);
      // oxlint-disable-next-line eslint/no-await-in-loop -- compare bytes after the second shared run.
      const secondBytes = await readBytes(closure);
      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      expect(first.stderr).toBe("");
      expect(second.stderr).toBe("");
      expect(first.stdout).toBe(second.stdout);
      expect(first.stdout).toContain(`Result: ${result}`);
      if (target !== undefined) expect(first.stdout).toContain(`Candidate: ${target}`);
      if (result === "Incomparable") {
        expect(first.stdout.indexOf("Candidate: effect-typescript")).toBeLessThan(
          first.stdout.indexOf("Candidate: gleam-beam"),
        );
      }
      if (result === "NoPlan") {
        expect(first.stdout).toContain("Candidate: effect-typescript");
        expect(first.stdout).toContain("unresolved");
        expect(first.stdout).toContain("Candidate: gleam-beam");
        expect(first.stdout).toContain("contradicted");
      }
      expect(sameBytes(firstBytes, secondBytes)).toBe(true);
    }
  }, 120_000);

  test("rejects malformed, identity, and qualification-integrity inputs without stdout", async () => {
    const canonical = JSON.parse(
      await Bun.file(resolve(root, "examples/tiny-bank/plans/supervised-exact-one.json")).text(),
    ) as Record<string, unknown>;
    const malformedPath = join(temporaryRoot, "malformed.json");
    await Bun.write(malformedPath, `${JSON.stringify({ ...canonical, unknown: true }, null, 2)}\n`);
    const malformed = await runCli(relative(root, malformedPath));
    expect(malformed.exitCode).not.toBe(0);
    expect(malformed.stdout).toBe("");
    expect(malformed.stderr).toContain("stage: selection");

    const identityPath = join(temporaryRoot, "identity.json");
    await Bun.write(
      identityPath,
      `${JSON.stringify(
        { ...canonical, requirementAddress: "operationRealization:Other.requirement:DebitAccount" },
        null,
        2,
      )}\n`,
    );
    const identity = await runCli(relative(root, identityPath));
    expect(identity.exitCode).not.toBe(0);
    expect(identity.stdout).toBe("");
    expect(identity.stderr).toContain("stage: qualification");
    expect(identity.stderr).toContain("reason: requirement-mismatch");

    const integrityPath = join(temporaryRoot, "integrity.json");
    await Bun.write(
      integrityPath,
      `${JSON.stringify(
        {
          ...canonical,
          qualificationSelection:
            "examples/tiny-bank/realizations/m031-package-digest-mismatch.json",
        },
        null,
        2,
      )}\n`,
    );
    const integrity = await runCli(relative(root, integrityPath));
    expect(integrity.exitCode).not.toBe(0);
    expect(integrity.stdout).toBe("");
    expect(integrity.stderr).toContain("stage: qualification");
  }, 30_000);

  test("restores every prior publication when the plan report cannot commit", async () => {
    const canonical = JSON.parse(
      await Bun.file(resolve(root, "examples/tiny-bank/plans/supervised-exact-one.json")).text(),
    ) as Record<string, unknown>;
    const selectionId = "m032-publication-failure";
    const selectionPath = join(temporaryRoot, `${selectionId}.json`);
    const blockedPlanDirectory = join(root, ".bang/plans", selectionId);
    await Bun.write(
      selectionPath,
      `${JSON.stringify({ ...canonical, id: selectionId }, null, 2)}\n`,
    );
    const before = await readBytes(sharedClosure);
    await rm(blockedPlanDirectory, { recursive: true, force: true });
    await mkdir(blockedPlanDirectory, { recursive: true });
    await chmod(blockedPlanDirectory, 0o555);
    try {
      const result = await runCli(relative(root, selectionPath));
      const after = await readBytes(sharedClosure);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("stage: publication");
      expect(result.stderr).toContain("reason: publication-failed");
      expect(sameBytes(before, after)).toBe(true);
      expect(await Bun.file(join(blockedPlanDirectory, "report.json")).exists()).toBe(false);
    } finally {
      await chmod(blockedPlanDirectory, 0o755);
      await rm(blockedPlanDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});
