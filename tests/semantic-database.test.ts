import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { BunServices } from "@effect/platform-bun";
import { Effect, Schema } from "effect";
import {
  M026SemanticDatabaseReportFromJson,
  compileSelectedSemanticDatabase,
  type M026SemanticDatabaseCompileResult,
  type M026SemanticDatabaseReport,
} from "../apps/bang/src/semantic-database.ts";
import { compileSelectedProject } from "../apps/bang/src/project.ts";
import {
  M026SemanticDatabaseSelectionFromJson,
  decodeM026SemanticDatabaseSelection,
  deriveM026DataServicePlan,
  renderM026EffectBindings,
  violatesM026StatePredicates,
  renderM026Sql,
} from "../apps/bang/src/semantic-database-target.ts";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const canonicalSelectionPath = "examples/tiny-bank/database/account.json";
const testOutputDirectory = ".bang/semantic-database-test";
const generatedDirectory = resolve(root, testOutputDirectory, "tiny-bank-account");
const artifactNames = ["schema.sql", "bindings.ts", "report.json"] as const;

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const negativeFixtures = [
  ["examples/tiny-bank/database/unsafe-project-path.json", "unsafe-path"],
  ["examples/tiny-bank/database/unknown-state-machine.json", "unknown-state-machine"],
  ["examples/tiny-bank/database/unknown-state-field.json", "unknown-state-field"],
  ["examples/tiny-bank/database/unknown-capability.json", "unknown-capability"],
  ["examples/tiny-bank/database/wrong-realization-quantity.json", "quantity-mismatch"],
  ["examples/tiny-bank/database/bad-subscription-reference.json", "subscription-query-mismatch"],
  ["examples/tiny-bank/database/malformed.json", "malformed-decimal"],
  ["examples/tiny-bank/database/excess-selection.json", "schema"],
] as const;

const readRepositoryFile = (path: string): Promise<string> => Bun.file(resolve(root, path)).text();

const readCanonicalSelection = async () => {
  const text = await readRepositoryFile(canonicalSelectionPath);
  return {
    text,
    value: Schema.decodeSync(M026SemanticDatabaseSelectionFromJson)(text),
  };
};

const compileDatabaseEffect = (selectionPath: string, outputDirectory = testOutputDirectory) =>
  compileSelectedSemanticDatabase(root, selectionPath, outputDirectory).pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(BunServices.layer),
  );

const compileDatabase = (
  selectionPath: string,
  outputDirectory = testOutputDirectory,
): Promise<M026SemanticDatabaseCompileResult> =>
  Effect.runPromise(compileDatabaseEffect(selectionPath, outputDirectory));

let canonicalCompilation: Promise<M026SemanticDatabaseCompileResult> | undefined;
const compileCanonicalDatabase = (): Promise<M026SemanticDatabaseCompileResult> =>
  (canonicalCompilation ??= compileDatabase(canonicalSelectionPath));

const runDatabaseCli = async (
  selectionPath: string,
  outputDirectory = testOutputDirectory,
): Promise<CliResult> => {
  const child = Bun.spawn(
    [executable, "database", selectionPath, "--output-dir", outputDirectory],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
};

const readGeneratedArtifacts = async (): Promise<Readonly<Record<string, Uint8Array>>> => {
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

const expectReportDecodeFailure = async (
  mutate: (report: M026SemanticDatabaseReport) => unknown,
): Promise<void> => {
  const { report } = await compileCanonicalDatabase();
  const encoded = JSON.stringify(mutate(report));
  expect(() =>
    Schema.decodeSync(M026SemanticDatabaseReportFromJson)(encoded, {
      onExcessProperty: "error",
    }),
  ).toThrow();
};

describe("M026 semantic database selection and projection", () => {
  test("decodes the strict canonical selection", async () => {
    const { value } = await readCanonicalSelection();

    expect(value).toEqual({
      bangSemanticDatabase: 1,
      id: "tiny-bank-account",
      project: "examples/tiny-bank/project.json",
      entity: {
        id: "Account",
        stateMachine: "Account",
        initializer: "initialize",
        identityField: "accountId",
      },
      command: {
        id: "WithdrawAccountOnce",
        realization: "WithdrawAccountOnce",
      },
      query: {
        id: "AccountSummary",
        stateFields: ["balance"],
        capabilityAvailability: "DebitAccount",
      },
      subscription: {
        id: "AccountSummarySubscription",
        query: "AccountSummary",
        mode: "snapshots",
        initialSnapshot: true,
      },
      target: {
        database: "sqlite",
        api: "effect-typescript",
      },
      scenario: {
        accountId: "account-1",
        initialBalance: "10",
        withdrawAmount: "4",
      },
    });
  });

  test("rejects excess and malformed selections at the strict JSON boundary", async () => {
    const [excess, malformed] = await Promise.all([
      readRepositoryFile("examples/tiny-bank/database/excess-selection.json"),
      readRepositoryFile("examples/tiny-bank/database/malformed.json"),
    ]);

    const [excessExit, malformedExit] = await Promise.all([
      Effect.runPromiseExit(decodeM026SemanticDatabaseSelection(excess, "excess-selection.json")),
      Effect.runPromiseExit(
        decodeM026SemanticDatabaseSelection(malformed, "malformed-selection.json"),
      ),
    ]);
    expect(excessExit._tag).toBe("Failure");
    expect(malformedExit._tag).toBe("Failure");
  });

  test("retains checked identities and references in the data-service plan", async () => {
    const { plan } = await compileCanonicalDatabase();

    expect(plan.version).toBe(1);
    expect(plan.serviceId).toBe("tiny-bank-account");
    expect(plan.projectId).toBe("tiny-bank");
    expect(plan.projectPath).toBe("examples/tiny-bank/project.json");
    expect(plan.artifactId).toBe("tiny-bank");
    expect(plan.entity).toEqual({
      id: "Account",
      stateMachineId: "Account",
      initializerId: "initialize",
      invariantId: "nonnegativeBalance",
      identityField: "accountId",
    });
    expect(plan.command).toEqual({
      id: "WithdrawAccountOnce",
      realizationId: "WithdrawAccountOnce",
      operationId: "withdraw",
      parameters: [{ id: "amount", type: "Integer" }],
      requires: [
        {
          kind: "greaterThanOrEqual",
          left: { kind: "parameter", id: "amount" },
          right: { kind: "integerLiteral", value: "0" },
        },
        {
          kind: "greaterThanOrEqual",
          left: { kind: "stateField", field: "balance" },
          right: { kind: "parameter", id: "amount" },
        },
      ],
      disabledFailureId: "WithdrawalRejectedOnce",
      capabilityId: "DebitAccount",
      exactUses: 1n,
    });
    expect(
      violatesM026StatePredicates(
        plan.command.requires,
        new Map([["balance", 10n]]),
        new Map([["amount", 11n]]),
      ),
    ).toBe(true);
    expect(
      violatesM026StatePredicates(
        plan.command.requires,
        new Map([["balance", 10n]]),
        new Map([["amount", 4n]]),
      ),
    ).toBe(false);
    expect(plan.query.stateFields).toEqual([
      {
        id: "balance",
        type: "Integer",
        column: "balance",
        address: "stateMachine:Account.state:AccountState.field:balance",
      },
    ]);
    expect(plan.query.capabilityAvailability).toBe("DebitAccount");
    expect(plan.subscription).toEqual({
      id: "AccountSummarySubscription",
      queryId: "AccountSummary",
      mode: "snapshots",
      initialSnapshot: true,
    });
    expect(plan.target).toEqual({ database: "sqlite", api: "effect-typescript" });
    expect(plan.scenario).toEqual({
      accountId: "account-1",
      initialBalance: 10n,
      withdrawAmount: 4n,
    });
    expect(plan.constructIds).toEqual({
      entity: "Account",
      stateMachine: "Account",
      initializer: "initialize",
      command: "WithdrawAccountOnce",
      realization: "WithdrawAccountOnce",
      operation: "withdraw",
      disabledFailure: "WithdrawalRejectedOnce",
      capability: "DebitAccount",
      query: "AccountSummary",
      subscription: "AccountSummarySubscription",
    });
    expect(plan.addresses).toEqual({
      project: "project:examples/tiny-bank/project.json",
      entity: "entity:Account",
      stateMachine: "stateMachine:Account",
      invariant: "stateMachine:Account.invariant:nonnegativeBalance",
      initializer: "stateMachine:Account.initializer:initialize",
      state: "stateMachine:Account.state:AccountState",
      fields: ["stateMachine:Account.state:AccountState.field:balance"],
      command: "command:WithdrawAccountOnce",
      realization: "operationRealization:WithdrawAccountOnce",
      operation: "operationRealization:WithdrawAccountOnce.operation",
      disabledFailure: "operationRealization:WithdrawAccountOnce.disabled:WithdrawalRejectedOnce",
      capabilityRequirement: "operationRealization:WithdrawAccountOnce.requirement:DebitAccount",
      capability: "capability:DebitAccount",
      query: "query:AccountSummary",
      subscription: "subscription:AccountSummarySubscription",
    });
  });

  test("rejects a state projection wider than the supported balance tracer", async () => {
    const [{ artifact }, { value: selection }] = await Promise.all([
      Effect.runPromise(
        compileSelectedProject(root, "examples/tiny-bank/project.json").pipe(
          // @effect-diagnostics-next-line strictEffectProvide:off
          Effect.provide(BunServices.layer),
        ),
      ),
      readCanonicalSelection(),
    ]);
    const widenedArtifact = {
      ...artifact,
      core: {
        ...artifact.core,
        declarations: artifact.core.declarations.map((declaration) =>
          declaration.kind === "stateMachine" && declaration.id === "Account"
            ? Object.assign({}, declaration, {
                state: Object.assign({}, declaration.state, {
                  fields: [...declaration.state.fields, { id: "status", type: "Integer" }],
                }),
              })
            : declaration,
        ),
      },
    };
    const widenedSelection = {
      ...selection,
      query: { ...selection.query, stateFields: ["balance", "status"] as const },
    };

    const error = await Effect.runPromise(
      Effect.flip(
        deriveM026DataServicePlan(widenedArtifact, widenedSelection, "wide-selection.json"),
      ),
    );
    expect(error.stage).toBe("projection");
    expect(error.reason).toBe("unsupported-state-shape");
  });

  test("projects the checked plan into constrained SQL and typed Effect bindings", async () => {
    const { plan } = await compileCanonicalDatabase();
    const schema = renderM026Sql(plan);
    const binding = renderM026EffectBindings(plan);

    expect(schema).toContain('CREATE TABLE IF NOT EXISTS "tiny_bank_account_Account" (');
    expect(schema).toContain('"account_id" TEXT PRIMARY KEY NOT NULL');
    expect(schema).toContain(
      "CHECK (\"balance\" <> '' AND \"balance\" NOT GLOB '*[^0-9]*' AND (\"balance\" = '0' OR substr(\"balance\", 1, 1) <> '0'))",
    );
    expect(schema).toContain('CHECK (typeof("revision") = \'integer\' AND "revision" >= 0)');
    expect(schema).toContain(
      'CHECK (typeof("DebitAccount_remaining_uses") = \'integer\' AND "DebitAccount_remaining_uses" IN (0, 1))',
    );
    expect(schema.endsWith(") STRICT;\n")).toBe(true);
    expect(await Bun.file(join(generatedDirectory, "schema.sql")).text()).toBe(schema);

    expect(binding).toContain('import { Context, Effect, Schema, Stream } from "effect";');
    expect(binding).toContain("export const AccountState = Schema.Struct({");
    expect(binding).toContain("export const AccountCreate = Schema.Struct({");
    expect(binding).toContain("export const AccountQuery = Schema.Struct({");
    expect(binding).toContain("export const WithdrawAccountOnceCommand = Schema.Union([");
    expect(binding).toMatch(
      /readonly create:\s*\([\s\S]*?AccountCreate[\s\S]*?Effect\.Effect<\s*AccountSummary/,
    );
    expect(binding).toMatch(
      /readonly query:\s*\([\s\S]*?AccountQuery[\s\S]*?Effect\.Effect<\s*AccountSummary/,
    );
    expect(binding).toMatch(
      /readonly dispatch:\s*\([\s\S]*?WithdrawAccountOnceCommand[\s\S]*?Effect\.Effect</,
    );
    expect(binding).toMatch(
      /readonly subscribe:\s*\([\s\S]*?AccountQuery[\s\S]*?Stream\.Stream<AccountSummary/,
    );
    expect(await Bun.file(join(generatedDirectory, "bindings.ts")).text()).toBe(binding);
  });
});

describe("M026 semantic database journey and report", () => {
  test("returns the canonical compile result and complete persistent reactive journey", async () => {
    const result = await compileCanonicalDatabase();
    const { report } = result;

    expect(result.selection.id).toBe("tiny-bank-account");
    expect(result.plan.serviceId).toBe("tiny-bank-account");
    expect(result.report).toBe(report);
    expect(report.projectId).toBe("tiny-bank");
    expect(report.serviceId).toBe("tiny-bank-account");
    expect(report.selection).toEqual({
      path: canonicalSelectionPath,
      stateMachine: "Account",
      initializer: "initialize",
      invariant: "nonnegativeBalance",
      realization: "WithdrawAccountOnce",
      capability: "DebitAccount",
      query: "AccountSummary",
      subscription: "AccountSummarySubscription",
    });
    expect(report.generatedArtifacts.map(({ kind }) => kind)).toEqual([
      "sqlite-schema",
      "effect-binding",
    ]);
    expect(report.journey.initial).toEqual({
      accountId: "account-1",
      revision: "0",
      balance: "10",
      withdrawalAvailable: true,
    });
    expect(report.journey.committed).toEqual({
      accountId: "account-1",
      revision: "1",
      balance: "6",
      withdrawalAvailable: false,
    });
    expect(report.journey.emitted).toEqual([report.journey.initial, report.journey.committed]);
    expect(report.journey.rejection).toEqual({
      identity: "WithdrawalRejectedOnce",
      revisionUnchangedAt: "1",
    });
    expect(report.journey.queryRunsAfterRejection).toBe(2);
    expect(report.journey.clean).toEqual(report.journey.committed);
    expect(report.journey.reopened).toEqual(report.journey.committed);
    expect(report.journey.incrementalEqualsClean).toBe(true);
    expect(report.journey.reopenedEqualsClean).toBe(true);
    expect(report.dispositions).toContainEqual(
      expect.objectContaining({
        law: "TypedInteractionBoundary",
        mechanism: "type",
        qualification: "static-checked",
      }),
    );
    expect(report.dispositions).toContainEqual(
      expect.objectContaining({
        law: "WithdrawPoststate",
        claim: "The independent TinyBank handler changed balance 10 to 6 for amount 4.",
      }),
    );
    expect(result.text).toContain(
      "Initial subscription: revision 0, balance 10, withdrawal available yes",
    );
    expect(result.text).toContain(
      "Committed subscription: revision 1, balance 6, withdrawal available no",
    );
    expect(result.text).toContain("Rejection: WithdrawalRejectedOnce");
    expect(result.text).toContain("Reactive query runs after rejection: 2");
    expect(result.text).toContain("Reopened query: revision 1, balance 6, withdrawal available no");
    expect(result.text).toContain("Incremental equals clean query: yes");
    expect(result.text).toContain("Reopened equals clean query: yes");
    expect(result.text).toContain("Effect binding type-check: passed");
  });

  test("round-trips the canonical report through its strict JSON schema", async () => {
    const { report } = await compileCanonicalDatabase();
    const encoded = Schema.encodeSync(M026SemanticDatabaseReportFromJson)(report);
    const decoded = Schema.decodeSync(M026SemanticDatabaseReportFromJson)(encoded);

    expect(decoded).toEqual(report);
    expect(
      Schema.decodeSync(M026SemanticDatabaseReportFromJson)(
        await Bun.file(join(generatedDirectory, "report.json")).text(),
      ),
    ).toEqual(report);
  });

  test("rejects a report with excess fields", async () => {
    await expectReportDecodeFailure((report) => ({
      ...report,
      unexpected: true,
    }));
  });

  test("rejects a report with revision drift", async () => {
    await expectReportDecodeFailure((report) => ({
      ...report,
      journey: {
        ...report.journey,
        committed: { ...report.journey.committed, revision: "2" },
      },
    }));
  });

  test("rejects a report with false parity", async () => {
    await expectReportDecodeFailure((report) => ({
      ...report,
      journey: { ...report.journey, incrementalEqualsClean: false },
    }));
  });
  test("rejects a report whose clean summary contradicts its parity claim", async () => {
    await expectReportDecodeFailure((report) => ({
      ...report,
      journey: {
        ...report.journey,
        clean: { ...report.journey.clean, balance: "7" },
      },
    }));
  });

  test("rejects a report with reversed generated artifact kinds", async () => {
    await expectReportDecodeFailure((report) => ({
      ...report,
      generatedArtifacts: [report.generatedArtifacts[1], report.generatedArtifacts[0]],
    }));
  });
});

describe("M026 semantic database CLI contract", () => {
  test("keeps canonical stdout and generated artifacts byte deterministic across two runs", async () => {
    const first = await runDatabaseCli(canonicalSelectionPath);
    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    const firstArtifacts = await readGeneratedArtifacts();

    const second = await runDatabaseCli(canonicalSelectionPath);
    expect(second.exitCode).toBe(0);
    expect(second.stderr).toBe("");
    expect(second.stdout).toBe(first.stdout);
    const secondArtifacts = await readGeneratedArtifacts();

    for (const name of artifactNames) {
      expect(equalBytes(firstArtifacts[name]!, secondArtifacts[name]!)).toBe(true);
    }
    for (const marker of [
      "Initial subscription: revision 0, balance 10, withdrawal available yes",
      "Committed subscription: revision 1, balance 6, withdrawal available no",
      "Rejection: WithdrawalRejectedOnce",
      "Reactive query runs after rejection: 2",
      "Reopened query: revision 1, balance 6, withdrawal available no",
      "Incremental equals clean query: yes",
      "Reopened equals clean query: yes",
      "Effect binding type-check: passed",
    ]) {
      expect(first.stdout).toContain(marker);
    }
  });

  test("rejects every negative fixture with its exact reason and no stdout", async () => {
    const checkNegativeFixture = async (index: number): Promise<void> => {
      const fixture = negativeFixtures[index];
      if (fixture === undefined) return;
      const [selectionPath, reason] = fixture;
      const result = await runDatabaseCli(selectionPath);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      const reportedReason = result.stderr
        .split(/\r?\n/u)
        .find((line) => line.startsWith("reason: "));
      expect(reportedReason).toBe(`reason: ${reason}`);
      return checkNegativeFixture(index + 1);
    };
    await checkNegativeFixture(0);
  }, 60_000);
});
