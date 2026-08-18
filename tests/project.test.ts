import { mkdtemp, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { BunServices } from "@effect/platform-bun";
import {
  M025ProjectReportFromJson,
  M025ProjectSelectionFromJson,
  compileSelectedProject,
  type M025ProjectCompileResult,
  type M025ProjectReport,
  type M025ProjectSelection,
} from "../apps/bang/src/project.ts";
import { Effect, Schema } from "effect";

const root = resolve(import.meta.dir, "..");
const canonicalSelectionPath = "examples/tiny-bank/project.json";

const readCanonicalSelection = async (): Promise<{
  readonly text: string;
  readonly value: M025ProjectSelection;
}> => {
  const text = await Bun.file(resolve(root, canonicalSelectionPath)).text();
  return { text, value: Schema.decodeSync(M025ProjectSelectionFromJson)(text) };
};

const compileProjectEffect = (selectionPath: string) =>
  compileSelectedProject(root, selectionPath).pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(BunServices.layer),
  );

const compileProject = (selectionPath: string): Promise<M025ProjectCompileResult> =>
  Effect.runPromise(compileProjectEffect(selectionPath));

let canonicalCompilation: Promise<M025ProjectCompileResult> | undefined;
const compileCanonicalProject = (): Promise<M025ProjectCompileResult> =>
  (canonicalCompilation ??= compileProject(canonicalSelectionPath));

const expectReportDecodeFailure = async (
  mutate: (report: M025ProjectReport) => unknown,
): Promise<void> => {
  const { report } = await compileCanonicalProject();
  const encoded = JSON.stringify(mutate(report));
  expect(() => Schema.decodeSync(M025ProjectReportFromJson)(encoded)).toThrow();
};

describe("M025 project selection boundary", () => {
  test("decodes the canonical project selection", async () => {
    const { value } = await readCanonicalSelection();

    expect(value.id).toBe("tiny-bank");
    expect(value.sources).toHaveLength(1);
    expect(value.theories[0]?.theory.id).toBe("ExactOneCapabilityExecution");
    expect(value.targets.map(({ adapter }) => adapter)).toEqual([
      "effect-typescript",
      "gleam-beam",
    ]);
    expect(value.realizationProfiles).toHaveLength(2);
    expect(value.evidence).toHaveLength(1);
    expect(value.channels).toHaveLength(1);
  });

  test("rejects excess selection keys instead of accepting an open record", async () => {
    const { value } = await readCanonicalSelection();
    const withExcessKey = {
      ...value,
      realizationProfiles: [
        { ...value.realizationProfiles[0]!, unexpected: true },
        value.realizationProfiles[1]!,
      ],
    };

    expect(() =>
      Schema.decodeSync(M025ProjectSelectionFromJson)(JSON.stringify(withExcessKey)),
    ).toThrow();
  });

  test("rejects duplicate project-local identities", async () => {
    const { value } = await readCanonicalSelection();
    const firstProfile = value.realizationProfiles[0]!;
    const secondProfile = value.realizationProfiles[1]!;
    const duplicateProfileIdentity = {
      ...value,
      realizationProfiles: [firstProfile, { ...secondProfile, id: firstProfile.id }],
    };

    expect(() =>
      Schema.decodeSync(M025ProjectSelectionFromJson)(JSON.stringify(duplicateProfileIdentity)),
    ).toThrow();
  });

  test("keeps unresolved references structurally decodable for evaluator failure", async () => {
    const { value } = await readCanonicalSelection();
    const unresolvedTarget = {
      ...value,
      realizationProfiles: [
        { ...value.realizationProfiles[0]!, target: "missing-target" },
        value.realizationProfiles[1]!,
      ],
    };
    const structurallyDecoded = Schema.decodeSync(M025ProjectSelectionFromJson)(
      JSON.stringify(unresolvedTarget),
    );
    expect(structurallyDecoded.realizationProfiles[0]?.target).toBe("missing-target");

    const temporaryRoot = await mkdtemp(join(root, ".m025-project-test-"));
    try {
      const selectionPath = join(temporaryRoot, "unresolved.json");
      await Bun.write(selectionPath, JSON.stringify(unresolvedTarget));
      const error = await Effect.runPromise(
        Effect.flip(compileProjectEffect(relative(root, selectionPath))),
      );

      expect(error.stage).toBe("project");
      expect(error.reason).toBe("unresolved-reference");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe("M025 project report boundary", () => {
  test("round-trips a real compiled report through its JSON schema", async () => {
    const { report } = await compileCanonicalProject();
    const encoded = Schema.encodeSync(M025ProjectReportFromJson)(report);
    const decoded = Schema.decodeSync(M025ProjectReportFromJson)(encoded);

    expect(decoded).toEqual(report);
  });

  test("rejects a report with mutated artifact identity", async () => {
    await expectReportDecodeFailure((report) => ({
      ...report,
      artifact: { ...report.artifact, id: `${report.artifact.id}-drift` },
    }));
  });

  test("rejects a report with mutated theory identity", async () => {
    const { report } = await compileCanonicalProject();
    const theoryApplication = report.theoryApplications[0]!;
    const mutated = {
      ...report,
      theoryApplications: [
        {
          ...theoryApplication,
          result: { ...theoryApplication.result, artifactId: "drifted-artifact" },
        },
      ],
    };

    expect(() => Schema.decodeSync(M025ProjectReportFromJson)(JSON.stringify(mutated))).toThrow();
  });

  test("rejects a report with a missing target profile", async () => {
    const { report } = await compileCanonicalProject();
    expect(() =>
      Schema.decodeSync(M025ProjectReportFromJson)(
        JSON.stringify({ ...report, realizationProfiles: [report.realizationProfiles[0]] }),
      ),
    ).toThrow();
  });

  test("rejects a profile whose project target does not match its typed result", async () => {
    await expectReportDecodeFailure((report) => ({
      ...report,
      realizationProfiles: [
        { ...report.realizationProfiles[0], target: report.realizationProfiles[1].target },
        { ...report.realizationProfiles[1], target: report.realizationProfiles[0].target },
      ],
    }));
  });

  test("rejects a profile whose evidence reference is not declared", async () => {
    await expectReportDecodeFailure((report) => ({
      ...report,
      realizationProfiles: [
        { ...report.realizationProfiles[0], evidence: "missing-evidence" },
        report.realizationProfiles[1],
      ],
    }));
  });

  test("rejects classification results outside stable Effect-then-Gleam order", async () => {
    await expectReportDecodeFailure((report) => ({
      ...report,
      realizationProfiles: [report.realizationProfiles[1], report.realizationProfiles[0]],
    }));
  });

  test("rejects a policy decision inconsistent with its typed contents", async () => {
    await expectReportDecodeFailure((report) => {
      const firstCondition = report.policyDecision.conditions[0];
      if (firstCondition === undefined) throw new Error("compiled report has no policy condition");
      return {
        ...report,
        policyDecision: {
          ...report.policyDecision,
          conditions: [
            { ...firstCondition, subjects: [...firstCondition.subjects, "policy-drift"] },
            ...report.policyDecision.conditions.slice(1),
          ],
        },
      };
    });
  });
});
