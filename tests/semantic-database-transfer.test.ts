import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { BunServices } from "@effect/platform-bun";
import { Effect, Schema } from "effect";

import {
  M027SemanticDatabaseFailure,
  compileSelectedM027Transfer,
  type M027SemanticDatabaseCompileResult,
} from "../apps/bang/src/semantic-database-transfer.ts";
import { runM027TransferJourney } from "../apps/bang/src/semantic-database-transfer-runtime.ts";
import {
  M027SemanticDatabaseSelectionFromJson,
  M027TransferReportFromJson,
} from "../apps/bang/src/semantic-database-transfer-target.ts";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const canonicalSelectionPath = "examples/tiny-bank/database/transfer.json";
const testOutputDirectory = ".bang/semantic-database-transfer-test";
const generatedDirectory = resolve(root, testOutputDirectory, "tiny-bank-transfer");
const artifactNames = ["schema.sql", "bindings.ts", "report.json"] as const;

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const compileEffect = (
  selectionPath = canonicalSelectionPath,
  outputDirectory = testOutputDirectory,
  handler?: Parameters<typeof compileSelectedM027Transfer>[3],
) =>
  compileSelectedM027Transfer(root, selectionPath, outputDirectory, handler).pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(BunServices.layer),
  );

const compile = (
  selectionPath = canonicalSelectionPath,
  outputDirectory = testOutputDirectory,
  handler?: Parameters<typeof compileSelectedM027Transfer>[3],
): Promise<M027SemanticDatabaseCompileResult> =>
  Effect.runPromise(compileEffect(selectionPath, outputDirectory, handler));
const faultyHandler = () => ({ sourceBalanceAfter: 6n, targetBalanceAfter: 7n });

const runCli = async (
  selectionPath: string,
  outputDirectory = testOutputDirectory,
): Promise<CliResult> => {
  const child = Bun.spawn(
    [executable, "database", selectionPath, "--output-dir", outputDirectory],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
};

const readArtifacts = async (): Promise<Readonly<Record<string, Uint8Array>>> => {
  const entries = await Promise.all(
    artifactNames.map(
      async (name) =>
        [
          name,
          new Uint8Array(await Bun.file(join(generatedDirectory, name)).arrayBuffer()),
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
};

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const negativeFixtures = [
  "examples/tiny-bank/database/transfer-missing-source.json",
  "examples/tiny-bank/database/transfer-wrong-account-identity.json",
  "examples/tiny-bank/database/transfer-wrong-bridge.json",
  "examples/tiny-bank/database/transfer-wrong-refinement.json",
  "examples/tiny-bank/database/transfer-wrong-link.json",
  "examples/tiny-bank/database/transfer-wrong-obligation.json",
  "examples/tiny-bank/database/transfer-wrong-evidence.json",
  "examples/tiny-bank/database/transfer-unsupported-target.json",
  "examples/tiny-bank/database/transfer-identical-accounts.json",
  "examples/tiny-bank/database/transfer-invalid-scenario.json",
  "examples/tiny-bank/database/transfer-excess-selection.json",
] as const;

let canonicalCompilation: Promise<M027SemanticDatabaseCompileResult> | undefined;
const compileCanonical = (): Promise<M027SemanticDatabaseCompileResult> =>
  (canonicalCompilation ??= compile());

describe("M027 transfer selection and deterministic projection", () => {
  test("decodes the strict canonical selection", async () => {
    const encoded = await Bun.file(resolve(root, canonicalSelectionPath)).text();
    const selection = Schema.decodeSync(M027SemanticDatabaseSelectionFromJson)(encoded, {
      onExcessProperty: "error",
    });
    expect(selection.bangSemanticDatabase).toBe(1);
    expect(selection.bridge.id).toBe("AccountLedger");
    expect(selection.obligation.id).toBe("AccountLedger.transferPreservesTotal");
    expect(selection.compositionLinks).toHaveLength(2);
  });

  test("compiles the canonical journey and preserves report parity", async () => {
    const result = await compileCanonical();
    expect(result.report.journey.initial.source.balance).toBe("10");
    expect(result.report.journey.initial.target.balance).toBe("2");
    expect(result.report.journey.initial.total.total).toBe("12");
    expect(result.report.journey.committed.source.balance).toBe("6");
    expect(result.report.journey.committed.target.balance).toBe("6");
    expect(result.report.journey.committed.total.total).toBe("12");
    expect(result.report.journey.rejection.identity).toBe("TransferRejected");
    expect(result.report.journey.rejection.sourceRevisionUnchangedAt).toBe("1");
    expect(result.report.journey.rejection.targetRevisionUnchangedAt).toBe("1");
    expect(result.report.journey.rejection.totalRevisionUnchangedAt).toBe("1");
    expect(result.report.journey.incrementalEqualsClean).toBe(true);
    expect(result.report.journey.reopenedEqualsClean).toBe(true);
    expect(result.report.limitations.length).toBeGreaterThan(0);
    expect(result.report.dispositions.length).toBeGreaterThan(0);
  });

  test("renders byte-identical artifacts and report output", async () => {
    const first = await runCli(canonicalSelectionPath);
    const firstArtifacts = await readArtifacts();
    const second = await runCli(canonicalSelectionPath);
    const secondArtifacts = await readArtifacts();
    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(second.stdout).toBe(first.stdout);
    for (const name of artifactNames) {
      expect(equalBytes(firstArtifacts[name]!, secondArtifacts[name]!)).toBe(true);
    }
  });

  test("rejects a report with a contradictory reopened parity claim", async () => {
    const { report } = await compileCanonical();
    const contradictory = {
      ...report,
      journey: { ...report.journey, reopenedEqualsClean: false },
    };
    expect(() =>
      Schema.decodeSync(M027TransferReportFromJson)(JSON.stringify(contradictory), {
        onExcessProperty: "error",
      }),
    ).toThrow();
  });

  test("keeps the generated boundary typed, checked, immutable, and independent", async () => {
    const source = await Bun.file(join(generatedDirectory, "bindings.ts")).text();
    expect(source).toContain('from "effect"');
    expect(source).toContain("M027TransferServiceShape");
    expect(source).toContain("subscribeAccount");
    expect(source).toContain("subscribeTotal");
    expect(source).toContain(
      "export const TransferResult = Schema.Struct({\n  source: AccountSummary,\n  target: AccountSummary,\n  total: TotalFunds,\n}).annotate({ parseOptions });\nexport type TransferResult = typeof TransferResult.Type;",
    );
    expect(source).toContain(
      "  ) => Effect.Effect<TransferResult, TransferRejected | M027TransferServiceUnavailableError>;",
    );
    expect(source).toContain("  balance: nonNegativeBigInt,");
    expect(source).not.toContain("  balance: Schema.BigInt,");
    expect(source).not.toContain(
      "  ) => Effect.Effect<AccountSummary, TransferRejected | M027TransferServiceUnavailableError>;",
    );
    expect(source.indexOf("export const AccountSummary")).toBeLessThan(
      source.indexOf("export const TransferResult"),
    );
    expect(source.indexOf("export const TotalFunds")).toBeLessThan(
      source.indexOf("export const TransferResult"),
    );
    expect(source.indexOf("export type TransferResult")).toBeLessThan(
      source.indexOf("export interface M027TransferServiceShape"),
    );
    expect(source).not.toContain("sqlite");
    expect(source).not.toContain("transferAccountState");
    expect(source).not.toContain("handler");
  });
});

describe("M027 transfer failures and runtime conformance", () => {
  test("rejects every frozen negative selection with empty standard output", async () => {
    const results = await Promise.all(
      negativeFixtures.map(async (fixture) => [fixture, await runCli(fixture)] as const),
    );
    for (const [fixture, result] of results) {
      expect(result.exitCode, fixture).not.toBe(0);
      expect(result.stdout, fixture).toBe("");
      expect(result.stderr, fixture).toContain("reason:");
    }
  });

  test("rejects a handler result that violates the transfer equations", async () => {
    const faultyOutputDirectory = ".bang/semantic-database-transfer-faulty";
    try {
      await compile(canonicalSelectionPath, faultyOutputDirectory, faultyHandler);
      throw new Error("Expected the faulty transfer handler to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(M027SemanticDatabaseFailure);
      if (!(error instanceof M027SemanticDatabaseFailure)) throw error;
      expect(error.stage).toBe("runtime");
      expect(error.reason).toBe("conformance");
    }
    expect(
      await Bun.file(
        resolve(root, faultyOutputDirectory, "tiny-bank-transfer", "report.json"),
      ).exists(),
    ).toBe(false);
  });

  test("rejects an invalid runtime precondition before opening a transfer", async () => {
    const { plan } = await compileCanonical();
    const invalidPlan = {
      ...plan,
      scenario: {
        ...plan.scenario,
        sourceAccountId: plan.scenario.targetAccountId,
      },
    };
    const result = runM027TransferJourney(
      invalidPlan,
      join(root, ".bang", "m027-invalid-precondition.sqlite"),
    ).pipe(
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(BunServices.layer),
    );
    await expect(Effect.runPromise(result)).rejects.toMatchObject({
      _tag: "M027RuntimeFailure",
      reason: "invariant",
    });
  });

  test("keeps rejected transfer atomic and publication-free", async () => {
    const { report } = await compileCanonical();
    expect(report.journey.committed.source.revision).toBe("1");
    expect(report.journey.committed.target.revision).toBe("1");
    expect(report.journey.rejection.sourceRevisionUnchangedAt).toBe("1");
    expect(report.journey.rejection.targetRevisionUnchangedAt).toBe("1");
    expect(report.journey.rejection.totalRevisionUnchangedAt).toBe("1");
    expect(report.journey.emitted).toHaveLength(2);
  });

  test("retains reopened Account and TotalFunds parity", async () => {
    const { report } = await compileCanonical();
    expect(report.journey.reopened).toEqual(report.journey.clean);
    expect(report.journey.reopenedEqualsClean).toBe(true);
    expect(report.journey.incrementalEqualsClean).toBe(true);
  });
});
