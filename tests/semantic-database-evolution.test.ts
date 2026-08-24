import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { BunServices } from "@effect/platform-bun";
import { Effect, Schema } from "effect";

import {
  M028SemanticEvolutionFailure,
  compileSelectedM028Evolution,
  type M028SemanticEvolutionCompileResult,
} from "../apps/bang/src/semantic-database-evolution.ts";
import {
  initializeM028VersionMetadata,
  observeM028StoredService,
} from "../apps/bang/src/semantic-database-evolution-runtime.ts";
import {
  M028SemanticEvolutionReportFromJson,
  M028SemanticEvolutionSelectionFromJson,
} from "../apps/bang/src/semantic-database-evolution-target.ts";
import { compileSelectedM027Transfer } from "../apps/bang/src/semantic-database-transfer.ts";
import { runM027TransferJourney } from "../apps/bang/src/semantic-database-transfer-runtime.ts";

const root = resolve(import.meta.dir, "..");
const compatibleSelection = "examples/tiny-bank/evolution/transfer-compatible.json";
const breakingSelection = "examples/tiny-bank/evolution/transfer-breaking.json";
const outputDirectory = ".bang/semantic-evolution-test";
const generatedDirectory = resolve(root, outputDirectory, "tiny-bank-transfer-evolution");
const artifactNames = ["schema.sql", "bindings.ts", "report.json"] as const;

const provideBun = <A, E>(effect: Effect.Effect<A, E, BunServices.BunServices>) =>
  effect.pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(BunServices.layer),
  );

const compile = (
  selectionPath: string,
  output = outputDirectory,
): Promise<M028SemanticEvolutionCompileResult> =>
  Effect.runPromise(provideBun(compileSelectedM028Evolution(root, selectionPath, output)));

let compatibleCompilation: Promise<M028SemanticEvolutionCompileResult> | undefined;
const compileCompatible = () => (compatibleCompilation ??= compile(compatibleSelection));

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

const expectBreakingFailure = async (output: string): Promise<M028SemanticEvolutionFailure> => {
  try {
    await compile(breakingSelection, output);
  } catch (error) {
    expect(error).toBeInstanceOf(M028SemanticEvolutionFailure);
    return error as M028SemanticEvolutionFailure;
  }
  throw new Error("breaking M028 candidate was accepted");
};

describe("M028 versioned semantic-service evolution", () => {
  test("decodes the strict version 1 to version 2 selection", async () => {
    const encoded = await Bun.file(resolve(root, compatibleSelection)).text();
    const selection = Schema.decodeSync(M028SemanticEvolutionSelectionFromJson)(encoded, {
      onExcessProperty: "error",
    });
    expect(selection.baselineVersion).toBe(1);
    expect(selection.candidateVersion).toBe(2);
    expect(selection.compatibility.kind).toBe("selected-service-closure");
    expect(selection.migration.kind).toBe("reuse-schema");
  });

  test("accepts an unselected quantity edit and reports scoped reuse", async () => {
    const { report } = await compileCompatible();
    expect(report.compatibility.classification).toBe("compatible");
    expect(report.changedConstructs.map(({ address }) => address)).toEqual([
      "operationRealization:WithdrawAccount",
      "operationRealization:WithdrawAccount.requirement:DebitAccount",
    ]);
    expect(report.constructDispositions.every(({ disposition }) => disposition === "reused")).toBe(
      true,
    );
    expect(report.evidenceDispositions.map(({ disposition }) => disposition)).toEqual([
      "reused",
      "reused",
      "reused",
    ]);
    expect(report.storedVersionBefore.semanticVersion).toBe(1);
    expect(report.storedVersionAfter.semanticVersion).toBe(2);
    expect(report.observations.beforeCutover).toEqual(report.observations.afterCutover);
    expect(report.observations.afterTransfer).toEqual(report.observations.finalReopen);
    expect(report.observations.afterTransfer.source.balance).toBe("5");
    expect(report.observations.afterTransfer.target.balance).toBe("7");
    expect(report.observations.afterTransfer.total.total).toBe("12");
    expect(report.cleanParity).toBe(true);
  });

  test("strictly reloads the generated report and reproduces all bytes", async () => {
    const first = await compileCompatible();
    const firstArtifacts = await readArtifacts();
    const encoded = await Bun.file(join(generatedDirectory, "report.json")).text();
    expect(Schema.decodeSync(M028SemanticEvolutionReportFromJson)(encoded)).toEqual(first.report);

    const second = await compile(compatibleSelection);
    const secondArtifacts = await readArtifacts();
    expect(second.text).toBe(first.text);
    expect(second.reportSha256).toBe(first.reportSha256);
    for (const name of artifactNames) {
      expect(equalBytes(firstArtifacts[name]!, secondArtifacts[name]!)).toBe(true);
    }
  });

  test("rejects the invariant edit with selected invalidating addresses and no artifacts", async () => {
    const rejectedOutput = `.bang/m028-rejected-test-${crypto.randomUUID()}`;
    const error = await expectBreakingFailure(rejectedOutput);
    expect(error.stage).toBe("compatibility");
    expect(error.reason).toBe("incompatible-service");
    expect(error.invalidatingAddresses).toEqual([
      "stateMachine:Account",
      "stateMachine:Account.invariant:nonnegativeBalance",
    ]);
    expect(
      await Bun.file(
        resolve(root, rejectedOutput, "tiny-bank-transfer-evolution-breaking", "report.json"),
      ).exists(),
    ).toBe(false);
  });

  test("keeps version 1 metadata and rows readable after compatibility rejection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bang-m028-rejection-"));
    const databasePath = join(directory, "version-one.sqlite");
    try {
      const baseline = await Effect.runPromise(
        provideBun(
          compileSelectedM027Transfer(
            root,
            "examples/tiny-bank/database/transfer.json",
            `.bang/m028-baseline-test-${crypto.randomUUID()}`,
          ),
        ),
      );
      await Effect.runPromise(provideBun(runM027TransferJourney(baseline.plan, databasePath)));
      const digest = "0".repeat(64);
      await Effect.runPromise(
        provideBun(
          initializeM028VersionMetadata(databasePath, {
            serviceId: baseline.plan.serviceId,
            semanticVersion: 1,
            artifactSha256: digest,
            normalizedSha256: digest,
          }),
        ),
      );
      const before = await Effect.runPromise(
        provideBun(observeM028StoredService(baseline.plan, databasePath)),
      );

      await expectBreakingFailure(`.bang/m028-preservation-test-${crypto.randomUUID()}`);

      const after = await Effect.runPromise(
        provideBun(observeM028StoredService(baseline.plan, databasePath)),
      );
      expect(after).toEqual(before);
      expect(after.version.semanticVersion).toBe(1);
      expect(after.observation.source.balance).toBe(6n);
      expect(after.observation.target.balance).toBe(6n);
      expect(after.observation.total.total).toBe(12n);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
