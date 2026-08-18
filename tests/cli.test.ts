import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const root = resolve(import.meta.dir, "..");
const canonicalSelectionPath = "examples/tiny-bank/system/account-ledger.json";
const canonicalSourcePath = "examples/tiny-bank/account.bang";

interface ParticipantModel {
  participant: string;
  theory: string;
  realization: string;
}

interface SelectionFixture {
  sources: {
    refinement: { path: string };
    state: { path: string };
    bridge: { path: string };
  };
  selection: {
    participantModels: Array<ParticipantModel>;
  };
}

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface Fixtures {
  selectedMissingSource: string;
  incoherentSelection: string;
  malformedSelection: string;
  malformedSource: string;
  zeroCaseSelfCheck: string;
  unsafeNormalizationSelection: string;
  unsafeArtifactPath: string;
}
const runCli = async (
  selectionPath: string,
  command:
    | "project"
    | "report"
    | "check"
    | "normalize"
    | "explain"
    | "classify"
    | "trace" = "report",
): Promise<CliResult> => {
  const child = Bun.spawn([join(root, "node_modules/.bin/bang"), command, selectionPath], {
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

const classificationProfileBlock = (report: string, target: string): string => {
  const start = report.indexOf(`${target} -> `);
  if (start < 0) return "";
  const nextProfile = report.indexOf("\n\n", start);
  return report.slice(start, nextProfile < 0 ? report.length : nextProfile);
};

const classificationAssessmentBlock = (profile: string, obligationId: string): string => {
  const start = profile.indexOf(`- ${obligationId}: `);
  if (start < 0) return "";
  const nextAssessment = profile.indexOf("\n- ", start + obligationId.length + 4);
  return profile.slice(start, nextAssessment < 0 ? profile.length : nextAssessment);
};

const m023ObligationIds = [
  "ExactOneCapabilityExecution.obligation.check-before-consumption",
  "ExactOneCapabilityExecution.obligation.consume-atomically-before-execution",
  "ExactOneCapabilityExecution.obligation.reject-reuse-before-execution",
  "ExactOneCapabilityExecution.obligation.no-restore-after-start",
] as const;

const m018MaterialReferences = [
  "examples/tiny-bank/account.bang [e35c8146d68887e371fa70c5ecb489cc480fc5779c42abd660973bf2d532cd40]",
  "examples/tiny-bank/capability/account-withdrawal-once-effect.ts [05e3dffcbd736ce8453331f6424edfd3774783c8dc63ca70db5153850ed4e2e2]",
  "generated/effect/WithdrawAccountOnce.ts [bdef50d7b7f26408ec8bc16efb35cbe578a25e03ee4ed86bdb6d82b9ef4890a4]",
] as const;

const normalizationReportBlock = (report: string, address: string): string => {
  const marker = `Address: ${address}`;
  const start = report.indexOf(marker);
  if (start < 0) return "";
  const nextAddress = report.indexOf("\nAddress: ", start + marker.length);
  return report.slice(start, nextAddress < 0 ? report.length : nextAddress);
};

const m019TemporaryDirectories = async (): Promise<ReadonlyArray<string>> =>
  (await readdir(root)).filter((entry) => entry.startsWith(".m019-check-")).toSorted();

const readSelection = async (): Promise<{ text: string; value: SelectionFixture }> => {
  const text = await Bun.file(resolve(root, canonicalSelectionPath)).text();
  return { text, value: JSON.parse(text) as SelectionFixture };
};

let fixtures: Fixtures;
let temporaryRoot: string;

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(root, ".m014-cli-test-"));
  const canonical = await readSelection();

  const selectedMissing = JSON.parse(canonical.text) as SelectionFixture;
  selectedMissing.sources.refinement.path = "examples/tiny-bank/core/not-selected-by-default.json";
  const selectedMissingSource = join(temporaryRoot, "selected-missing-source.json");
  await Bun.write(selectedMissingSource, `${JSON.stringify(selectedMissing, null, 2)}\n`);

  const incoherent = JSON.parse(canonical.text) as SelectionFixture;
  incoherent.selection.participantModels = incoherent.selection.participantModels.map((model) =>
    model.participant === "ledger" ? { ...model, realization: "InconsistentLedgerBalance" } : model,
  );
  const incoherentSelection = join(temporaryRoot, "incoherent-selection.json");
  await Bun.write(incoherentSelection, `${JSON.stringify(incoherent, null, 2)}\n`);

  const malformedSource = join(temporaryRoot, "account-missing-brace.bang");
  const source = await Bun.file(resolve(root, canonicalSourcePath)).text();

  const zeroCaseSelfCheckValue = JSON.parse(
    await Bun.file(resolve(root, "examples/bang-core/self-check/bridge-term-drifted.json")).text(),
  ) as { evidence: { cases: number } };
  zeroCaseSelfCheckValue.evidence.cases = 0;
  const zeroCaseSelfCheck = join(temporaryRoot, "zero-case-self-check.json");
  await Bun.write(zeroCaseSelfCheck, `${JSON.stringify(zeroCaseSelfCheckValue, null, 2)}\n`);
  await Bun.write(malformedSource, source.slice(0, source.lastIndexOf("}")));
  const malformed = JSON.parse(canonical.text) as SelectionFixture;
  malformed.sources.state.path = relative(root, malformedSource);
  const malformedSelection = join(temporaryRoot, "malformed-selection.json");
  await Bun.write(malformedSelection, `${JSON.stringify(malformed, null, 2)}\n`);

  const unsafeNormalizationSelectionPath = join(
    temporaryRoot,
    "unsafe-normalization-selection.json",
  );
  await Bun.write(
    unsafeNormalizationSelectionPath,
    `${JSON.stringify(
      {
        bangNormalization: 1,
        baseline: {
          sources: [{ path: "../package.json", format: "core-json" }],
        },
        candidate: {
          sources: [
            {
              path: "examples/tiny-bank/normalization/baseline.bang",
              format: "bang-source",
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );

  fixtures = {
    selectedMissingSource: relative(root, selectedMissingSource),
    incoherentSelection: relative(root, incoherentSelection),
    malformedSelection: relative(root, malformedSelection),
    malformedSource: relative(root, malformedSource),
    zeroCaseSelfCheck: relative(root, zeroCaseSelfCheck),
    unsafeNormalizationSelection: relative(root, unsafeNormalizationSelectionPath),
    unsafeArtifactPath: "examples/tiny-bank/theories/unsafe-artifact-path.json",
  };
});

describe("M021 shipped normalization CLI", () => {
  const selectedRealization = "examples/tiny-bank/normalization/selected-realization-change.json";
  const unrelatedRealization = "examples/tiny-bank/normalization/unrelated-realization-change.json";
  const invariantChange = "examples/tiny-bank/normalization/invariant-change.json";
  const propertyReorder = "examples/tiny-bank/normalization/property-reorder.json";
  const invalidReference = "examples/tiny-bank/normalization/invalid-reference.json";

  test("reports changed and reused constructs, invalidation explanations, and clean parity", async () => {
    const first = await runCli(selectedRealization, "normalize");
    const second = await runCli(selectedRealization, "normalize");

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(second.stderr).toBe("");
    expect(first.stdout).toBe(second.stdout);
    expect(first.stdout).toContain("M021 construct-addressed normalization");
    const changedBlock = normalizationReportBlock(
      first.stdout,
      "operationRealization:WithdrawAccount",
    );
    expect(changedBlock).toContain("Status: changed");
    const reusedBlock = normalizationReportBlock(
      first.stdout,
      "operationRealization:WithdrawAccountOnce",
    );
    expect(reusedBlock).toContain("Status: reused");
    expect(first.stdout).toContain("Baseline fingerprint:");
    expect(first.stdout).toContain("Candidate fingerprint:");
    expect(first.stdout).toContain("Direct dependencies:");
    expect(first.stdout).toContain("Dependency closure:");
    expect(first.stdout).toContain("Material provenance:");
    expect(first.stdout).toContain("Evidence scope: runtime-checked comparison evidence");
    expect(first.stdout).toContain("Clean parity: match");
    expect(first.stdout.endsWith("\n")).toBe(true);
  });
  test("reuses selected conclusions when an unrelated realization changes", async () => {
    const result = await runCli(unrelatedRealization, "normalize");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(
      normalizationReportBlock(result.stdout, "operationRealization:WithdrawAccount"),
    ).toContain("Status: reused");
    expect(
      normalizationReportBlock(result.stdout, "operationRealization:WithdrawAccountOnce"),
    ).toContain("Status: changed");
    expect(result.stdout).toContain("Clean parity: match");
  });

  test("changes the stable invariant and derived obligation fingerprints", async () => {
    const result = await runCli(invariantChange, "normalize");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const invariantBlock = normalizationReportBlock(
      result.stdout,
      "stateMachine:Account.invariant:nonnegativeBalance",
    );
    expect(invariantBlock).toContain("Status: changed");
    expect(invariantBlock).toContain("Baseline fingerprint:");
    expect(invariantBlock).toContain("Candidate fingerprint:");
    const baselineInvariantFingerprint = invariantBlock.match(/^Baseline fingerprint: (.+)$/m)?.[1];
    const candidateInvariantFingerprint = invariantBlock.match(
      /^Candidate fingerprint: (.+)$/m,
    )?.[1];
    expect(baselineInvariantFingerprint).toBeDefined();
    expect(candidateInvariantFingerprint).toBeDefined();
    expect(candidateInvariantFingerprint).not.toBe(baselineInvariantFingerprint);
    const obligationBlock = normalizationReportBlock(
      result.stdout,
      "obligation:Account.withdraw.preserves.nonnegativeBalance",
    );
    expect(result.stdout).toContain("Clean parity: match");
    expect(obligationBlock).toContain("Status: changed");
  });
  test("keeps semantic fingerprints equal when Core object properties are reordered", async () => {
    const result = await runCli(propertyReorder, "normalize");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const bridgeBlock = normalizationReportBlock(
      result.stdout,
      "theoryBridge:AccountLedger.law:balancesAgree",
    );
    expect(bridgeBlock).toContain("Status: reused");
    const baselineFingerprint = bridgeBlock.match(/^Baseline fingerprint: (.+)$/m)?.[1];
    const candidateFingerprint = bridgeBlock.match(/^Candidate fingerprint: (.+)$/m)?.[1];
    expect(baselineFingerprint).toBeDefined();
    expect(candidateFingerprint).toBe(baselineFingerprint);
    expect(result.stdout).toContain("Clean parity: match");
  });

  test("rejects an unsafe selection path before reading sources", async () => {
    const result = await runCli(fixtures.unsafeNormalizationSelection, "normalize");

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/stage:\s*selection/i);
  });

  test("rejects an invalid Core reference with a typed failure and no report", async () => {
    const result = await runCli(invalidReference, "normalize");

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/stage:\s*core-validation/i);
    expect(result.stderr).toContain("bridge-invalid-reference.json");
    expect(result.stderr).toContain("AccountLedger");
  });
});

describe("M022 shipped theory explanation CLI", () => {
  test("reports typed theory scope separately from runtime evidence classification", async () => {
    const result = await runCli("examples/tiny-bank/theories/exact-one-capability.json", "explain");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Evidence scope: theory-derived-obligations");
    expect(result.stdout).toContain(
      "Evidence classification: runtime-checked encoded artifact crossing and theory evaluation.",
    );
    expect(result.stdout).not.toContain("Evidence scope: runtime-checked");
  });

  test("rejects an unsafe artifact path before reading or writing files", async () => {
    const result = await runCli(fixtures.unsafeArtifactPath, "explain");

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/stage:\s*selection/i);
    expect(result.stderr).not.toContain("could not write semantic artifact");
  });
});

describe("M023 shipped realization classification CLI", () => {
  const canonicalClassification = "examples/tiny-bank/realizations/exact-one.json";

  test("classifies both targets with deterministic bytes and honest obligation evidence", async () => {
    const first = await runCli(canonicalClassification, "classify");
    const second = await runCli(canonicalClassification, "classify");

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(second.stderr).toBe("");
    expect(first.stdout).toBe(second.stdout);
    expect(Buffer.from(first.stdout).equals(Buffer.from(second.stdout))).toBe(true);
    expect(first.stdout.endsWith("\n")).toBe(true);
    expect(first.stdout).toContain("effect-typescript -> qualified");
    expect(first.stdout).toContain("gleam-beam -> rejected");
    expect(first.stdout).not.toContain("M017");
    expect(first.stdout).not.toContain("gleam actor evidence");

    for (const obligationId of m023ObligationIds) {
      expect(
        first.stdout.split("\n").filter((line) => line.startsWith(`- ${obligationId}: `)).length,
      ).toBe(2);
    }

    const effectProfile = classificationProfileBlock(first.stdout, "effect-typescript");
    const gleamProfile = classificationProfileBlock(first.stdout, "gleam-beam");
    expect(effectProfile).not.toBe("");
    expect(gleamProfile).not.toBe("");

    const effectCheckBefore = classificationAssessmentBlock(effectProfile, m023ObligationIds[0]);
    expect(effectCheckBefore).toContain(
      "Evidence: structurally-derived; scope=checked Core WithdrawAccountOnce projection; producer=effect-typescript;",
    );
    expect(effectCheckBefore).not.toContain("Evidence: runtime-checked;");
    expect(effectCheckBefore).not.toContain("Evidence: assumed-truthful;");

    for (const obligationId of m023ObligationIds.slice(1)) {
      const effectAssessment = classificationAssessmentBlock(effectProfile, obligationId);
      expect(effectAssessment).toContain(
        "Evidence: structurally-derived; scope=checked Core WithdrawAccountOnce projection; producer=effect-typescript;",
      );
      expect(effectAssessment).toContain(
        "Evidence: runtime-checked; scope=single-grant-two-call-trace; producer=bun run scripts/demo-m018.ts;",
      );
      expect(effectAssessment).toContain(
        "Evidence: assumed-truthful; scope=assumed-truthful; producer=bun run scripts/demo-m018.ts;",
      );
    }

    for (const material of m018MaterialReferences) {
      expect(effectProfile).toContain(material);
    }
    for (const qualification of [
      "Assumptions:",
      "the selected checked realization and the independent implementation are the executed boundary",
      "the diagnostic process reports the generated boundary without an unobserved bypass",
      "Weakenings: TypeScript and Effect cannot make the grant universally unforgeable",
      "unsafe casts, foreign JavaScript, or direct implementation calls can bypass the boundary",
      "this runtime journey observes one grant in one process and does not prove distributed exactly-once delivery",
      "the target proves no lifetime, elapsed-time, memory, termination, fairness, or delivery guarantee",
      "Lifetime: valid while the checked Core source, generated boundary, realization, and evaluator remain unchanged",
      "Core declaration, quantity, or failure identity changes",
      "generated boundary or independent realization changes",
      "runtime order, implementation call trace, or target dependency changes",
    ]) {
      expect(effectProfile).toContain(qualification);
    }
    for (const limitation of [
      "termination is not established",
      "productivity is not established",
      "memory or work bounds are not established",
      "capability lifetime is not established",
      "fairness is not established",
      "message delivery is not established",
      "distributed exactly-once execution is not established",
    ]) {
      expect(effectProfile).toContain(limitation);
    }

    const gleamEvidence =
      "Evidence: unsupported-by-target; scope=gleam-beam target projection; producer=gleam-beam; materials=examples/tiny-bank/account.bang [e35c8146d68887e371fa70c5ecb489cc480fc5779c42abd660973bf2d532cd40]";
    for (const obligationId of m023ObligationIds) {
      const gleamAssessment = classificationAssessmentBlock(gleamProfile, obligationId);
      expect(gleamAssessment).toContain(gleamEvidence);
      expect(gleamAssessment).not.toContain("runtime-checked");
      expect(gleamAssessment).not.toContain("assumed-truthful");
    }
    expect(gleamProfile).toContain(
      "Target rejection: adapter=gleam-beam; address=operationRealization:WithdrawAccountOnce.requires; reason=unsupported-target: Gleam entity projection requires exactly one unbounded DebitAccount",
    );
    expect(gleamProfile).toContain("Assumptions: none");
    expect(gleamProfile).toContain("Weakenings: none");
    expect(gleamProfile).not.toContain("single-grant-two-call-trace");
    expect(gleamProfile).not.toContain("bun run scripts/demo-m018.ts");
    expect(gleamProfile).not.toContain("generated/effect/WithdrawAccountOnce.ts");
    expect(gleamProfile).not.toContain(
      "examples/tiny-bank/capability/account-withdrawal-once-effect.ts",
    );
  });

  test("rejects an unsafe classification path without partial stdout", async () => {
    const result = await runCli("examples/tiny-bank/realizations/unsafe-path.json", "classify");

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("stage: selection");
    expect(result.stderr).toContain(
      `path: ${join(root, "examples/tiny-bank/realizations/unsafe-path.json")}`,
    );
    expect(result.stderr).toContain('at ["explanationSelection"]');
  });
  test("rejects an unsafe evidence path before file access", async () => {
    const result = await runCli(
      "examples/tiny-bank/realizations/unsafe-evidence-path.json",
      "classify",
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("stage: selection");
    expect(result.stderr).toContain('at ["evidencePath"]');
  });
  test("reports a target realization identity mismatch as a typed failure", async () => {
    const result = await runCli(
      "examples/tiny-bank/realizations/identity-mismatch.json",
      "classify",
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("stage: selection");
    expect(result.stderr).toContain("reason: realization-identity-mismatch");
    expect(result.stderr).toContain(
      "selected target realization does not match the applicable M022 requirement",
    );
  });

  test("rejects M018 evidence from outside the semantic artifact source set", async () => {
    const result = await runCli("examples/tiny-bank/realizations/source-mismatch.json", "classify");

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("stage: evidence");
    expect(result.stderr).toContain("reason: evidence-source-mismatch");
    expect(result.stderr).toContain(
      "M018 Core material is not a source of the classified semantic artifact",
    );
  });

  test("reports stale evidence digest as a typed failure without partial stdout", async () => {
    const result = await runCli("examples/tiny-bank/realizations/stale-evidence.json", "classify");

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("stage: evidence");
    expect(result.stderr).toContain("stale-m018.json");
    expect(result.stderr).toContain("reason: stale-material");
    expect(result.stderr).toContain(
      "message: M018 material digest differs for examples/tiny-bank/account.bang",
    );
  });

  test("reports an inapplicable theory as a typed failure without partial stdout", async () => {
    const result = await runCli(
      "examples/tiny-bank/realizations/inapplicable-theory.json",
      "classify",
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("stage: artifact");
    expect(result.stderr).toContain("reason: inapplicable-theory");
    expect(result.stderr).toContain("selected M022 theory result is not applicable");
  });
});

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("M014 shipped report CLI", () => {
  test("loads paths from the selected system and retains report identities and evidence", async () => {
    const selectedMissing = await runCli(fixtures.selectedMissingSource);
    expect(selectedMissing.exitCode).not.toBe(0);
    expect(selectedMissing.stdout).toBe("");
    expect(selectedMissing.stderr).toContain("stage: refinement-source");
    expect(selectedMissing.stderr).toContain("not-selected-by-default.json");

    const first = await runCli(canonicalSelectionPath);
    const second = await runCli(canonicalSelectionPath);
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(second.stderr).toBe("");
    expect(first.stdout).toBe(second.stdout);
    expect(Buffer.from(first.stdout).equals(Buffer.from(second.stdout))).toBe(true);
    expect(first.stdout).toContain("M012 accumulated system report");
    expect(first.stdout.endsWith("\n")).toBe(true);

    for (const identity of [
      "refinement:Balance",
      "stateMachine:Account",
      "capability:DebitAccount",
      "operationRealization:WithdrawAccount",
      "theory:AccountBalance",
      "theory:LedgerBalance",
      "theoryBridge:AccountLedger",
    ]) {
      expect(first.stdout).toContain(identity);
    }
    const declarationLine = first.stdout
      .split("\n")
      .find((line) => line.startsWith("Declarations: "));
    expect(declarationLine).toBeDefined();
    expect(declarationLine?.slice("Declarations: ".length).split(", ").length).toBe(7);
    for (const evidence of [
      "Bridge evidence:",
      "Property evidence:",
      "Runtime evidence:",
      "Portability evidence:",
      "Replay evidence:",
      "Solver evidence:",
    ]) {
      expect(first.stdout).toContain(evidence);
    }
  });

  test("rejects an incoherent selected realization without a report", async () => {
    const result = await runCli(fixtures.incoherentSelection);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain("M012 accumulated system report");
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("bridge-law-failed");
    expect(result.stderr).toContain("AccountLedger.balancesAgree");
  });

  test("retains source path and parse span for a missing closing brace", async () => {
    const result = await runCli(fixtures.malformedSelection);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain("M012 accumulated system report");
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(fixtures.malformedSource);
    expect(result.stderr).toMatch(/line\s*:\s*\d+/i);
    expect(result.stderr).toMatch(/column\s*:\s*1/i);
    expect(result.stderr).toMatch(/found(?:\s+token)?\s*:?\s*end of input/i);
    expect(result.stderr).toMatch(/expected(?:\s+syntax)?\s*:?[^\n]*\}/i);
    expect(result.stderr).not.toContain("bridge-law-failed");
  });
});

describe("M019 shipped self-check CLI", () => {
  const canonicalSelfCheck = "examples/bang-core/self-check/bridge-term.json";
  const driftedSelfCheck = "examples/bang-core/self-check/bridge-term-drifted.json";
  const materialChangeSelfCheck = "examples/bang-core/self-check/bridge-term-material-change.json";

  test("produces deterministic fresh sampled evidence and removes generated artifacts", async () => {
    const temporaryDirectoriesBefore = await m019TemporaryDirectories();
    const first = await runCli(canonicalSelfCheck, "check");
    const second = await runCli(canonicalSelfCheck, "check");

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(second.stderr).toBe("");
    expect(first.stdout).toBe(second.stdout);
    expect(Buffer.from(first.stdout).equals(Buffer.from(second.stdout))).toBe(true);
    expect(first.stdout).toContain("M019 self-check report");
    expect(first.stdout).toContain("Result: passed");
    expect(first.stdout).toContain(
      "Declaration: examples/bang-core/bridge-term-data.json#BridgeTerm",
    );
    expect(first.stdout).toContain("Implementation binding: bang-core-bridge-term");
    expect(first.stdout).toContain("Evidence: property-tested; scope: sampled");
    expect(first.stdout).toContain("requested=100; executed=100");
    expect(first.stdout).toContain(
      "bounded generated cases are sampled evidence, not exhaustive or proven decoder equivalence",
    );
    expect(first.stdout).not.toContain("Evidence: exhaustive");
    expect(first.stdout).not.toContain("Evidence: proven");
    expect(first.stdout.endsWith("\n")).toBe(true);
    expect(await m019TemporaryDirectories()).toEqual(temporaryDirectoriesBefore);
  });

  test("rejects a deliberate nested decoder drift with the minimized domain path", async () => {
    const result = await runCli(driftedSelfCheck, "check");

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Stage: conformance");
    expect(result.stderr).toContain("Declaration: data:BridgeTerm");
    expect(result.stderr).toContain("Implementation binding: bang-core-bridge-term-drifted");
    expect(result.stderr).toContain("Evidence: property-tested; scope: sampled");
    expect(result.stderr).toContain("Domain path: BridgeTerm.Application.arguments[0].Variable.id");
    expect(result.stderr).not.toContain("M019 self-check report");
  });

  test("rejects a zero-case policy before a drifted binding can pass vacuously", async () => {
    const result = await runCli(fixtures.zeroCaseSelfCheck, "check");

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Stage: selection");
    expect(result.stderr).toContain("cases");
    expect(result.stderr).not.toContain("M019 self-check report");
  });

  test("changes fresh material closure when selected implementation material changes", async () => {
    const canonical = await runCli(canonicalSelfCheck, "check");
    const changed = await runCli(materialChangeSelfCheck, "check");

    expect(canonical.exitCode).toBe(0);
    expect(changed.exitCode).toBe(0);
    const canonicalAdapter = canonical.stdout
      .split("\n")
      .find((line) => line.startsWith("Material adapter: "));
    const changedAdapter = changed.stdout
      .split("\n")
      .find((line) => line.startsWith("Material adapter: "));
    expect(canonicalAdapter).toBeDefined();
    expect(changedAdapter).toBeDefined();
    expect(changedAdapter).not.toBe(canonicalAdapter);
    expect(changed.stdout).toContain(
      "Implementation binding: bang-core-bridge-term-material-change",
    );
  });
});

const m024ScheduleBlock = (report: string, scheduleId: string): string => {
  const start = report.indexOf(`Schedule: ${scheduleId}`);
  if (start < 0) return "";
  const next = report.indexOf("\n\nSchedule: ", start + scheduleId.length + 10);
  return report.slice(start, next < 0 ? report.length : next);
};

describe("M024 shipped bounded channel trace CLI", () => {
  const canonical = "examples/tiny-bank/channels/two-owner.json";

  test("reports all six schedules, obligations, identities, observations, and limitations deterministically", async () => {
    const first = await runCli(canonical, "trace");
    const second = await runCli(canonical, "trace");

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(second.stderr).toBe("");
    expect(first.stdout).toBe(second.stdout);
    expect(first.stdout.endsWith("\n")).toBe(true);

    const scheduleIds = [
      "ordered",
      "duplicate-prepare",
      "duplicate-commit",
      "commit-before-prepare",
      "drop-ack",
      "complete-without-ack",
    ];
    for (const scheduleId of scheduleIds) {
      expect(first.stdout).toContain(`Schedule: ${scheduleId}`);
    }
    expect(m024ScheduleBlock(first.stdout, "ordered")).toContain("Result: Satisfied");
    expect(m024ScheduleBlock(first.stdout, "duplicate-prepare")).toContain("Result: Satisfied");
    expect(m024ScheduleBlock(first.stdout, "duplicate-commit")).toContain("Result: Satisfied");
    expect(m024ScheduleBlock(first.stdout, "commit-before-prepare")).toContain("Result: Violated");
    expect(m024ScheduleBlock(first.stdout, "drop-ack")).toContain("Result: Unresolved");
    expect(m024ScheduleBlock(first.stdout, "complete-without-ack")).toContain("Result: Violated");

    for (const obligationId of [
      "BoundedChannelProtocol.obligation.logical-message-identity",
      "BoundedChannelProtocol.obligation.handle-after-causal-parent",
      "BoundedChannelProtocol.obligation.at-most-once-state-mutation",
      "BoundedChannelProtocol.obligation.acknowledged-coordination",
      "BoundedChannelProtocol.obligation.loss-remains-unresolved",
    ]) {
      expect(first.stdout).toContain(obligationId);
    }
    for (const identity of [
      "logical=prepare-t1",
      "attempt=ordered-prepare-1",
      "owner-a=complete",
    ]) {
      expect(first.stdout).toContain(identity);
    }
    for (const observation of [
      "Sent",
      "Delivered",
      "Handled",
      "Rejected",
      "Dropped",
      "DuplicateIgnored",
      "ForcedCompletion",
    ]) {
      expect(first.stdout).toContain(observation);
    }
    for (const limitation of [
      "no distributed exactly-once guarantee",
      "no durable delivery or mailbox",
      "no retry-safety or recovery guarantee",
      "no scheduler or network fairness guarantee",
      "no bounded latency, work, memory, or mailbox guarantee",
      "no liveness or productivity guarantee",
      "no behavior claim for unenumerated schedules",
      "the deterministic scheduler is not a real network",
    ]) {
      expect(first.stdout).toContain(limitation);
    }
  });

  test("rejects malformed and semantically unsafe fixtures without partial stdout", async () => {
    const negativeFixtures = [
      {
        path: "examples/tiny-bank/channels/duplicate-attempt.json",
        expected: "duplicate delivery-attempt identity",
      },
      {
        path: "examples/tiny-bank/channels/unknown-message.json",
        expected: "unknown logical message",
      },
      {
        path: "examples/tiny-bank/channels/unknown-causal-parent.json",
        expected: "unknown causal parent",
      },
      {
        path: "examples/tiny-bank/channels/invalid-causal-parent.json",
        expected: "prepare-t1 must not have a causal parent",
      },
      {
        path: "examples/tiny-bank/channels/malformed-step.json",
        expected: "Missing key",
      },
      {
        path: "examples/tiny-bank/channels/../channels/unsafe-path.json",
        expected: "unsafe repository-relative selection path",
      },
    ];
    const results = await Promise.all(
      negativeFixtures.map(async ({ path, expected }) => ({
        expected,
        result: await runCli(path, "trace"),
      })),
    );
    for (const { expected, result } of results) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/stage:\s*(selection|validation|execution|evaluation)/i);
      expect(result.stderr).toContain("message:");
      expect(result.stderr).toContain(expected);
    }
  });
});

describe("M025 shipped single-authority project CLI", () => {
  const canonical = "examples/tiny-bank/project.json";

  test("reports one project authority with deterministic typed conclusions and policy conditions", async () => {
    const first = await runCli(canonical, "project");
    const second = await runCli(canonical, "project");

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(second.stderr).toBe("");
    expect(first.stdout).toBe(second.stdout);
    expect(Buffer.from(first.stdout).equals(Buffer.from(second.stdout))).toBe(true);
    expect(first.stdout.endsWith("\n")).toBe(true);

    expect(first.stdout).toContain("M025 single-authority project report");
    expect(first.stdout).toContain("Project: tiny-bank");
    expect(first.stdout.match(/^Sources:$/gm)?.length).toBe(1);
    expect(
      first.stdout.match(/^- account: examples\/tiny-bank\/account\.bang \(bang-source\)$/gm)
        ?.length,
    ).toBe(1);
    expect(first.stdout).toContain("Theory: ExactOneCapabilityExecution v1");
    expect(first.stdout).toContain("Result: Applicable");
    for (const obligationId of [
      "ExactOneCapabilityExecution.obligation.check-before-consumption",
      "ExactOneCapabilityExecution.obligation.consume-atomically-before-execution",
      "ExactOneCapabilityExecution.obligation.reject-reuse-before-execution",
      "ExactOneCapabilityExecution.obligation.no-restore-after-start",
    ]) {
      expect(first.stdout).toContain(obligationId);
    }

    const theoryStart = first.stdout.indexOf("Theory application: exact-one-withdraw");
    const classificationsStart = first.stdout.indexOf(
      "\n\nRealization classifications:",
      theoryStart,
    );
    expect(
      first.stdout
        .slice(theoryStart, classificationsStart)
        .split("\n")
        .filter((line) => line.startsWith("- ")).length,
    ).toBe(4);

    expect(first.stdout).toContain("effect-typescript -> qualified");
    expect(first.stdout).toContain("gleam-beam -> rejected");
    expect(first.stdout).toContain(
      "Target rejection: adapter=gleam-beam; address=operationRealization:WithdrawAccountOnce.requires; reason=unsupported-target:",
    );

    const effectProfile = classificationProfileBlock(first.stdout, "effect-typescript");
    expect(effectProfile).toContain(
      "Evidence: runtime-checked; scope=single-grant-two-call-trace;",
    );
    expect(effectProfile).toContain("Evidence: assumed-truthful; scope=assumed-truthful;");
    expect(effectProfile).toContain("Assumptions:");
    expect(effectProfile).toContain("Weakenings:");
    expect(effectProfile).toContain("Limitations:");
    expect(effectProfile).toContain("Lifetime:");
    expect(effectProfile).toContain("Invalidators:");
    for (const material of m018MaterialReferences) expect(effectProfile).toContain(material);
    expect(classificationProfileBlock(first.stdout, "gleam-beam")).toContain(
      "Evidence: unsupported-by-target; scope=gleam-beam target projection;",
    );

    for (const scheduleId of [
      "ordered",
      "duplicate-prepare",
      "duplicate-commit",
      "commit-before-prepare",
      "drop-ack",
      "complete-without-ack",
    ]) {
      expect(first.stdout).toContain(`Schedule: ${scheduleId}`);
    }
    expect(first.stdout.match(/^Result: Satisfied$/gm)?.length).toBe(3);
    expect(first.stdout.match(/^Result: Violated$/gm)?.length).toBe(2);
    expect(first.stdout.match(/^Result: Unresolved$/gm)?.length).toBe(1);

    expect(first.stdout).toContain(
      "Policy condition: assumptions -> reported; subjects=withdraw-once-effect",
    );
    expect(first.stdout).toContain(
      "Policy condition: unsupported-by-target -> reported; subjects=withdraw-once-gleam",
    );
    expect(first.stdout).toContain(
      "Policy condition: unresolved -> reported; subjects=two-owner-transfer",
    );
    expect(first.stdout).toContain("Project policy: Accepted");
  });

  test("rejects every M025 negative fixture with its typed stage and no partial stdout", async () => {
    const negativeFixtures = [
      {
        path: "examples/tiny-bank/projects/duplicate-source-id.json",
        stage: "project",
        reason: "duplicate-identity",
      },
      {
        path: "examples/tiny-bank/projects/duplicate-source-path.json",
        stage: "project",
        reason: "duplicate-identity",
      },
      {
        path: "examples/tiny-bank/projects/unknown-reference.json",
        stage: "project",
        reason: "unresolved-reference",
      },
      {
        path: "examples/tiny-bank/projects/unsafe-input-path.json",
        stage: "project",
        reason: "unsafe-path",
      },
      {
        path: "examples/tiny-bank/projects/unbounded-capability.json",
        stage: "theory",
        reason: "inapplicable-theory",
      },
      {
        path: "examples/tiny-bank/projects/source-mismatch.json",
        stage: "evidence",
        reason: "evidence-source-mismatch",
      },
      {
        path: "examples/tiny-bank/projects/stale-evidence.json",
        stage: "evidence",
        reason: "stale-material",
      },
      {
        path: "examples/tiny-bank/projects/invalid-channel.json",
        stage: "channel",
        reason: "invalid-causal-parent",
      },
      {
        path: "examples/tiny-bank/projects/reject-unsupported.json",
        stage: "policy",
        reason: "policy-rejected",
      },
      {
        path: "examples/tiny-bank/projects/malformed.json",
        stage: "project",
        reason: "schema",
      },
    ] as const;

    const results = await Promise.all(
      negativeFixtures.map(async (fixture) => ({
        fixture,
        result: await runCli(fixture.path, "project"),
      })),
    );
    for (const { fixture, result } of results) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`stage: ${fixture.stage}`);
      expect(result.stderr).toContain(`reason: ${fixture.reason}`);
      expect(result.stderr).toContain("message:");
    }
  });
});
